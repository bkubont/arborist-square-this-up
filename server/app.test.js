import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase, migrate } from './db.js';
import { createApp } from './app.js';
import { hash, token } from './security.js';
import { importData } from './import.js';
import { saveRecord } from './domain.js';
import { sumDepositsApplied, isLiveAcceptedEstimate, findLiveAcceptedEstimate } from './documentRules.js';

const CLIENT_ADDR = { address: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701' };

async function fixture(t) {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  await migrate(db);
  const app = await createApp(db, { APP_ORIGIN: 'http://localhost:5173' });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.close(); });
  const addr = server.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const request = async (path, { method = 'GET', data, cookie, origin = 'http://localhost:5173', form } = {}) => {
    const response = await fetch(base + '/api' + path, { method, headers: { origin, ...(cookie ? { cookie } : {}), ...(!form ? { 'content-type': 'application/json' } : {}) }, body: form || (data ? JSON.stringify(data) : undefined) });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], response,
      data: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.arrayBuffer() };
  };
  const register = async email => {
    const invitation = token();
    await db.run('INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)', [hash(invitation), 'invite', email, Date.now() + 60000]);
    const result = await request('/auth/register', { method: 'POST', data: { email, password: 'strong-password-123', inviteToken: invitation } });
    assert.equal(result.status, 201);
    return { ...result, invitation };
  };
  return { db, request, register };
}
test('invitation-only registration, cookie sessions, logout and CSRF protection', async t => {
  const { request, register } = await fixture(t);
  assert.equal((await request('/entities/Client')).status, 401);
  assert.equal((await request('/auth/register', { method: 'POST', data: { email: 'a@example.com', password: 'strong-password-123' } })).status, 400);
  const user = await register('a@example.com');
  assert.match(user.response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(user.response.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal((await request('/auth/me', { cookie: user.cookie })).data.email, 'a@example.com');
  assert.equal(user.data.default_tax_rate, 6);
  const profiles = await request('/entities/CompanyProfile', { cookie: user.cookie });
  assert.equal(profiles.status, 200);
  assert.equal(profiles.data[0]?.default_tax_rate, 6);
  assert.equal((await request('/auth/register', { method: 'POST', data: { email: 'a@example.com', password: 'strong-password-123', inviteToken: user.invitation } })).status, 400);
  assert.equal((await request('/entities/Client', { method: 'POST', cookie: user.cookie, origin: 'https://evil.example', data: { name: 'Attack' } })).status, 403);
  await request('/auth/logout', { method: 'POST', cookie: user.cookie });
  assert.equal((await request('/auth/me', { cookie: user.cookie })).status, 401);
});

test('registration accepts custom sales tax rate on company profile', async t => {
  const { request, db } = await fixture(t);
  const invitation = token();
  await db.run('INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)', [hash(invitation), 'invite', 'tax@example.com', Date.now() + 60000]);
  const result = await request('/auth/register', {
    method: 'POST',
    data: { email: 'tax@example.com', password: 'strong-password-123', inviteToken: invitation, default_tax_rate: 7.5 },
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.default_tax_rate, 7.5);
  const profiles = await request('/entities/CompanyProfile', { cookie: result.cookie });
  assert.equal(profiles.data[0]?.default_tax_rate, 7.5);
});
test('accounts cannot read, modify, delete, link or export each other’s data or photos', async t => {
  const { request, register } = await fixture(t);
  const a = await register('a@example.com'), b = await register('b@example.com');
  const create = async (entity, data, cookie = a.cookie) => (await request(`/entities/${entity}`, { method: 'POST', data, cookie })).data;
  const client = await create('Client', { name: 'Private client', owner_id: b.data.id, ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Private job', client_id: client.id });
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'photo.png');
  const file = await request('/files', { method: 'POST', cookie: a.cookie, form });
  assert.equal(file.status, 201);
  const entry = await create('TimelineEntry', { job_id: job.id, type: 'photo', category: 'before', photo_url: file.data.file_url });
  for (const [entity, record] of [['Client', client], ['Job', job], ['TimelineEntry', entry]]) {
    assert.deepEqual((await request(`/entities/${entity}`, { cookie: b.cookie })).data, []);
    for (const method of ['GET','PATCH','DELETE']) assert.equal((await request(`/entities/${entity}/${record.id}`, { method, data: method === 'PATCH' ? { text: 'attack' } : undefined, cookie: b.cookie })).status, 404);
  }
  assert.equal((await request('/entities/Job', { method: 'POST', cookie: b.cookie, data: { title: 'Attack', client_id: client.id } })).status, 404);
  assert.equal((await request(file.data.file_url.replace('/api',''), { cookie: b.cookie })).status, 404);
  assert.equal((await request(file.data.file_url.replace('/api',''))).status, 401);
  assert.equal((await request(file.data.file_url.replace('/api',''), { cookie: a.cookie })).status, 200);
  const ownClient = await create('Client', { name: 'B client', ...CLIENT_ADDR }, b.cookie);
  const ownJob = await create('Job', { title: 'B job', client_id: ownClient.id }, b.cookie);
  assert.equal((await request('/entities/TimelineEntry', { method: 'POST', cookie: b.cookie, data: { job_id: ownJob.id, type: 'photo', photo_url: file.data.file_url } })).status, 400);
  const exported = (await request('/export', { cookie: b.cookie })).data;
  // Client + Job + registration-seeded CompanyProfile
  assert.equal(exported.records.length, 3); assert.deepEqual(exported.files, []);
  assert.ok(exported.records.some((r) => r.entity === 'CompanyProfile'));
  assert.equal((await request(`/entities/Client/${client.id}`, { method: 'DELETE', cookie: a.cookie })).status, 409);
  assert.equal((await request(`/entities/Job/${job.id}`, { method: 'DELETE', cookie: a.cookie })).status, 200);
  assert.equal((await request(`/entities/TimelineEntry/${entry.id}`, { cookie: a.cookie })).status, 404);
  assert.equal((await request(file.data.file_url.replace('/api',''), { cookie: a.cookie })).status, 404);
});

test('timeline photo categories include addition and gallery', async t => {
  const { request, register } = await fixture(t);
  const a = await register('photos-cat@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const client = await create('Client', { name: 'Photo client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Photo job', client_id: client.id });
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'photo.png');
  const file = await request('/files', { method: 'POST', cookie: a.cookie, form });
  assert.equal(file.status, 201);
  const addition = await create('TimelineEntry', {
    job_id: job.id, type: 'photo', category: 'addition', photo_url: file.data.file_url, text: 'Extra work',
  });
  const gallery = await create('TimelineEntry', {
    job_id: job.id, type: 'photo', category: 'gallery', photo_url: file.data.file_url, text: 'General',
  });
  assert.equal(addition.category, 'addition');
  assert.equal(gallery.category, 'gallery');
});

test('reset tokens expire, are single use, and revoke existing sessions', async t => {
  const { db, request, register } = await fixture(t);
  const user = await register('a@example.com');
  const value = token();
  await db.run('INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)', [hash(value), 'reset', 'a@example.com', Date.now() + 60000]);
  const body = { method: 'POST', data: { resetToken: value, newPassword: 'new-strong-password' } };
  const expired = token();
  await db.run('INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)', [hash(expired), 'reset', 'a@example.com', Date.now() - 1]);
  assert.equal((await request('/auth/reset-password', { method: 'POST', data: { resetToken: expired, newPassword: 'new-strong-password' } })).status, 400);
  assert.equal((await request('/auth/reset-password', body)).status, 200);
  assert.equal((await request('/auth/reset-password', body)).status, 400);
  assert.equal((await request('/auth/me', { cookie: user.cookie })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', data: { email: 'a@example.com', password: 'strong-password-123' } })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', data: { email: 'a@example.com', password: 'new-strong-password' } })).status, 200);
  assert.equal((await request('/auth/forgot-password', { method: 'POST', data: { email: 'a@example.com' } })).status, 503);
});
test('export restores relationships and photos; invalid imports roll back', async t => {
  const { db, request, register } = await fixture(t);
  const a = await register('a@example.com'); await register('b@example.com'); await register('c@example.com');
  const source = { Client: [{ id: 'old-client', name: 'Client', created_date: '2025-01-01T00:00:00Z' }], Job: [{ id: 'old-job', title: 'Job', client_id: 'old-client' }], TimelineEntry: [{ id: 'old-note', job_id: 'old-job', type: 'note', text: 'Hello' }] };
  await importData(db, 'a@example.com', source);
  const job = (await request('/entities/Job', { cookie: a.cookie })).data[0];
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'photo.png');
  const file = await request('/files', { method: 'POST', cookie: a.cookie, form });
  await request('/entities/TimelineEntry', { method: 'POST', cookie: a.cookie, data: { job_id: job.id, type: 'photo', photo_url: file.data.file_url } });
  const exported = (await request('/export', { cookie: a.cookie })).data;
  assert.equal(await importData(db, 'b@example.com', exported), 4);
  const [b] = await db.all('SELECT id FROM users WHERE email = ?', ['b@example.com']);
  const [restoredFile] = await db.all('SELECT * FROM files WHERE owner_id = ?', [b.id]);
  assert.equal(Buffer.from(restoredFile.content).toString('hex'), '89504e470d0a1a0a');
  const [restoredClient] = await db.all('SELECT created_date FROM records WHERE owner_id = ? AND entity = ?', [b.id, 'Client']);
  assert.equal(restoredClient.created_date, '2025-01-01T00:00:00.000Z');
  await assert.rejects(importData(db, 'b@example.com', exported), /empty account/);
  await assert.rejects(importData(db, 'c@example.com', { ...source, Job: [{ id: 'bad', title: 'Broken', client_id: 'missing' }] }), /missing client/);
  const [c] = await db.all('SELECT id FROM users WHERE email = ?', ['c@example.com']);
  // Failed import rolls back; seed CompanyProfile from registration remains.
  const cRecords = await db.all('SELECT entity FROM records WHERE owner_id = ?', [c.id]);
  assert.equal(cRecords.length, 1);
  assert.equal(cRecords[0].entity, 'CompanyProfile');
});
test('backup import: MaterialOrder linked to a WorkOrder round-trips (import order must resolve the reference)', async t => {
  const { db, request, register } = await fixture(t);
  const a = await register('mo-wo-import@example.com');
  await register('mo-wo-restore@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const client = await create('Client', { name: 'MO/WO client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'MO/WO job', client_id: client.id });
  const wo = await create('WorkOrder', { job_id: job.id, number: 'WO-001', status: 'draft' });
  await create('MaterialOrder', { job_id: job.id, number: 'MO-001', status: 'draft', related_work_order_id: wo.id });

  const backup = (await request('/export', { cookie: a.cookie })).data;
  await importData(db, 'mo-wo-restore@example.com', backup);
  const [owner] = await db.all('SELECT id FROM users WHERE email = ?', ['mo-wo-restore@example.com']);
  const restoredMo = (await db.all('SELECT data FROM records WHERE owner_id = ? AND entity = ?', [owner.id, 'MaterialOrder'])).map(r => JSON.parse(r.data))[0];
  const restoredWo = (await db.all('SELECT id FROM records WHERE owner_id = ? AND entity = ?', [owner.id, 'WorkOrder']))[0];
  assert.equal(restoredMo.related_work_order_id, restoredWo.id);
});

