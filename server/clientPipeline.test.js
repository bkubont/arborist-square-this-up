import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { describe, it } from 'node:test';
import { createApp } from './app.js';
import { applyClientPipelineFields, CLIENT_LEAD_STATUSES, LEGACY_CLIENT_STATUS_MAP } from './clientPipeline.js';
import { openDatabase, migrate } from './db.js';
import { JOB_PHASES } from './jobStatus.js';
import { hash, token } from './security.js';

const CLIENT_ADDR = { address: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701' };

describe('contact lead pipeline', () => {
  it('uses the CRM list, not job-board statuses', () => {
    assert.deepEqual(CLIENT_LEAD_STATUSES, [
      'Prospect',
      'Contacted',
      'Assessment',
      'Follow-up',
      'Active',
      'Declined',
    ]);
    assert.equal(JOB_PHASES.lead, undefined);
    assert.deepEqual(LEGACY_CLIENT_STATUS_MAP, {
      Contact: 'Prospect',
      'Plan / draft estimate': 'Assessment',
      'Waiting on approval': 'Follow-up',
      Approved: 'Active',
    });
    assert.ok(JOB_PHASES.working.statuses.includes('Waiting on materials'));
    assert.ok(JOB_PHASES.working.statuses.includes('Estimate'));
  });

  it('archives only Declined and leaves other patches alone', () => {
    const created = applyClientPipelineFields({ name: 'Pat' }, null);
    assert.equal(created.status, 'Prospect');
    assert.equal(created.archived_at, undefined);

    const declined = applyClientPipelineFields({ status: 'Declined' }, { status: 'Active' });
    assert.equal(declined.status, 'Declined');
    assert.match(declined.archived_at, /^\d{4}-\d{2}-\d{2}$/);

    const kept = applyClientPipelineFields(
      { status: 'Declined' },
      { status: 'Declined', archived_at: '2026-09-01' },
    );
    assert.equal(kept.archived_at, '2026-09-01');

    const reopened = applyClientPipelineFields({ status: 'Assessment' }, { status: 'Declined', archived_at: '2026-09-01' });
    assert.equal(reopened.status, 'Assessment');
    assert.equal(reopened.archived_at, undefined);

    const phone = applyClientPipelineFields({ phone: '555-0100' }, { status: 'Assessment', archived_at: undefined });
    assert.equal(phone.status, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(phone, 'archived_at'), false);

    const rejected = applyClientPipelineFields({ status: 'Waiting on materials' }, { status: 'Prospect' });
    assert.equal(rejected.status, 'Waiting on materials');

    const remapped = applyClientPipelineFields({ phone: '555-0100' }, { status: 'Contact' });
    assert.equal(remapped.status, 'Prospect');
    const fromApproved = applyClientPipelineFields({ status: 'Approved' }, { status: 'Prospect' });
    assert.equal(fromApproved.status, 'Active');
  });
});

async function fixture(t) {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  await migrate(db);
  const app = await createApp(db, { APP_ORIGIN: 'http://localhost:5173' });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await db.close();
  });
  const addr = server.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const request = async (path, { method = 'GET', data, cookie, origin = 'http://localhost:5173' } = {}) => {
    const response = await fetch(base + '/api' + path, {
      method,
      headers: {
        ...(origin !== null ? { origin } : {}),
        ...(cookie ? { cookie } : {}),
        'content-type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return {
      status: response.status,
      cookie: response.headers.get('set-cookie')?.split(';')[0],
      data: response.headers.get('content-type')?.includes('json') ? await response.json() : null,
    };
  };
  const register = async email => {
    const invitation = token();
    await db.run(
      'INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)',
      [hash(invitation), 'invite', email, Date.now() + 60000],
    );
    const result = await request('/auth/register', {
      method: 'POST',
      data: { email, password: 'strong-password-123', inviteToken: invitation },
    });
    assert.equal(result.status, 201);
    return result;
  };
  return { request, register };
}

test('contact lead status does not sync with jobs; Declined archives the contact', async t => {
  const { request, register } = await fixture(t);
  const a = await register('pipeline@example.com');
  const b = await register('other-pipeline@example.com');

  const created = await request('/entities/Client', {
    method: 'POST',
    cookie: a.cookie,
    data: { name: 'Pat Customer', ...CLIENT_ADDR },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.status, 'Prospect');
  assert.equal(created.data.archived_at, undefined);

  const client = created.data;
  const estimate = await request('/entities/Job', {
    method: 'POST',
    cookie: a.cookie,
    data: { title: 'Deck estimate', client_id: client.id },
  });
  const working = await request('/entities/Job', {
    method: 'POST',
    cookie: a.cookie,
    data: { title: 'Kitchen work', client_id: client.id, phase: 'working', status: 'Prep' },
  });
  assert.equal(estimate.status, 201);
  assert.equal(estimate.data.phase, 'working');
  assert.equal(estimate.data.status, 'Estimate');
  assert.equal(working.status, 201);
  assert.equal(working.data.status, 'Prep');

  const otherClient = await request('/entities/Client', {
    method: 'POST',
    cookie: b.cookie,
    data: { name: 'Other', ...CLIENT_ADDR },
  });
  const otherJob = await request('/entities/Job', {
    method: 'POST',
    cookie: b.cookie,
    data: { title: 'Other job', client_id: otherClient.data.id, status: 'Estimate' },
  });

  const movedJob = await request(`/entities/Job/${estimate.data.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { phase: 'working', status: 'Waiting on approval' },
  });
  assert.equal(movedJob.data.status, 'Waiting on approval');
  const clientAfterJob = await request(`/entities/Client/${client.id}`, { cookie: a.cookie });
  assert.equal(clientAfterJob.data.status, 'Prospect', 'job status does not change the contact');
  const workingAfterJob = await request(`/entities/Job/${working.data.id}`, { cookie: a.cookie });
  assert.equal(workingAfterJob.data.status, 'Prep');

  const phone = await request(`/entities/Client/${client.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { phone: '555-0100' },
  });
  assert.equal(phone.status, 200);
  assert.equal(phone.data.status, 'Prospect');
  const afterPhone = await request(`/entities/Job/${estimate.data.id}`, { cookie: a.cookie });
  assert.equal(afterPhone.data.status, 'Waiting on approval');

  const blocked = await request(`/entities/Client/${client.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { status: 'Waiting on materials' },
  });
  assert.equal(blocked.status, 400);
  assert.equal((await request(`/entities/Client/${client.id}`, { cookie: a.cookie })).data.status, 'Prospect');

  for (const status of ['Contacted', 'Assessment', 'Follow-up', 'Active']) {
    const updated = await request(`/entities/Client/${client.id}`, {
      method: 'PATCH',
      cookie: a.cookie,
      data: { status },
    });
    assert.equal(updated.status, 200, status);
    assert.equal(updated.data.status, status);
    assert.equal(updated.data.archived_at, undefined);
    const job = await request(`/entities/Job/${estimate.data.id}`, { cookie: a.cookie });
    assert.equal(job.data.status, 'Waiting on approval', 'contact Lead does not move the job');
    const workingLead = await request(`/entities/Job/${working.data.id}`, { cookie: a.cookie });
    assert.equal(workingLead.data.status, 'Prep');
  }

  const declined = await request(`/entities/Client/${client.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { status: 'Declined' },
  });
  assert.equal(declined.data.status, 'Declined');
  assert.match(declined.data.archived_at, /^\d{4}-\d{2}-\d{2}$/);
  const declinedJob = await request(`/entities/Job/${estimate.data.id}`, { cookie: a.cookie });
  assert.equal(declinedJob.data.status, 'Waiting on approval');
  assert.equal(declinedJob.data.archived_at, undefined);
  const workingJob = await request(`/entities/Job/${working.data.id}`, { cookie: a.cookie });
  assert.equal(workingJob.data.status, 'Prep');
  assert.equal(workingJob.data.archived_at, undefined);
  const untouched = await request(`/entities/Job/${otherJob.data.id}`, { cookie: b.cookie });
  assert.equal(untouched.data.status, 'Estimate');
  assert.equal((await request(`/entities/Client/${client.id}`, { method: 'PATCH', cookie: b.cookie, data: { status: 'Active' } })).status, 404);

  const reopened = await request(`/entities/Client/${client.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { status: 'Prospect' },
  });
  assert.equal(reopened.data.status, 'Prospect');
  assert.equal(reopened.data.archived_at, undefined);
});
