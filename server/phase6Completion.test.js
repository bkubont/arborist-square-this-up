/**
 * Phase 6 exit + PDF “how to know v1 works” (automated slice):
 * completion checklist + review gate, invoice from estimate+approved changes,
 * deposits/partial payments + balance, job/crew production, RBAC export.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase, migrate } from './db.js';
import { createApp } from './app.js';
import { hash, token } from './security.js';
import {
  evaluateReviewGate,
  mergeCompletionChecklist,
  autoChecklistFlags,
  fieldsForCompleteWithChecklist,
} from './completion.js';
import {
  hoursFromTimeEntry,
  estimatedHoursFromScope,
  summarizeJobProduction,
  summarizeCrewDashboard,
} from './production.js';
import { normalizeReviewGateRules } from '../shared/completionChecklist.js';

const CLIENT_ADDR = { address: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701' };

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
  return { request, register, db };
}

test('completion helpers: auto flags + review gate by price/type/problem', () => {
  const auto = autoChecklistFlags({
    timeline: [
      { type: 'photo', category: 'before' },
      { type: 'photo', category: 'after' },
    ],
    workItems: [{ status: 'completed' }],
    changeOrders: [],
  });
  assert.equal(auto.photos, true);
  assert.equal(auto.approved_work, true);
  const checklist = mergeCompletionChecklist({
    items: [
      { key: 'cleanup', done: true },
      { key: 'damage', done: true },
      { key: 'equipment', done: true },
      { key: 'return_visits', done: true },
      { key: 'customer_informed', done: true },
    ],
  }, auto);
  assert.equal(checklist.complete, true);

  const gate = evaluateReviewGate(
    { job_type: 'residential', estimate_amount: 6000 },
    { review_gate: normalizeReviewGateRules({ enabled: true, min_price: 5000, job_types: ['storm'], require_on_problem: true }) },
    { authorizedTotal: 6000, timeline: [] },
  );
  assert.equal(gate.required, true);
  assert.ok(gate.reasons.some((r) => r.startsWith('price')));

  const problemGate = evaluateReviewGate(
    { job_type: 'residential' },
    { review_gate: normalizeReviewGateRules({ min_price: 99999, job_types: [], require_on_problem: true }) },
    { authorizedTotal: 100, timeline: [{ type: 'problem', text: 'Hit fence' }] },
  );
  assert.equal(problemGate.required, true);

  const prepared = fieldsForCompleteWithChecklist(
    { id: 'j1', status: 'In progress', estimate_amount: 100 },
    {
      company: { review_gate: { enabled: true, min_price: 50, job_types: [], require_on_problem: false } },
      checklist: { items: checklist.items },
      estimates: [{ status: 'accepted', total: 100, accepted_snapshot: { total: 100, lines: [] } }],
      changeOrders: [],
      workItems: [],
      timeline: [{ type: 'photo' }, { type: 'photo' }],
    },
  );
  assert.equal(prepared.fields.status, 'Completed');
  assert.equal(prepared.review.status, 'pending');
});

test('production helpers: hours + crew rollup', () => {
  assert.equal(hoursFromTimeEntry({
    clock_in: '2026-10-08T14:00:00.000Z',
    clock_out: '2026-10-08T16:30:00.000Z',
  }), 2.5);
  assert.equal(estimatedHoursFromScope({
    accepted_snapshot: { lines: [{ labor_hours: 4 }, { labor_hours: 2 }] },
  }), 6);

  const jobProd = summarizeJobProduction({
    job: {
      id: 'j1', crew_id: 'c1', title: 'Oak', status: 'Completed',
      estimated_duration_hours: 6, materials_cost: 50,
      start_date: '2026-10-08', end_date: '2026-10-09',
    },
    estimates: [{ status: 'accepted', total: 1000, accepted_snapshot: { total: 1000, lines: [{ labor_hours: 6 }] } }],
    changeOrders: [{ status: 'approved', net_change: 200, lines: [{ labor_amount: 200, amount: 200 }] }],
    invoices: [{ status: 'sent', total: 1200, deposits_applied: 200, payments_applied: 400, balance_due: 600, material_lines: [], labor_lines: [], misc_lines: [{ description: 'Work', amount: 1200 }] }],
    expenses: [{ amount: 100 }],
    timeEntries: [{
      clock_in: '2026-10-08T13:00:00.000Z',
      clock_out: '2026-10-08T20:00:00.000Z',
    }],
    timeline: [{ type: 'problem' }],
  });
  assert.equal(jobProd.estimated_hours, 6);
  assert.equal(jobProd.actual_hours, 7);
  assert.equal(jobProd.approved_changes, 200);
  assert.equal(jobProd.deposits_applied, 200);
  assert.equal(jobProd.payments_applied, 400);
  assert.equal(jobProd.balance_due, 600);
  assert.equal(jobProd.direct_costs, 150);
  assert.equal(jobProd.problem_count, 1);

  const dash = summarizeCrewDashboard([jobProd], { crew: { id: 'c1', name: 'Alpha' } });
  assert.equal(dash.jobs_completed, 1);
  assert.equal(dash.crew_name, 'Alpha');
  assert.ok(dash.production_revenue > 0);
});

test('Phase 6: checklist → review → invoice from estimate+CO → partial pay → production + RBAC export', async (t) => {
  const { request, register } = await fixture(t);
  const owner = await register('phase6-owner@example.com');
  const create = async (entity, data, cookie = owner.cookie) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie });
    assert.equal(result.status, 201, result.data?.message || entity);
    return result.data;
  };

  // Two properties on one customer (PDF checklist item — Phase 2 already covers; smoke here).
  const client = await create('Client', { name: 'Phase6 Customer', ...CLIENT_ADDR });
  const propA = await create('Property', {
    client_id: client.id, name: 'Front', address: '10 Oak', city: 'Austin', state: 'TX', zip: '78701',
  });
  const propB = await create('Property', {
    client_id: client.id, name: 'Back', address: '10 Oak Rear', city: 'Austin', state: 'TX', zip: '78701',
  });
  assert.notEqual(propA.id, propB.id);

  // Configure review gate: low price threshold + problems.
  const profiles = (await request('/entities/CompanyProfile', { cookie: owner.cookie })).data;
  const profile = profiles[0];
  assert.ok(profile);
  await request(`/entities/CompanyProfile/${profile.id}`, {
    method: 'PATCH',
    cookie: owner.cookie,
    data: {
      review_gate: {
        enabled: true,
        min_price: 500,
        job_types: ['commercial'],
        require_on_problem: true,
      },
    },
  });

  const invite = await request('/members/invite', {
    method: 'POST',
    cookie: owner.cookie,
    data: { email: 'phase6-hand@example.com', role: 'crew_member' },
  });
  assert.equal(invite.status, 201);
  const inviteToken = new URL(invite.data.inviteUrl).searchParams.get('invite');
  const memberReg = await request('/auth/register', {
    method: 'POST',
    data: { email: 'phase6-hand@example.com', password: 'strong-password-123', inviteToken },
  });
  assert.equal(memberReg.status, 201);
  const memberCookie = memberReg.cookie;
  const handId = (await request('/auth/me', { cookie: memberCookie })).data.id;

  const bookInvite = await request('/members/invite', {
    method: 'POST',
    cookie: owner.cookie,
    data: { email: 'phase6-books@example.com', role: 'bookkeeper' },
  });
  const bookToken = new URL(bookInvite.data.inviteUrl).searchParams.get('invite');
  const bookReg = await request('/auth/register', {
    method: 'POST',
    data: { email: 'phase6-books@example.com', password: 'strong-password-123', inviteToken: bookToken },
  });
  assert.equal(bookReg.status, 201);

  const crew = await create('Crew', { name: 'Crew Profit', member_user_ids: [handId] });

  const job = await create('Job', {
    title: 'Removal + stump',
    client_id: client.id,
    property_id: propA.id,
    status: 'In progress',
    crew_id: crew.id,
    job_type: 'residential',
    estimated_duration_hours: 6,
    start_date: '2026-10-08',
    end_date: '2026-10-08',
  });

  const estimate = await create('Estimate', {
    job_id: job.id,
    number: 'EST-P6',
    status: 'draft',
    tax_rate: 0,
    lines: [
      { description: 'Tree removal', labor_amount: 800, labor_hours: 5 },
      { description: 'Stump grind', labor_amount: 200, is_optional: true },
    ],
  });
  const accepted = await request(`/documents/Estimate/${estimate.id}/status`, {
    method: 'POST',
    cookie: owner.cookie,
    data: { status: 'accepted' },
  });
  assert.equal(accepted.status, 200, accepted.data?.message);
  assert.equal(accepted.data.accepted_snapshot.total, 800);

  // Approved change only (optional stump via CO) — must land on invoice, not draft optional.
  const co = await create('ChangeOrder', {
    job_id: job.id,
    number: 'CO-STUMP',
    status: 'draft',
    lines: [{ description: 'Stump grind', labor_amount: 200, labor_hours: 1 }],
  });
  const coOk = await request(`/documents/ChangeOrder/${co.id}/status`, {
    method: 'POST',
    cookie: owner.cookie,
    data: { status: 'approved' },
  });
  assert.equal(coOk.status, 200, coOk.data?.message);

  // Deposit before completion.
  await create('TimelineEntry', {
    job_id: job.id,
    type: 'deposit_received',
    category: 'financial',
    amount: 150,
    text: 'Deposit',
  });

  // Photos + problem (triggers review gate).
  const formA = new FormData();
  formA.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'before.png');
  const fileA = await request('/files', { method: 'POST', cookie: owner.cookie, form: formA });
  assert.equal(fileA.status, 201, fileA.data?.message);
  const formB = new FormData();
  formB.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'after.png');
  const fileB = await request('/files', { method: 'POST', cookie: owner.cookie, form: formB });
  assert.equal(fileB.status, 201, fileB.data?.message);
  await create('TimelineEntry', {
    job_id: job.id, type: 'photo', category: 'before', text: 'Before', photo_url: fileA.data.file_url,
  });
  await create('TimelineEntry', {
    job_id: job.id, type: 'photo', category: 'after', text: 'After', photo_url: fileB.data.file_url,
  });
  await request(`/jobs/${job.id}/problem`, {
    method: 'POST',
    cookie: memberCookie,
    data: { text: 'Fence scuff — noted' },
  });

  // Close open tasks spawned from the signed estimate/CO so approved_work can pass.
  const tasks = (await request(`/entities/WorkItem?job_id=${job.id}`, { cookie: owner.cookie })).data;
  for (const task of tasks) {
    if (task.status === 'completed' || task.status === 'cancelled') continue;
    const done = await request(`/entities/WorkItem/${task.id}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      data: { status: 'completed' },
    });
    assert.equal(done.status, 200, done.data?.message);
  }

  // Mark remaining checklist items (photos/approved_work auto from records).
  const checklistPatch = await request(`/jobs/${job.id}/completion`, {
    method: 'PATCH',
    cookie: memberCookie,
    data: {
      items: [
        { key: 'approved_work', done: true },
        { key: 'cleanup', done: true },
        { key: 'damage', done: true },
        { key: 'equipment', done: true },
        { key: 'return_visits', done: true },
        { key: 'customer_informed', done: true },
      ],
    },
  });
  assert.equal(checklistPatch.status, 200, checklistPatch.data?.message);

  // Incomplete complete without checklist would fail — we filled it.
  const complete = await request(`/jobs/${job.id}/complete`, {
    method: 'POST',
    cookie: memberCookie,
    data: { note: 'Wrapped' },
  });
  assert.equal(complete.status, 200, complete.data?.message);
  assert.equal(complete.data.status, 'Completed');
  assert.equal(complete.data.review_status, 'pending');
  assert.ok((complete.data.review_reasons || []).includes('reported_problem')
    || (complete.data.review?.reasons || []).includes('reported_problem')
    || complete.data.review?.required === true);

  // Invoice blocked while review pending.
  const blockedInv = await request('/invoices/from-job', {
    method: 'POST',
    cookie: owner.cookie,
    data: { job_id: job.id },
  });
  assert.equal(blockedInv.status, 409);

  // Crew cannot approve review or create invoice.
  assert.equal((await request(`/jobs/${job.id}/review/approve`, {
    method: 'POST', cookie: memberCookie, data: {},
  })).status, 403);
  assert.equal((await request('/invoices/from-job', {
    method: 'POST', cookie: memberCookie, data: { job_id: job.id },
  })).status, 403);

  // Owner approves review.
  const approved = await request(`/jobs/${job.id}/review/approve`, {
    method: 'POST',
    cookie: owner.cookie,
    data: {},
  });
  assert.equal(approved.status, 200, approved.data?.message);
  assert.equal(approved.data.review_status, 'approved');

  // Invoice from accepted estimate + approved CO; deposits applied.
  const inv = await request('/invoices/from-job', {
    method: 'POST',
    cookie: owner.cookie,
    data: { job_id: job.id },
  });
  assert.equal(inv.status, 201, inv.data?.message);
  assert.ok(Number(inv.data.total) >= 1000, `expected ~1000 got ${inv.data.total}`);
  assert.equal(Number(inv.data.deposits_applied), 150);
  assert.ok(Number(inv.data.balance_due) > 0);

  // Mark sent so partial payment can promote status to partial.
  const sent = await request(`/entities/Invoice/${inv.data.id}`, {
    method: 'PATCH',
    cookie: owner.cookie,
    data: { status: 'sent' },
  });
  assert.equal(sent.status, 200, sent.data?.message);

  // Partial payment via timeline → invoice balance sync.
  const pay = await request('/entities/TimelineEntry', {
    method: 'POST',
    cookie: owner.cookie,
    data: {
      job_id: job.id,
      type: 'payment_received',
      category: 'financial',
      amount: 300,
      text: 'Partial payment',
    },
  });
  assert.equal(pay.status, 201, pay.data?.message);
  const invAfter = (await request(`/entities/Invoice/${inv.data.id}`, { cookie: owner.cookie })).data;
  assert.equal(Number(invAfter.payments_applied), 300);
  assert.equal(
    Number(invAfter.balance_due),
    Math.round((Number(invAfter.total) - 150 - 300) * 100) / 100,
  );
  assert.equal(invAfter.status, 'partial');

  // Also Payment entity deposit/partial applies to invoice without payment_received double-count.
  const pmtEntity = await request('/payments', {
    method: 'POST',
    cookie: owner.cookie,
    data: {
      job_id: job.id,
      invoice_id: inv.data.id,
      amount_cents: 10000,
      kind: 'payment',
      method: 'check',
    },
  });
  assert.equal(pmtEntity.status, 201, pmtEntity.data?.message);
  const invAfterPmt = (await request(`/entities/Invoice/${inv.data.id}`, { cookie: owner.cookie })).data;
  assert.equal(Number(invAfterPmt.payments_applied), 400);

  // Time for production compare.
  await create('TimeEntry', {
    job_id: job.id,
    user_id: handId,
    kind: 'work',
    clock_in: '2026-10-08T13:00:00.000Z',
    clock_out: '2026-10-08T19:00:00.000Z',
  });
  await create('Expense', {
    job_id: job.id,
    amount: 75,
    category: 'disposal',
    note: 'Dump fee',
  });

  const prod = await request(`/jobs/${job.id}/production`, { cookie: owner.cookie });
  assert.equal(prod.status, 200, prod.data?.message);
  assert.equal(prod.data.actual_hours, 6);
  assert.ok(prod.data.estimated_hours >= 5);
  assert.ok(prod.data.final_invoice_total > 0);
  assert.ok(prod.data.direct_costs >= 75);
  assert.equal(prod.data.crew_id, crew.id);

  const crews = await request('/production/crews', { cookie: owner.cookie });
  assert.equal(crews.status, 200, crews.data?.message);
  assert.ok(Array.isArray(crews.data.crews));
  const crewDash = crews.data.crews.find((c) => c.crew_id === crew.id);
  assert.ok(crewDash);
  assert.ok(crewDash.jobs_completed >= 1);
  assert.ok(crewDash.production_revenue > 0);

  // Crew member cannot see money production / export.
  assert.equal((await request(`/jobs/${job.id}/production`, { cookie: memberCookie })).status, 403);
  assert.equal((await request('/export', { cookie: memberCookie })).status, 403);

  // Bookkeeper can export; payload opens as independent JSON with records.
  const exported = await request('/export', { cookie: bookReg.cookie });
  assert.equal(exported.status, 200, exported.data?.message);
  assert.equal(exported.data.version, 1);
  assert.ok(exported.data.exported_at);
  assert.ok(Array.isArray(exported.data.records));
  assert.ok(exported.data.records.some((r) => r.entity === 'Invoice'));
  assert.ok(exported.data.records.some((r) => r.entity === 'Payment'));
  assert.ok(exported.data.records.some((r) => r.entity === 'Job' && r.review_status === 'approved'));

  // Owner export still works under multi-user.
  const ownerExport = await request('/export', { cookie: owner.cookie });
  assert.equal(ownerExport.status, 200);
  assert.ok(ownerExport.data.records.length >= exported.data.records.length);
});
