/**
 * Local/demo seed for multi-crew Phase 1.
 *
 * Creates (or reuses) an owner company, two crews, and sample members with roles.
 * Does NOT wipe existing company business data unless { wipeMembers: true }.
 *
 * Usage (CLI via accounts.js):
 *   npm run account -- seed-multi-crew owner@example.com [--yes]
 *
 * Safe for local SQLite and tests. For production Hostinger, only run with explicit
 * confirmation — never against Brittany's live data without asking.
 */
import { passwordHash } from './security.js';
import { saveRecord } from './domain.js';
import { ensureMembership, createMemberUser, listMembers } from './membership.js';
import { describeSeedDatabase } from './seedDemo.js';

const DEMO_PASSWORD = 'multi-crew-demo-12';

/**
 * @param {any} db
 * @param {string} ownerEmail
 * @param {{ yes?: boolean }} [opts]
 */
export async function seedMultiCrew(db, ownerEmail, opts = {}) {
  const { yes = false } = opts;
  const target = describeSeedDatabase(db);
  if (db.dialect === 'mysql' && process.env.NODE_ENV === 'production' && !yes) {
    throw new Error(
      'Refusing to seed multi-crew on production MySQL without --yes. '
      + 'Prefer local SQLite / tests. Confirm with the user before Hostinger.',
    );
  }

  const [owner] = await db.all('SELECT id, email FROM users WHERE email = ?', [ownerEmail]);
  if (!owner) {
    throw new Error(
      `Owner account ${ownerEmail} not found. Create it first with: npm run account -- invite ${ownerEmail}`,
    );
  }
  await ensureMembership(db, owner.id);

  const memberSpecs = [
    { email: 'ops.manager@example.com', role: 'operations_manager' },
    { email: 'office.admin@example.com', role: 'office_admin' },
    { email: 'estimator@example.com', role: 'estimator' },
    { email: 'crew1.leader@example.com', role: 'crew_leader' },
    { email: 'crew1.member@example.com', role: 'crew_member' },
    { email: 'crew2.leader@example.com', role: 'crew_leader' },
    { email: 'crew2.member@example.com', role: 'crew_member' },
    { email: 'books@example.com', role: 'bookkeeper' },
  ];

  const digest = await passwordHash(DEMO_PASSWORD);
  /** @type {Record<string, { id: string, email: string, role: string }>} */
  const created = {};
  for (const spec of memberSpecs) {
    const [existing] = await db.all('SELECT id FROM users WHERE email = ?', [spec.email]);
    if (existing) {
      const [m] = await db.all(
        'SELECT role FROM company_members WHERE user_id = ? AND company_id = ?',
        [existing.id, owner.id],
      );
      if (m) {
        created[spec.email] = { id: existing.id, email: spec.email, role: m.role };
        continue;
      }
      throw new Error(`${spec.email} exists but is not a member of ${ownerEmail}`);
    }
    created[spec.email] = await createMemberUser(db, {
      email: spec.email,
      passwordHash: digest,
      companyId: owner.id,
      role: spec.role,
    });
  }

  const existingCrews = await db.all(
    'SELECT id, data FROM records WHERE owner_id = ? AND entity = ?',
    [owner.id, 'Crew'],
  );
  let crewAlpha;
  let crewBeta;
  if (existingCrews.length >= 2) {
    crewAlpha = { id: existingCrews[0].id, ...JSON.parse(existingCrews[0].data) };
    crewBeta = { id: existingCrews[1].id, ...JSON.parse(existingCrews[1].data) };
  } else {
    crewAlpha = await saveRecord(db, owner.id, 'Crew', {
      name: 'Crew Alpha',
      leader_user_id: created['crew1.leader@example.com'].id,
      member_user_ids: [created['crew1.member@example.com'].id],
      capability_tags: ['removal', 'aerial'],
    });
    crewBeta = await saveRecord(db, owner.id, 'Crew', {
      name: 'Crew Beta',
      leader_user_id: created['crew2.leader@example.com'].id,
      member_user_ids: [created['crew2.member@example.com'].id],
      capability_tags: ['pruning', 'stump_grinding'],
    });
  }

  // Assign a couple of existing jobs to crews when present (does not create wipe).
  const jobs = await db.all(
    'SELECT id, data FROM records WHERE owner_id = ? AND entity = ? ORDER BY created_date ASC LIMIT 4',
    [owner.id, 'Job'],
  );
  let assigned = 0;
  for (let i = 0; i < jobs.length; i++) {
    const data = JSON.parse(jobs[i].data);
    if (data.crew_id) continue;
    const crewId = i % 2 === 0 ? crewAlpha.id : crewBeta.id;
    await saveRecord(db, owner.id, 'Job', { ...data, client_id: data.client_id, crew_id: crewId }, jobs[i].id);
    assigned += 1;
  }

  // Phase 2 sample: customer with two properties + a New inquiry lead (idempotent by client name).
  const existingPhase2 = await db.all(
    'SELECT id, data FROM records WHERE owner_id = ? AND entity = ?',
    [owner.id, 'Client'],
  );
  let phase2Client = existingPhase2
    .map((row) => ({ id: row.id, ...JSON.parse(row.data) }))
    .find((c) => c.name === 'Multi-crew Demo Customer');
  let propertiesCreated = 0;
  let leadCreated = false;
  if (!phase2Client) {
    phase2Client = await saveRecord(db, owner.id, 'Client', {
      name: 'Multi-crew Demo Customer',
      address: '100 Demo Lane',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      phone: '555-0100',
      email: 'demo.customer@example.com',
      status: 'Prospect',
      preferred_contact_method: 'text',
      referral_source: 'Neighbor',
      contacts: [
        { role: 'owner', name: 'Dana Owner', phone: '555-0101' },
        { role: 'site', name: 'Sam Site', phone: '555-0102' },
      ],
    });
    const main = await saveRecord(db, owner.id, 'Property', {
      client_id: phase2Client.id,
      name: 'Main residence',
      address: '100 Demo Lane',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      access_notes: 'Side gate unlocked after 8am',
      hazard_notes: 'Overhead lines along east fence',
      parking_notes: 'Chipper on driveway OK',
      pets_notes: 'Friendly lab — keep in garage',
    });
    await saveRecord(db, owner.id, 'Property', {
      client_id: phase2Client.id,
      name: 'Rental cottage',
      address: '102 Demo Lane',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      access_notes: 'Tenant has key',
      hazard_notes: 'Septic near rear oak',
    });
    propertiesCreated = 2;
    await saveRecord(db, owner.id, 'Job', {
      title: 'Front maple assessment',
      client_id: phase2Client.id,
      property_id: main.id,
      status: 'New inquiry',
      requested_work: 'Prune or remove leaning maple',
      next_action: 'Schedule site visit',
      referral_source: 'Neighbor',
    });
    leadCreated = true;
  }

  const members = await listMembers(db, owner.id);
  return {
    ownerEmail,
    demoPassword: DEMO_PASSWORD,
    members: members.map((m) => ({ email: m.email, role: m.role })),
    crews: [
      { id: crewAlpha.id, name: crewAlpha.name },
      { id: crewBeta.id, name: crewBeta.name },
    ],
    jobsAssigned: assigned,
    phase2: {
      clientId: phase2Client.id,
      propertiesCreated,
      leadCreated,
    },
    database: target,
  };
}
