/**
 * Phase 3: tree/optional estimate lines, version history, Ready to Schedule on accept,
 * controlled changes (accepted estimate not reopened), trees/photos/property preserved.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase, migrate } from './db.js';
import { createApp } from './app.js';
import { hash, token } from './security.js';
import { READY_TO_SCHEDULE_STATUS } from './readyToSchedule.js';

const CLIENT_ADDR = { address: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701' };
const SIGN_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function fixture(t) {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  await migrate(db);
  const app = await createApp(db, { APP_ORIGIN: 'http://localhost:5173' });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  const addr = server.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const request = async (path, { method = 'GET', data, cookie, origin = 'http://localhost:5173', form } = {}) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        ...(origin !== null ? { origin } : {}),
        ...(cookie ? { cookie } : {}),
        ...(!form ? { 'content-type': 'application/json' } : {}),
      },
      body: form || (data ? JSON.stringify(data) : undefined),
    });
    return {
      status: response.status,
      cookie: response.headers.get('set-cookie')?.split(';')[0],
      data: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.arrayBuffer(),
    };
  };
  const register = async (email) => {
    const invitation = token();
    await db.run('INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)', [
      hash(invitation), 'invite', email, Date.now() + 60000,
    ]);
    const result = await request('/auth/register', {
      method: 'POST',
      data: { email, password: 'strong-password-123', inviteToken: invitation },
    });
    assert.equal(result.status, 201);
    return result;
  };
  return { request, register };
}

test('Phase 3: accept estimate → Ready to Schedule; trees/photos/property kept; optionals excluded; reopen blocked', async (t) => {
  const { request, register } = await fixture(t);
  const a = await register('phase3@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message || entity);
    return result.data;
  };

  const client = await create('Client', { name: 'Phase3 Customer', ...CLIENT_ADDR });
  const property = await create('Property', {
    client_id: client.id,
    name: 'Front lot',
    address: '9 Oak Ln',
    city: 'Austin',
    state: 'TX',
    zip: '78702',
    access_notes: 'Gate code 1234',
  });
  const job = await create('Job', {
    title: 'Oak removal',
    client_id: client.id,
    property_id: property.id,
    status: 'Estimate sent',
    service_area: 'Austin East',
    urgency: 'high',
  });
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'site.png');
  const file = await request('/files', { method: 'POST', cookie: a.cookie, form });
  assert.equal(file.status, 201, file.data?.message);
  const tree = await create('TreeInventory', {
    job_id: job.id,
    label: 'T-1 Front oak',
    species: 'Live oak',
    method_needs: ['crane', 'chipper'],
    photo_url: file.data.file_url,
  });
  const photo = await create('TimelineEntry', {
    job_id: job.id,
    type: 'photo',
    category: 'before',
    text: 'Site photo',
    photo_url: file.data.file_url,
  });

  const estimate = await create('Estimate', {
    job_id: job.id,
    property_id: property.id,
    number: 'EST-P3',
    status: 'draft',
    tax_rate: 0,
    lines: [
      { description: 'Tree removal', labor_amount: 1200, labor_hours: 6, tree_id: tree.id },
      { description: 'Stump grind', labor_amount: 300, is_optional: true },
    ],
  });
  assert.equal(estimate.lines[0].tree_id, tree.id);
  assert.equal(estimate.lines[1].is_optional, true);
  // Line ids must round-trip on save (tree ↔ line link stability).
  const patched = await request(`/entities/Estimate/${estimate.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: {
      lines: estimate.lines.map((line) => ({ ...line })),
      notes: 'keep ids',
    },
  });
  assert.equal(patched.status, 200, patched.data?.message);
  assert.equal(patched.data.lines[0].id, estimate.lines[0].id);
  assert.equal(patched.data.lines[1].id, estimate.lines[1].id);

  await request(`/entities/TreeInventory/${tree.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { estimate_line_id: estimate.lines[0].id },
  });

  const accepted = await request(`/documents/Estimate/${estimate.id}/status`, {
    method: 'POST',
    cookie: a.cookie,
    data: { status: 'accepted' },
  });
  assert.equal(accepted.status, 200, accepted.data?.message);
  assert.equal(accepted.data.status, 'accepted');
  assert.ok(accepted.data.accepted_snapshot);
  assert.equal(accepted.data.accepted_snapshot.total, 1200, 'optional stump excluded from binding total');
  assert.deepEqual(accepted.data.accepted_snapshot.included_optional_line_ids, []);
  assert.ok(Array.isArray(accepted.data.version_history));

  const jobAfter = (await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data;
  assert.equal(jobAfter.status, READY_TO_SCHEDULE_STATUS);
  assert.equal(jobAfter.property_id, property.id);
  assert.equal(jobAfter.estimate_amount, 1200);
  assert.ok((jobAfter.required_capabilities || []).includes('crane'));
  assert.equal(jobAfter.estimated_duration_hours, 6);
  assert.equal(jobAfter.urgency, 'high');
  assert.equal(jobAfter.service_area, 'Austin East');

  const treesAfter = (await request(`/entities/TreeInventory?job_id=${job.id}`, { cookie: a.cookie })).data;
  assert.equal(treesAfter.length, 1);
  assert.equal(treesAfter[0].id, tree.id);
  assert.equal(treesAfter[0].photo_url, tree.photo_url);
  assert.equal(treesAfter[0].estimate_line_id, estimate.lines[0].id);

  const photosAfter = (await request(`/entities/TimelineEntry?job_id=${job.id}`, { cookie: a.cookie })).data
    .filter((e) => e.type === 'photo');
  assert.ok(photosAfter.some((e) => e.id === photo.id));

  const tasks = (await request(`/entities/WorkItem?job_id=${job.id}`, { cookie: a.cookie })).data
    .filter((i) => i.source_type === 'Estimate');
  assert.deepEqual(tasks.map((i) => i.description), ['Tree removal']);

  // Controlled change: cannot reopen accepted estimate (must void or use change order).
  const reopen = await request(`/documents/Estimate/${estimate.id}/status`, {
    method: 'POST',
    cookie: a.cookie,
    data: { status: 'draft' },
  });
  assert.equal(reopen.status, 409);
  assert.match(reopen.data.message || '', /cannot be reopened/i);

  // Scope add-on still works for optional stump after accept.
  const co = await create('ChangeOrder', {
    job_id: job.id,
    number: 'CO-STUMP',
    status: 'draft',
    lines: [{ description: 'Stump grind', labor_amount: 300 }],
  });
  const coApproved = await request(`/documents/ChangeOrder/${co.id}/status`, {
    method: 'POST',
    cookie: a.cookie,
    data: { status: 'approved' },
  });
  assert.equal(coApproved.status, 200, coApproved.data?.message);
  assert.equal(coApproved.data.revised_contract_total, 1500);

  // Job still has property + trees after CO approval.
  const jobFinal = (await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data;
  assert.equal(jobFinal.property_id, property.id);
  assert.equal((await request(`/entities/TreeInventory?job_id=${job.id}`, { cookie: a.cookie })).data.length, 1);
});

test('Phase 3: e-sign accept also lands Ready to Schedule and preserves version on second accept path', async (t) => {
  const { request, register } = await fixture(t);
  const a = await register('phase3-sign@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message || entity);
    return result.data;
  };
  const client = await create('Client', { name: 'Sign Customer', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Sign job', client_id: client.id, status: 'Approved' });
  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-SIGN',
    status: 'draft',
    lines: [{ description: 'Prune', labor_amount: 400 }],
  });
  const sent = await request(`/estimates/${estimate.id}/send-sign`, {
    method: 'POST',
    cookie: a.cookie,
    data: { channel: 'link' },
  });
  assert.ok([200, 201].includes(sent.status), sent.data?.message);
  const rawToken = sent.data.sign_url.split('/').pop();
  const signed = await request(`/sign/${rawToken}`, {
    method: 'POST',
    data: { signer_name: 'Pat Customer', signature_data_url: SIGN_PNG },
  });
  assert.equal(signed.status, 200, signed.data?.message);
  const jobAfter = (await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data;
  assert.equal(jobAfter.status, READY_TO_SCHEDULE_STATUS);
  assert.equal(jobAfter.estimate_amount, 400);
});
