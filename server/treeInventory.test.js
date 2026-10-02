import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase, migrate } from './db.js';
import { passwordHash } from './security.js';
import { saveRecord, getRecord, defaultCompanyProfileSeed } from './domain.js';

async function createUser(db, email) {
  const id = randomUUID();
  await db.run(
    'INSERT INTO users (id, email, password_hash, created_date) VALUES (?, ?, ?, ?)',
    [id, email, await passwordHash('strong-password-123'), new Date().toISOString()],
  );
  return id;
}

test('TreeInventory CRUD on a job', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'trees@example.com');
    const client = await saveRecord(db, ownerId, 'Client', {
      name: 'Tree Client',
      address: '1 Oak St',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
    });
    const job = await saveRecord(db, ownerId, 'Job', {
      title: 'Yard walk',
      client_id: client.id,
      job_type: 'residential',
      work_type: 'assessment',
    });
    const tree = await saveRecord(db, ownerId, 'TreeInventory', {
      job_id: job.id,
      label: 'T-1',
      species: 'Oak',
      dbh_inches: 24,
      condition: 'fair',
      location_note: 'Front yard',
      recommended_work: ['prune', 'monitor'],
      notes: 'Slight lean west',
    });
    assert.equal(tree.label, 'T-1');
    assert.equal(tree.species, 'Oak');
    assert.equal(tree.dbh_inches, 24);
    assert.deepEqual(tree.recommended_work, ['prune', 'monitor']);

    const updated = await saveRecord(db, ownerId, 'TreeInventory', { condition: 'hazardous', dbh_inches: 26 }, tree.id);
    assert.equal(updated.condition, 'hazardous');
    assert.equal(updated.dbh_inches, 26);
    assert.equal(updated.label, 'T-1');

    const listed = await db.all(
      'SELECT id FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
      [ownerId, 'TreeInventory', job.id],
    );
    assert.equal(listed.length, 1);

    await db.run('DELETE FROM records WHERE owner_id = ? AND id = ?', [ownerId, tree.id]);
    assert.equal(
      (await db.all('SELECT id FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'TreeInventory'])).length,
      0,
    );
  } finally {
    await db.close();
  }
});

test('CompanyProfile seeds include arborist service presets', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'preset@example.com');
    const seed = defaultCompanyProfileSeed(6);
    assert.ok(Array.isArray(seed.service_presets));
    assert.ok(seed.service_presets.length >= 8);
    assert.ok(seed.service_presets.some((p) => /prun/i.test(p.name)));
    const profile = await saveRecord(db, ownerId, 'CompanyProfile', seed);
    const again = await getRecord(db, ownerId, 'CompanyProfile', profile.id);
    assert.ok(again.service_presets.length >= 8);
    assert.ok(again.service_presets.every((p) => p.id));
  } finally {
    await db.close();
  }
});
