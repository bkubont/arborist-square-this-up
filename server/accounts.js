import 'dotenv/config';
import { openDatabase, migrate } from './db.js';
import { emailSchema, token, hash } from './security.js';
import { wipeAndSeedAccount } from './seedDemo.js';

const args = process.argv.slice(2);
const yes = args.includes('--yes');
const positional = args.filter((a) => a !== '--yes');
const [command, rawEmail] = positional;

const usage = 'Usage: npm run account -- invite|reset|seed-demo user@example.com [--yes]';

if (!['invite', 'reset', 'seed-demo'].includes(command) || !rawEmail) {
  throw new Error(usage);
}

const email = emailSchema.parse(rawEmail);
const db = await openDatabase();
try {
  await migrate(db);

  if (command === 'seed-demo') {
    const result = await wipeAndSeedAccount(db, email, { yes });
    console.log(
      `Seeded demo data for ${result.email}: `
      + `${result.clients} clients (${result.clientsWithJobs} with jobs, ${result.clientsWithoutJobs} without), `
      + `${result.jobs} jobs, ${result.expenses} expenses.`,
    );
    console.log('Company profile and login were kept. Other accounts were not modified.');
  } else {
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
    const origin = new URL(process.env.APP_ORIGIN || 'http://localhost:5173').origin;
    console.log(
      command === 'invite'
        ? `${origin}/register?invite=${value}&email=${encodeURIComponent(email)}`
        : `${origin}/reset-password?token=${value}`,
    );
    console.log('Share this private, single-use link only with the account owner.');
  }
} finally {
  await db.close();
}
