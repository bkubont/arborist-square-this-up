import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase, migrate } from './db.js';
import { passwordHash } from './security.js';
import { saveRecord } from './domain.js';
import { attachDefaultPunchList } from './defaultPunchList.js';
import { completePunchList, preparePunchListUpdate } from './punchList.js';

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

test('completePunchList posts photo to job timeline and marks document completed', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'complete-punch@example.com');
    const client = await saveRecord(db, ownerId, 'Client', { name: 'Complete client', ...CLIENT_ADDR });
    const job = await saveRecord(db, ownerId, 'Job', { title: 'Complete job', client_id: client.id });
    const fileId = randomUUID();
    await db.run('INSERT INTO files (id, owner_id, mime, content, size) VALUES (?, ?, ?, ?, ?)', [
      fileId, ownerId, 'image/jpeg', Buffer.from('fake'), 4,
    ]);
    const photo_url = `/api/files/${fileId}`;
    const punchList = await attachDefaultPunchList(db, ownerId, job.id);

    const updated = await completePunchList(db, ownerId, punchList.id, { photo_url });
    assert.equal(updated.status, 'completed');
    assert.equal(updated.completed_photo_url, photo_url);
    assert.ok(updated.completed_at);

    const entries = (await db.all(
      'SELECT data FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
      [ownerId, 'TimelineEntry', job.id],
    )).map((r) => JSON.parse(r.data));
    const photo = entries.find((e) => e.photo_url === photo_url);
    assert.ok(photo);
    assert.equal(photo.type, 'photo');
    assert.equal(photo.category, 'after');
  } finally {
    await db.close();
  }
});

test('preparePunchListUpdate blocks direct completion and edits after complete', () => {
  assert.throws(
    () => preparePunchListUpdate({ status: 'in_progress' }, { status: 'completed' }),
    /photo/i,
  );
  assert.throws(
    () => preparePunchListUpdate({ status: 'completed' }, { sections: [] }),
    /cannot be edited/i,
  );
});
