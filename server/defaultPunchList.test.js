import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase, migrate } from './db.js';
import { passwordHash } from './security.js';
import { saveRecord } from './domain.js';
import { attachDefaultPunchList } from './defaultPunchList.js';
import { PUNCH_LIST_SECTIONS, PUNCH_LIST_TITLE } from '../shared/punchListTemplates.js';

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

test('attachDefaultPunchList adds Final walkthrough punch list with finish | find | funds sections', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'punch@example.com');
    const client = await saveRecord(db, ownerId, 'Client', { name: 'Punch client', ...CLIENT_ADDR });
    const job = await saveRecord(db, ownerId, 'Job', { title: 'Punch job', client_id: client.id });

    const created = await attachDefaultPunchList(db, ownerId, job.id);
    assert.ok(created);
    assert.equal(created.title, PUNCH_LIST_TITLE);
    assert.equal(created.status, 'in_progress');
    assert.deepEqual(created.sections.map((s) => s.key), PUNCH_LIST_SECTIONS.map((s) => s.key));
    assert.deepEqual(created.sections.map((s) => s.label), PUNCH_LIST_SECTIONS.map((s) => s.label));

    assert.equal(await attachDefaultPunchList(db, ownerId, job.id), null, 'idempotent');
  } finally {
    await db.close();
  }
});