test('client address requires street, city, state, ZIP; line 2 optional; persists through backup', async t => {
  const { db, request, register } = await fixture(t);
  const a = await register('address@example.com');
  await register('restore-address@example.com');

  assert.equal((await request('/entities/Client', {
    method: 'POST', cookie: a.cookie, data: { name: 'Incomplete', address: '123 Oak St' },
  })).status, 400);

  const client = (await request('/entities/Client', {
    method: 'POST', cookie: a.cookie,
    data: { name: 'Address test', address: '123 Oak St', city: 'Springfield', state: 'IL', zip: '62701' },
  })).data;
  assert.equal(client.address_line2, undefined);
  assert.equal(client.city, 'Springfield');
  const updated = await request(`/entities/Client/${client.id}`, {
    method: 'PATCH', cookie: a.cookie, data: { address_line2: 'Suite 2' },
  });
  assert.equal(updated.status, 200);
  await request(`/entities/Client/${client.id}`, { method: 'PATCH', cookie: a.cookie, data: { phone: '555-1234' } });
  const saved = (await request(`/entities/Client/${client.id}`, { cookie: a.cookie })).data;
  assert.equal(saved.address, '123 Oak St');
  assert.equal(saved.address_line2, 'Suite 2');
  assert.equal(saved.city, 'Springfield');
  assert.equal(saved.state, 'IL');
  assert.equal(saved.zip, '62701');
  const backup = (await request('/export', { cookie: a.cookie })).data;
  await importData(db, 'restore-address@example.com', backup);
  const [owner] = await db.all('SELECT id FROM users WHERE email = ?', ['restore-address@example.com']);
  const [restored] = await db.all('SELECT data FROM records WHERE owner_id = ? AND entity = ?', [owner.id, 'Client']);
  assert.equal(JSON.parse(restored.data).address_line2, saved.address_line2);
  assert.equal(JSON.parse(restored.data).zip, '62701');
  await request(`/entities/Client/${client.id}`, { method: 'PATCH', cookie: a.cookie, data: { address_line2: '' } });
  assert.equal((await request(`/entities/Client/${client.id}`, { cookie: a.cookie })).data.address_line2, '');
});

test('address suggest returns items shape (empty ok if upstream unavailable)', async t => {
  const { request, register } = await fixture(t);
  const a = await register('suggest@example.com');
  assert.equal((await request('/address-suggest?q=oak')).status, 401);
  const res = await request('/address-suggest?q=oak', { cookie: a.cookie });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.items));
});

test('invalid inputs, forbidden file types, expired invitations and login throttling', async t => {
  const { db, request, register } = await fixture(t);
  const a = await register('a@example.com');
  const expired = token();
  await db.run('INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)', [hash(expired), 'invite', 'expired@example.com', Date.now() - 1]);
  assert.equal((await request('/auth/register', { method: 'POST', data: { email: 'expired@example.com', password: 'strong-password-123', inviteToken: expired } })).status, 400);
  assert.equal((await request('/entities/Client', { method: 'POST', cookie: a.cookie, data: { name: '', ...CLIENT_ADDR } })).status, 400);
  assert.equal((await request('/entities/Client?sort=DROP%20TABLE', { cookie: a.cookie })).status, 400);
  assert.equal((await request('/entities/Client?sort=-updated_date', { cookie: a.cookie })).status, 200);
  assert.equal((await request('/entities/Client?sort=updated_date', { cookie: a.cookie })).status, 200);
  assert.equal((await request('/entities/TimelineEntry?limit=1000', { cookie: a.cookie })).status, 400);
  assert.equal((await request('/entities/TimelineEntry?limit=500', { cookie: a.cookie })).status, 200);
  const form = new FormData(); form.append('file', new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/svg+xml' }), 'image.svg');
  assert.equal((await request('/files', { method: 'POST', cookie: a.cookie, form })).status, 400);
  const large = new FormData(); large.append('file', new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
  assert.equal((await request('/files', { method: 'POST', cookie: a.cookie, form: large })).status, 413);
  for (let i = 0; i < 10; i++) assert.equal((await request('/auth/login', { method: 'POST', data: { email: 'a@example.com', password: 'wrong' } })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', data: { email: 'a@example.com', password: 'wrong' } })).status, 429);
});

test('job documents: create draft Estimate/Invoice stubs, list by job, and enforce ownership', async t => {
  const { request, register } = await fixture(t);
  const a = await register('docs-a@example.com');
  const b = await register('docs-b@example.com');
  const create = async (entity, data, cookie = a.cookie) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const client = await create('Client', { name: 'Docs client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Docs job', client_id: client.id, status: 'Estimate' });
  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-001',
    status: 'accepted',
    lines: [{ description: 'Labor', labor_amount: 100 }],
    total: 100,
    accepted_snapshot: { number: 'EST-001', total: 100, lines: [{ description: 'Labor', labor_amount: 100 }] },
  });
  const wo = (await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: estimate.id },
  })).data;
  await request(`/entities/WorkOrder/${wo.id}`, { method: 'PATCH', cookie: a.cookie, data: { status: 'complete' } });
  const invoice = await create('Invoice', { job_id: job.id, number: 'INV-001', status: 'draft', date: '2026-09-19' });
  assert.equal(estimate.status, 'accepted');
  assert.equal(estimate.lines[0].labor_amount, 100);
  assert.equal(invoice.material_lines.length, 0);

  const listedEstimates = (await request(`/entities/Estimate?job_id=${job.id}`, { cookie: a.cookie })).data;
  const listedInvoices = (await request(`/entities/Invoice?job_id=${job.id}`, { cookie: a.cookie })).data;
  assert.equal(listedEstimates.length, 1);
  assert.equal(listedInvoices.length, 1);
  assert.equal(listedEstimates[0].id, estimate.id);

  const opened = (await request(`/entities/Estimate/${estimate.id}`, { cookie: a.cookie })).data;
  assert.equal(opened.number, 'EST-001');

  assert.deepEqual((await request('/entities/Estimate', { cookie: b.cookie })).data, []);
  assert.equal((await request(`/entities/Estimate/${estimate.id}`, { cookie: b.cookie })).status, 404);
  assert.equal((await request(`/entities/Invoice/${invoice.id}`, { method: 'PATCH', cookie: b.cookie, data: { notes: 'attack' } })).status, 404);
  assert.equal((await request('/entities/Estimate', { method: 'POST', cookie: b.cookie, data: { job_id: job.id, number: 'X' } })).status, 404);

  const profile = await create('CompanyProfile', { name: 'Square This Up', default_tax_rate: 10, default_payment_terms: 'Due upon receipt' });
  assert.equal(profile.name, 'Square This Up');
  assert.equal((await request(`/entities/CompanyProfile/${profile.id}`, { cookie: b.cookie })).status, 404);

  // Existing job status / timeline still work alongside documents
  assert.equal((await request(`/entities/Job/${job.id}`, { method: 'PATCH', cookie: a.cookie, data: { status: 'Scheduled' } })).status, 200);
  const note = await create('TimelineEntry', { job_id: job.id, type: 'note', text: 'Still works', category: 'note' });
  assert.equal(note.text, 'Still works');

  await request(`/entities/Estimate/${estimate.id}`, { method: 'PATCH', cookie: a.cookie, data: { status: 'sent' } });
  await create('TimelineEntry', { job_id: job.id, type: 'estimate_sent', text: 'Estimate EST-001 sent to client', category: 'financial' });

  assert.equal((await request(`/entities/Job/${job.id}`, { method: 'DELETE', cookie: a.cookie })).status, 200);
  assert.equal((await request(`/entities/Estimate/${estimate.id}`, { cookie: a.cookie })).status, 404);
  assert.equal((await request(`/entities/Invoice/${invoice.id}`, { cookie: a.cookie })).status, 404);
  assert.equal((await request(`/entities/TimelineEntry/${note.id}`, { cookie: a.cookie })).status, 404);
});

