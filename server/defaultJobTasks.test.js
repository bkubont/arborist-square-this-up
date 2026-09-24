import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase, migrate } from './db.js';
import { passwordHash } from './security.js';
import { saveRecord } from './domain.js';
import { attachDefaultJobTasks } from './defaultJobTasks.js';
import { createWorkItemsForLines } from './workItems.js';
import { PREP_TASK_STEPS, FINAL_WALKTHROUGH_STEPS } from '../shared/taskTemplates.js';
import { normalizeTaskStatus } from '../shared/taskStatus.js';

async function createUser(db, email) {
  const id = randomUUID();
  await db.run(
    'INSERT INTO users (id, email, password_hash, created_date) VALUES (?, ?, ?, ?)',
    [id, email, await passwordHash('strong-password-123'), new Date().toISOString()],
  );
  await saveRecord(db, id, 'CompanyProfile', { name: 'Test Co', default_tax_rate: 6 });
  return id;
}

const CLIENT_ADDR = {
  address: '1 Main St',
  city: 'Springfield',
  state: 'IL',
  zip: '62701',
};

test('attachDefaultJobTasks adds Prep first and Final walkthrough last with template steps', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'tasks@example.com');
    const client = await saveRecord(db, ownerId, 'Client', { name: 'Task client', ...CLIENT_ADDR });
    const job = await saveRecord(db, ownerId, 'Job', { title: 'Task job', client_id: client.id });

    assert.equal(await attachDefaultJobTasks(db, ownerId, job.id), 2);
    assert.equal(await attachDefaultJobTasks(db, ownerId, job.id), 0);

    const rows = (await db.all(
      'SELECT data FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
      [ownerId, 'WorkItem', job.id],
    )).map((r) => JSON.parse(r.data)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    assert.equal(rows.length, 2);
    assert.equal(rows[0].template_key, 'prep');
    assert.equal(rows[0].description, 'Prep');
    assert.deepEqual(rows[0].steps.map((s) => s.text), PREP_TASK_STEPS.map((s) => s.text));
    assert.equal(rows[1].template_key, 'final_walkthrough');
    assert.equal(rows[1].description, 'Final walkthrough');
    assert.deepEqual(rows[1].steps.map((s) => s.text), FINAL_WALKTHROUGH_STEPS.map((s) => s.text));
    assert.equal(rows[0].status, 'plan');
    assert.equal(rows[1].status, 'finish');
  } finally {
    await db.close();
  }
});

test('attachDefaultJobTasks keeps Final walkthrough after signed scope tasks by sort_order', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'order@example.com');
    const client = await saveRecord(db, ownerId, 'Client', { name: 'Order client', ...CLIENT_ADDR });
    const job = await saveRecord(db, ownerId, 'Job', { title: 'Order job', client_id: client.id });
    await attachDefaultJobTasks(db, ownerId, job.id);
    const estimate = await saveRecord(db, ownerId, 'Estimate', {
      job_id: job.id,
      status: 'accepted',
      lines: [{ id: 'line-1', description: 'Install cabinets', labor_amount: 500 }],
      accepted_snapshot: { lines: [{ id: 'line-1', description: 'Install cabinets', labor_amount: 500 }] },
    });
    await createWorkItemsForLines(db, ownerId, {
      jobId: job.id,
      sourceType: 'Estimate',
      sourceId: estimate.id,
      lines: estimate.accepted_snapshot.lines,
    });
    const rows = (await db.all(
      'SELECT data FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
      [ownerId, 'WorkItem', job.id],
    )).map((r) => JSON.parse(r.data)).sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity));
    assert.equal(rows[0].template_key, 'prep');
    assert.equal(rows.at(-1).template_key, 'final_walkthrough');
  } finally {
    await db.close();
  }
});

test('attachDefaultJobTasks adopts legacy Final walkthrough rows without duplicating', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'legacy@example.com');
    const client = await saveRecord(db, ownerId, 'Client', { name: 'Legacy client', ...CLIENT_ADDR });
    const job = await saveRecord(db, ownerId, 'Job', { title: 'Legacy job', client_id: client.id });
    const legacy = await saveRecord(db, ownerId, 'WorkItem', {
      job_id: job.id,
      description: 'Final walkthrough',
      status: 'done',
    });

    assert.equal(await attachDefaultJobTasks(db, ownerId, job.id), 2);

    const rows = (await db.all(
      'SELECT id, data FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
      [ownerId, 'WorkItem', job.id],
    )).map((r) => ({ id: r.id, ...JSON.parse(r.data) }));

    assert.equal(rows.filter((r) => r.description.toLowerCase() === 'final walkthrough').length, 1);
    const walkthrough = rows.find((r) => r.template_key === 'final_walkthrough');
    assert.equal(walkthrough.id, legacy.id);
    assert.equal(normalizeTaskStatus(walkthrough.status), 'completed', 'legacy done normalizes to completed');
  } finally {
    await db.close();
  }
});
