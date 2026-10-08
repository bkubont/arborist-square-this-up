import 'dotenv/config';
import { openDatabase, migrate } from './db.js';
import { emailSchema, token, hash } from './security.js';
import { wipeAndSeedAccount, describeSeedDatabase } from './seedDemo.js';
import { seedMultiCrew } from './seedMultiCrew.js';
import { ensureMembership, createMemberInvite, INVITABLE_ROLES } from './membership.js';
import { ROLE_LABELS } from './roles.js';

const args = process.argv.slice(2);
const yes = args.includes('--yes');
const positional = args.filter((a) => a !== '--yes');
const [command, ...rest] = positional;

const usage = [
  'Usage:',
  '  npm run account -- invite|reset|seed-demo user@example.com [--yes]',
  '  npm run account -- seed-multi-crew owner@example.com [--yes]',
  '  npm run account -- invite-member owner@example.com member@example.com <role>',
  '',
  `Roles: ${INVITABLE_ROLES.join(', ')}`,
].join('\n');

if (!command) throw new Error(usage);

const db = await openDatabase();
try {
  await migrate(db);
  const origin = new URL(process.env.APP_ORIGIN || 'http://localhost:5173').origin;

  if (command === 'seed-demo') {
    const rawEmail = rest[0];
    if (!rawEmail) throw new Error(usage);
    const email = emailSchema.parse(rawEmail);
    const dbTarget = describeSeedDatabase(db);
    console.log(`Using database ${dbTarget.label} (NODE_ENV=${process.env.NODE_ENV || 'unset'})`);
    console.log(dbTarget.hint);
    const result = await wipeAndSeedAccount(db, email, { yes });
    const { visibility: v } = result;
    const phaseSummary = v
      ? `Working ${v.boardByPhase.working} · Payment ${v.boardByPhase.payment}`
      : '';
    console.log(
      `Seeded demo data for ${result.email}: `
      + `${result.clients} clients (${result.clientsWithJobs} with jobs, ${result.clientsWithoutJobs} without), `
      + `${result.jobs} jobs, ${result.expenses} expenses.`,
    );
    if (v) {
      console.log(
        `Visibility: ${v.allJobs} on All Jobs · ${v.boardJobs} on Board (${phaseSummary}) · `
        + `${v.archivedJobs} in Archive (${v.archivedStatuses.join(', ') || 'none'}).`,
      );
    }
    console.log('Company profile and login were kept. Other accounts were not modified.');
  } else if (command === 'seed-multi-crew') {
    const rawEmail = rest[0];
    if (!rawEmail) throw new Error(usage);
    const email = emailSchema.parse(rawEmail);
    const dbTarget = describeSeedDatabase(db);
    console.log(`Using database ${dbTarget.label} (NODE_ENV=${process.env.NODE_ENV || 'unset'})`);
    console.log(dbTarget.hint);
    const result = await seedMultiCrew(db, email, { yes });
    console.log(`Multi-crew seed for ${result.ownerEmail}:`);
    console.log(`  Crews: ${result.crews.map((c) => c.name).join(', ')}`);
    console.log(`  Members (${result.members.length}):`);
    for (const m of result.members) {
      console.log(`    ${m.email} — ${ROLE_LABELS[m.role] || m.role}`);
    }
    console.log(`  Jobs newly assigned to crews: ${result.jobsAssigned}`);
    console.log(`  Demo member password: ${result.demoPassword}`);
    console.log('Did not wipe owner business data. Production requires --yes.');
  } else if (command === 'invite-member') {
    const [ownerEmailRaw, memberEmailRaw, role] = rest;
    if (!ownerEmailRaw || !memberEmailRaw || !role) throw new Error(usage);
    const ownerEmail = emailSchema.parse(ownerEmailRaw);
    const [owner] = await db.all('SELECT id FROM users WHERE email = ?', [ownerEmail]);
    if (!owner) throw new Error(`Owner account not found: ${ownerEmail}`);
    await ensureMembership(db, owner.id);
    const result = await createMemberInvite(db, {
      companyId: owner.id,
      email: memberEmailRaw,
      role,
      invitedBy: owner.id,
      origin,
    });
    console.log(result.inviteUrl);
    console.log(`Share this private member invite (${ROLE_LABELS[result.role] || result.role}) only with ${result.email}.`);
  } else if (command === 'invite' || command === 'reset') {
    const rawEmail = rest[0];
    if (!rawEmail) throw new Error(usage);
    const email = emailSchema.parse(rawEmail);
    const exists = (await db.all('SELECT id FROM users WHERE email = ?', [email])).length;
    if (command === 'invite' && exists) throw new Error('Account already exists; use reset instead.');
    if (command === 'reset' && !exists) throw new Error('Account not found.');
    const value = token();
    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM tokens WHERE email = ? AND kind = ?', [email, command]);
      await tx.run(
        'INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)',
        [hash(value), command, email, Date.now() + (command === 'invite' ? 48 * 60 : 30) * 60 * 1000],
      );
    });
    console.log(
      command === 'invite'
        ? `${origin}/register?invite=${value}&email=${encodeURIComponent(email)}`
        : `${origin}/reset-password?token=${value}`,
    );
    console.log('Share this private, single-use link only with the account owner.');
  } else {
    throw new Error(usage);
  }
} finally {
  await db.close();
}
