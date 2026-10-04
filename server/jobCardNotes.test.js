import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from './app.js';
import { openDatabase, migrate } from './db.js';
import { hash, token } from './security.js';

const CLIENT_ADDR = { address: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701' };

async function fixture(t) {
  const db = await openDatabase({ SQLITE_PATH: ':memory:' });
  await migrate(db);
  const app = await createApp(db, { APP_ORIGIN: 'http://localhost:5173' });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await db.close();
  });
  const addr = server.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const request = async (path, { method = 'GET', data, cookie, origin = 'http://localhost:5173' } = {}) => {
    const response = await fetch(base + '/api' + path, {
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
      data: response.headers.get('content-type')?.includes('json') ? await response.json() : null,
    };
  };
  const register = async email => {
    const invitation = token();
    await db.run(
      'INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)',
      [hash(invitation), 'invite', email, Date.now() + 60000],
    );
    const result = await request('/auth/register', {
      method: 'POST',
      data: { email, password: 'strong-password-123', inviteToken: invitation },
    });
    assert.equal(result.status, 201);
    return result;
  };
  return { request, register };
}

test('job board status_notes stamp color and survive column moves', async t => {
  const { request, register } = await fixture(t);
  const a = await register('job-notes@example.com');
  const client = await request('/entities/Client', {
    method: 'POST',
    cookie: a.cookie,
    data: { name: 'Notes Client', ...CLIENT_ADDR },
  });
  const job = await request('/entities/Job', {
    method: 'POST',
    cookie: a.cookie,
    data: { title: 'Notes job', client_id: client.data.id, status: 'Waiting on' },
  });
  assert.equal(job.data.status, 'Waiting on');

  const withNote = await request(`/entities/Job/${job.data.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: { status_notes: [{ text: 'Need gate code from owner' }] },
  });
  assert.equal(withNote.status, 200);
  assert.equal(withNote.data.status_notes.length, 1);
  assert.equal(withNote.data.status_notes[0].text, 'Need gate code from owner');
  assert.equal(withNote.data.status_notes[0].status, 'Waiting on');
  assert.ok(withNote.data.status_notes[0].id);
  assert.ok(withNote.data.status_notes[0].created_at);

  const moved = await request(`/entities/Job/${job.data.id}`, {
    method: 'PATCH',
    cookie: a.cookie,
    data: {
      status: 'In progress',
      status_notes: [
        ...withNote.data.status_notes,
        { text: 'Access cleared — crew rolling' },
      ],
    },
  });
  assert.equal(moved.data.status, 'In progress');
  assert.equal(moved.data.status_notes.length, 2);
  assert.equal(moved.data.status_notes[0].status, 'Waiting on', 'first note keeps Waiting on color after move');
  assert.equal(moved.data.status_notes[1].status, 'In progress');

  const legacy = await request('/entities/Job', {
    method: 'POST',
    cookie: a.cookie,
    data: {
      title: 'Legacy waiting',
      client_id: client.data.id,
      status: 'Waiting on weather',
      status_notes: [{ text: 'Storm day', status: 'Waiting on weather' }],
    },
  });
  assert.equal(legacy.data.status, 'Waiting on');
  assert.equal(legacy.data.status_notes[0].status, 'Waiting on');
});