test('catalog search and estimate line fill with recomputed totals', async t => {
  const { request, register } = await fixture(t);
  const a = await register('catalog@example.com');
  assert.equal((await request('/catalog?q=filter')).status, 401);

  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };

  await create('CompanyProfile', { name: 'Square This Up', default_tax_rate: 6 });
  const catalog = await request('/catalog?q=hvac%20air%20filter&limit=10', { cookie: a.cookie });
  assert.equal(catalog.status, 200);
  assert.ok(catalog.data.items.length >= 1);
  const hit = catalog.data.items.find(item => /air filter/i.test(item.task));
  assert.ok(hit);
  assert.ok(hit.hours_mid > 0);
  assert.ok(hit.est_labor_cost > 0);
  assert.ok(hit.est_materials_cost > 0);

  const byCategory = await request('/catalog?category=Plumbing&limit=20', { cookie: a.cookie });
  assert.ok(byCategory.data.items.every(item => /plumbing/i.test(item.category)));

  const client = await create('Client', { name: 'Catalog client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Small faucet job', client_id: client.id });
  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-010',
    tax_rate: 6,
    lines: [{
      description: hit.task,
      category: hit.category,
      labor_amount: hit.est_labor_cost,
      labor_hours: hit.hours_mid,
      labor_rate: hit.labor_rate,
      catalog_id: hit.id,
      material_amount: 12.5,
    }, {
      description: 'Manual trip fee',
      equipment_amount: 25,
    }],
  });
  assert.equal(estimate.lines.length, 2);
  assert.equal(estimate.lines[0].labor_hours, hit.hours_mid);
  assert.equal(estimate.lines[0].material_amount, 12.5);

  const subtotal = hit.est_labor_cost + 12.5 + 25;
  const tax = Math.round(subtotal * 0.06 * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const updated = await request(`/entities/Estimate/${estimate.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { subtotal: Math.round(subtotal * 100) / 100, tax_amount: tax, total, lines: estimate.lines.map(line => ({ ...line, labor_amount: line.labor_amount ? line.labor_amount + 1 : line.labor_amount })) },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.lines[0].labor_amount, hit.est_labor_cost + 1);
  assert.equal(updated.data.total, total);
});

test('estimate sign link: client signs, estimate accepted, signed copy on job Photos/Documents', async t => {
  const { request, register } = await fixture(t);
  const a = await register('sign-owner@example.com');
  const b = await register('other@example.com');
  const create = async (entity, data, cookie = a.cookie) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const client = await create('Client', { name: 'Sign client', email: 'client@example.com', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Deck repair', client_id: client.id });
  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-100',
    status: 'draft',
    tax_rate: 10,
    lines: [{ description: 'Labor', labor_amount: 200, labor_hours: 4, labor_rate: 50 }],
    subtotal: 200,
    tax_amount: 20,
    total: 220,
  });

  const sent = await request(`/estimates/${estimate.id}/send-sign`, {
    method: 'POST', cookie: a.cookie, data: { channel: 'link' },
  });
  assert.equal(sent.status, 201, sent.data?.message);
  assert.match(sent.data.sign_url, /\/sign\/[a-f0-9]{64}$/);
  assert.equal(sent.data.delivery, 'stubbed');
  const token = sent.data.sign_url.split('/').pop();

  assert.equal((await request(`/entities/Estimate/${estimate.id}`, { cookie: a.cookie })).data.status, 'sent');
  assert.equal((await request(`/estimates/${estimate.id}/send-sign`, { method: 'POST', cookie: b.cookie, data: { channel: 'link' } })).status, 404);

  const publicView = await request(`/sign/${token}`);
  assert.equal(publicView.status, 200);
  assert.equal(publicView.data.estimate.number, 'EST-100');
  assert.equal(publicView.data.estimate.total, 220);
  assert.equal(publicView.data.job.title, 'Deck repair');

  // Sign link is public and unauthenticated: internal line detail must not leak to the customer
  assert.equal(publicView.data.estimate.lines[0].labor_amount, 200);
  assert.equal(publicView.data.estimate.lines[0].labor_hours, undefined);
  assert.equal(publicView.data.estimate.lines[0].labor_rate, undefined);
  assert.equal(publicView.data.document, undefined);

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const signed = await request(`/sign/${token}`, {
    method: 'POST',
    data: { signer_name: 'Pat Client', signature_data_url: png },
  });
  assert.equal(signed.status, 200, signed.data?.message);
  assert.equal(signed.data.estimate.status, 'accepted');

  const after = (await request(`/entities/Estimate/${estimate.id}`, { cookie: a.cookie })).data;
  assert.equal(after.status, 'accepted');
  assert.equal(after.signer_name, 'Pat Client');
  assert.ok(after.signed_at);
  assert.ok(after.signature_file_url);
  assert.equal(after.accepted_snapshot.total, 220);
  assert.equal(after.accepted_snapshot.lines[0].labor_amount, 200);

  // Signed hardcopy appears as a document timeline entry on the job
  const docs = (await request(`/entities/TimelineEntry?job_id=${job.id}`, { cookie: a.cookie })).data
    .filter(e => e.category === 'document' && e.photo_url === after.signature_file_url);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].type, 'estimate_signed');
  assert.match(docs[0].text, /Pat Client/);

  // Deleting the timeline copy of the signature must not orphan the file the live Estimate still uses
  assert.equal((await request(`/entities/TimelineEntry/${docs[0].id}`, { method: 'DELETE', cookie: a.cookie })).status, 200);
  assert.equal((await request(after.signature_file_url.replace('/api', ''), { cookie: a.cookie })).status, 200);

  // Accepted estimate is print/view only — content edits rejected
  const edited = await request(`/entities/Estimate/${estimate.id}`, {
    method: 'PATCH', cookie: a.cookie, data: { notes: 'Adjusted after sign', lines: [{ description: 'Labor', labor_amount: 250 }] },
  });
  assert.equal(edited.status, 400);
  const afterFreeze = (await request(`/entities/Estimate/${estimate.id}`, { cookie: a.cookie })).data;
  assert.equal(afterFreeze.status, 'accepted');
  assert.equal(afterFreeze.accepted_snapshot.total, 220);
  assert.equal(afterFreeze.lines[0].labor_amount, 200);

  // Token is single-use
  assert.equal((await request(`/sign/${token}`, { method: 'POST', data: { signer_name: 'Again', signature_data_url: png } })).status, 400);

  // Other accounts cannot see the signature file
  assert.equal((await request(after.signature_file_url.replace('/api', ''), { cookie: b.cookie })).status, 404);
  assert.equal((await request(after.signature_file_url.replace('/api', ''), { cookie: a.cookie })).status, 200);
});

test('work order from accepted estimate maps dual lines with work categories', async t => {
  const { request, register } = await fixture(t);
  const a = await register('wo@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const client = await create('Client', { name: 'WO client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'WO job', client_id: client.id });
  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-WO',
    status: 'accepted',
    tax_rate: 6,
    lines: [{
      description: 'Replace faucet',
      category: 'Plumbing',
      labor_amount: 110,
      labor_hours: 2,
      labor_rate: 55,
      material_amount: 45,
    }],
    subtotal: 155,
    tax_amount: 9.3,
    total: 164.3,
    accepted_snapshot: {
      number: 'EST-WO',
      tax_rate: 6,
      lines: [{
        description: 'Replace faucet',
        category: 'Plumbing',
        labor_amount: 110,
        labor_hours: 2,
        labor_rate: 55,
        material_amount: 45,
      }],
      subtotal: 155,
      tax_amount: 9.3,
      total: 164.3,
    },
  });

  assert.equal((await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: estimate.id },
  })).status, 201);

  const first = (await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: estimate.id },
  }));
  assert.equal(first.status, 200);
  const wo = first.data;
  assert.equal(wo.related_estimate_id, estimate.id);
  assert.ok(wo.lines.some(l => l.kind === 'labor' && l.hours === 2 && l.work_category === 'Plumbing'));
  assert.ok(wo.lines.some(l => l.kind === 'material' && l.unit_price === 45));

  // Idempotent — does not create a second work order
  const again = (await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: estimate.id },
  })).data;
  assert.equal(again.id, wo.id);

  const timeline = (await request(`/entities/TimelineEntry?job_id=${job.id}`, { cookie: a.cookie })).data;
  assert.ok(timeline.some(e => e.type === 'work_order_created'));

  const mo = await create('MaterialOrder', {
    job_id: job.id,
    number: 'MO-001',
    status: 'draft',
    lines: [{ description: 'Faucet cartridge', qty: 1, unit_price: 24 }],
  });
  assert.equal(mo.number, 'MO-001');
  assert.equal(mo.lines[0].unit_price, 24);

  const patched = await request(`/entities/WorkOrder/${wo.id}`, {
    method: 'PATCH', cookie: a.cookie,
    data: { lines: wo.lines.map((l, i) => i === 0 ? { ...l, hours: 3, work_category: 'Plumbing' } : l) },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.lines[0].hours, 3);
});

test('change order e-sign updates authorized total; draft CO excluded', async t => {
  const { request, register } = await fixture(t);
  const a = await register('co@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const client = await create('Client', { name: 'CO client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'CO job', client_id: client.id });
  await create('Estimate', {
    job_id: job.id,
    number: 'EST-CO',
    status: 'accepted',
    total: 1000,
    accepted_snapshot: { total: 1000, lines: [], number: 'EST-CO' },
  });
  const draftCo = await create('ChangeOrder', {
    job_id: job.id, number: 'CO-001', status: 'draft', added_cost: 500, credit: 0, net_change: 500,
  });
  const signCo = await create('ChangeOrder', {
    job_id: job.id, number: 'CO-002', status: 'draft', added_cost: 200, credit: 50, net_change: 150,
  });

  let auth = (await request(`/jobs/${job.id}/authorized-total`, { cookie: a.cookie })).data;
  assert.equal(auth.baseline, 1000);
  assert.equal(auth.authorized_total, 1000);
  assert.deepEqual(auth.approved_change_order_ids, []);

  const sent = await request(`/change-orders/${signCo.id}/send-sign`, {
    method: 'POST', cookie: a.cookie, data: { channel: 'link' },
  });
  assert.equal(sent.status, 201, sent.data?.message);
  const token = sent.data.sign_url.split('/').pop();
  const publicView = await request(`/sign/${token}`);
  assert.equal(publicView.status, 200);
  assert.equal(publicView.data.link.entity, 'ChangeOrder');
  assert.equal(publicView.data.change_order.number, 'CO-002');

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const signed = await request(`/sign/${token}`, {
    method: 'POST', data: { signer_name: 'Alex Client', signature_data_url: png },
  });
  assert.equal(signed.status, 200, signed.data?.message);
  assert.equal(signed.data.document.status, 'approved');

  const approved = (await request(`/entities/ChangeOrder/${signCo.id}`, { cookie: a.cookie })).data;
  assert.equal(approved.status, 'approved');
  assert.equal(approved.net_change, 150);
  assert.equal(approved.revised_contract_total, 1150);
  assert.ok(approved.accepted_snapshot);

  auth = (await request(`/jobs/${job.id}/authorized-total`, { cookie: a.cookie })).data;
  assert.equal(auth.authorized_total, 1150);
  assert.ok(auth.approved_change_order_ids.includes(signCo.id));
  assert.ok(!auth.approved_change_order_ids.includes(draftCo.id));

  const docs = (await request(`/entities/TimelineEntry?job_id=${job.id}`, { cookie: a.cookie })).data
    .filter(e => e.category === 'document' && e.photo_url === approved.signature_file_url);
  assert.equal(docs.length, 1);

  // Still editable after approval
  const edited = await request(`/entities/ChangeOrder/${signCo.id}`, {
    method: 'PATCH', cookie: a.cookie, data: { notes: 'Post-sign note' },
  });
  assert.equal(edited.data.notes, 'Post-sign note');
  assert.equal(edited.data.status, 'approved');
});

test('credit change order can sign when revised total goes below baseline', async t => {
  const { request, register } = await fixture(t);
  const a = await register('credit-co@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const client = await create('Client', { name: 'Credit client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Credit job', client_id: client.id });
  await create('Estimate', {
    job_id: job.id,
    number: 'EST-CR',
    status: 'accepted',
    total: 500,
    accepted_snapshot: { total: 500, lines: [], number: 'EST-CR' },
  });
  const co = await create('ChangeOrder', {
    job_id: job.id,
    number: 'CO-CREDIT',
    status: 'draft',
    credit: 600,
    added_cost: 0,
    net_change: -600,
    lines: [{ description: 'Remove vanity', amount: -600 }],
  });
  const sent = await request(`/change-orders/${co.id}/send-sign`, {
    method: 'POST', cookie: a.cookie, data: { channel: 'link' },
  });
  assert.equal(sent.status, 201, sent.data?.message);
  const token = sent.data.sign_url.split('/').pop();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const signed = await request(`/sign/${token}`, {
    method: 'POST', data: { signer_name: 'Credit Client', signature_data_url: png },
  });
  assert.equal(signed.status, 200, signed.data?.message);
  const after = (await request(`/entities/ChangeOrder/${co.id}`, { cookie: a.cookie })).data;
  assert.equal(after.status, 'approved');
  assert.equal(after.revised_contract_total, -100);
  assert.equal(after.accepted_snapshot.revised_contract_total, -100);
  assert.equal(after.accepted_snapshot.lines[0].amount, -600);
});

test('second unused sign link cannot overwrite accepted snapshot', async t => {
  const { request, register } = await fixture(t);
  const a = await register('double-sign@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const client = await create('Client', { name: 'Double client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Double job', client_id: client.id });
  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-DBL',
    status: 'draft',
    total: 300,
    lines: [{ description: 'Labor', labor_amount: 300 }],
    subtotal: 300,
    tax_amount: 0,
  });
  const first = await request(`/estimates/${estimate.id}/send-sign`, {
    method: 'POST', cookie: a.cookie, data: { channel: 'link' },
  });
  assert.equal(first.status, 201);
  const second = await request(`/estimates/${estimate.id}/send-sign`, {
    method: 'POST', cookie: a.cookie, data: { channel: 'link' },
  });
  assert.equal(second.status, 201);
  const token1 = first.data.sign_url.split('/').pop();
  const token2 = second.data.sign_url.split('/').pop();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const signed = await request(`/sign/${token1}`, {
    method: 'POST', data: { signer_name: 'First Signer', signature_data_url: png },
  });
  assert.equal(signed.status, 200, signed.data?.message);
  const afterFirst = (await request(`/entities/Estimate/${estimate.id}`, { cookie: a.cookie })).data;
  assert.equal(afterFirst.status, 'accepted');
  assert.equal(afterFirst.signer_name, 'First Signer');
  assert.equal(afterFirst.accepted_snapshot.total, 300);

  // Leftover unused link must not overwrite the frozen snapshot
  assert.equal((await request(`/sign/${token2}`, {
    method: 'POST', data: { signer_name: 'Second Signer', signature_data_url: png },
  })).status, 400);

  const afterSecond = (await request(`/entities/Estimate/${estimate.id}`, { cookie: a.cookie })).data;
  assert.equal(afterSecond.signer_name, 'First Signer');
  assert.equal(afterSecond.accepted_snapshot.total, 300);

  // New send-sign blocked while accepted
  assert.equal((await request(`/estimates/${estimate.id}/send-sign`, {
    method: 'POST', cookie: a.cookie, data: { channel: 'link' },
  })).status, 400);
});

test('voiding an estimate with an outstanding sign link reports void, not signed', async t => {
  const { request, register } = await fixture(t);
  const a = await register('void-sign-link@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const client = await create('Client', { name: 'Void-sign client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Void-sign job', client_id: client.id });
  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-VOID',
    status: 'draft',
    total: 150,
    lines: [{ description: 'Labor', labor_amount: 150 }],
    subtotal: 150,
    tax_amount: 0,
  });
  const sent = await request(`/estimates/${estimate.id}/send-sign`, {
    method: 'POST', cookie: a.cookie, data: { channel: 'link' },
  });
  assert.equal(sent.status, 201, sent.data?.message);
  const token = sent.data.sign_url.split('/').pop();

  // Owner voids the estimate before the customer ever opens the link (job cancelled, etc.)
  const voided = await request(`/documents/Estimate/${estimate.id}/void`, { method: 'POST', cookie: a.cookie, data: {} });
  assert.equal(voided.status, 200, voided.data?.message);

  // The link was consumed by voiding, but the customer must be told it's void, not that it was signed
  const publicView = await request(`/sign/${token}`);
  assert.equal(publicView.status, 200);
  assert.equal(publicView.data.link.used, true);
  assert.equal(publicView.data.link.signed, false);
  assert.equal(publicView.data.link.unavailable, 'void');

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const attempt = await request(`/sign/${token}`, {
    method: 'POST', data: { signer_name: 'Too Late', signature_data_url: png },
  });
  assert.equal(attempt.status, 400);
  assert.match(attempt.data.message, /no longer available/);
});

test('status edit cannot bypass accepted_snapshot freeze', async t => {
  const { request, register } = await fixture(t);
  const a = await register('status-bypass@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const client = await create('Client', { name: 'Bypass client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Bypass job', client_id: client.id });
  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-BYP',
    status: 'draft',
    total: 100,
    lines: [{ description: 'Labor', labor_amount: 100 }],
    subtotal: 100,
    tax_amount: 0,
  });
  const sent = await request(`/estimates/${estimate.id}/send-sign`, {
    method: 'POST', cookie: a.cookie, data: { channel: 'link' },
  });
  const token = sent.data.sign_url.split('/').pop();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal((await request(`/sign/${token}`, {
    method: 'POST', data: { signer_name: 'Pat', signature_data_url: png },
  })).status, 200);

  // Accepted estimate is print/view only — status/content edits rejected; snapshot stays frozen
  const rolledBack = await request(`/entities/Estimate/${estimate.id}`, {
    method: 'PATCH', cookie: a.cookie, data: { status: 'draft', total: 999 },
  });
  assert.equal(rolledBack.status, 400);

  assert.equal((await request(`/estimates/${estimate.id}/send-sign`, {
    method: 'POST', cookie: a.cookie, data: { channel: 'link' },
  })).status, 400);

  const final = (await request(`/entities/Estimate/${estimate.id}`, { cookie: a.cookie })).data;
  assert.equal(final.status, 'accepted');
  assert.equal(final.accepted_snapshot.total, 100);
  assert.equal(final.total, 100);
  assert.equal(final.signer_name, 'Pat');
});

test('invoice from job autofills estimate + approved COs, balance due, job rollup', async t => {
  const { request, register } = await fixture(t);
  const a = await register('inv@example.com');
  const b = await register('inv-other@example.com');
  const create = async (entity, data, cookie = a.cookie) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };

  await create('CompanyProfile', { name: 'Square This Up', default_tax_rate: 0, default_payment_terms: 'Due upon receipt' });
  const client = await create('Client', { name: 'Invoice client', ...CLIENT_ADDR });
  const job = await create('Job', {
    title: 'Kitchen refresh',
    client_id: client.id,
  });

  assert.equal((await request('/invoices/from-job', {
    method: 'POST', cookie: a.cookie, data: { job_id: job.id },
  })).status, 400);

  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-INV',
    status: 'accepted',
    tax_rate: 0,
    lines: [{
      description: 'Cabinets',
      material_amount: 800,
      labor_amount: 600,
      labor_hours: 12,
      labor_rate: 50,
      equipment_amount: 50,
    }],
    subtotal: 1450,
    tax_amount: 0,
    total: 1450,
    accepted_snapshot: {
      number: 'EST-INV',
      tax_rate: 0,
      lines: [{
        description: 'Cabinets',
        material_amount: 800,
        labor_amount: 600,
        labor_hours: 12,
        labor_rate: 50,
        equipment_amount: 50,
      }],
      subtotal: 1450,
      tax_amount: 0,
      total: 1450,
    },
  });

  // Invoice gated on work order complete
  const woDraft = (await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: estimate.id },
  })).data;
  assert.equal((await request('/invoices/from-job', {
    method: 'POST', cookie: a.cookie, data: { job_id: job.id },
  })).status, 400);
  await request(`/entities/WorkOrder/${woDraft.id}`, {
    method: 'PATCH', cookie: a.cookie, data: { status: 'complete' },
  });

  const approvedCo = await create('ChangeOrder', {
    job_id: job.id,
    number: 'CO-INV',
    status: 'approved',
    description: 'Extra hardware',
    added_cost: 100,
    credit: 0,
    net_change: 100,
    accepted_snapshot: { number: 'CO-INV', net_change: 100, lines: [] },
  });
  await create('ChangeOrder', {
    job_id: job.id,
    number: 'CO-DRAFT',
    status: 'draft',
    added_cost: 500,
    net_change: 500,
  });

  await create('TimelineEntry', {
    job_id: job.id,
    type: 'deposit_received',
    text: 'Deposit received',
    category: 'financial',
    amount: 200,
  });
  await create('TimelineEntry', {
    job_id: job.id,
    type: 'payment_received',
    text: 'Partial payment',
    category: 'financial',
    amount: 150,
  });

  const created = await request('/invoices/from-job', {
    method: 'POST', cookie: a.cookie, data: { job_id: job.id },
  });
  assert.equal(created.status, 201, created.data?.message);
  const inv = created.data;
  assert.equal(inv.status, 'draft');
  assert.ok(inv.material_lines.some(l => l.unit_price === 800));
  assert.ok(inv.labor_lines.some(l => l.hours === 12 && l.rate === 50));
  assert.ok(inv.misc_lines.some(l => /equipment/i.test(l.description)));
  assert.ok(inv.misc_lines.some(l => /CO-INV/.test(l.description) && l.amount === 100));
  assert.deepEqual(inv.billed_change_order_ids, [approvedCo.id]);
  assert.equal(inv.estimate_ref, 'EST-INV');
  assert.equal(inv.change_order_refs, 'CO-INV');
  assert.equal(inv.payment_terms, 'Due upon receipt');
  assert.equal(inv.deposits_applied, 200);
  assert.equal(inv.payments_applied, 150);
  assert.equal(inv.total, 1550);
  assert.equal(inv.authorized_total, 1550);
  assert.equal(inv.over_authorized, false);
  assert.equal(inv.balance_due, 1200);

  const jobAfter = (await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data;
  assert.equal(jobAfter.invoice_amount, inv.total);

  // One invoice per job — second call returns the existing invoice
  const again = await request('/invoices/from-job', {
    method: 'POST', cookie: a.cookie, data: { job_id: job.id },
  });
  assert.equal(again.status, 200);
  assert.equal(again.data.id, inv.id);

  // Job financial scalars are not client-writable
  const moneyPatch = await request(`/entities/Job/${job.id}`, {
    method: 'PATCH', cookie: a.cookie,
    data: { estimate_amount: 9999, deposit_amount: 1, materials_cost: 2, invoice_amount: 3 },
  });
  assert.equal(moneyPatch.status, 200);
  assert.notEqual(moneyPatch.data.estimate_amount, 9999);
  assert.equal(moneyPatch.data.invoice_amount, inv.total);

  // Editable after autofill
  const patched = await request(`/entities/Invoice/${inv.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: {
      notes: 'Adjusted',
      material_lines: [...inv.material_lines, { description: 'Extra tile', qty: 1, unit_price: 50 }],
    },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.notes, 'Adjusted');
  assert.equal(patched.data.material_lines.length, inv.material_lines.length + 1);

  // Ownership
  assert.equal((await request('/invoices/from-job', {
    method: 'POST', cookie: b.cookie, data: { job_id: job.id },
  })).status, 404);
  assert.equal((await request(`/entities/Invoice/${inv.id}`, { cookie: b.cookie })).status, 404);

  // No invoice e-sign route
  assert.equal((await request(`/invoices/${inv.id}/send-sign`, {
    method: 'POST', cookie: a.cookie, data: { channel: 'link' },
  })).status, 404);
});

