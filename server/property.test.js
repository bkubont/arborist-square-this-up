import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase, migrate } from './db.js';
import { passwordHash } from './security.js';
import { saveRecord, getRecord } from './domain.js';

async function createUser(db, email) {
  const id = randomUUID();
  await db.run(
    'INSERT INTO users (id, email, password_hash, created_date) VALUES (?, ?, ?, ?)',
    [id, email, await passwordHash('strong-password-123'), new Date().toISOString()],
  );
  return id;
}

const CLIENT_ADDR = {
  address: '10 Maple Ave',
  city: 'Springfield',
  state: 'IL',
  zip: '62701',
};

test('Property CRUD under a client with durable access notes', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'property@example.com');
    const client = await saveRecord(db, ownerId, 'Client', {
      name: 'Two Property Customer',
      ...CLIENT_ADDR,
      preferred_contact_method: 'phone',
      referral_source: 'Neighbor',
      contacts: [
        { role: 'owner', name: 'Pat Owner', phone: '555-0100' },
        { role: 'tenant', name: 'Terry Tenant', email: 'terry@example.com' },
      ],
    });
    assert.equal(client.contacts.length, 2);
    assert.ok(client.contacts.every((c) => c.id));

    const main = await saveRecord(db, ownerId, 'Property', {
      client_id: client.id,
      name: 'Main house',
      address: '10 Maple Ave',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      access_notes: 'Gate code 4521',
      hazard_notes: 'Septic left of driveway',
      parking_notes: 'Park on street; soft lawn',
      pets_notes: 'Two dogs — crate on arrival',
    });
    const rental = await saveRecord(db, ownerId, 'Property', {
      client_id: client.id,
      name: 'Rental on Oak',
      address: '22 Oak St',
      city: 'Springfield',
      state: 'IL',
      zip: '62702',
      access_notes: 'Key under mat',
      hazard_notes: 'Low wires over rear alley',
    });

    const listed = await db.all(
      'SELECT id FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
      [ownerId, 'Property', client.id],
    );
    assert.equal(listed.length, 2);

    const updated = await saveRecord(db, ownerId, 'Property', {
      pets_notes: 'Dogs rehomed',
    }, main.id);
    assert.equal(updated.access_notes, 'Gate code 4521');
    assert.equal(updated.pets_notes, 'Dogs rehomed');
    assert.equal(updated.name, 'Main house');

    await getRecord(db, ownerId, 'Property', rental.id);
  } finally {
    await db.close();
  }
});

test('lead → site visit → estimate reuses property notes without retyping', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'lead-path@example.com');
    const client = await saveRecord(db, ownerId, 'Client', {
      name: 'Lead Path Client',
      ...CLIENT_ADDR,
      status: 'Prospect',
    });
    const property = await saveRecord(db, ownerId, 'Property', {
      client_id: client.id,
      name: 'Back lot',
      access_notes: 'Unlock side gate',
      hazard_notes: 'Steep slope north side',
      parking_notes: 'Chipper fits in driveway',
    });

    const lead = await saveRecord(db, ownerId, 'Job', {
      title: 'Storm oak inquiry',
      client_id: client.id,
      property_id: property.id,
      status: 'New inquiry',
      requested_work: 'Remove storm-damaged oak',
      next_action: 'Schedule site visit',
      referral_source: 'Google',
    });
    assert.equal(lead.status, 'New inquiry');
    assert.equal(lead.property_id, property.id);

    const afterVisit = await saveRecord(db, ownerId, 'Job', {
      status: 'Site visit',
      site_visit_date: '2026-10-12',
      next_action: 'Write estimate',
      contact_attempts: 'Confirmed visit by text',
    }, lead.id);
    assert.equal(afterVisit.status, 'Site visit');
    assert.equal(afterVisit.site_visit_date, '2026-10-12');
    // Property notes still come from the Property record — not copied onto the job.
    const propertyAgain = await getRecord(db, ownerId, 'Property', property.id);
    assert.equal(propertyAgain.access_notes, 'Unlock side gate');
    assert.equal(propertyAgain.hazard_notes, 'Steep slope north side');

    await saveRecord(db, ownerId, 'Job', { status: 'Estimate sent' }, lead.id);
    const estimate = await saveRecord(db, ownerId, 'Estimate', {
      job_id: lead.id,
      property_id: property.id,
      status: 'draft',
      lines: [{ description: 'Oak removal', labor_amount: 1200 }],
    });
    assert.equal(estimate.property_id, property.id);

    const wrongClient = await saveRecord(db, ownerId, 'Client', {
      name: 'Other',
      address: '1 Other St',
      city: 'Springfield',
      state: 'IL',
      zip: '62703',
    });
    const otherProp = await saveRecord(db, ownerId, 'Property', {
      client_id: wrongClient.id,
      name: 'Elsewhere',
    });
    await assert.rejects(
      () => saveRecord(db, ownerId, 'Job', { property_id: otherProp.id }, lead.id),
      (err) => err.status === 400 && /different client/i.test(err.message),
    );
  } finally {
    await db.close();
  }
});

test('TreeInventory stores method needs and cleanup notes', async () => {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  try {
    await migrate(db);
    const ownerId = await createUser(db, 'tree-method@example.com');
    const client = await saveRecord(db, ownerId, 'Client', { name: 'Tree Client', ...CLIENT_ADDR });
    const job = await saveRecord(db, ownerId, 'Job', { title: 'Walk', client_id: client.id });
    const tree = await saveRecord(db, ownerId, 'TreeInventory', {
      job_id: job.id,
      label: 'Back Yard Oak',
      species: 'Oak',
      dbh_inches: 30,
      height_ft: 55,
      location_note: 'NW corner',
      recommended_work: ['removal', 'stump_grind'],
      method_needs: ['climbing', 'chipper', 'grinder'],
      cleanup_notes: 'Haul brush; leave rounds for firewood; stump 6 in below grade',
    });
    assert.deepEqual(tree.method_needs, ['climbing', 'chipper', 'grinder']);
    assert.match(tree.cleanup_notes, /firewood/);
    assert.equal(tree.height_ft, 55);
  } finally {
    await db.close();
  }
});
