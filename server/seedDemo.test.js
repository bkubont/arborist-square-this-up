import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase, migrate } from './db.js';
import { passwordHash } from './security.js';
import { saveRecord } from './domain.js';
import {
  wipeAndSeedAccount,
  wipeAccountBusinessData,
  seedDemoData,
  DEMO_SPEC,
} from './seedDemo.js';

async function createUser(db, email) {
  const id = randomUUID();
  await db.run(
    'INSERT INTO users (id, email, password_hash, created_date) VALUES (?, ?, ?, ?)',
    [id, email, await passwordHash('strong-password-123'), new Date().toISOString()],
  );
  await saveRecord(db, id, 'CompanyProfile', {
    name: 'Square This Up Demo Co',
    default_tax_rate: 7,
    default_payment_terms: 'Net 15',
  });
  return id;
}

test('demo seed creates 15 clients and 14 jobs with intended distribution', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'seed@example.com');
    const result = await wipeAndSeedAccount(db, 'seed@example.com', { yes: true });

    assert.equal(result.clients, 15);
    assert.equal(result.jobs, 14);
    assert.equal(result.clientsWithJobs, 8);
    assert.equal(result.clientsWithoutJobs, 7);
    assert.equal(DEMO_SPEC.totalJobs, 14);

    const clients = await db.all('SELECT id FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'Client']);
    const jobs = await db.all('SELECT id, parent_id, data FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'Job']);
    assert.equal(clients.length, 15);
    assert.equal(jobs.length, 14);

    const byClient = new Map();
    for (const job of jobs) {
      byClient.set(job.parent_id, (byClient.get(job.parent_id) || 0) + 1);
    }
    const counts = [...byClient.values()].sort((a, b) => a - b);
    assert.deepEqual(counts, [1, 1, 1, 1, 2, 2, 3, 3]);
    assert.equal(15 - byClient.size, 7);

    const statuses = new Set(jobs.map((j) => JSON.parse(j.data).status));
    for (const needed of [
      'Plan / draft estimate',
      'Waiting on approval',
      'Prep',
      'In progress',
      'Blocked',
      'Waiting on payment',
      'Paid',
    ]) {
      assert.ok(statuses.has(needed), `missing job status ${needed}`);
    }

    const profiles = await db.all('SELECT data FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'CompanyProfile']);
    assert.equal(profiles.length, 1);
    assert.equal(JSON.parse(profiles[0].data).default_tax_rate, 7);
    assert.equal(JSON.parse(profiles[0].data).name, 'Square This Up Demo Co');

    // One Estimate per job (one-doc).
    const estimates = await db.all('SELECT parent_id FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'Estimate']);
    assert.equal(estimates.length, 14);
    assert.equal(new Set(estimates.map((e) => e.parent_id)).size, 14);

    const expenses = await db.all('SELECT id FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'Expense']);
    assert.equal(expenses.length, 4);

    // Tasks stand where Work Orders did: none of the retired type, a task per signed line.
    assert.equal((await db.all('SELECT id FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'WorkOrder'])).length, 0);
    const tasks = (await db.all('SELECT data FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'WorkItem'])).map((r) => JSON.parse(r.data));
    assert.ok(tasks.some((task) => task.source_type === 'Estimate' && task.status === 'in_progress'));
    assert.ok(tasks.some((task) => task.source_type === 'ChangeOrder'), 'the approved change order has its tasks');
    assert.equal(tasks.filter((task) => task.template_key === 'prep').length, 14);
    assert.equal(tasks.filter((task) => task.template_key === 'final_walkthrough').length, 14);
    assert.ok(jobs.every((j) => JSON.parse(j.data).checklist === undefined), 'no old free-text checklist');

    // Deposits must not double-count: do not set both deposit_amount and timeline amounts.
    const { sumDepositsApplied } = await import('./documentRules.js');
    const timeline = await db.all('SELECT data FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'TimelineEntry']);
    const entries = timeline.map((r) => JSON.parse(r.data));
    for (const job of jobs) {
      const data = JSON.parse(job.data);
      const jobEntries = entries.filter((e) => e.job_id === job.id);
      const timelineDeposits = jobEntries
        .filter((e) => e.type === 'deposit_received' && e.amount != null)
        .reduce((s, e) => s + Number(e.amount), 0);
      const legacy = Number(data.deposit_amount) || 0;
      assert.ok(
        !(legacy > 0 && timelineDeposits > 0),
        `job ${data.title} sets both deposit_amount (${legacy}) and timeline deposits (${timelineDeposits})`,
      );
      assert.equal(sumDepositsApplied(data, jobEntries), legacy + timelineDeposits);
    }

    const invoices = await db.all('SELECT data FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'Invoice']);
    for (const row of invoices) {
      const inv = JSON.parse(row.data);
      if (inv.status === 'paid') {
        assert.equal(Number(inv.balance_due) || 0, 0, `paid invoice ${inv.number} still has balance`);
      }
    }
  } finally {
    await db.close();
  }
});

test('demo wipe is account-scoped and preserves other accounts', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const a = await createUser(db, 'a@example.com');
    const b = await createUser(db, 'b@example.com');

    const clientA = await saveRecord(db, a, 'Client', {
      name: 'A client', address: '1 A St', city: 'Springfield', state: 'IL', zip: '62701',
    });
    await saveRecord(db, a, 'Job', { title: 'A job', client_id: clientA.id, phase: 'lead', status: 'Contact' });
    const clientB = await saveRecord(db, b, 'Client', {
      name: 'B client', address: '2 B St', city: 'Springfield', state: 'IL', zip: '62702',
    });
    await saveRecord(db, b, 'Job', { title: 'B job', client_id: clientB.id, phase: 'payment', status: 'Paid' });

    await wipeAndSeedAccount(db, 'a@example.com', { yes: true });

    const aClients = await db.all('SELECT data FROM records WHERE owner_id = ? AND entity = ?', [a, 'Client']);
    const bClients = await db.all('SELECT data FROM records WHERE owner_id = ? AND entity = ?', [b, 'Client']);
    const bJobs = await db.all('SELECT data FROM records WHERE owner_id = ? AND entity = ?', [b, 'Job']);
    assert.equal(aClients.length, 15);
    assert.equal(bClients.length, 1);
    assert.equal(JSON.parse(bClients[0].data).name, 'B client');
    assert.equal(bJobs.length, 1);
    assert.equal(JSON.parse(bJobs[0].data).title, 'B job');
  } finally {
    await db.close();
  }
});

test('wipe keeps company profile and refuses without confirmation', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'confirm@example.com');
    const client = await saveRecord(db, ownerId, 'Client', {
      name: 'Temp', address: '1 Main', city: 'Springfield', state: 'IL', zip: '62701',
    });
    await saveRecord(db, ownerId, 'Job', { title: 'Temp job', client_id: client.id });

    await assert.rejects(
      () => wipeAndSeedAccount(db, 'confirm@example.com', { yes: false, confirm: async () => false }),
      /Aborted/,
    );
    assert.equal((await db.all('SELECT id FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'Client'])).length, 1);

    await wipeAccountBusinessData(db, ownerId);
    assert.equal((await db.all('SELECT id FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'Client'])).length, 0);
    assert.equal((await db.all('SELECT id FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'CompanyProfile'])).length, 1);

    const seeded = await seedDemoData(db, ownerId);
    assert.equal(seeded.jobs, 14);
  } finally {
    await db.close();
  }
});