test('export backup includes form entities and company profile', async t => {
  const { request, register } = await fixture(t);
  const a = await register('export-forms@example.com');
  const client = (await request('/entities/Client', { method: 'POST', cookie: a.cookie, data: { name: 'Forms Client', ...CLIENT_ADDR } })).data;
  const job = (await request('/entities/Job', { method: 'POST', cookie: a.cookie, data: { title: 'Forms Job', client_id: client.id } })).data;
  await request('/entities/CompanyProfile', { method: 'POST', cookie: a.cookie, data: { name: 'Acme Handyman', default_tax_rate: 10 } });
  const estimate = (await request('/entities/Estimate', { method: 'POST', cookie: a.cookie, data: {
    job_id: job.id, number: 'EST-EX', status: 'accepted', lines: [{ description: 'Labor', labor_amount: 100 }], total: 100,
    accepted_snapshot: { number: 'EST-EX', total: 100, lines: [{ description: 'Labor', labor_amount: 100 }] },
  }})).data;
  const wo = (await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: estimate.id },
  })).data;
  await request(`/entities/WorkOrder/${wo.id}`, { method: 'PATCH', cookie: a.cookie, data: { status: 'complete' } });
  await request('/invoices/from-job', { method: 'POST', cookie: a.cookie, data: { job_id: job.id } });

  const exported = (await request('/export', { cookie: a.cookie })).data;
  const entities = new Set(exported.records.map(r => r.entity));
  for (const name of ['Client', 'Job', 'CompanyProfile', 'Estimate', 'Invoice', 'WorkOrder']) {
    assert.ok(entities.has(name), `export missing ${name}`);
  }
  assert.ok(exported.records.some(r => r.entity === 'Estimate' && r.number === 'EST-EX'));
  assert.ok(exported.records.some(r => r.entity === 'Invoice'));
});

