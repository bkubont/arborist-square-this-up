import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase, migrate } from './db.js';
import { createApp } from './app.js';
import { hash, token } from './security.js';
import { importData } from './import.js';

async function fixture(t) {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  await migrate(db);
  const app = await createApp(db, { APP_ORIGIN: 'http://localhost:5173' });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
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
  assert.equal((await request('/auth/register', { method: 'POST', data: { email: 'a@example.com', password: 'strong-password-123', inviteToken: user.invitation } })).status, 400);
  assert.equal((await request('/entities/Client', { method: 'POST', cookie: user.cookie, origin: 'https://evil.example', data: { name: 'Attack' } })).status, 403);
  await request('/auth/logout', { method: 'POST', cookie: user.cookie });
  assert.equal((await request('/auth/me', { cookie: user.cookie })).status, 401);
});
test('accounts cannot read, modify, delete, link or export each other’s data or photos', async t => {
  const { request, register } = await fixture(t);
  const a = await register('a@example.com'), b = await register('b@example.com');
  const create = async (entity, data, cookie = a.cookie) => (await request(`/entities/${entity}`, { method: 'POST', data, cookie })).data;
  const client = await create('Client', { name: 'Private client', owner_id: b.data.id });
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
  const ownClient = await create('Client', { name: 'B client' }, b.cookie);
  const ownJob = await create('Job', { title: 'B job', client_id: ownClient.id }, b.cookie);
  assert.equal((await request('/entities/TimelineEntry', { method: 'POST', cookie: b.cookie, data: { job_id: ownJob.id, type: 'photo', photo_url: file.data.file_url } })).status, 400);
  const exported = (await request('/export', { cookie: b.cookie })).data;
  assert.equal(exported.records.length, 2); assert.deepEqual(exported.files, []);
  assert.equal((await request(`/entities/Client/${client.id}`, { method: 'DELETE', cookie: a.cookie })).status, 409);
  assert.equal((await request(`/entities/Job/${job.id}`, { method: 'DELETE', cookie: a.cookie })).status, 200);
  assert.equal((await request(`/entities/TimelineEntry/${entry.id}`, { cookie: a.cookie })).status, 404);
  assert.equal((await request(file.data.file_url.replace('/api',''), { cookie: a.cookie })).status, 404);
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
  assert.equal((await db.all('SELECT id FROM records WHERE owner_id = ?', [c.id])).length, 0);
});
test('client address line two persists through edits and backup restore, and is optional for existing clients', async t => {
  const { db, request, register } = await fixture(t);
  const a = await register('address@example.com');
  await register('restore-address@example.com');
  const client = (await request('/entities/Client', { method: 'POST', cookie: a.cookie, data: { name: 'Address test', address: '123 Oak St' } })).data;
  assert.equal(client.address_line2, undefined);
  const updated = await request(`/entities/Client/${client.id}`, { method: 'PATCH', cookie: a.cookie, data: { address_line2: 'Suite 2, Springfield, IL 62701' } });
  assert.equal(updated.status, 200);
  await request(`/entities/Client/${client.id}`, { method: 'PATCH', cookie: a.cookie, data: { phone: '555-1234' } });
  const saved = (await request(`/entities/Client/${client.id}`, { cookie: a.cookie })).data;
  assert.equal(saved.address, '123 Oak St');
  assert.equal(saved.address_line2, 'Suite 2, Springfield, IL 62701');
  const backup = (await request('/export', { cookie: a.cookie })).data;
  await importData(db, 'restore-address@example.com', backup);
  const [owner] = await db.all('SELECT id FROM users WHERE email = ?', ['restore-address@example.com']);
  const [restored] = await db.all('SELECT data FROM records WHERE owner_id = ?', [owner.id]);
  assert.equal(JSON.parse(restored.data).address_line2, saved.address_line2);
  await request(`/entities/Client/${client.id}`, { method: 'PATCH', cookie: a.cookie, data: { address_line2: '' } });
  assert.equal((await request(`/entities/Client/${client.id}`, { cookie: a.cookie })).data.address_line2, '');
});

test('invalid inputs, forbidden file types, expired invitations and login throttling', async t => {
  const { db, request, register } = await fixture(t);
  const a = await register('a@example.com');
  const expired = token();
  await db.run('INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)', [hash(expired), 'invite', 'expired@example.com', Date.now() - 1]);
  assert.equal((await request('/auth/register', { method: 'POST', data: { email: 'expired@example.com', password: 'strong-password-123', inviteToken: expired } })).status, 400);
  assert.equal((await request('/entities/Client', { method: 'POST', cookie: a.cookie, data: { name: '' } })).status, 400);
  assert.equal((await request('/entities/Client?sort=DROP%20TABLE', { cookie: a.cookie })).status, 400);
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
  const client = await create('Client', { name: 'Docs client' });
  const job = await create('Job', { title: 'Docs job', client_id: client.id, status: 'Estimate' });
  const estimate = await create('Estimate', { job_id: job.id, number: 'EST-001', status: 'draft', lines: [{ description: 'Labor', labor_amount: 100 }] });
  const invoice = await create('Invoice', { job_id: job.id, number: 'INV-001', status: 'draft', date: '2026-09-19' });
  assert.equal(estimate.status, 'draft');
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

  const byCategory = await request('/catalog?category=Plumbing&limit=20', { cookie: a.cookie });
  assert.ok(byCategory.data.items.every(item => /plumbing/i.test(item.category)));

  const client = await create('Client', { name: 'Catalog client' });
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
  const client = await create('Client', { name: 'Sign client', email: 'client@example.com' });
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
  assert.match(docs[0].text, /Pat Client/);

  // Owner can still edit after accept
  const edited = await request(`/entities/Estimate/${estimate.id}`, {
    method: 'PATCH', cookie: a.cookie, data: { notes: 'Adjusted after sign', lines: [{ description: 'Labor', labor_amount: 250 }] },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.notes, 'Adjusted after sign');
  assert.equal(edited.data.lines[0].labor_amount, 250);
  assert.equal(edited.data.status, 'accepted');
  assert.equal(edited.data.accepted_snapshot.total, 220);

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
  const client = await create('Client', { name: 'WO client' });
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

  const wo = (await request('/work-orders/from-estimate', {
    method: 'POST', cookie: a.cookie, data: { estimate_id: estimate.id },
  })).data;
  assert.equal(wo.related_estimate_id, estimate.id);
  assert.ok(wo.lines.some(l => l.kind === 'labor' && l.hours === 2 && l.work_category === 'Plumbing'));
  assert.ok(wo.lines.some(l => l.kind === 'material' && l.unit_price === 45));

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
  const client = await create('Client', { name: 'CO client' });
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
  const client = await create('Client', { name: 'Invoice client', address: '1 Main St' });
  const job = await create('Job', {
    title: 'Kitchen refresh',
    client_id: client.id,
    deposit_amount: 200,
  });

  assert.equal((await request('/invoices/from-job', {
    method: 'POST', cookie: a.cookie, data: { job_id: job.id },
  })).status, 400);

  await create('Estimate', {
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
