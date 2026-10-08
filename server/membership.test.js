import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase, migrate } from './db.js';
import { createApp } from './app.js';
import { hash, token, passwordHash } from './security.js';
import { seedMultiCrew } from './seedMultiCrew.js';
import { createMemberUser } from './membership.js';

const CLIENT_ADDR = { address: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701' };

async function fixture(t) {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  await migrate(db);
  const app = await createApp(db, { APP_ORIGIN: 'http://localhost:5173' });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  const addr = server.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const request = async (path, { method = 'GET', data, cookie, origin = 'http://localhost:5173', headers = {} } = {}) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        ...(origin !== null ? { origin } : {}),
        ...(cookie ? { cookie } : {}),
        'content-type': 'application/json',
        ...headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return {
      status: response.status,
      cookie: response.headers.get('set-cookie')?.split(';')[0],
      data: response.headers.get('content-type')?.includes('json') ? await response.json() : null,
    };
  };
  const registerOwner = async (email) => {
    const invitation = token();
    await db.run(
      'INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)',
      [hash(invitation), 'invite', email, Date.now() + 60000],
    );
    const result = await request('/auth/register', {
      method: 'POST',
      data: { email, password: 'strong-password-123', inviteToken: invitation },
    });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result;
  };
  return { db, request, registerOwner };
}

test('solo register creates owner membership; /auth/me returns role', async (t) => {
  const { request, registerOwner } = await fixture(t);
  const reg = await registerOwner('owner-phase1@example.com');
  assert.equal(reg.data.role, 'owner');
  assert.equal(reg.data.company_id, reg.data.id);
  const me = await request('/auth/me', { cookie: reg.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.role, 'owner');
  assert.ok(me.data.permissions.includes('manage_members'));
});

test('owner invites crew leader; leader only sees assigned crew jobs', async (t) => {
  const { db, request, registerOwner } = await fixture(t);
  const owner = await registerOwner('company-owner@example.com');
  const ownerCookie = owner.cookie;

  const client = await request('/entities/Client', {
    method: 'POST',
    cookie: ownerCookie,
    data: { name: 'Oak Client', ...CLIENT_ADDR },
  });
  assert.equal(client.status, 201);

  const leaderInvite = await request('/members/invite', {
    method: 'POST',
    cookie: ownerCookie,
    data: { email: 'leader@example.com', role: 'crew_leader' },
  });
  assert.equal(leaderInvite.status, 201, JSON.stringify(leaderInvite.data));
  assert.ok(leaderInvite.data.inviteUrl.includes('kind=member'));

  const inviteToken = new URL(leaderInvite.data.inviteUrl).searchParams.get('invite');
  const leaderReg = await request('/auth/register', {
    method: 'POST',
    data: { email: 'leader@example.com', password: 'strong-password-123', inviteToken },
  });
  assert.equal(leaderReg.status, 201, JSON.stringify(leaderReg.data));
  assert.equal(leaderReg.data.role, 'crew_leader');
  assert.equal(leaderReg.data.company_id, owner.data.id);

  const memberInvite = await request('/members/invite', {
    method: 'POST',
    cookie: ownerCookie,
    data: { email: 'hand@example.com', role: 'crew_member' },
  });
  const memberToken = new URL(memberInvite.data.inviteUrl).searchParams.get('invite');
  const memberReg = await request('/auth/register', {
    method: 'POST',
    data: { email: 'hand@example.com', password: 'strong-password-123', inviteToken: memberToken },
  });
  assert.equal(memberReg.status, 201);

  const crew = await request('/entities/Crew', {
    method: 'POST',
    cookie: ownerCookie,
    data: {
      name: 'Alpha',
      leader_user_id: leaderReg.data.id,
      member_user_ids: [memberReg.data.id],
      capability_tags: ['removal'],
    },
  });
  assert.equal(crew.status, 201, JSON.stringify(crew.data));

  const otherCrew = await request('/entities/Crew', {
    method: 'POST',
    cookie: ownerCookie,
    data: { name: 'Beta', capability_tags: ['pruning'] },
  });
  assert.equal(otherCrew.status, 201);

  const assigned = await request('/entities/Job', {
    method: 'POST',
    cookie: ownerCookie,
    data: { title: 'Assigned job', client_id: client.data.id, crew_id: crew.data.id },
  });
  assert.equal(assigned.status, 201);

  const unassigned = await request('/entities/Job', {
    method: 'POST',
    cookie: ownerCookie,
    data: { title: 'Office-only job', client_id: client.data.id },
  });
  assert.equal(unassigned.status, 201);

  const otherAssigned = await request('/entities/Job', {
    method: 'POST',
    cookie: ownerCookie,
    data: { title: 'Other crew job', client_id: client.data.id, crew_id: otherCrew.data.id },
  });
  assert.equal(otherAssigned.status, 201);

  const leaderJobs = await request('/entities/Job', { cookie: leaderReg.cookie });
  assert.equal(leaderJobs.status, 200);
  const leaderIds = leaderJobs.data.map((j) => j.id);
  assert.ok(leaderIds.includes(assigned.data.id));
  assert.ok(!leaderIds.includes(unassigned.data.id));
  assert.ok(!leaderIds.includes(otherAssigned.data.id));

  const blocked = await request(`/entities/Job/${unassigned.data.id}`, { cookie: leaderReg.cookie });
  assert.equal(blocked.status, 403);

  const moneyBlocked = await request('/entities/Invoice', { cookie: leaderReg.cookie });
  assert.equal(moneyBlocked.status, 403);

  const ownerJobs = await request('/entities/Job', { cookie: ownerCookie });
  assert.equal(ownerJobs.data.length, 3);

  const digest = await passwordHash('strong-password-123');
  await createMemberUser(db, {
    email: 'books-iso@example.com',
    passwordHash: digest,
    companyId: owner.data.id,
    role: 'bookkeeper',
  });
  const booksLogin = await request('/auth/login', {
    method: 'POST',
    data: { email: 'books-iso@example.com', password: 'strong-password-123' },
  });
  assert.equal(booksLogin.status, 200);
  const crewCreate = await request('/entities/Crew', {
    method: 'POST',
    cookie: booksLogin.cookie,
    data: { name: 'Nope' },
  });
  assert.equal(crewCreate.status, 403);
});

test('seed-multi-crew creates two crews and mixed roles without wiping jobs', async (t) => {
  const { db, registerOwner, request } = await fixture(t);
  const owner = await registerOwner('seed-owner@example.com');
  const client = await request('/entities/Client', {
    method: 'POST',
    cookie: owner.cookie,
    data: { name: 'Keep Me', ...CLIENT_ADDR },
  });
  await request('/entities/Job', {
    method: 'POST',
    cookie: owner.cookie,
    data: { title: 'Keep job', client_id: client.data.id },
  });
  const result = await seedMultiCrew(db, 'seed-owner@example.com', { yes: true });
  assert.equal(result.crews.length, 2);
  assert.ok(result.members.some((m) => m.role === 'crew_leader'));
  const jobs = await db.all('SELECT id FROM records WHERE owner_id = ? AND entity = ?', [owner.data.id, 'Job']);
  assert.equal(jobs.length, 1);
});