test('void and revise document rules; partial invoice status; ownership', async t => {
  const { request, register } = await fixture(t);
  const a = await register('void-revise@example.com');
  const b = await register('void-other@example.com');
  const client = (await request('/entities/Client', { method: 'POST', cookie: a.cookie, data: { name: 'VR Client', ...CLIENT_ADDR } })).data;
  const job = (await request('/entities/Job', {
    method: 'POST', cookie: a.cookie,
    data: { title: 'VR Job', client_id: client.id },
  })).data;

  const estimate = (await request('/entities/Estimate', { method: 'POST', cookie: a.cookie, data: {
    job_id: job.id,
    number: 'EST-VR',
    status: 'accepted',
    tax_rate: 0,
    lines: [{ description: 'Labor', labor_amount: 500, labor_hours: 10, labor_rate: 50 }],
    total: 500,
    accepted_snapshot: {
      number: 'EST-VR', tax_rate: 0, total: 500,
      lines: [{ description: 'Labor', labor_amount: 500, labor_hours: 10, labor_rate: 50 }],
    },
  }})).data;

  // Cannot re-sign accepted
  assert.equal((await request(`/estimates/${estimate.id}/send-sign`, {
    method: 'POST', cookie: a.cookie, data: { channel: 'link' },
  })).status, 400);

  // Singular docs cannot be revised
  const revisionBlocked = await request(`/documents/Estimate/${estimate.id}/revise`, {
    method: 'POST', cookie: a.cookie, data: {},
  });
  assert.equal(revisionBlocked.status, 400);

  // Change orders can still be revised
  const co = (await request('/entities/ChangeOrder', { method: 'POST', cookie: a.cookie, data: {
    job_id: job.id, number: 'CO-VR', status: 'draft', added_cost: 50, net_change: 50,
  }})).data;
  const coRev = await request(`/documents/ChangeOrder/${co.id}/revise`, {
    method: 'POST', cookie: a.cookie, data: {},
  });
  assert.equal(coRev.status, 201, coRev.data?.message);
  assert.equal(coRev.data.status, 'draft');
  assert.match(coRev.data.number, /CO-VR-R/);

  // Ownership on revise/void
  assert.equal((await request(`/documents/ChangeOrder/${co.id}/revise`, {
    method: 'POST', cookie: b.cookie, data: {},
  })).status, 404);

  const voided = await request(`/documents/ChangeOrder/${coRev.data.id}/void`, {
    method: 'POST', cookie: a.cookie, data: {},
  });
  assert.equal(voided.status, 200);
  assert.equal(voided.data.status, 'void');

  const wo = (await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: estimate.id },
  })).data;
  await request(`/entities/WorkOrder/${wo.id}`, {
    method: 'PATCH', cookie: a.cookie, data: { status: 'complete' },
  });

  const inv = await request('/invoices/from-job', {
    method: 'POST', cookie: a.cookie, data: { job_id: job.id },
  });
  assert.equal(inv.status, 201, inv.data?.message);
  assert.equal(inv.data.prior_invoiced, 0);
  assert.equal(inv.data.over_authorized, false);

  // Mark sent with partial payment → partial
  const partial = await request(`/entities/Invoice/${inv.data.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: {
      status: 'sent',
      payments_applied: 100,
      balance_due: 400,
      total: 500,
      deposits_applied: 0,
      labor_lines: inv.data.labor_lines,
      material_lines: inv.data.material_lines,
      misc_lines: inv.data.misc_lines,
    },
  });
  assert.equal(partial.status, 200);
  assert.equal(partial.data.status, 'partial');

  // Second invoice from-job returns the same invoice (one per job)
  const inv2 = await request('/invoices/from-job', {
    method: 'POST', cookie: a.cookie, data: { job_id: job.id },
  });
  assert.equal(inv2.status, 200);
  assert.equal(inv2.data.id, inv.data.id);

  // Void invoice → rollup drops; can create a replacement
  const voidInv = await request(`/documents/Invoice/${inv.data.id}/void`, {
    method: 'POST', cookie: a.cookie, data: {},
  });
  assert.equal(voidInv.status, 200);
  const jobAfterVoid = (await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data;
  assert.equal(jobAfterVoid.invoice_amount, 0);

  const replacement = await request('/invoices/from-job', {
    method: 'POST', cookie: a.cookie, data: { job_id: job.id },
  });
  assert.equal(replacement.status, 201);
  const jobAfter = (await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data;
  assert.equal(jobAfter.invoice_amount, replacement.data.total);

  // Paid invoice cannot be voided
  await request(`/documents/Invoice/${replacement.data.id}/void`, {
    method: 'POST', cookie: a.cookie, data: {},
  });
  const paid = (await request('/invoices/from-job', {
    method: 'POST', cookie: a.cookie, data: { job_id: job.id },
  })).data;
  await request(`/entities/Invoice/${paid.id}`, {
    method: 'PATCH', cookie: a.cookie,
    data: {
      status: 'paid', total: 10, balance_due: 0, payments_applied: 10, deposits_applied: 0,
      material_lines: [], labor_lines: [], misc_lines: [],
    },
  });
  assert.equal((await request(`/documents/Invoice/${paid.id}/void`, {
    method: 'POST', cookie: a.cookie, data: {},
  })).status, 400);
});

test('document rules: void estimates excluded, deposits sum, freeze snapshot, job_id move, rollups', async t => {
  const { db, request, register } = await fixture(t);
  const a = await register('rules-fix@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const me = (await request('/auth/me', { cookie: a.cookie })).data;
  const client = await create('Client', { name: 'Rules client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Rules job', client_id: client.id });
  const job2 = await create('Job', { title: 'Other job', client_id: client.id });

  assert.equal(sumDepositsApplied({ deposit_amount: 200 }, [{ type: 'deposit_received', amount: 100 }]), 300);
  assert.equal(isLiveAcceptedEstimate({ status: 'void', accepted_snapshot: { total: 1 } }), false);
  assert.equal(findLiveAcceptedEstimate([
    { status: 'void', accepted_snapshot: { total: 99 } },
    { status: 'accepted', accepted_snapshot: { total: 50 } },
  ]).accepted_snapshot.total, 50);

  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-RULES',
    status: 'accepted',
    total: 400,
    lines: [{ description: 'Labor', labor_amount: 400 }],
    accepted_snapshot: { number: 'EST-RULES', total: 400, lines: [{ description: 'Labor', labor_amount: 400 }] },
  });

  // Freeze signature / snapshot fields
  assert.equal((await request(`/entities/Estimate/${estimate.id}`, {
    method: 'PATCH', cookie: a.cookie,
    data: { accepted_snapshot: { number: 'HACK', total: 1, lines: [] }, signer_name: 'Attacker' },
  })).status, 400);

  const wo = (await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: estimate.id },
  })).data;

  // Void estimate clears estimate_amount and blocks from-estimate
  assert.equal((await request(`/documents/Estimate/${estimate.id}/void`, {
    method: 'POST', cookie: a.cookie, data: {},
  })).status, 200);
  assert.equal((await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data.estimate_amount, 0);
  assert.equal((await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: estimate.id },
  })).status, 400);

  // Replacement: void WO, create new accepted estimate, new WO
  await request(`/documents/WorkOrder/${wo.id}/void`, { method: 'POST', cookie: a.cookie, data: {} });
  const accepted2 = await create('Estimate', {
    job_id: job.id,
    number: 'EST-OK',
    status: 'accepted',
    total: 250,
    lines: [{ description: 'Labor', labor_amount: 250 }],
    accepted_snapshot: { number: 'EST-OK', total: 250, lines: [{ description: 'Labor', labor_amount: 250 }] },
  });
  const wo2 = (await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: accepted2.id },
  })).data;
  await request(`/entities/WorkOrder/${wo2.id}`, { method: 'PATCH', cookie: a.cookie, data: { status: 'complete' } });

  // Legacy deposit_amount + timeline deposit both apply
  await saveRecord(db, me.id, 'Job', { deposit_amount: 200 }, job.id);
  await create('TimelineEntry', {
    job_id: job.id, type: 'deposit_received', text: 'More deposit', category: 'financial', amount: 100,
  });
  const inv = await request('/invoices/from-job', { method: 'POST', cookie: a.cookie, data: { job_id: job.id } });
  assert.equal(inv.status, 201, inv.data?.message);
  assert.equal(inv.data.deposits_applied, 300);

  // Material order void clears materials_cost
  const mo = await create('MaterialOrder', {
    job_id: job.id, number: 'MO-1', status: 'draft',
    lines: [{ description: 'Parts', qty: 1, unit_price: 40 }],
    total: 40,
  });
  await request(`/entities/MaterialOrder/${mo.id}`, {
    method: 'PATCH', cookie: a.cookie, data: { total: 40 },
  });
  assert.equal((await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data.materials_cost, 40);
  await request(`/documents/MaterialOrder/${mo.id}/void`, { method: 'POST', cookie: a.cookie, data: {} });
  assert.equal((await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data.materials_cost, 0);

  // Moving a material order refreshes materials_cost on both source and destination jobs
  const moMove = await create('MaterialOrder', {
    job_id: job.id, number: 'MO-MOVE', status: 'draft',
    lines: [{ description: 'Lumber', qty: 2, unit_price: 25 }],
    total: 50,
  });
  await request(`/entities/MaterialOrder/${moMove.id}`, {
    method: 'PATCH', cookie: a.cookie, data: { total: 50 },
  });
  assert.equal((await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data.materials_cost, 50);
  assert.equal((await request(`/entities/MaterialOrder/${moMove.id}`, {
    method: 'PATCH', cookie: a.cookie, data: { job_id: job2.id },
  })).status, 200);
  assert.equal((await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data.materials_cost, 0);
  assert.equal((await request(`/entities/Job/${job2.id}`, { cookie: a.cookie })).data.materials_cost, 50);

  // Cannot move invoice onto a job without a complete WO
  assert.equal((await request(`/entities/Invoice/${inv.data.id}`, {
    method: 'PATCH', cookie: a.cookie, data: { job_id: job2.id },
  })).status, 400);

  // Cannot move WO onto a job that already has an active WO
  const estB = await create('Estimate', {
    job_id: job2.id, number: 'EST-B', status: 'accepted', total: 10,
    lines: [{ description: 'x', labor_amount: 10 }],
    accepted_snapshot: { number: 'EST-B', total: 10, lines: [{ description: 'x', labor_amount: 10 }] },
  });
  const woB = (await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: estB.id },
  })).data;
  assert.equal((await request(`/entities/WorkOrder/${wo2.id}`, {
    method: 'PATCH', cookie: a.cookie, data: { job_id: job2.id },
  })).status, 409);
  assert.equal(woB.id != null, true);
});

test('material order redesign: statuses, line fields, autofill from estimate/WO', async t => {
  const { request, register } = await fixture(t);
  const a = await register('mo-redesign@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const client = await create('Client', { name: 'MO redesign', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'MO job', client_id: client.id });

  // Saving estimate materials creates/updates a draft Material Order (no invented prices)
  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-MO',
    status: 'draft',
    lines: [
      { description: 'Replace faucet', category: 'Plumbing', material_amount: 48, labor_amount: 110, labor_hours: 2, labor_rate: 55 },
    ],
  });
  let mos = (await request(`/entities/MaterialOrder?job_id=${job.id}`, { cookie: a.cookie })).data;
  assert.equal(mos.length, 1);
  assert.equal(mos[0].status, 'draft');
  assert.equal(mos[0].lines.length, 1);
  assert.equal(mos[0].lines[0].unit_price, 48);
  assert.equal(mos[0].lines[0].source_entity, 'Estimate');
  assert.equal(mos[0].lines[0].wo_line_number, undefined);
  assert.equal(mos[0].lines[0].line_status, undefined);

  // Legacy ordered → purchased; new line fields persist
  const patched = await request(`/entities/MaterialOrder/${mos[0].id}`, {
    method: 'PATCH', cookie: a.cookie,
    data: {
      status: 'ordered',
      lines: [{
        ...mos[0].lines[0],
        supplier: 'Home Depot',
        on_hand: true,
        line_status: 'pricing',
        notes: 'chrome finish',
      }],
      total: 48,
    },
  });
  assert.equal(patched.status, 200, patched.data?.message);
  assert.equal(patched.data.status, 'purchased');
  assert.equal(patched.data.lines[0].supplier, 'Home Depot');
  assert.equal(patched.data.lines[0].on_hand, true);
  assert.equal(patched.data.lines[0].line_status, 'pricing');

  // Clearing line_status stores unset (not coerced to pricing)
  const cleared = await request(`/entities/MaterialOrder/${mos[0].id}`, {
    method: 'PATCH', cookie: a.cookie,
    data: {
      status: 'purchased',
      lines: [{
        description: mos[0].lines[0].description,
        qty: 1,
        unit_price: 48,
        supplier: 'Home Depot',
        on_hand: true,
      }],
      total: 48,
    },
  });
  assert.equal(cleared.status, 200, cleared.data?.message);
  assert.equal(cleared.data.lines[0].line_status, undefined);

  // Receipt photo linked to this Material Order (+ job gallery/timeline via TimelineEntry)
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'receipt.png');
  const upload = await request('/files', { method: 'POST', cookie: a.cookie, form });
  assert.equal(upload.status, 201, upload.data?.message);
  const receipt = await request('/entities/TimelineEntry', {
    method: 'POST', cookie: a.cookie,
    data: {
      job_id: job.id,
      type: 'receipt',
      category: 'receipt',
      text: 'Receipt · Material Order MO',
      photo_url: upload.data.file_url,
      related_material_order_id: mos[0].id,
    },
  });
  assert.equal(receipt.status, 201, receipt.data?.message);
  assert.equal(receipt.data.related_material_order_id, mos[0].id);
  assert.equal(receipt.data.category, 'receipt');

  // Wrong-job Material Order link rejected
  const job2 = await create('Job', { title: 'Other job', client_id: client.id });
  const otherMo = await create('MaterialOrder', { job_id: job2.id, number: 'MO-OTHER', status: 'draft', lines: [] });
  assert.equal((await request('/entities/TimelineEntry', {
    method: 'POST', cookie: a.cookie,
    data: {
      job_id: job.id,
      type: 'receipt',
      category: 'receipt',
      photo_url: upload.data.file_url,
      related_material_order_id: otherMo.id,
    },
  })).status, 400);
  // New statuses accepted
  for (const status of ['quote', 'partial', 'received', 'void']) {
    const mo = await create('MaterialOrder', {
      job_id: job.id, number: `MO-${status}`, status, lines: [], total: 0,
    });
    assert.equal(mo.status, status);
  }

  // Void purchased so its materials no longer claim the source fingerprint —
  // then a draft can receive WO Line# sync without doubling materials_cost.
  assert.equal((await request(`/documents/MaterialOrder/${mos[0].id}/void`, {
    method: 'POST', cookie: a.cookie, data: {},
  })).status, 200);

  const draftMo = await create('MaterialOrder', {
    job_id: job.id, number: 'MO-DRAFT-SYNC', status: 'draft', lines: [],
  });
  assert.ok((draftMo.lines || []).length >= 1, 'empty draft fills from estimate after purchased voided');

  await request(`/entities/Estimate/${estimate.id}`, {
    method: 'PATCH', cookie: a.cookie,
    data: {
      status: 'accepted',
      total: 158,
      accepted_snapshot: {
        number: 'EST-MO',
        total: 158,
        lines: estimate.lines,
      },
    },
  });
  const wo = (await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: estimate.id },
  })).data;
  assert.ok(wo.lines.some((l) => l.kind === 'material'));

  mos = (await request(`/entities/MaterialOrder?job_id=${job.id}`, { cookie: a.cookie })).data;
  const draftWithWo = mos.find((m) => m.status === 'draft' && m.lines?.some((l) => l.source_entity === 'WorkOrder'));
  assert.ok(draftWithWo, 'expected a draft MO synced from Work Order');
  const woLine = draftWithWo.lines.find((l) => l.source_entity === 'WorkOrder');
  assert.ok(woLine.wo_line_number >= 1);
  assert.equal(woLine.unit_price, 48);

  // Line status enum validation
  assert.equal((await request(`/entities/MaterialOrder/${draftMo.id}`, {
    method: 'PATCH', cookie: a.cookie,
    data: { lines: [{ description: 'x', line_status: 'not-a-status' }] },
  })).status, 400);

  for (const line_status of ['backorder', 'unavailable', 'canceled', 'rebuild']) {
    const ok = await request(`/entities/MaterialOrder/${draftMo.id}`, {
      method: 'PATCH', cookie: a.cookie,
      data: { status: 'draft', lines: [{ description: 'part', qty: 1, unit_price: 1, line_status }] },
    });
    assert.equal(ok.status, 200, line_status);
    assert.equal(ok.data.lines[0].line_status, line_status);
  }
});

test('material order sync: no draft clone on New MO; void source clears draft lines', async t => {
  const { request, register } = await fixture(t);
  const a = await register('mo-sync-fix@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const client = await create('Client', { name: 'MO sync fix', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'MO sync job', client_id: client.id });

  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-SYNC',
    status: 'draft',
    lines: [{ description: 'Pipe', category: 'Plumbing', material_amount: 30 }],
  });
  let mos = (await request(`/entities/MaterialOrder?job_id=${job.id}`, { cookie: a.cookie })).data;
  assert.equal(mos.length, 1);
  const firstDraft = mos[0];
  assert.equal(firstDraft.lines.length, 1);
  assert.equal(firstDraft.total, 30);
  assert.equal((await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data.materials_cost, 30);

  // New empty Material Order must not clone synced source lines (would double materials_cost)
  const second = await create('MaterialOrder', {
    job_id: job.id, number: 'MO-002', status: 'draft', lines: [],
  });
  assert.equal(second.lines?.length || 0, 0);
  assert.equal(second.total ?? 0, 0);
  mos = (await request(`/entities/MaterialOrder?job_id=${job.id}`, { cookie: a.cookie })).data;
  const stillFirst = mos.find((m) => m.id === firstDraft.id);
  assert.equal(stillFirst.lines.length, 1);
  assert.equal((await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data.materials_cost, 30);

  // Voiding the estimate clears auto-synced lines from the draft MO
  assert.equal((await request(`/documents/Estimate/${estimate.id}/void`, {
    method: 'POST', cookie: a.cookie, data: {},
  })).status, 200);
  const afterVoid = (await request(`/entities/MaterialOrder/${firstDraft.id}`, { cookie: a.cookie })).data;
  assert.equal(afterVoid.lines.filter((l) => l.source_entity === 'Estimate').length, 0);
  assert.equal(afterVoid.total ?? 0, 0);
  assert.equal((await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data.materials_cost, 0);
});

test('material order sync: purchased MO claims sources; no draft recreate', async t => {
  const { request, register } = await fixture(t);
  const a = await register('mo-purchased-claim@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message);
    return result.data;
  };
  const client = await create('Client', { name: 'MO claim', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'MO claim job', client_id: client.id });

  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-CLAIM',
    status: 'draft',
    lines: [{ description: 'Lumber', category: 'Carpentry', material_amount: 40 }],
  });
  let mos = (await request(`/entities/MaterialOrder?job_id=${job.id}`, { cookie: a.cookie })).data;
  assert.equal(mos.length, 1);
  const draftId = mos[0].id;

  // Promote draft → purchased (still holds the Estimate-sourced materials)
  assert.equal((await request(`/entities/MaterialOrder/${draftId}`, {
    method: 'PATCH', cookie: a.cookie,
    data: {
      status: 'purchased',
      lines: mos[0].lines.map((l) => ({ ...l, qty: 1, unit_price: 55 })),
      total: 55,
    },
  })).status, 200);

  // Re-sync estimate with a different material amount — same source key still claims
  await request(`/entities/Estimate/${estimate.id}`, {
    method: 'PATCH', cookie: a.cookie,
    data: {
      lines: [{ description: 'Lumber', category: 'Carpentry', material_amount: 99 }],
      total: 99,
    },
  });

  mos = (await request(`/entities/MaterialOrder?job_id=${job.id}`, { cookie: a.cookie })).data;
  let live = mos.filter((m) => m.status !== 'void');
  assert.equal(live.length, 1);
  assert.equal(live[0].status, 'purchased');
  assert.equal((await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data.materials_cost, 55);

  // Empty New MO stays empty (purchased claims source key + description)
  const empty = await create('MaterialOrder', { job_id: job.id, number: 'MO-EMPTY', status: 'draft', lines: [] });
  assert.equal(empty.lines?.length || 0, 0);
  assert.equal((await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data.materials_cost, 55);

  // Accept estimate + create WO — must not fill a draft with WO duplicates or double cost
  await request(`/entities/Estimate/${estimate.id}`, {
    method: 'PATCH', cookie: a.cookie,
    data: {
      status: 'accepted',
      total: 99,
      accepted_snapshot: {
        number: 'EST-CLAIM',
        total: 99,
        lines: [{ description: 'Lumber', category: 'Carpentry', material_amount: 99 }],
      },
    },
  });
  const woRes = await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: estimate.id },
  });
  assert.equal(woRes.status, 201, woRes.data?.message);

  mos = (await request(`/entities/MaterialOrder?job_id=${job.id}`, { cookie: a.cookie })).data;
  live = mos.filter((m) => m.status !== 'void');
  assert.equal(live.filter((m) => m.status === 'purchased').length, 1);
  const woFilled = live.filter((m) => (
    m.status === 'draft' && (m.lines || []).some((l) => l.source_entity === 'WorkOrder')
  ));
  assert.equal(woFilled.length, 0, 'WO after purchase must not autofill a duplicate draft');
  assert.equal((await request(`/entities/Job/${job.id}`, { cookie: a.cookie })).data.materials_cost, 55);

  // New CO with a different description still autofills (not already on a past-draft MO)
  await create('ChangeOrder', {
    job_id: job.id,
    number: 'CO-CLAIM',
    status: 'draft',
    lines: [{ description: 'Extra fasteners', amount: 12 }],
  });
  mos = (await request(`/entities/MaterialOrder?job_id=${job.id}`, { cookie: a.cookie })).data;
  live = mos.filter((m) => m.status !== 'void');
  const coDraft = live.find((m) => m.status === 'draft' && (m.lines || []).some((l) => l.source_entity === 'ChangeOrder'));
  assert.ok(coDraft, 'distinct CO description should autofill a draft');
  assert.equal(coDraft.lines.some((l) => l.description === 'Extra fasteners'), true);
});

test('Expense entity: create unassigned and job-linked; ownership enforced; job delete cascades', async t => {
  const { request, register } = await fixture(t);
  const a = await register('expense-a@example.com');
  const b = await register('expense-b@example.com');
  const create = async (entity, data, cookie = a.cookie) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie });
    assert.equal(result.status, 201, result.data?.message || entity);
    return result.data;
  };

  const client = await create('Client', { name: 'Expense Client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Expense Job', client_id: client.id });

  const unassigned = await create('Expense', {
    amount: 42.5,
    date: '2026-09-21',
    category: 'Fuel',
    vendor: 'Shell',
    note: 'Trip to site',
  });
  assert.equal(unassigned.amount, 42.5);
  assert.equal(unassigned.job_id, undefined);
  assert.equal(unassigned.category, 'Fuel');

  const linked = await create('Expense', {
    amount: 18,
    date: '2026-09-20',
    category: 'Materials',
    job_id: job.id,
    note: 'Screws',
  });
  assert.equal(linked.job_id, job.id);

  const listed = (await request('/entities/Expense', { cookie: a.cookie })).data;
  assert.equal(listed.length, 2);

  const byJob = (await request(`/entities/Expense?job_id=${job.id}`, { cookie: a.cookie })).data;
  assert.equal(byJob.length, 1);
  assert.equal(byJob[0].id, linked.id);

  // Cross-account isolation
  assert.deepEqual((await request('/entities/Expense', { cookie: b.cookie })).data, []);
  assert.equal((await request(`/entities/Expense/${linked.id}`, { cookie: b.cookie })).status, 404);
  assert.equal((await request(`/entities/Expense/${linked.id}`, { method: 'PATCH', cookie: b.cookie, data: { amount: 1 } })).status, 404);
  assert.equal((await request('/entities/Expense', { method: 'POST', cookie: b.cookie, data: { amount: 9, job_id: job.id } })).status, 404);

  // Assign unassigned expense to job
  const patched = await request(`/entities/Expense/${unassigned.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { job_id: job.id },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.job_id, job.id);

  // Reject foreign job link
  const bClient = await create('Client', { name: 'B', ...CLIENT_ADDR }, b.cookie);
  const bJob = await create('Job', { title: 'B job', client_id: bClient.id }, b.cookie);
  assert.equal((await request('/entities/Expense', {
    method: 'POST',
    cookie: a.cookie,
    data: { amount: 5, job_id: bJob.id },
  })).status, 404);

  // Job delete cascades job-linked expenses
  assert.equal((await request(`/entities/Job/${job.id}`, { method: 'DELETE', cookie: a.cookie })).status, 200);
  assert.equal((await request(`/entities/Expense/${linked.id}`, { cookie: a.cookie })).status, 404);
  assert.equal((await request(`/entities/Expense/${unassigned.id}`, { cookie: a.cookie })).status, 404);
});

