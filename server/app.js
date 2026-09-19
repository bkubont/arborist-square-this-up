import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { schemas, fail, decode, getRecord, saveRecord, JOB_DOCUMENT_ENTITIES } from './domain.js';
import { emailSchema, passwordSchema, passwordHash, verifyPassword, hash, token } from './security.js';

export async function createApp(db, env = process.env) {
  const app = express();
  const production = env.NODE_ENV === 'production';
  const origin = new URL(env.APP_ORIGIN || 'http://localhost:5173').origin;
  if (production && !origin.startsWith('https://')) throw new Error('APP_ORIGIN must use HTTPS in production');
  const cookie = { httpOnly: true, secure: production, sameSite: 'lax', path: '/' };
  const cookieName = production ? '__Host-jobsite_session' : 'jobsite_session';
  const dummyHash = await passwordHash(token());
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"],
    upgradeInsecureRequests: production ? [] : null,
  } }, strictTransportSecurity: production ? undefined : false }));
  app.use(cookieParser());
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // Require the configured frontend origin on every mutation, including login.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== origin)
      return next(fail(403, 'Invalid request origin'));
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  const cleanup = async tx => {
    const now = Date.now();
    await tx.run('DELETE FROM sessions WHERE expires_at < ?', [now]);
    await tx.run('DELETE FROM tokens WHERE expires_at < ?', [now]);
    await tx.run('DELETE FROM rate_limits WHERE expires_at < ?', [now]);
  };
  const limited = async (key, max = 10) => db.transaction(async tx => {
    await cleanup(tx);
    const bucket = hash(key);
    // Increment atomically so limits work across multiple server processes.
    const upsert = db.dialect === 'mysql'
      ? 'INSERT INTO rate_limits (bucket, attempts, expires_at) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE attempts = attempts + 1'
      : 'INSERT INTO rate_limits (bucket, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1';
    await tx.run(upsert, [bucket, Date.now() + 15 * 60 * 1000]);
    const [row] = await tx.all('SELECT attempts FROM rate_limits WHERE bucket = ?', [bucket]);
    return row.attempts <= max;
  });
  app.use('/api/auth', async (req, res, next) => {
    if (req.method === 'GET') return next();
    // Global cap also protects deployments where the reverse proxy hides client IPs.
    if (!await limited('auth-global', 300)) throw fail(429, 'Too many attempts. Try again in 15 minutes.');
    next();
  });
  const requireUser = async (req, res, next) => {
    const value = req.cookies[cookieName];
    const [user] = value ? await db.all('SELECT users.id, users.email, users.created_date FROM users JOIN sessions ON sessions.user_id = users.id WHERE sessions.token_hash = ? AND sessions.expires_at > ?', [hash(value), Date.now()]) : [];
    if (!user) throw fail(401, 'Please log in');
    req.user = user;
    next();
  };
  const session = async (res, userId, connection = db) => {
    const value = token();
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    await connection.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [hash(value), userId, Date.now() + maxAge]);
    res.cookie(cookieName, value, { ...cookie, maxAge });
  };
  app.get('/api/health', async (req, res) => { await db.all('SELECT 1 AS ok'); res.json({ ok: true }); });
  app.get('/api/auth/me', requireUser, (req, res) => res.json(req.user));
  app.post('/api/auth/login', async (req, res) => {
    const email = emailSchema.parse(req.body.email);
    if (!await limited(`login:${email}`)) throw fail(429, 'Too many attempts. Try again in 15 minutes.');
    const user = await db.transaction(async tx => {
      const [user] = await tx.all('SELECT * FROM users WHERE email = ?' + (db.dialect === 'mysql' ? ' FOR UPDATE' : ''), [email]);
      const valid = await verifyPassword(req.body.password, user?.password_hash || dummyHash);
      if (!user || !valid) throw fail(401, 'Invalid email or password');
      if (req.cookies[cookieName]) await tx.run('DELETE FROM sessions WHERE token_hash = ?', [hash(req.cookies[cookieName])]);
      await session(res, user.id, tx);
      return user;
    });
    res.json({ id: user.id, email: user.email });
  });
  app.post('/api/auth/logout', async (req, res) => {
    if (req.cookies[cookieName]) await db.run('DELETE FROM sessions WHERE token_hash = ?', [hash(req.cookies[cookieName])]);
    res.clearCookie(cookieName, cookie).json({ ok: true });
  });
  app.post('/api/auth/register', async (req, res) => {
    const email = emailSchema.parse(req.body.email);
    const invite = z.string().regex(/^[a-f0-9]{64}$/).parse(req.body.inviteToken);
    const password = passwordSchema.parse(req.body.password);
    const digest = await passwordHash(password);
    const userId = randomUUID();
    await db.transaction(async tx => {
      const lock = db.dialect === 'mysql' ? ' FOR UPDATE' : '';
      const [row] = await tx.all('SELECT * FROM tokens WHERE token_hash = ? AND kind = ? AND email = ? AND expires_at > ?' + lock, [hash(invite), 'invite', email, Date.now()]);
      if (!row) throw fail(400, 'Invitation is invalid or expired');
      if ((await tx.all('SELECT id FROM users WHERE email = ?', [email])).length) throw fail(409, 'Account already exists. Please log in.');
      await tx.run('INSERT INTO users (id, email, password_hash, created_date) VALUES (?, ?, ?, ?)', [userId, email, digest, new Date().toISOString()]);
      await tx.run('DELETE FROM tokens WHERE token_hash = ?', [hash(invite)]);
    });
    await session(res, userId);
    res.status(201).json({ id: userId, email });
  });
  app.post('/api/auth/forgot-password', async (req, res) => {
    if (!env.SMTP_HOST || !env.MAIL_FROM) throw fail(503, 'Email recovery is not configured. Contact the app owner for a reset link.');
    const email = emailSchema.parse(req.body.email);
    if (!await limited(`reset:${email}`, 3)) throw fail(429, 'Please wait before requesting another link.');
    const [user] = await db.all('SELECT id FROM users WHERE email = ?', [email]);
    if (user) {
      const value = token();
      await db.run('INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)', [hash(value), 'reset', email, Date.now() + 30 * 60 * 1000]);
      try {
        const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 465), secure: env.SMTP_SECURE !== 'false',
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined });
        await transport.sendMail({ from: env.MAIL_FROM, to: email, subject: 'Reset your Jobsite Notebook password',
          text: `Reset your password within 30 minutes: ${origin}/reset-password?token=${value}\nIf you did not request this, ignore this email.` });
      } catch { console.error('Password reset email delivery failed'); }
    }
    res.json({ ok: true });
  });
  app.post('/api/auth/reset-password', async (req, res) => {
    const value = z.string().regex(/^[a-f0-9]{64}$/).parse(req.body.resetToken);
    const digest = await passwordHash(req.body.newPassword);
    await db.transaction(async tx => {
      const lock = db.dialect === 'mysql' ? ' FOR UPDATE' : '';
      const [row] = await tx.all('SELECT * FROM tokens WHERE token_hash = ? AND kind = ? AND expires_at > ?' + lock, [hash(value), 'reset', Date.now()]);
      if (!row) throw fail(400, 'Reset link is invalid or expired');
      const [user] = await tx.all('SELECT id FROM users WHERE email = ?', [row.email]);
      if (!user) throw fail(400, 'Reset link is invalid or expired');
      await tx.run('UPDATE users SET password_hash = ? WHERE id = ?', [digest, user.id]);
      await tx.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
      await tx.run('DELETE FROM tokens WHERE email = ? AND kind = ?', [row.email, 'reset']);
    });
    res.clearCookie(cookieName, cookie).json({ ok: true });
  });
  app.use('/api', requireUser);
  app.param('entity', (req, res, next, entity) => { if (!Object.hasOwn(schemas, entity)) return next(fail(404, 'Unknown record type')); next(); });
  app.get('/api/entities/:entity', async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(500).parse(req.query.limit || 200);
    const offset = z.coerce.number().int().min(0).parse(req.query.offset || 0);
    const sort = z.enum(['created_date', '-created_date']).parse(req.query.sort || '-created_date');
    const parent = req.query.job_id || req.query.client_id;
    if (parent !== undefined) z.string().min(1).max(36).parse(parent);
    const rows = await db.all(`SELECT * FROM records WHERE owner_id = ? AND entity = ?${parent ? ' AND parent_id = ?' : ''} ORDER BY created_date ${sort.startsWith('-') ? 'DESC' : 'ASC'}, id ASC LIMIT ${limit} OFFSET ${offset}`, [req.user.id, req.params.entity, ...(parent ? [parent] : [])]);
    res.json(rows.map(decode));
  });
  app.get('/api/entities/:entity/:id', async (req, res) => res.json(await getRecord(db, req.user.id, req.params.entity, req.params.id)));
  // Lock the owner's row to serialize relationships, deletes, quotas and exports.
  const ownedTransaction = (owner, fn) => db.transaction(async tx => {
    await tx.all('SELECT id FROM users WHERE id = ?' + (db.dialect === 'mysql' ? ' FOR UPDATE' : ''), [owner]);
    return fn(tx);
  });
  app.post('/api/entities/:entity', async (req, res) => res.status(201).json(await ownedTransaction(req.user.id, tx => saveRecord(tx, req.user.id, req.params.entity, req.body))));
  app.patch('/api/entities/:entity/:id', async (req, res) => res.json(await ownedTransaction(req.user.id, tx => saveRecord(tx, req.user.id, req.params.entity, req.body, req.params.id))));
  app.delete('/api/entities/:entity/:id', async (req, res) => {
    await ownedTransaction(req.user.id, async tx => {
      const record = await getRecord(tx, req.user.id, req.params.entity, req.params.id);
      const removedEntries = req.params.entity === 'Job'
        ? (await tx.all('SELECT data FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [req.user.id, 'TimelineEntry', record.id])).map(row => JSON.parse(row.data))
        : req.params.entity === 'TimelineEntry' ? [record] : [];
      if (req.params.entity === 'Client' && (await tx.all('SELECT id FROM records WHERE owner_id = ? AND parent_id = ?', [req.user.id, record.id])).length)
        throw fail(409, 'Delete this client’s jobs first');
      if (req.params.entity === 'Job') {
        for (const child of ['TimelineEntry', ...JOB_DOCUMENT_ENTITIES]) {
          await tx.run('DELETE FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [req.user.id, child, record.id]);
        }
      }
      await tx.run('DELETE FROM records WHERE owner_id = ? AND id = ?', [req.user.id, record.id]);
      // Remove files no longer referenced by remaining timeline entries.
      const entries = await tx.all('SELECT data FROM records WHERE owner_id = ? AND entity = ?', [req.user.id, 'TimelineEntry']);
      const references = new Set(entries.map(row => JSON.parse(row.data).photo_url));
      for (const entry of removedEntries) if (entry.photo_url && !references.has(entry.photo_url))
        await tx.run('DELETE FROM files WHERE id = ? AND owner_id = ?', [entry.photo_url.split('/').pop(), req.user.id]);
    });
    res.json({ ok: true });
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 0 } });
  app.post('/api/files', upload.single('file'), async (req, res) => {
    if (!req.file) throw fail(400, 'Choose a photo to upload');
    const bytes = req.file.buffer;
    const mime = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg'
      : bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
      : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' ? 'image/webp' : null;
    if (!mime) throw fail(400, 'Use a JPEG, PNG or WebP photo');
    const fileId = randomUUID();
    await ownedTransaction(req.user.id, async tx => {
      const [usage] = await tx.all('SELECT COALESCE(SUM(size), 0) AS total FROM files WHERE owner_id = ?', [req.user.id]);
      if (Number(usage.total) + bytes.length > Number(env.ACCOUNT_STORAGE_MB || 100) * 1024 * 1024) throw fail(413, 'Account photo storage limit reached');
      await tx.run('INSERT INTO files (id, owner_id, mime, content, size) VALUES (?, ?, ?, ?, ?)', [fileId, req.user.id, mime, bytes, bytes.length]);
    });
    res.status(201).json({ file_url: `/api/files/${fileId}` });
  });
  app.get('/api/files/:id', async (req, res) => {
    const [file] = await db.all('SELECT * FROM files WHERE owner_id = ? AND id = ?', [req.user.id, req.params.id]);
    if (!file) throw fail(404, 'File not found');
    res.set('Content-Type', file.mime).set('Content-Disposition', 'inline').send(Buffer.from(file.content));
  });
  app.get('/api/export', async (req, res) => {
    const data = await ownedTransaction(req.user.id, async tx => ({ version: 1, exported_at: new Date().toISOString(),
      records: (await tx.all('SELECT * FROM records WHERE owner_id = ?', [req.user.id])).map(row => ({ entity: row.entity, ...decode(row) })),
      files: (await tx.all('SELECT * FROM files WHERE owner_id = ?', [req.user.id])).map(file => ({ id: file.id, mime: file.mime, content: Buffer.from(file.content).toString('base64') })),
    }));
    res.set('Content-Disposition', 'attachment; filename="jobsite-backup.json"').json(data);
  });
  app.use('/api', (req, res, next) => next(fail(404, 'Endpoint not found')));
  app.use(express.static(resolve('dist'), { index: false }));
  app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof z.ZodError ? 400 : error instanceof multer.MulterError ? 413 : error.status || 500;
    if (status >= 500) console.error('Request failed:', error.code || error.name);
    res.status(status).json({ message: error instanceof z.ZodError ? error.issues[0].message : status >= 500 ? (status === 503 ? error.message : 'Server error. Please try again.') : error.message });
  });
  return app;
}
