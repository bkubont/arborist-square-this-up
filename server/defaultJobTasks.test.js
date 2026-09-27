import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase, migrate } from './db.js';
import { passwordHash } from './security.js';
import { saveRecord } from './domain.js';
import { attachDefaultJobTasks } from './defaultJobTasks.js';
import { createWorkItemsForLines } from './workItems.js';
import { DEFAULT_JOB_TASK_TEMPLATES } from '../shared/taskTemplates.js';
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

test('attachDefaultJobTasks does not auto-create Prep', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'tasks@example.com');
    const client = await saveRecord(db, ownerId, 'Client', { name: 'Task client', ...CLIENT_ADDR });
    const job = await saveRecord(db, ownerId, 'Job', { title: 'Task job', client_id: client.id });

    assert.deepEqual(DEFAULT_JOB_TASK_TEMPLATES, []);
    assert.equal(await attachDefaultJobTasks(db, ownerId, job.id), 0);
    assert.equal(await attachDefaultJobTasks(db, ownerId, job.id), 0);

    const rows = (await db.all(
      'SELECT data FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
      [ownerId, 'WorkItem', job.id],
    )).map((r) => JSON.parse(r.data));

    assert.equal(rows.length, 0);
  } finally {
    await db.close();
  }
});

test('attachDefaultJobTasks leaves signed scope as the first tasks', async () => {
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
    assert.equal(rows.length, 1);
    assert.equal(rows[0].description, 'Install cabinets');
    assert.equal(rows[0].template_key, undefined);
  } finally {
    await db.close();
  }
});

test('attachDefaultJobTasks does not adopt legacy Materials rows as built-in tasks', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'legacy@example.com');
    const client = await saveRecord(db, ownerId, 'Client', { name: 'Legacy client', ...CLIENT_ADDR });
    const job = await saveRecord(db, ownerId, 'Job', { title: 'Legacy job', client_id: client.id });
    const legacy = await saveRecord(db, ownerId, 'WorkItem', {
      job_id: job.id,
      description: 'Materials',
      status: 'materials',
    });

    assert.equal(await attachDefaultJobTasks(db, ownerId, job.id), 0);

    const rows = (await db.all(
      'SELECT id, data FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
      [ownerId, 'WorkItem', job.id],
    )).map((r) => ({ id: r.id, ...JSON.parse(r.data) }));

    const materials = rows.find((r) => r.description.toLowerCase() === 'materials');
    assert.equal(materials.id, legacy.id);
    assert.equal(materials.template_key, undefined, 'legacy Materials task is not re-tagged');
    assert.equal(normalizeTaskStatus(materials.status), 'plan');
  } finally {
    await db.close();
  }
});