test('Expense with receipt photo requires owned file; export includes Expense', async t => {
  const { request, register } = await fixture(t);
  const a = await register('expense-photo@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message || entity);
    return result.data;
  };

  assert.equal((await request('/entities/Expense', {
    method: 'POST',
    cookie: a.cookie,
    data: { amount: 10, photo_url: '/api/files/00000000-0000-4000-8000-000000000099' },
  })).status, 400);

  const form = new FormData();
  form.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'receipt.png');
  const file = await request('/files', { method: 'POST', cookie: a.cookie, form });
  assert.equal(file.status, 201);

  const expense = await create('Expense', {
    amount: 25,
    category: 'Materials',
    photo_url: file.data.file_url,
    note: 'Unassigned receipt',
  });
  assert.equal(expense.photo_url, file.data.file_url);

  const exported = (await request('/export', { cookie: a.cookie })).data;
  assert.ok(exported.records.some((r) => r.entity === 'Expense' && r.amount === 25));

  assert.equal((await request(`/entities/Expense/${expense.id}`, { method: 'DELETE', cookie: a.cookie })).status, 200);
  assert.equal((await request(file.data.file_url.replace('/api', ''), { cookie: a.cookie })).status, 404);
});

test('Payment: create, ownership enforced, invoice must match job, job delete cascades, export round-trips', async t => {
  const { db, request, register } = await fixture(t);
  const a = await register('payment-a@example.com');
  const b = await register('payment-b@example.com');
  const create = async (entity, data, cookie = a.cookie) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie });
    assert.equal(result.status, 201, result.data?.message || entity);
    return result.data;
  };
  const client = await create('Client', { name: 'Payment client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Payment job', client_id: client.id });
  await create('WorkOrder', { job_id: job.id, number: 'WO-PMT', status: 'complete' });
  const invoice = await create('Invoice', { job_id: job.id, number: 'INV-PMT', status: 'sent', misc_lines: [{ description: 'Total', amount: 200 }] });

  const payment = await request('/payments', { method: 'POST', cookie: a.cookie, data: { job_id: job.id, amount_cents: 5000, invoice_id: invoice.id, method: 'check' } });
  assert.equal(payment.status, 201, payment.data?.message);
  assert.equal(payment.data.amount_cents, 5000);
  assert.equal(payment.data.kind, 'payment');

  // Logged as a plain note, not payment_received — the legacy TimelineEntry-based rollup
  // (server/documentRules.js sumDepositsApplied, FinancialPanel) must not double-count it.
  const entries = (await request(`/entities/TimelineEntry?job_id=${job.id}`, { cookie: a.cookie })).data;
  const note = entries.find((e) => e.category === 'financial' && /Payment of \$50\.00/.test(e.text || ''));
  assert.ok(note, 'expected a financial note TimelineEntry for the payment');
  assert.equal(note.type, 'note');
  assert.equal(note.amount, undefined);

  // Invoice from another job is rejected
  const otherJob = await create('Job', { title: 'Other job', client_id: client.id });
  await create('WorkOrder', { job_id: otherJob.id, number: 'WO-OTHER', status: 'complete' });
  const otherInvoice = await create('Invoice', { job_id: otherJob.id, number: 'INV-OTHER', status: 'sent' });
  assert.equal((await request('/payments', { method: 'POST', cookie: a.cookie, data: { job_id: job.id, amount_cents: 100, invoice_id: otherInvoice.id } })).status, 400);

  // Cross-account isolation
  assert.deepEqual((await request('/entities/Payment', { cookie: b.cookie })).data, []);
  assert.equal((await request(`/entities/Payment/${payment.data.id}`, { cookie: b.cookie })).status, 404);
  assert.equal((await request('/payments', { method: 'POST', cookie: b.cookie, data: { job_id: job.id, amount_cents: 100 } })).status, 404);

  const exported = (await request('/export', { cookie: a.cookie })).data;
  assert.ok(exported.records.some((r) => r.entity === 'Payment' && r.amount_cents === 5000));

  // Job delete cascades payments
  assert.equal((await request(`/entities/Job/${job.id}`, { method: 'DELETE', cookie: a.cookie })).status, 200);
  assert.equal((await request(`/entities/Payment/${payment.data.id}`, { cookie: a.cookie })).status, 404);

  // Backup import round-trips job_id + invoice_id remap (import order: Invoice before Payment)
  await register('payment-restore@example.com');
  const client2 = await create('Client', { name: 'Payment client 2', ...CLIENT_ADDR });
  const job2 = await create('Job', { title: 'Payment job 2', client_id: client2.id });
  await create('WorkOrder', { job_id: job2.id, number: 'WO-PMT2', status: 'complete' });
  const invoice2 = await create('Invoice', { job_id: job2.id, number: 'INV-PMT2', status: 'sent' });
  await request('/payments', { method: 'POST', cookie: a.cookie, data: { job_id: job2.id, amount_cents: 750, invoice_id: invoice2.id } });
  const backup = (await request('/export', { cookie: a.cookie })).data;
  await importData(db, 'payment-restore@example.com', backup);
  const [owner] = await db.all('SELECT id FROM users WHERE email = ?', ['payment-restore@example.com']);
  const restoredPayment = (await db.all('SELECT data FROM records WHERE owner_id = ? AND entity = ?', [owner.id, 'Payment'])).map((r) => JSON.parse(r.data))[0];
  const restoredInvoices = (await db.all('SELECT id, data FROM records WHERE owner_id = ? AND entity = ?', [owner.id, 'Invoice'])).map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
  const restoredInvoice2 = restoredInvoices.find((inv) => inv.number === 'INV-PMT2');
  const restoredJobs = (await db.all('SELECT id, data FROM records WHERE owner_id = ? AND entity = ?', [owner.id, 'Job'])).map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
  const restoredJob2 = restoredJobs.find((j) => j.title === 'Payment job 2');
  assert.equal(restoredPayment.invoice_id, restoredInvoice2.id);
  assert.equal(restoredPayment.job_id, restoredJob2.id);
});

