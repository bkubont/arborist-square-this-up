/**
 * Phase 4 exit: two crews can be scheduled; double-book warning fires.
 * Also covers equipment overlap, weather reschedule history, and prerequisites.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase, migrate } from './db.js';
import { createApp } from './app.js';
import { hash, token } from './security.js';
import { SCHEDULED_STATUS } from './schedule.js';
import { READY_TO_SCHEDULE_STATUS } from './readyToSchedule.js';

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
  const request = async (path, { method = 'GET', data, cookie, origin = 'http://localhost:5173' } = {}) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        ...(origin !== null ? { origin } : {}),
        ...(cookie ? { cookie } : {}),
        'content-type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return {
      status: response.status,
      cookie: response.headers.get('set-cookie')?.split(';')[0],
      data: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.arrayBuffer(),
    };
  };
  const register = async (email) => {
    const invitation = token();
    await db.run('INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)', [
      hash(invitation), 'invite', email, Date.now() + 60000,
    ]);
    const result = await request('/auth/register', {
      method: 'POST',
      data: { email, password: 'strong-password-123', inviteToken: invitation },
    });
    assert.equal(result.status, 201);
    return result;
  };
  return { request, register };
}

test('Phase 4: schedule two crews; double-book warning; weather history; equipment', async (t) => {
  const { request, register } = await fixture(t);
  const a = await register('phase4@example.com');
  const create = async (entity, data) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie: a.cookie });
    assert.equal(result.status, 201, result.data?.message || entity);
    return result.data;
  };

  const client = await create('Client', { name: 'Phase4 Customer', ...CLIENT_ADDR });
  const property = await create('Property', {
    client_id: client.id,
    name: 'Yard',
    address: '9 Oak Ln',
    city: 'Austin',
    state: 'TX',
    zip: '78702',
    access_notes: 'Side gate',
  });

  const crewAlpha = await create('Crew', { name: 'Crew Alpha', capability_tags: ['removal'] });
  const crewBeta = await create('Crew', { name: 'Crew Beta', capability_tags: ['pruning'] });
  const crane = await create('Equipment', {
    name: '80t Crane',
    kind: 'machine',
    capability_tags: ['crane'],
  });
  const chipper = await create('Equipment', {
    name: 'Bandit Chipper',
    kind: 'machine',
    capability_tags: ['chipper'],
  });

  const jobA = await create('Job', {
    title: 'Oak removal A',
    client_id: client.id,
    property_id: property.id,
    status: READY_TO_SCHEDULE_STATUS,
    urgency: 'high',
    estimated_duration_hours: 6,
    prereq_deposit: true,
    prereq_access: true,
  });
  const jobB = await create('Job', {
    title: 'Maple prune B',
    client_id: client.id,
    property_id: property.id,
    status: READY_TO_SCHEDULE_STATUS,
    estimated_duration_hours: 4,
  });

  // Schedule two different crews on different days — no conflict.
  const schedA = await request(`/jobs/${jobA.id}/schedule`, {
    method: 'POST',
    cookie: a.cookie,
    data: {
      start_date: '2026-10-20',
      end_date: '2026-10-20',
      crew_id: crewAlpha.id,
      equipment_ids: [crane.id],
      estimated_duration_hours: 6,
      prereq_deposit: true,
      prereq_access: true,
    },
  });
  assert.equal(schedA.status, 200, schedA.data?.message);
  assert.equal(schedA.data.status, SCHEDULED_STATUS);
  assert.equal(schedA.data.crew_id, crewAlpha.id);
  assert.deepEqual(schedA.data.equipment_ids, [crane.id]);
  assert.equal(schedA.data.schedule_conflicts.ok, true);
  assert.ok(Array.isArray(schedA.data.schedule_history));
  assert.equal(schedA.data.schedule_history[0].reason, 'initial');
  assert.equal(schedA.data.schedule_prerequisites.approval, true);
  assert.equal(schedA.data.schedule_prerequisites.deposit, true);
  assert.equal(schedA.data.schedule_prerequisites.access, true);

  const schedB = await request(`/jobs/${jobB.id}/schedule`, {
    method: 'POST',
    cookie: a.cookie,
    data: {
      start_date: '2026-10-21',
      crew_id: crewBeta.id,
      equipment_ids: [chipper.id],
    },
  });
  assert.equal(schedB.status, 200, schedB.data?.message);
  assert.equal(schedB.data.status, SCHEDULED_STATUS);
  assert.equal(schedB.data.crew_id, crewBeta.id);
  assert.equal(schedB.data.schedule_conflicts.ok, true);

  // Double-book Crew Alpha on the same day → warning fires (soft save still succeeds).
  const jobC = await create('Job', {
    title: 'Conflict stump',
    client_id: client.id,
    status: READY_TO_SCHEDULE_STATUS,
  });
  const conflict = await request(`/jobs/${jobC.id}/schedule`, {
    method: 'POST',
    cookie: a.cookie,
    data: {
      start_date: '2026-10-20',
      crew_id: crewAlpha.id,
      equipment_ids: [crane.id],
    },
  });
  assert.equal(conflict.status, 200, conflict.data?.message);
  assert.equal(conflict.data.schedule_conflicts.ok, false);
  assert.ok(conflict.data.schedule_warnings.length >= 2, conflict.data.schedule_warnings);
  assert.ok(conflict.data.schedule_warnings.some((w) => /Double-booked Crew Alpha/i.test(w)));
  assert.ok(conflict.data.schedule_warnings.some((w) => /Double-booked 80t Crane/i.test(w)));
  assert.ok(conflict.data.schedule_conflicts.crewConflicts.length >= 1);
  assert.ok(conflict.data.schedule_conflicts.equipmentConflicts.length >= 1);

  // Preview endpoint agrees.
  const preview = await request(
    `/schedule/conflicts?start_date=2026-10-20&crew_id=${crewAlpha.id}&equipment_ids=${crane.id}&exclude_job_id=${jobC.id}`,
    { cookie: a.cookie },
  );
  assert.equal(preview.status, 200);
  assert.equal(preview.data.ok, false);
  assert.ok(preview.data.warnings.length >= 1);

  // Weather reschedule retains history + notification flag.
  const moved = await request(`/jobs/${jobA.id}/reschedule`, {
    method: 'POST',
    cookie: a.cookie,
    data: {
      start_date: '2026-10-23',
      reason: 'weather',
      note: 'High winds advisory',
      customer_notified: true,
    },
  });
  assert.equal(moved.status, 200, moved.data?.message);
  assert.equal(moved.data.start_date, '2026-10-23');
  assert.ok(moved.data.schedule_history.length >= 2);
  const weather = moved.data.schedule_history.find((h) => h.reason === 'weather');
  assert.ok(weather);
  assert.equal(weather.previous_start_date, '2026-10-20');
  assert.equal(weather.new_start_date, '2026-10-23');
  assert.equal(weather.customer_notified, true);
  assert.match(weather.note || '', /High winds/);

  // Job PATCH also surfaces warnings when overlapping.
  const patchConflict = await request(`/entities/Job/${jobB.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { start_date: '2026-10-23', end_date: '2026-10-23', crew_id: crewAlpha.id },
  });
  assert.equal(patchConflict.status, 200);
  assert.ok(Array.isArray(patchConflict.data.schedule_warnings));
  assert.ok(patchConflict.data.schedule_warnings.some((w) => /Double-booked/i.test(w)));
});
