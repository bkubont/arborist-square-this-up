/**
 * Phase 5 exit: crew member completes a visit with time + photos on the field flow.
 * Covers Today payload, visit lifecycle, time clock missing-clock-out flags, timeline visibility.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase, migrate } from './db.js';
import { createApp } from './app.js';
import { hash, token } from './security.js';
import { SCHEDULED_STATUS } from './schedule.js';
import { isMissingClockOut, flagMissingClockOuts, calendarDayOf } from './timeClock.js';
import { jobTouchesDay, orderTodayJobs } from './today.js';

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
  return { request, register, db };
}

test('timeClock helpers: missing clock-out detection', () => {
  const today = '2026-10-08';
  assert.equal(isMissingClockOut({ clock_in: '2026-10-07T18:00:00.000Z' }, today), true);
  assert.equal(isMissingClockOut({ clock_in: '2026-10-08T09:00:00.000Z' }, today), false);
  assert.equal(isMissingClockOut({ clock_in: '2026-10-07T18:00:00.000Z', clock_out: '2026-10-07T19:00:00.000Z' }, today), false);
  const flagged = flagMissingClockOuts([
    { id: '1', clock_in: '2026-10-07T12:00:00.000Z' },
  ], today);
  assert.equal(flagged[0].needs_review, true);
  assert.equal(flagged[0].missing_clock_out, true);
  assert.ok(calendarDayOf('2026-10-08T15:00:00.000Z'));
});

test('today helpers: jobTouchesDay + order', () => {
  assert.equal(jobTouchesDay({ start_date: '2026-10-08' }, '2026-10-08'), true);
  assert.equal(jobTouchesDay({ start_date: '2026-10-07', end_date: '2026-10-09' }, '2026-10-08'), true);
  assert.equal(jobTouchesDay({ start_date: '2026-10-09' }, '2026-10-08'), false);
  const ordered = orderTodayJobs([
    { id: 'a', title: 'B', start_date: '2026-10-08' },
    { id: 'b', title: 'A', start_date: '2026-10-08', active_visit: { started_at: 'x' } },
  ]);
  assert.equal(ordered[0].id, 'b');
});

test('Phase 5: crew member Today → start visit → clock → photo → finish visit', async (t) => {
  const { request, register } = await fixture(t);
  const owner = await register('phase5-owner@example.com');
  const create = async (entity, data, cookie = owner.cookie) => {
    const result = await request(`/entities/${entity}`, { method: 'POST', data, cookie });
    assert.equal(result.status, 201, result.data?.message || entity);
    return result.data;
  };

  const client = await create('Client', { name: 'Phase5 Customer', ...CLIENT_ADDR });
  const property = await create('Property', {
    client_id: client.id,
    name: 'Front yard',
    address: '22 Pine St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    access_notes: 'Side gate code 1234',
    hazard_notes: 'Overhead lines',
  });

  const invite = await request('/members/invite', {
    method: 'POST',
    cookie: owner.cookie,
    data: { email: 'phase5-hand@example.com', role: 'crew_member' },
  });
  assert.equal(invite.status, 201, invite.data?.message);
  const inviteToken = new URL(invite.data.inviteUrl).searchParams.get('invite');
  const memberReg = await request('/auth/register', {
    method: 'POST',
    data: { email: 'phase5-hand@example.com', password: 'strong-password-123', inviteToken },
  });
  assert.equal(memberReg.status, 201);
  const memberCookie = memberReg.cookie;

  const me = await request('/auth/me', { cookie: memberCookie });
  assert.equal(me.data.role, 'crew_member');
  const handId = me.data.id;
  assert.ok(handId);

  const crew = await create('Crew', {
    name: 'Crew Field',
    member_user_ids: [handId],
  });
  const chipper = await create('Equipment', {
    name: 'Chipper',
    kind: 'machine',
    capability_tags: ['chipper'],
  });

  const today = calendarDayOf(null);
  const job = await create('Job', {
    title: 'Oak prune visit',
    client_id: client.id,
    property_id: property.id,
    status: SCHEDULED_STATUS,
    start_date: today,
    end_date: today,
    crew_id: crew.id,
    equipment_ids: [chipper.id],
    description: 'Crown reduction on front oak',
  });

  // Today payload for crew member — ordered job with crew, equipment, instructions.
  const todayRes = await request(`/today?date=${today}`, { cookie: memberCookie });
  assert.equal(todayRes.status, 200, todayRes.data?.message);
  assert.equal(todayRes.data.date, today);
  assert.equal(todayRes.data.jobs.length, 1);
  assert.equal(todayRes.data.jobs[0].id, job.id);
  assert.equal(todayRes.data.jobs[0].crew?.name, 'Crew Field');
  assert.equal(todayRes.data.jobs[0].equipment[0]?.name, 'Chipper');
  assert.equal(todayRes.data.jobs[0].property?.access_notes, 'Side gate code 1234');

  // Start visit → In progress + timeline.
  const start = await request(`/jobs/${job.id}/visit/start`, {
    method: 'POST',
    cookie: memberCookie,
    data: { note: 'Crew on site' },
  });
  assert.equal(start.status, 200, start.data?.message);
  assert.equal(start.data.status, 'In progress');
  assert.ok(start.data.active_visit?.started_at);

  // Clock in / out.
  const clockIn = await request(`/jobs/${job.id}/clock-in`, {
    method: 'POST',
    cookie: memberCookie,
    data: { kind: 'work' },
  });
  assert.equal(clockIn.status, 201, clockIn.data?.message);
  assert.ok(clockIn.data.clock_in);
  assert.equal(clockIn.data.user_id, handId);

  const clockOut = await request(`/jobs/${job.id}/clock-out`, {
    method: 'POST',
    cookie: memberCookie,
    data: {},
  });
  assert.equal(clockOut.status, 200, clockOut.data?.message);
  assert.ok(clockOut.data.clock_out);

  // Photo on timeline (customer visibility).
  const photo = await create('TimelineEntry', {
    job_id: job.id,
    type: 'photo',
    category: 'before',
    text: 'Before: front oak',
    visibility: 'customer',
    // No real file — photo_url optional for this path when omitted; use placeholder path shape.
    photo_url: undefined,
  }, memberCookie);
  assert.equal(photo.type, 'photo');
  assert.equal(photo.visibility, 'customer');

  // Problem + change request (internal).
  const problem = await request(`/jobs/${job.id}/problem`, {
    method: 'POST',
    cookie: memberCookie,
    data: { text: 'Neighbor fence damage risk' },
  });
  assert.equal(problem.status, 201);
  assert.equal(problem.data.visibility, 'internal');

  const change = await request(`/jobs/${job.id}/request-change`, {
    method: 'POST',
    cookie: memberCookie,
    data: { text: 'Add stump grind' },
  });
  assert.equal(change.status, 201);
  assert.equal(change.data.type, 'change_request');

  // Finish visit — clears active_visit, job stays In progress for multi-day.
  const finish = await request(`/jobs/${job.id}/visit/finish`, {
    method: 'POST',
    cookie: memberCookie,
    data: { note: 'Wrapped for today' },
  });
  assert.equal(finish.status, 200, finish.data?.message);
  assert.equal(finish.data.active_visit, null);
  assert.equal(finish.data.status, 'In progress');

  // Unified timeline includes visit + time + photo + problem.
  const timeline = await request(`/entities/TimelineEntry?job_id=${job.id}&limit=100`, { cookie: memberCookie });
  assert.equal(timeline.status, 200);
  const types = new Set(timeline.data.map((e) => e.type));
  assert.ok(types.has('visit_started'));
  assert.ok(types.has('visit_finished'));
  assert.ok(types.has('time_clock'));
  assert.ok(types.has('photo'));
  assert.ok(types.has('problem'));
  assert.ok(types.has('change_request'));

  const customerish = timeline.data.filter((e) => e.visibility === 'customer');
  const internalish = timeline.data.filter((e) => e.visibility === 'internal');
  assert.ok(customerish.some((e) => e.type === 'photo'));
  assert.ok(internalish.some((e) => e.type === 'problem'));

  // Complete job.
  const complete = await request(`/jobs/${job.id}/complete`, {
    method: 'POST',
    cookie: memberCookie,
    data: { note: 'All work done' },
  });
  assert.equal(complete.status, 200, complete.data?.message);
  assert.equal(complete.data.status, 'Completed');

  // Missing clock-out flag: invent an open entry from yesterday via entity create as owner.
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString();
  })();
  const stale = await create('TimeEntry', {
    job_id: job.id,
    user_id: handId,
    clock_in: yesterday,
    kind: 'work',
  });
  const times = await request(`/time-entries?job_id=${job.id}`, { cookie: owner.cookie });
  assert.equal(times.status, 200);
  const flagged = times.data.find((e) => e.id === stale.id);
  assert.ok(flagged);
  assert.equal(flagged.missing_clock_out, true);
  assert.equal(flagged.needs_review, true);
});