test('job/account summary: cents totals from ledger, accepted-estimate baseline, waiting-payment list', async t => {
  const { request, register } = await fixture(t);
  const a = await register('summary-a@example.com');
  const b = await register('summary-b@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message || entity);
    return result.data;
  };
  const client = await create('Client', { name: 'Summary client', ...CLIENT_ADDR });
  const job = await create('Job', { title: 'Summary job', client_id: client.id });
  await create('Estimate', {
    job_id: job.id, number: 'EST-SUM', status: 'accepted', total: 220,
    accepted_snapshot: { number: 'EST-SUM', total: 220, tax_rate: 10, lines: [] },
  });
  await create('WorkOrder', { job_id: job.id, number: 'WO-SUM', status: 'complete' });
  const invoice = await create('Invoice', {
    job_id: job.id, number: 'INV-SUM', status: 'sent',
    misc_lines: [{ description: 'Contract total', amount: 200 }], tax_rate: 10,
  });
  await request('/payments', { method: 'POST', cookie: a.cookie, data: { job_id: job.id, amount_cents: 10000 } });

  const summary = (await request(`/jobs/${job.id}/summary`, { cookie: a.cookie })).data;
  assert.equal(summary.has_accepted_estimate, true);
  assert.equal(summary.estimate_cents, 22000);
  assert.equal(summary.authorized_cents, 22000);
  assert.equal(summary.billing_ceiling_cents, 22000);
  assert.equal(summary.invoiced_cents, 22000);
  assert.equal(summary.paid_cents, 10000);
  assert.equal(summary.balance_cents, 12000);
  assert.equal(summary.over_billed, false);
  const invoiceRow = summary.invoices.find((row) => row.id === invoice.id);
  assert.equal(invoiceRow.payment_status, 'partial');
  assert.equal(invoiceRow.number, 'INV-SUM');

  // Cross-account isolation
  assert.equal((await request(`/jobs/${job.id}/summary`, { cookie: b.cookie })).status, 404);

  const account = (await request('/summaries', { cookie: a.cookie })).data;
  assert.equal(account.jobs[job.id].balance_cents, 12000);
  assert.equal(account.totals.invoiced_cents, 22000);
  assert.equal(account.totals.paid_cents, 10000);
  assert.equal(account.totals.outstanding_cents, 12000);
  assert.equal(account.totals.waiting_payment_count, 1);
  assert.equal(account.waiting_payment[0].id, invoice.id);
  assert.deepEqual((await request('/summaries', { cookie: b.cookie })).data.totals.invoiced_cents, 0);
});
