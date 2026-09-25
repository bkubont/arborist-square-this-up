import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { describe, it } from 'node:test';
import { createApp } from './app.js';
import { applyClientPipelineFields, applyJobLeadField, CLIENT_LEAD_STATUSES, jobLeadChanged } from './clientPipeline.js';
import { openDatabase, migrate } from './db.js';
import { JOB_PHASES } from './jobStatus.js';
import { hash, token } from './security.js';

const CLIENT_ADDR = { address: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701' };

describe('contact lead pipeline', () => {
  it('uses the job board lead statuses, in order', () => {
    assert.deepEqual(CLIENT_LEAD_STATUSES, [
      'Contact',
      'Assessment',
      'Plan / draft estimate',
      'Waiting on approval',
      'Approved',
      'Declined',
    ]);
    assert.deepEqual(CLIENT_LEAD_STATUSES, JOB_PHASES.lead.statuses);
    assert.ok(JOB_PHASES.working.statuses.includes('Waiting on materials'));
    assert.ok(!JOB_PHASES.lead.statuses.includes('Waiting on materials'));
  });

  it('archives only Declined and leaves other patches alone', () => {
    const created = applyClientPipelineFields({ name: 'Pat' }, null);
    assert.equal(created.status, 'Contact');
    assert.equal(created.archived_at, undefined);

    const declined = applyClientPipelineFields({ status: 'Declined' }, { status: 'Approved' });
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

    const rejected = applyClientPipelineFields({ status: 'Waiting on materials' }, { status: 'Contact' });
    assert.equal(rejected.status, 'Waiting on materials');
  });

  it('copies a lead phase status onto lead_status and leaves working patches alone', () => {
    const lead = applyJobLeadField({ status: 'Waiting on approval' }, { status: 'Contact', phase: 'lead' });
    assert.equal(lead.lead_status, 'Waiting on approval');
    const working = applyJobLeadField(
      { status: 'In progress', phase: 'working' },
      { status: 'Prep', phase: 'working', lead_status: 'Assessment' },
    );
    assert.equal(working.lead_status, undefined);
    const explicit = applyJobLeadField(
      { lead_status: 'Approved' },
      { status: 'Prep', phase: 'working', lead_status: 'Contact' },
    );
    assert.equal(explicit.lead_status, 'Approved');
    assert.equal(explicit.status, undefined);
    assert.equal(jobLeadChanged(
      { status: 'Prep', lead_status: 'Contact' },
      { status: 'In progress', lead_status: 'Contact' },
    ), false);
    assert.equal(jobLeadChanged(
      { status: 'Contact', phase: 'lead' },
      { status: 'Assessment', phase: 'lead', lead_status: 'Assessment' },
    ), true);
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

test('contact lead status syncs lead jobs and Declined archives', async t => {
  const { request, register } = await fixture(t);
  const a = await register('pipeline@example.com');
  const b = await register('other-pipeline@example.com');

  const created = await request('/entities/Client', {
    method: 'POST',
    cookie: a.cookie,
    data: { name: 'Pat Customer', ...CLIENT_ADDR },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.status, 'Contact');
  assert.equal(created.data.archived_at, undefined);

  const client = created.data;
  const lead = await request('/entities/Job', {
    method: 'POST',
    cookie: a.cookie,
    data: { title: 'Deck lead', client_id: client.id, phase: 'lead', status: 'Contact' },
  });
  const working = await request('/entities/Job', {
    method: 'POST',
    cookie: a.cookie,
    data: { title: 'Kitchen work', client_id: client.id, phase: 'working', status: 'Prep' },
  });
  assert.equal(lead.status, 201);
  assert.equal(working.status, 201);

  const otherClient = await request('/entities/Client', {
    method: 'POST',
    cookie: b.cookie,
    data: { name: 'Other', ...CLIENT_ADDR },
  });
  const otherJob = await request('/entities/Job', {
    method: 'POST',
    cookie: b.cookie,
    data: { title: 'Other lead', client_id: otherClient.data.id, phase: 'lead', status: 'Assessment' },
  });

  const movedJob = await request(`/entities/Job/${lead.data.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { phase: 'lead', status: 'Assessment' },
  });
  assert.equal(movedJob.data.status, 'Assessment');
  assert.equal(movedJob.data.lead_status, 'Assessment');
  const clientAfterJob = await request(`/entities/Client/${client.id}`, { cookie: a.cookie });
  assert.equal(clientAfterJob.data.status, 'Assessment');
  const workingAfterJob = await request(`/entities/Job/${working.data.id}`, { cookie: a.cookie });
  assert.equal(workingAfterJob.data.status, 'Prep');
  assert.equal(workingAfterJob.data.lead_status, 'Assessment');

  const phone = await request(`/entities/Client/${client.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { phone: '555-0100' },
  });
  assert.equal(phone.status, 200);
  assert.equal(phone.data.status, 'Assessment');
  const afterPhone = await request(`/entities/Job/${lead.data.id}`, { cookie: a.cookie });
  assert.equal(afterPhone.data.status, 'Assessment');
  assert.equal(afterPhone.data.phase, 'lead');

  const blocked = await request(`/entities/Client/${client.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { status: 'Waiting on materials' },
  });
  assert.equal(blocked.status, 400);
  const stillAssessment = await request(`/entities/Job/${lead.data.id}`, { cookie: a.cookie });
  assert.equal(stillAssessment.data.status, 'Assessment');

  for (const status of ['Plan / draft estimate', 'Waiting on approval', 'Approved']) {
    const updated = await request(`/entities/Client/${client.id}`, {
      method: 'PATCH',
      cookie: a.cookie,
      data: { status },
    });
    assert.equal(updated.status, 200, status);
    assert.equal(updated.data.status, status);
    assert.equal(updated.data.archived_at, undefined);
    const job = await request(`/entities/Job/${lead.data.id}`, { cookie: a.cookie });
    assert.equal(job.data.phase, 'lead');
    assert.equal(job.data.status, status);
    assert.equal(job.data.lead_status, status);
    assert.equal(job.data.archived_at, undefined);
    const workingLead = await request(`/entities/Job/${working.data.id}`, { cookie: a.cookie });
    assert.equal(workingLead.data.status, 'Prep');
    assert.equal(workingLead.data.lead_status, status);
  }

  const declined = await request(`/entities/Client/${client.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { status: 'Declined' },
  });
  assert.equal(declined.data.status, 'Declined');
  assert.match(declined.data.archived_at, /^\d{4}-\d{2}-\d{2}$/);
  const declinedJob = await request(`/entities/Job/${lead.data.id}`, { cookie: a.cookie });
  assert.equal(declinedJob.data.status, 'Declined');
  assert.equal(declinedJob.data.phase, 'lead');
  assert.ok(declinedJob.data.archived_at);
  const workingJob = await request(`/entities/Job/${working.data.id}`, { cookie: a.cookie });
  assert.equal(workingJob.data.status, 'Prep');
  assert.equal(workingJob.data.phase, 'working');
  assert.equal(workingJob.data.lead_status, 'Declined');
  assert.equal(workingJob.data.archived_at, undefined);
  const untouched = await request(`/entities/Job/${otherJob.data.id}`, { cookie: b.cookie });
  assert.equal(untouched.data.status, 'Assessment');
  assert.equal((await request(`/entities/Client/${client.id}`, { method: 'PATCH', cookie: b.cookie, data: { status: 'Approved' } })).status, 404);

  const reopened = await request(`/entities/Client/${client.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { status: 'Contact' },
  });
  assert.equal(reopened.data.status, 'Contact');
  assert.equal(reopened.data.archived_at, undefined);
  const reopenedJob = await request(`/entities/Job/${lead.data.id}`, { cookie: a.cookie });
  assert.equal(reopenedJob.data.status, 'Contact');
  assert.equal(reopenedJob.data.lead_status, 'Contact');
  assert.equal(reopenedJob.data.archived_at, undefined);

  const progressed = await request(`/entities/Job/${working.data.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { phase: 'working', status: 'In progress' },
  });
  assert.equal(progressed.data.status, 'In progress');
  assert.equal(progressed.data.lead_status, 'Contact');
  assert.equal((await request(`/entities/Client/${client.id}`, { cookie: a.cookie })).data.status, 'Contact');

  const fromWorkingLead = await request(`/entities/Job/${working.data.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { lead_status: 'Approved' },
  });
  assert.equal(fromWorkingLead.data.status, 'In progress');
  assert.equal(fromWorkingLead.data.lead_status, 'Approved');
  assert.equal((await request(`/entities/Client/${client.id}`, { cookie: a.cookie })).data.status, 'Approved');
  const leadFollows = await request(`/entities/Job/${lead.data.id}`, { cookie: a.cookie });
  assert.equal(leadFollows.data.status, 'Approved');
  assert.equal(leadFollows.data.lead_status, 'Approved');
  assert.equal(leadFollows.data.archived_at, undefined);

  const declinedFromJob = await request(`/entities/Job/${lead.data.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { phase: 'lead', status: 'Declined' },
  });
  assert.equal(declinedFromJob.data.status, 'Declined');
  assert.ok(declinedFromJob.data.archived_at);
  const clientDeclinedFromJob = await request(`/entities/Client/${client.id}`, { cookie: a.cookie });
  assert.equal(clientDeclinedFromJob.data.status, 'Declined');
  assert.ok(clientDeclinedFromJob.data.archived_at);
  const workingStillActive = await request(`/entities/Job/${working.data.id}`, { cookie: a.cookie });
  assert.equal(workingStillActive.data.status, 'In progress');
  assert.equal(workingStillActive.data.lead_status, 'Declined');
  assert.equal(workingStillActive.data.archived_at, undefined);

  const timeline = await request(`/entities/TimelineEntry?job_id=${lead.data.id}`, { cookie: a.cookie });
  assert.ok(timeline.data.some(entry => entry.type === 'status_change' && entry.text === 'Status changed to Lead · Declined'));
});
