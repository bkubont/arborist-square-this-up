import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { schemas, fail, decode, getRecord, saveRecord, JOB_DOCUMENT_ENTITIES, JOB_CHILD_ENTITIES, fileIdsOf, defaultCompanyProfileSeed } from './domain.js';
import { searchCatalog } from './catalog.js';
import { loadWorkTypes } from '../shared/workTypes.js';
import { suggestAddresses } from './addressSuggest.js';
import { createSignLink, loadPublicSign, completeSign, jobAuthorizedTotal } from './sign.js';
import { buildInvoiceAutofill, sumActiveInvoiceTotals } from './mapping.js';
import { syncDraftMaterialOrder } from './materialOrderSync.js';
import { voidDocument, reviseDocument, declineDocument, invalidateSignLinks, assertDocumentEntity } from './documents.js';
import {
  assertSingularDocument,
  assertInvoiceHasAuthorizedScope,
  stripJobDerivedMoney,
  findActiveJobDocument,
  listJobDocuments,
  findLiveAcceptedEstimate,
  sumDepositsApplied,
  refreshJobDocumentRollups,
  SINGLE_DOC_ENTITIES,
} from './documentRules.js';
import {
  isFinancialTimelineEntry,
  prepareInvoicePatch,
  refreshInvoicePaymentSync,
  applyPaymentRecordToInvoice,
} from './invoiceSync.js';
import {
  fieldsForCompleteWithChecklist,
  fieldsForApproveReview,
  prepareChecklistUpdate,
  mergeCompletionChecklist,
  autoChecklistFlags,
  loadCompletionContext,
  assertInvoiceAllowedAfterReview,
  evaluateReviewGate,
} from './completion.js';
import { loadJobProduction, loadCrewDashboards } from './production.js';
import {
  applyClientPipelineFields,
  normalizeClientRecord,
} from './clientPipeline.js';
import { applyJobArchiveFields } from './jobArchive.js';
import { applyJobStatusFields, normalizeJobRecord } from './jobStatus.js';
import { normalizeWorkItemRecord } from './taskStatus.js';
import { assertScopeUpdatable, assertScopeDeletable, assertJobHasActiveEstimate } from './lifecycle.js';
import { prepareWorkItemCreate, prepareWorkItemUpdate, assertWorkItemDeletable, completeJobWhenTasksDone } from './workItems.js';
import { absorbWorkItemMaterials, attachSharedMaterials, dropMaterialsForTask } from './jobMaterialList.js';
import { attachDefaultJobTasks } from './defaultJobTasks.js';
import { attachDefaultPunchList } from './defaultPunchList.js';
import { preparePunchListUpdate, completePunchList } from './punchList.js';
import { overrideScopeStatus } from './statusOverride.js';
import { emailSchema, passwordSchema, passwordHash, verifyPassword, hash, token } from './security.js';
import { DEFAULT_SALES_TAX_RATE } from './salesTax.js';
import { jobSummary, accountSummaries } from './summary.js';
import { fromCents } from '../shared/money.js';
import {
  ensureMembership,
  acceptMemberInvite,
  peekMemberInvite,
  createMemberInvite,
  listMembers,
  listMemberInvites,
  updateMemberRole,
  removeMember,
  crewIdsForUser,
  toPublicUser,
  validateCrewMembers,
} from './membership.js';
import { can, INVITABLE_ROLES, ROLE_LABELS, isCrewScopedRole } from './roles.js';
import {
  requirePermission,
  assertEntityPermission,
  assertRecordVisible,
  assertWriteAllowed,
  filterRecordsForRole,
  ensureCrewIds,
} from './permissions.js';
import { findScheduleConflicts, scheduleAssignmentChanged } from './scheduleConflicts.js';
import {
  jobFieldsForScheduleAssign,
  jobFieldsForReschedule,
  schedulePrerequisiteFlags,
} from './schedule.js';
import {
  fieldsForStartVisit,
  fieldsForFinishVisit,
  appendFieldTimeline,
  scheduleChangeTimelineText,
} from './fieldVisit.js';
import {
  listTimeEntries,
  flagMissingClockOuts,
  prepareClockIn,
  prepareClockOut,
  saveClockIn,
  saveClockOut,
  calendarDayOf,
} from './timeClock.js';
import { buildTodayPayload } from './today.js';

/** Saving these re-syncs the job's draft Material Order from the job buy list. */
const MATERIAL_SYNC_ENTITIES = new Set(['WorkItem', 'Job']);

async function maybeSyncMaterialOrder(tx, ownerId, jobId, opts = {}) {
  if (!jobId) return null;
  const synced = await syncDraftMaterialOrder(tx, ownerId, jobId, opts);
  if (synced?.job_id) {
    await refreshJobDocumentRollups(tx, ownerId, synced.job_id, { saveRecord, sumActiveInvoiceTotals });
  }
  return synced;
}

function normalizeEntityRecord(entity, record) {
  if (entity === 'Job') return normalizeJobRecord(record);
  if (entity === 'Client') return normalizeClientRecord(record);
  if (entity === 'WorkItem') return normalizeWorkItemRecord(record);
  return record;
}

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
    defaultSrc: ["'self'"],
    // Google Places Autocomplete (optional VITE_GOOGLE_PLACES_API_KEY)
    scriptSrc: ["'self'", "https://maps.googleapis.com", "https://maps.gstatic.com"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    imgSrc: ["'self'", "data:", "blob:", "https://maps.gstatic.com", "https://maps.googleapis.com", "https://*.ggpht.com"],
    connectSrc: ["'self'", "https://maps.googleapis.com", "https://places.googleapis.com", "https://maps.gstatic.com"],
    workerSrc: ["'self'", "blob:"],
    upgradeInsecureRequests: production ? [] : null,
  } }, strictTransportSecurity: production ? undefined : false }));
  app.use(cookieParser());
  /** Raw session token from Authorization: Bearer … (native clients). */
  const bearerToken = req => {
    const header = req.get('authorization') || '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    return match?.[1] || null;
  };
  /** Native clients (Expo / Electron): X-Client header (body may not be parsed yet on CSRF gate). */
  const isNativeClientHeader = req => {
    const client = (req.get('x-client') || '').toLowerCase();
    return client === 'mobile' || client === 'desktop';
  };
  /** After JSON parse: header or body.client for Bearer token issuance (no cookie). */
  const isNativeClient = req => {
    if (isNativeClientHeader(req)) return true;
    const bodyClient = req.body?.client;
    return bodyClient === 'mobile' || bodyClient === 'desktop';
  };
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // Electron (and browsers) need CORS for cross-origin Bearer calls; RN does not.
    const acrh = (req.get('access-control-request-headers') || '').toLowerCase();
    const nativePreflight = req.method === 'OPTIONS'
      && (acrh.includes('x-client') || acrh.includes('authorization'));
    if (isNativeClientHeader(req) || nativePreflight) {
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Client',
        'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      });
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    // Browser CSRF: require APP_ORIGIN on mutations. Bearer / native clients skip Origin.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      && !bearerToken(req)
      && !isNativeClientHeader(req)
      && req.get('origin') !== origin)
      return next(fail(403, 'Invalid request origin'));
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  const cleanup = async tx => {
    const now = Date.now();
    await tx.run('DELETE FROM sessions WHERE expires_at < ?', [now]);
    await tx.run('DELETE FROM tokens WHERE expires_at < ?', [now]);
    await tx.run('DELETE FROM rate_limits WHERE expires_at < ?', [now]);
    await tx.run('DELETE FROM sign_links WHERE expires_at < ?', [now]);
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
    const value = bearerToken(req) || req.cookies[cookieName];
    const [user] = value ? await db.all('SELECT users.id, users.email, users.created_date FROM users JOIN sessions ON sessions.user_id = users.id WHERE sessions.token_hash = ? AND sessions.expires_at > ?', [hash(value), Date.now()]) : [];
    if (!user) throw fail(401, 'Please log in');
    const membership = await ensureMembership(db, user.id);
    req.user = user;
    req.membership = membership;
    req.ownerId = membership.company_id;
    req.role = membership.role;
    req.sessionToken = value;
    next();
  };
  const attachPublicUser = async (user, membership) => {
    const crewIds = isCrewScopedRole(membership.role)
      ? await crewIdsForUser(db, membership.company_id, user.id)
      : [];
    return toPublicUser(user, membership, crewIds);
  };
  const session = async (res, userId, connection = db, { setCookie = true } = {}) => {
    const value = token();
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    await connection.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [hash(value), userId, Date.now() + maxAge]);
    if (setCookie) res.cookie(cookieName, value, { ...cookie, maxAge });
    return value;
  };
  app.get('/api/health', async (req, res) => { await db.all('SELECT 1 AS ok'); res.json({ ok: true }); });
  app.get('/api/auth/me', requireUser, async (req, res) => {
    res.json(await attachPublicUser(req.user, req.membership));
  });
  app.get('/api/auth/invite-info', async (req, res) => {
    const inviteToken = z.string().regex(/^[a-f0-9]{64}$/).parse(req.query.invite || '');
    const email = emailSchema.parse(req.query.email || '');
    const member = await peekMemberInvite(db, inviteToken, email);
    if (member) {
      res.json({ kind: 'member', role: member.role, role_label: ROLE_LABELS[member.role] || member.role });
      return;
    }
    const [solo] = await db.all(
      'SELECT email FROM tokens WHERE token_hash = ? AND kind = ? AND email = ? AND expires_at > ?',
      [hash(inviteToken), 'invite', email, Date.now()],
    );
    if (!solo) throw fail(400, 'Invitation is invalid or expired');
    res.json({ kind: 'company' });
  });
  app.post('/api/auth/login', async (req, res) => {
    const email = emailSchema.parse(req.body.email);
    if (!await limited(`login:${email}`)) throw fail(429, 'Too many attempts. Try again in 15 minutes.');
    const native = isNativeClient(req);
    const user = await db.transaction(async tx => {
      const [user] = await tx.all('SELECT * FROM users WHERE email = ?' + (db.dialect === 'mysql' ? ' FOR UPDATE' : ''), [email]);
      const valid = await verifyPassword(req.body.password, user?.password_hash || dummyHash);
      if (!user || !valid) throw fail(401, 'Invalid email or password');
      if (req.cookies[cookieName]) await tx.run('DELETE FROM sessions WHERE token_hash = ?', [hash(req.cookies[cookieName])]);
      const sessionToken = await session(res, user.id, tx, { setCookie: !native });
      return { user, sessionToken };
    });
    const membership = await ensureMembership(db, user.user.id);
    const payload = await attachPublicUser(
      { id: user.user.id, email: user.user.email, created_date: user.user.created_date },
      membership,
    );
    if (native) payload.token = user.sessionToken;
    res.json(payload);
  });
  app.post('/api/auth/logout', async (req, res) => {
    const bearer = bearerToken(req);
    if (bearer) await db.run('DELETE FROM sessions WHERE token_hash = ?', [hash(bearer)]);
    if (req.cookies[cookieName]) await db.run('DELETE FROM sessions WHERE token_hash = ?', [hash(req.cookies[cookieName])]);
    res.clearCookie(cookieName, cookie).json({ ok: true });
  });
  /** App Store 5.1.1(v): password-confirmed wipe. Owner deletes the company; members leave. */
  app.delete('/api/auth/account', requireUser, async (req, res) => {
    const password = z.string().max(128).parse(req.body?.password ?? '');
    if (!await limited(`delete-account:${req.user.id}`, 5)) throw fail(429, 'Too many attempts. Try again in 15 minutes.');
    await db.transaction(async tx => {
      const lock = db.dialect === 'mysql' ? ' FOR UPDATE' : '';
      const [user] = await tx.all('SELECT * FROM users WHERE id = ?' + lock, [req.user.id]);
      const valid = await verifyPassword(password, user?.password_hash || dummyHash);
      if (!user || !valid) throw fail(401, 'Incorrect password');
      const membership = await ensureMembership(tx, user.id);
      if (membership.role === 'owner' && membership.company_id === user.id) {
        // Wipe member users first (their rows do not own company records).
        const members = await tx.all(
          'SELECT user_id FROM company_members WHERE company_id = ? AND user_id != ?',
          [user.id, user.id],
        );
        for (const m of members) {
          await tx.run('DELETE FROM company_members WHERE user_id = ?', [m.user_id]);
          await tx.run('DELETE FROM sessions WHERE user_id = ?', [m.user_id]);
          await tx.run('DELETE FROM users WHERE id = ?', [m.user_id]);
        }
        await tx.run('DELETE FROM member_invites WHERE company_id = ?', [user.id]);
        await tx.run('DELETE FROM tokens WHERE email = ?', [user.email]);
        await tx.run('DELETE FROM users WHERE id = ?', [user.id]);
      } else {
        // Non-owner: leave company and delete only this login.
        const { stripUserFromCrews } = await import('./membership.js');
        await stripUserFromCrews(tx, membership.company_id, user.id);
        await tx.run('DELETE FROM company_members WHERE user_id = ?', [user.id]);
        await tx.run('DELETE FROM tokens WHERE email = ?', [user.email]);
        await tx.run('DELETE FROM users WHERE id = ?', [user.id]);
      }
    });
    res.clearCookie(cookieName, cookie).json({ ok: true });
  });
  app.post('/api/auth/register', async (req, res) => {
    const email = emailSchema.parse(req.body.email);
    const invite = z.string().regex(/^[a-f0-9]{64}$/).parse(req.body.inviteToken);
    const password = passwordSchema.parse(req.body.password);
    const taxRaw = req.body.default_tax_rate ?? req.body.sales_tax_rate;
    const defaultTaxRate = taxRaw === undefined || taxRaw === null || taxRaw === ''
      ? DEFAULT_SALES_TAX_RATE
      : z.number().finite().min(0).max(100).parse(Number(taxRaw));
    const digest = await passwordHash(password);
    const userId = randomUUID();
    const native = isNativeClient(req);
    let membership = null;
    await db.transaction(async tx => {
      const lock = db.dialect === 'mysql' ? ' FOR UPDATE' : '';
      const pendingMember = await peekMemberInvite(tx, invite, email);
      if (pendingMember) {
        if ((await tx.all('SELECT id FROM users WHERE email = ?', [email])).length) {
          throw fail(409, 'Account already exists. Please log in.');
        }
        await tx.run(
          'INSERT INTO users (id, email, password_hash, created_date) VALUES (?, ?, ?, ?)',
          [userId, email, digest, new Date().toISOString()],
        );
        const memberJoin = await acceptMemberInvite(tx, { inviteToken: invite, email, userId });
        if (!memberJoin) throw fail(400, 'Invitation is invalid or expired');
        membership = { company_id: memberJoin.company_id, role: memberJoin.role };
        return;
      }
      const [row] = await tx.all(
        'SELECT * FROM tokens WHERE token_hash = ? AND kind = ? AND email = ? AND expires_at > ?' + lock,
        [hash(invite), 'invite', email, Date.now()],
      );
      if (!row) throw fail(400, 'Invitation is invalid or expired');
      if ((await tx.all('SELECT id FROM users WHERE email = ?', [email])).length) {
        throw fail(409, 'Account already exists. Please log in.');
      }
      await tx.run(
        'INSERT INTO users (id, email, password_hash, created_date) VALUES (?, ?, ?, ?)',
        [userId, email, digest, new Date().toISOString()],
      );
      await tx.run('DELETE FROM tokens WHERE token_hash = ?', [hash(invite)]);
      await tx.run(
        'INSERT INTO company_members (user_id, company_id, role, created_date) VALUES (?, ?, ?, ?)',
        [userId, userId, 'owner', new Date().toISOString()],
      );
      // Seed company profile with sales tax + arborist service presets so estimates autofill.
      await saveRecord(tx, userId, 'CompanyProfile', defaultCompanyProfileSeed(defaultTaxRate));
      membership = { company_id: userId, role: 'owner' };
    });
    const sessionToken = await session(res, userId, db, { setCookie: !native });
    const payload = await attachPublicUser(
      { id: userId, email, created_date: new Date().toISOString() },
      membership,
    );
    if (membership.role === 'owner') payload.default_tax_rate = defaultTaxRate;
    if (native) payload.token = sessionToken;
    res.status(201).json(payload);
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
        await transport.sendMail({ from: env.MAIL_FROM, to: email, subject: 'Reset your Square This Up (arborist) password',
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

  // Public client e-sign (Estimate / Change Order; no login). Rate-limited.
  app.get('/api/sign/:token', async (req, res) => {
    if (!await limited(`sign-get:${req.ip}`, 60)) throw fail(429, 'Too many attempts. Try again later.');
    res.json(await loadPublicSign(db, req.params.token));
  });
  app.post('/api/sign/:token', async (req, res) => {
    if (!await limited(`sign-post:${req.ip}`, 20)) throw fail(429, 'Too many attempts. Try again later.');
    const updated = await completeSign(db, {
      rawToken: req.params.token,
      signerName: req.body.signer_name,
      signatureDataUrl: req.body.signature_data_url,
      env,
    });
    res.json({
      ok: true,
      entity: updated.status === 'approved' ? 'ChangeOrder' : 'Estimate',
      document: { id: updated.id, status: updated.status, signed_at: updated.signed_at, signer_name: updated.signer_name, revised_contract_total: updated.revised_contract_total },
      estimate: updated.status === 'accepted' ? { id: updated.id, status: updated.status, signed_at: updated.signed_at, signer_name: updated.signer_name } : undefined,
    });
  });

  app.use('/api', requireUser);

  // --- Company members & crews (multi-crew Phase 1) ---
  app.get('/api/members', requirePermission('manage_members'), async (req, res) => {
    const [members, invites] = await Promise.all([
      listMembers(db, req.ownerId),
      listMemberInvites(db, req.ownerId),
    ]);
    res.json({
      members,
      invites: invites.map((i) => ({
        email: i.email,
        role: i.role,
        role_label: ROLE_LABELS[i.role] || i.role,
        expires_at: i.expires_at,
        created_date: i.created_date,
      })),
      roles: INVITABLE_ROLES.map((r) => ({ id: r, label: ROLE_LABELS[r] })),
    });
  });
  app.post('/api/members/invite', requirePermission('manage_members'), async (req, res) => {
    const email = emailSchema.parse(req.body.email);
    const role = z.enum(/** @type {[string, ...string[]]} */ (INVITABLE_ROLES)).parse(req.body.role);
    if (!await limited(`member-invite:${req.ownerId}`, 30)) {
      throw fail(429, 'Too many invites. Try again in 15 minutes.');
    }
    const result = await createMemberInvite(db, {
      companyId: req.ownerId,
      email,
      role,
      invitedBy: req.user.id,
      origin,
    });
    res.status(201).json(result);
  });
  app.patch('/api/members/:userId', requirePermission('manage_members'), async (req, res) => {
    const role = z.enum(/** @type {[string, ...string[]]} */ (INVITABLE_ROLES)).parse(req.body.role);
    const updated = await updateMemberRole(db, req.ownerId, req.params.userId, role, req.user.id);
    res.json(updated);
  });
  app.delete('/api/members/:userId', requirePermission('manage_members'), async (req, res) => {
    res.json(await removeMember(db, req.ownerId, req.params.userId, req.user.id));
  });

  app.get('/api/catalog', async (req, res) => {
    const q = z.string().max(200).optional().parse(req.query.q);
    const category = z.string().max(200).optional().parse(req.query.category);
    const maintenance = z.string().max(40).optional().parse(req.query.maintenance);
    const source = z.enum(['everyday', 'less_frequent', '']).optional().parse(req.query.source || '');
    const limit = z.coerce.number().int().min(1).max(100).parse(req.query.limit || 40);
    res.json(searchCatalog({ q: q || '', category: category || '', maintenance: maintenance || '', source: source || '', limit }));
  });
  app.get('/api/work-types', async (_req, res) => {
    res.json({ types: loadWorkTypes() });
  });
  /** Free address typeahead (Photon). Google Places is client-side when VITE_GOOGLE_PLACES_API_KEY is set. */
  app.get('/api/address-suggest', async (req, res) => {
    const q = z.string().trim().min(1).max(200).parse(req.query.q || '');
    const items = await suggestAddresses(q);
    res.json({ items });
  });
  app.param('entity', (req, res, next, entity) => { if (!Object.hasOwn(schemas, entity)) return next(fail(404, 'Unknown record type')); next(); });
  app.get('/api/entities/:entity', async (req, res) => {
    assertEntityPermission(req.params.entity, 'view', req.role);
    const limit = z.coerce.number().int().min(1).max(500).parse(req.query.limit || 200);
    const offset = z.coerce.number().int().min(0).parse(req.query.offset || 0);
    // created_date | updated_date; leading "-" = DESC (Dashboard / Money / Board use -updated_date)
    const sort = z.enum(['created_date', '-created_date', 'updated_date', '-updated_date']).parse(req.query.sort || '-created_date');
    const parent = req.query.job_id || req.query.client_id;
    if (parent !== undefined) z.string().min(1).max(36).parse(parent);
    const sortColumn = sort.includes('updated_date') ? 'updated_date' : 'created_date';
    const sortDir = sort.startsWith('-') ? 'DESC' : 'ASC';
    // Crew-scoped job lists may need a larger fetch before filtering; cap still applies after filter.
    const fetchLimit = isCrewScopedRole(req.role) && req.params.entity === 'Job' && !parent
      ? Math.min(500, Math.max(limit, 200))
      : limit;
    const rows = await db.all(
      `SELECT * FROM records WHERE owner_id = ? AND entity = ?${parent ? ' AND parent_id = ?' : ''} ORDER BY ${sortColumn} ${sortDir}, id ASC LIMIT ${fetchLimit} OFFSET ${offset}`,
      [req.ownerId, req.params.entity, ...(parent ? [parent] : [])]
    );
    let records = rows.map(decode).map((record) => normalizeEntityRecord(req.params.entity, record));
    records = await filterRecordsForRole(db, req, req.params.entity, records);
    if (isCrewScopedRole(req.role) && req.params.entity === 'Job' && !parent) {
      records = records.slice(0, limit);
    }
    if (req.params.entity === 'WorkItem') records = await attachSharedMaterials(db, req.ownerId, records);
    res.json(records);
  });
  app.get('/api/entities/:entity/:id', async (req, res) => {
    let record = normalizeEntityRecord(req.params.entity, await getRecord(db, req.ownerId, req.params.entity, req.params.id));
    await assertRecordVisible(db, req, req.params.entity, record);
    if (req.params.entity === 'WorkItem') record = (await attachSharedMaterials(db, req.ownerId, [record]))[0];
    res.json(record);
  });
  // Lock the owner's row to serialize relationships, deletes, quotas and exports.
  const ownedTransaction = (owner, fn) => db.transaction(async tx => {
    await tx.all('SELECT id FROM users WHERE id = ?' + (db.dialect === 'mysql' ? ' FOR UPDATE' : ''), [owner]);
    return fn(tx);
  });
  app.post('/api/estimates/:id/send-sign', async (req, res) => {
    const channel = z.enum(['email', 'sms', 'link']).parse(req.body.channel || 'link');
    const recipient = req.body.recipient != null && req.body.recipient !== ''
      ? z.string().trim().max(254).parse(req.body.recipient)
      : undefined;
    if (channel === 'email' && !recipient) throw fail(400, 'Enter an email address');
    if (channel === 'sms' && !recipient) throw fail(400, 'Enter a phone number');
    const estimate = await getRecord(db, req.ownerId, 'Estimate', req.params.id);
    if (estimate.status === 'void') throw fail(400, 'Cannot send a void estimate');
    if (estimate.accepted_snapshot) throw fail(400, 'Estimate already has an accepted snapshot; create a revision instead of re-signing');
    const result = await createSignLink(db, {
      ownerId: req.ownerId,
      entity: 'Estimate',
      record: estimate,
      channel,
      recipient,
      origin,
      env,
    });
    await ownedTransaction(req.ownerId, async tx => {
      if (estimate.status === 'draft') await saveRecord(tx, req.ownerId, 'Estimate', { status: 'sent' }, estimate.id);
      await saveRecord(tx, req.ownerId, 'TimelineEntry', {
        job_id: estimate.job_id,
        type: 'estimate_sent',
        text: `Estimate ${estimate.number || ''} sign link sent (${channel})`.trim(),
        category: 'financial',
      });
    });
    res.status(201).json(result);
  });
  app.post('/api/change-orders/:id/send-sign', async (req, res) => {
    const channel = z.enum(['email', 'sms', 'link']).parse(req.body.channel || 'link');
    const recipient = req.body.recipient != null && req.body.recipient !== ''
      ? z.string().trim().max(254).parse(req.body.recipient)
      : undefined;
    if (channel === 'email' && !recipient) throw fail(400, 'Enter an email address');
    if (channel === 'sms' && !recipient) throw fail(400, 'Enter a phone number');
    const changeOrder = await getRecord(db, req.ownerId, 'ChangeOrder', req.params.id);
    if (changeOrder.status === 'void' || changeOrder.status === 'rejected') throw fail(400, 'Cannot send this change order');
    if (changeOrder.accepted_snapshot) throw fail(400, 'Change order already has an accepted snapshot; create a revision instead of re-signing');
    // The estimate could have been voided since this change order was created.
    assertJobHasActiveEstimate(!!findLiveAcceptedEstimate(await listJobDocuments(db, req.ownerId, 'Estimate', changeOrder.job_id)), 'sending');
    const result = await createSignLink(db, {
      ownerId: req.ownerId,
      entity: 'ChangeOrder',
      record: changeOrder,
      channel,
      recipient,
      origin,
      env,
    });
    await ownedTransaction(req.ownerId, async tx => {
      if (changeOrder.status === 'draft') await saveRecord(tx, req.ownerId, 'ChangeOrder', { status: 'sent' }, changeOrder.id);
      await saveRecord(tx, req.ownerId, 'TimelineEntry', {
        job_id: changeOrder.job_id,
        type: 'change_order_sent',
        text: `Change order ${changeOrder.number || ''} sign link sent (${channel})`.trim(),
        category: 'financial',
      });
    });
    res.status(201).json(result);
  });
  app.get('/api/jobs/:id/authorized-total', async (req, res) => {
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    res.json(await jobAuthorizedTotal(db, req.ownerId, req.params.id));
  });
  // Server-derived money (cents-based), additive alongside the existing Job.estimate_amount /
  // invoice_amount / deposit_amount rollup — no current page reads these yet.
  app.get('/api/jobs/:id/summary', async (req, res) => {
    if (!can(req.role, 'view_money') && !can(req.role, 'view_jobs')) {
      throw fail(403, 'You do not have permission for this action');
    }
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    res.json(await jobSummary(db, req.ownerId, req.params.id));
  });

  /** Load company jobs + crew/equipment lookups for conflict checks. */
  async function loadScheduleContext(ownerId) {
    const jobRows = await db.all(
      "SELECT id, data FROM records WHERE owner_id = ? AND entity = 'Job'",
      [ownerId],
    );
    const jobs = jobRows.map((row) => ({ id: row.id, ...JSON.parse(row.data) }));
    const crewRows = await db.all(
      "SELECT id, data FROM records WHERE owner_id = ? AND entity = 'Crew'",
      [ownerId],
    );
    const equipRows = await db.all(
      "SELECT id, data FROM records WHERE owner_id = ? AND entity = 'Equipment'",
      [ownerId],
    );
    const crewsById = Object.fromEntries(
      crewRows.map((row) => [row.id, { id: row.id, ...JSON.parse(row.data) }]),
    );
    const equipmentById = Object.fromEntries(
      equipRows.map((row) => [row.id, { id: row.id, ...JSON.parse(row.data) }]),
    );
    return { jobs, crewsById, equipmentById };
  }

  async function assertEquipmentIds(ownerId, equipmentIds = []) {
    for (const eid of equipmentIds || []) {
      if (!eid) continue;
      await getRecord(db, ownerId, 'Equipment', eid);
    }
  }

  /** Preview crew/equipment overlap warnings (read-only). */
  app.get('/api/schedule/conflicts', async (req, res) => {
    if (!can(req.role, 'view_jobs')) throw fail(403, 'You do not have permission for this action');
    const start_date = String(req.query.start_date || '').trim();
    const end_date = String(req.query.end_date || '').trim() || start_date;
    const crew_id = String(req.query.crew_id || '').trim() || undefined;
    const exclude_job_id = String(req.query.exclude_job_id || '').trim() || undefined;
    const equipment_ids = String(req.query.equipment_ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const { jobs, crewsById, equipmentById } = await loadScheduleContext(req.ownerId);
    const conflicts = findScheduleConflicts(
      jobs,
      { id: exclude_job_id, start_date, end_date, crew_id, equipment_ids },
      { crewsById, equipmentById },
    );
    res.json(conflicts);
  });

  /** Assign crew / date / duration / equipment; soft-warns on double-book. */
  app.post('/api/jobs/:id/schedule', async (req, res) => {
    if (!can(req.role, 'edit_jobs')) throw fail(403, 'You do not have permission for this action');
    if (!can(req.role, 'assign_crew') && req.body?.crew_id) {
      throw fail(403, 'You do not have permission to assign crews');
    }
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    const body = req.body || {};
    const equipment_ids = Array.isArray(body.equipment_ids) ? body.equipment_ids.filter(Boolean) : [];
    await assertEquipmentIds(req.ownerId, equipment_ids);
    if (body.crew_id) await getRecord(db, req.ownerId, 'Crew', body.crew_id);

    let fields = jobFieldsForScheduleAssign(job, {
      start_date: body.start_date,
      end_date: body.end_date,
      crew_id: body.crew_id,
      equipment_ids,
      estimated_duration_hours: body.estimated_duration_hours,
      prereq_approval: body.prereq_approval,
      prereq_deposit: body.prereq_deposit,
      prereq_access: body.prereq_access,
      customer_notified: body.customer_notified,
      note: body.note,
      changed_by: req.user?.email || req.user?.id,
    });
    fields = applyJobStatusFields(fields, job);
    await assertWriteAllowed(db, req, 'Job', fields, job);

    const { jobs, crewsById, equipmentById } = await loadScheduleContext(req.ownerId);
    const candidate = {
      id: job.id,
      start_date: fields.start_date,
      end_date: fields.end_date,
      crew_id: fields.crew_id !== undefined ? fields.crew_id : job.crew_id,
      equipment_ids: fields.equipment_ids || [],
    };
    const conflicts = findScheduleConflicts(jobs, candidate, { crewsById, equipmentById });

    const updated = await ownedTransaction(req.ownerId, async (tx) => {
      const saved = await saveRecord(tx, req.ownerId, 'Job', fields, job.id);
      await appendFieldTimeline(tx, req.ownerId, {
        job_id: job.id,
        type: 'schedule_change',
        category: 'note',
        visibility: body.customer_notified ? 'customer' : 'internal',
        text: scheduleChangeTimelineText('initial', body.note || `Scheduled ${fields.start_date || ''}`),
        job_status: saved.status,
      });
      return saved;
    });
    const property = job.property_id
      ? await getRecord(db, req.ownerId, 'Property', job.property_id).catch(() => null)
      : null;
    const prerequisites = schedulePrerequisiteFlags(updated, { property });
    res.json({
      ...normalizeJobRecord(updated),
      schedule_warnings: conflicts.warnings,
      schedule_conflicts: {
        ok: conflicts.ok,
        crewConflicts: conflicts.crewConflicts,
        equipmentConflicts: conflicts.equipmentConflicts,
      },
      schedule_prerequisites: prerequisites,
    });
  });

  /** Weather / move reschedule — retains prior dates in schedule_history. */
  app.post('/api/jobs/:id/reschedule', async (req, res) => {
    if (!can(req.role, 'edit_jobs')) throw fail(403, 'You do not have permission for this action');
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    const body = req.body || {};
    if (body.crew_id && !can(req.role, 'assign_crew')) {
      throw fail(403, 'You do not have permission to assign crews');
    }
    if (body.crew_id) await getRecord(db, req.ownerId, 'Crew', body.crew_id);

    let fields = jobFieldsForReschedule(job, {
      start_date: body.start_date,
      end_date: body.end_date,
      reason: body.reason || 'weather',
      note: body.note,
      customer_notified: body.customer_notified,
      changed_by: req.user?.email || req.user?.id,
      crew_id: body.crew_id,
    });
    fields = applyJobStatusFields(fields, job);
    await assertWriteAllowed(db, req, 'Job', fields, job);

    const { jobs, crewsById, equipmentById } = await loadScheduleContext(req.ownerId);
    const candidate = {
      id: job.id,
      start_date: fields.start_date,
      end_date: fields.end_date,
      crew_id: fields.crew_id !== undefined ? fields.crew_id : job.crew_id,
      equipment_ids: job.equipment_ids || [],
    };
    const conflicts = findScheduleConflicts(jobs, candidate, { crewsById, equipmentById });

    const updated = await ownedTransaction(req.ownerId, async (tx) => {
      const saved = await saveRecord(tx, req.ownerId, 'Job', fields, job.id);
      await appendFieldTimeline(tx, req.ownerId, {
        job_id: job.id,
        type: 'schedule_change',
        category: 'note',
        visibility: body.customer_notified ? 'customer' : 'internal',
        text: scheduleChangeTimelineText(body.reason || 'weather', body.note),
        job_status: saved.status,
      });
      return saved;
    });
    res.json({
      ...normalizeJobRecord(updated),
      schedule_warnings: conflicts.warnings,
      schedule_conflicts: {
        ok: conflicts.ok,
        crewConflicts: conflicts.crewConflicts,
        equipmentConflicts: conflicts.equipmentConflicts,
      },
    });
  });

  /** Today workspace — ordered jobs for a calendar day with crew / equipment / instructions. */
  app.get('/api/today', async (req, res) => {
    if (!can(req.role, 'view_jobs')) throw fail(403, 'You do not have permission for this action');
    const crewIds = await ensureCrewIds(db, req);
    const payload = await buildTodayPayload(db, {
      ownerId: req.ownerId,
      role: req.role,
      userId: req.user.id,
      crewIds,
      date: String(req.query.date || '').trim() || undefined,
    });
    res.json(payload);
  });

  /** Start a production visit (marks In progress + timeline). */
  app.post('/api/jobs/:id/visit/start', async (req, res) => {
    if (!can(req.role, 'edit_jobs')) throw fail(403, 'You do not have permission for this action');
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    const body = req.body || {};
    const { fields, started_at } = fieldsForStartVisit(job, {
      started_by: req.user?.email || req.user?.id,
      started_by_user_id: req.user?.id,
      note: body.note,
    });
    await assertWriteAllowed(db, req, 'Job', fields, job);
    const updated = await ownedTransaction(req.ownerId, async (tx) => {
      const saved = await saveRecord(tx, req.ownerId, 'Job', fields, job.id);
      await appendFieldTimeline(tx, req.ownerId, {
        job_id: job.id,
        type: 'visit_started',
        category: 'visit',
        visibility: 'internal',
        text: body.note ? `Visit started — ${body.note}` : 'Visit started',
        job_status: saved.status,
      });
      return saved;
    });
    res.json({ ...normalizeJobRecord(updated), visit_started_at: started_at });
  });

  /** Finish today's visit without completing a multi-day job. */
  app.post('/api/jobs/:id/visit/finish', async (req, res) => {
    if (!can(req.role, 'edit_jobs')) throw fail(403, 'You do not have permission for this action');
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    const body = req.body || {};
    const { fields, finished_at, started_at } = fieldsForFinishVisit(job, { note: body.note });
    await assertWriteAllowed(db, req, 'Job', fields, job);
    const updated = await ownedTransaction(req.ownerId, async (tx) => {
      const saved = await saveRecord(tx, req.ownerId, 'Job', fields, job.id);
      await appendFieldTimeline(tx, req.ownerId, {
        job_id: job.id,
        type: 'visit_finished',
        category: 'visit',
        visibility: 'internal',
        text: body.note
          ? `Visit finished — ${body.note}`
          : `Visit finished (started ${started_at})`,
        job_status: saved.status,
      });
      return saved;
    });
    res.json({ ...normalizeJobRecord(updated), visit_finished_at: finished_at });
  });

  /** Completion checklist for a job (PDF §6 + auto flags). */
  app.get('/api/jobs/:id/completion', async (req, res) => {
    if (!can(req.role, 'view_jobs')) throw fail(403, 'You do not have permission for this action');
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    const ctx = await loadCompletionContext(db, req.ownerId, job.id);
    const auto = autoChecklistFlags({ job, ...ctx });
    const checklist = mergeCompletionChecklist(job.completion_checklist, auto);
    const company = await loadCompany(req.ownerId);
    const gate = evaluateReviewGate(job, company, {
      timeline: ctx.timeline,
      authorizedTotal: Number(job.estimate_amount) || 0,
    });
    res.json({
      checklist,
      review_status: job.review_status || null,
      review_reasons: job.review_reasons || [],
      review_gate: gate,
    });
  });

  /** Update manual completion checklist items. */
  app.patch('/api/jobs/:id/completion', async (req, res) => {
    if (!can(req.role, 'edit_jobs')) throw fail(403, 'You do not have permission for this action');
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    const ctx = await loadCompletionContext(db, req.ownerId, job.id);
    const auto = autoChecklistFlags({ job, ...ctx });
    const base = mergeCompletionChecklist(job.completion_checklist, auto);
    const next = prepareChecklistUpdate(base, req.body || {}, {
      submitted_by: req.user?.email,
    });
    await assertWriteAllowed(db, req, 'Job', { completion_checklist: next }, job);
    const saved = await ownedTransaction(req.ownerId, (tx) => (
      saveRecord(tx, req.ownerId, 'Job', { completion_checklist: next }, job.id)
    ));
    res.json({
      ...normalizeJobRecord(saved),
      checklist: mergeCompletionChecklist(saved.completion_checklist, auto),
    });
  });

  /**
   * Complete job production (board → Completed) with checklist + review gate (Phase 6).
   * Body: { note?, allow_incomplete?, force?, customer_visible?, checklist? }
   */
  app.post('/api/jobs/:id/complete', async (req, res) => {
    if (!can(req.role, 'edit_jobs')) throw fail(403, 'You do not have permission for this action');
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    const body = req.body || {};
    const company = await loadCompany(req.ownerId);
    const ctx = await loadCompletionContext(db, req.ownerId, job.id);
    const prepared = fieldsForCompleteWithChecklist(job, {
      note: body.note,
      checklist: body.checklist || job.completion_checklist,
      company,
      timeline: ctx.timeline,
      workItems: ctx.workItems,
      changeOrders: ctx.changeOrders,
      estimates: ctx.estimates,
      allow_incomplete: Boolean(body.allow_incomplete),
      force: Boolean(body.force),
      submitted_by: req.user?.email,
    });
    await assertWriteAllowed(db, req, 'Job', prepared.fields, job);
    const updated = await ownedTransaction(req.ownerId, async (tx) => {
      const saved = await saveRecord(tx, req.ownerId, 'Job', prepared.fields, job.id);
      const reviewNote = prepared.review.required
        ? ' — pending office review'
        : '';
      await appendFieldTimeline(tx, req.ownerId, {
        job_id: job.id,
        type: 'job_completed',
        category: 'visit',
        visibility: body.customer_visible ? 'customer' : 'internal',
        text: body.note
          ? `Job completed — ${body.note}${reviewNote}`
          : `Job completed${reviewNote}`,
        job_status: saved.status,
      });
      return saved;
    });
    res.json({
      ...normalizeJobRecord(updated),
      checklist: prepared.checklist,
      review: prepared.review,
    });
  });

  /** Office approves a pending completion review (unlocks invoicing). */
  app.post('/api/jobs/:id/review/approve', async (req, res) => {
    if (!can(req.role, 'edit_jobs') || isCrewScopedRole(req.role)) {
      throw fail(403, 'You do not have permission for this action');
    }
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    const fields = fieldsForApproveReview(job, { approved_by: req.user?.email });
    const updated = await ownedTransaction(req.ownerId, async (tx) => {
      const saved = await saveRecord(tx, req.ownerId, 'Job', fields, job.id);
      await appendFieldTimeline(tx, req.ownerId, {
        job_id: job.id,
        type: 'note',
        category: 'note',
        visibility: 'internal',
        text: 'Completion review approved — ready to invoice',
        job_status: saved.status,
      });
      return saved;
    });
    res.json(normalizeJobRecord(updated));
  });

  /** Job production comparison (est vs actual hours/costs/gross). */
  app.get('/api/jobs/:id/production', async (req, res) => {
    if (!can(req.role, 'view_reports') && !can(req.role, 'view_money')) {
      throw fail(403, 'You do not have permission for this action');
    }
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    res.json(await loadJobProduction(db, req.ownerId, job));
  });

  /** Crew production dashboards (company-wide or ?crew_id=). */
  app.get('/api/production/crews', async (req, res) => {
    if (!can(req.role, 'view_reports') && !can(req.role, 'view_money')) {
      throw fail(403, 'You do not have permission for this action');
    }
    let jobs = (await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ?', [req.ownerId, 'Job'])).map(decode);
    if (isCrewScopedRole(req.role)) {
      jobs = await filterRecordsForRole(db, req, 'Job', jobs);
    }
    const crew_id = String(req.query.crew_id || '').trim() || undefined;
    if (crew_id && isCrewScopedRole(req.role)) {
      const ids = await ensureCrewIds(db, req);
      if (!ids.includes(crew_id)) throw fail(403, 'You do not have access to this crew');
    }
    res.json(await loadCrewDashboards(db, req.ownerId, { jobs, crew_id }));
  });

  /** Report a field problem (changed conditions, damage, delay, equipment). */
  app.post('/api/jobs/:id/problem', async (req, res) => {
    if (!can(req.role, 'edit_jobs')) throw fail(403, 'You do not have permission for this action');
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    const text = String(req.body?.text || req.body?.note || '').trim();
    if (!text) throw fail(400, 'Describe the problem');
    const photo_url = req.body?.photo_url ? String(req.body.photo_url).slice(0, 200) : undefined;
    const entry = await ownedTransaction(req.ownerId, async (tx) => (
      appendFieldTimeline(tx, req.ownerId, {
        job_id: job.id,
        type: 'problem',
        category: 'problem',
        visibility: 'internal',
        text,
        photo_url,
        job_status: job.status,
      })
    ));
    res.status(201).json(entry);
  });

  /**
   * Request a scope change from the field.
   * Creates an internal timeline marker for the office (crew roles cannot edit ChangeOrders).
   */
  app.post('/api/jobs/:id/request-change', async (req, res) => {
    if (!can(req.role, 'edit_jobs')) throw fail(403, 'You do not have permission for this action');
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    const text = String(req.body?.text || req.body?.note || '').trim();
    if (!text) throw fail(400, 'Describe the requested change');
    const photo_url = req.body?.photo_url ? String(req.body.photo_url).slice(0, 200) : undefined;
    const entry = await ownedTransaction(req.ownerId, async (tx) => (
      appendFieldTimeline(tx, req.ownerId, {
        job_id: job.id,
        type: 'change_request',
        category: 'note',
        visibility: 'internal',
        text: `Change requested: ${text}`,
        photo_url,
        job_status: job.status,
      })
    ));
    res.status(201).json(entry);
  });

  /** Clock in against a job. */
  app.post('/api/jobs/:id/clock-in', async (req, res) => {
    if (!can(req.role, 'edit_jobs')) throw fail(403, 'You do not have permission for this action');
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    const openEntries = await listTimeEntries(db, req.ownerId, {
      user_id: req.user.id,
      open_only: true,
    });
    const payload = prepareClockIn({
      job_id: job.id,
      user_id: req.user.id,
      user_email: req.user.email,
      kind: req.body?.kind,
      note: req.body?.note,
      openEntries,
    });
    const entry = await ownedTransaction(req.ownerId, async (tx) => saveClockIn(tx, req.ownerId, payload));
    res.status(201).json(entry);
  });

  /** Clock out of an open time entry (by entry id or the caller's open entry on this job). */
  app.post('/api/jobs/:id/clock-out', async (req, res) => {
    if (!can(req.role, 'edit_jobs')) throw fail(403, 'You do not have permission for this action');
    const job = await getRecord(db, req.ownerId, 'Job', req.params.id);
    await assertRecordVisible(db, req, 'Job', job);
    const body = req.body || {};
    let entry = null;
    if (body.time_entry_id) {
      entry = await getRecord(db, req.ownerId, 'TimeEntry', body.time_entry_id);
      if (entry.job_id !== job.id) throw fail(400, 'Time entry belongs to a different job');
    } else {
      const open = await listTimeEntries(db, req.ownerId, { job_id: job.id, open_only: true });
      entry = open.find((e) => e.user_id === req.user.id) || open[0] || null;
      if (!entry) throw fail(404, 'No open time entry on this job');
    }
    const prepared = prepareClockOut(entry, {
      note: body.note,
      manually_edited: Boolean(body.manually_edited),
      at: body.at,
    });
    const saved = await ownedTransaction(req.ownerId, async (tx) => saveClockOut(tx, req.ownerId, prepared));
    res.json(flagMissingClockOuts([saved])[0]);
  });

  /** List time entries (optional job_id); open past-day entries are flagged. */
  app.get('/api/time-entries', async (req, res) => {
    if (!can(req.role, 'view_jobs')) throw fail(403, 'You do not have permission for this action');
    const job_id = String(req.query.job_id || '').trim() || undefined;
    let entries = await listTimeEntries(db, req.ownerId, {
      job_id,
      user_id: req.query.mine === '1' ? req.user.id : undefined,
      open_only: req.query.open === '1',
    });
    if (isCrewScopedRole(req.role)) {
      entries = await filterRecordsForRole(db, req, 'TimeEntry', entries);
    }
    const today = String(req.query.date || '').trim() || calendarDayOf(null);
    res.json(flagMissingClockOuts(entries, today));
  });

  app.get('/api/summaries', async (req, res) => {
    if (!can(req.role, 'view_money') && !can(req.role, 'view_reports')) {
      throw fail(403, 'You do not have permission for this action');
    }
    res.json(await accountSummaries(db, req.ownerId));
  });
  app.post('/api/payments', requirePermission('edit_money'), async (req, res) => {
    const created = await ownedTransaction(req.ownerId, async tx => {
      const payment = await saveRecord(tx, req.ownerId, 'Payment', req.body);
      await saveRecord(tx, req.ownerId, 'TimelineEntry', {
        job_id: payment.job_id,
        type: 'note',
        category: 'financial',
        text: `${payment.kind === 'deposit' ? 'Deposit' : 'Payment'} of $${fromCents(payment.amount_cents).toFixed(2)} logged`,
      });
      // Apply cents onto the active invoice balance (no payment_received row — avoids double-count).
      await applyPaymentRecordToInvoice(tx, req.ownerId, payment);
      return payment;
    });
    res.status(201).json(created);
  });
  const loadCompany = async ownerId => {
    const [profile] = await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? ORDER BY created_date DESC LIMIT 1', [ownerId, 'CompanyProfile']);
    return profile ? decode(profile) : null;
  };
  /**
   * A new draft invoice for the job, filled from the accepted estimate (its signed snapshot) and
   * approved change orders, with deposits / payments already received applied. Every line stays
   * editable and removable in the invoice editor.
   */
  async function createInvoiceFromJob(tx, ownerId, job, company) {
    const jobId = job.id;
    const estimates = await listJobDocuments(tx, ownerId, 'Estimate', jobId);
    const estimate = findLiveAcceptedEstimate(estimates);
    if (!estimate) throw fail(400, 'Accept an estimate before creating an invoice from this job');
    const cos = await listJobDocuments(tx, ownerId, 'ChangeOrder', jobId);
    const approved = cos.filter(c => c.status === 'approved');
    const timeline = await listJobDocuments(tx, ownerId, 'TimelineEntry', jobId);
    const payments_applied = timeline
      .filter(e => e.type === 'payment_received' && e.amount != null)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const deposits_applied = sumDepositsApplied(job, timeline);
    const existingRows = await listJobDocuments(tx, ownerId, 'Invoice', jobId);
    const activeInvoices = existingRows.filter(inv => inv.status !== 'void');
    const built = buildInvoiceAutofill({
      job,
      estimate,
      approvedChangeOrders: approved,
      company,
      deposits_applied,
      payments_applied,
      number: `INV-${String(existingRows.length + 1).padStart(3, '0')}`,
      existingInvoices: activeInvoices,
    });
    const inv = await saveRecord(tx, ownerId, 'Invoice', built.invoice);
    await saveRecord(tx, ownerId, 'TimelineEntry', {
      job_id: jobId,
      type: 'document_created',
      text: `Invoice ${inv.number || ''} created from accepted estimate`.trim(),
      category: 'document',
    });
    const invoicedRollup = sumActiveInvoiceTotals([...activeInvoices, inv]);
    await saveRecord(tx, ownerId, 'Job', { invoice_amount: invoicedRollup }, job.id);
    return { ...inv, authorized_total: built.authorized_total, prior_invoiced: built.prior_invoiced };
  }
  app.post('/api/invoices/from-job', requirePermission('edit_money'), async (req, res) => {
    const jobId = z.string().min(1).max(36).parse(req.body.job_id);
    const job = await getRecord(db, req.ownerId, 'Job', jobId);
    await assertRecordVisible(db, req, 'Job', job);
    assertInvoiceAllowedAfterReview(job);
    const company = await loadCompany(req.ownerId);
    const result = await ownedTransaction(req.ownerId, async tx => {
      await assertInvoiceHasAuthorizedScope(tx, req.ownerId, jobId);
      const existingInv = await findActiveJobDocument(tx, req.ownerId, 'Invoice', jobId);
      if (existingInv) return { existing: existingInv };
      return { created: await createInvoiceFromJob(tx, req.ownerId, job, company) };
    });
    if (result.existing) {
      res.json(result.existing);
      return;
    }
    res.status(201).json(result.created);
  });
  app.post('/api/documents/:entity/:id/void', async (req, res) => {
    const entity = assertDocumentEntity(req.params.entity);
    const updated = await ownedTransaction(req.ownerId, async tx => {
      const voided = await voidDocument(tx, req.ownerId, entity, req.params.id);
      // Drop voided Estimate / WO / CO materials from draft MOs + rollup
      if (MATERIAL_SYNC_ENTITIES.has(entity) && voided.job_id) {
        await maybeSyncMaterialOrder(tx, req.ownerId, voided.job_id);
      }
      if (['Invoice', 'Estimate', 'MaterialOrder'].includes(entity) && voided.job_id) {
        await refreshJobDocumentRollups(tx, req.ownerId, voided.job_id, { saveRecord, sumActiveInvoiceTotals });
      }
      return voided;
    });
    res.json(updated);
  });
  app.post('/api/documents/:entity/:id/decline', async (req, res) => {
    const entity = req.params.entity;
    if (entity !== 'Estimate' && entity !== 'ChangeOrder') throw fail(400, 'Only estimates and change orders can be declined');
    const updated = await ownedTransaction(req.ownerId, tx => declineDocument(tx, req.ownerId, entity, req.params.id));
    res.json(updated);
  });
  /** Owner's status override for an Estimate / Change Order, no signature (server/statusOverride.js). */
  app.post('/api/documents/:entity/:id/status', async (req, res) => {
    const status = z.string().min(1).max(20).parse(req.body?.status);
    const updated = await ownedTransaction(req.ownerId, async tx => {
      const saved = await overrideScopeStatus(tx, req.ownerId, req.params.entity, req.params.id, status);
      // Reopening can remove unstarted tasks, whose materials leave the draft Material Order.
      if (saved.job_id) await maybeSyncMaterialOrder(tx, req.ownerId, saved.job_id);
      return saved;
    });
    res.json(updated);
  });
  app.post('/api/documents/:entity/:id/revise', async (req, res) => {
    const entity = assertDocumentEntity(req.params.entity);
    const created = await ownedTransaction(req.ownerId, tx => reviseDocument(tx, req.ownerId, entity, req.params.id));
    res.status(201).json(created);
  });
  app.post('/api/punch-list/:id/complete', async (req, res) => {
    const photo_url = z.string().min(1).max(200).parse(req.body?.photo_url);
    const updated = await ownedTransaction(req.ownerId, tx => completePunchList(tx, req.ownerId, req.params.id, { photo_url }));
    res.json(updated);
  });
  app.post('/api/entities/:entity', async (req, res) => {
    const entity = req.params.entity;
    let body = req.body;
    if (entity === 'Job') {
      body = stripJobDerivedMoney(body);
      body = applyJobStatusFields(body);
      body = applyJobArchiveFields(body);
    }
    if (entity === 'Client') body = applyClientPipelineFields(body, null);
    if (entity === 'WorkItem') body = prepareWorkItemCreate(body);
    if (entity === 'PunchList') throw fail(400, 'Punch lists are created automatically with each job');
    if (entity === 'Crew') await validateCrewMembers(db, req.ownerId, body || {});
    await assertWriteAllowed(db, req, entity, body, null);
    const created = await ownedTransaction(req.ownerId, async tx => {
      if (JOB_DOCUMENT_ENTITIES.includes(entity) && body?.job_id) {
        await assertSingularDocument(tx, req.ownerId, entity, body.job_id);
        if (entity === 'Invoice') await assertInvoiceHasAuthorizedScope(tx, req.ownerId, body.job_id);
        if (entity === 'ChangeOrder') assertJobHasActiveEstimate(!!findLiveAcceptedEstimate(await listJobDocuments(tx, req.ownerId, 'Estimate', body.job_id)), 'creating');
      }
      let record = await saveRecord(tx, req.ownerId, entity, body);
      if (entity === 'Job') {
        await attachDefaultJobTasks(tx, req.ownerId, record.id);
        await attachDefaultPunchList(tx, req.ownerId, record.id);
      }
      if (entity === 'WorkItem') await completeJobWhenTasksDone(tx, req.ownerId, record.job_id);
      if (entity === 'WorkItem' && req.body && Object.prototype.hasOwnProperty.call(req.body, 'materials')) {
        const lines = Array.isArray(record.materials) && Array.isArray(req.body.materials) ? record.materials : [];
        record = await absorbWorkItemMaterials(tx, req.ownerId, record, lines);
      }
      if (entity === 'WorkItem') record = (await attachSharedMaterials(tx, req.ownerId, [record]))[0];
      if (entity === 'MaterialOrder' && record.job_id) {
        const hasLines = Array.isArray(record.lines)
          && record.lines.some((l) => l.description || l.qty || l.unit_price);
        if (!hasLines) {
          const synced = await maybeSyncMaterialOrder(tx, req.ownerId, record.job_id, {
            preferId: record.id,
            createIfMissing: false,
          });
          if (synced) record = synced;
        } else {
          await refreshJobDocumentRollups(tx, req.ownerId, record.job_id, { saveRecord, sumActiveInvoiceTotals });
        }
      }
      const materialSyncJobId = entity === 'Job' ? record.id : record.job_id;
      if (MATERIAL_SYNC_ENTITIES.has(entity) && materialSyncJobId) {
        await maybeSyncMaterialOrder(tx, req.ownerId, materialSyncJobId);
      }
      return record;
    });
    if (entity === 'TimelineEntry' && isFinancialTimelineEntry(created) && created.job_id) {
      await ownedTransaction(req.ownerId, tx => refreshInvoicePaymentSync(tx, req.ownerId, created.job_id));
    }
    res.status(201).json(normalizeEntityRecord(entity, created));
  });
  app.patch('/api/entities/:entity/:id', async (req, res) => {
    const entity = req.params.entity;
    let body = req.body;
    const previous = await getRecord(db, req.ownerId, entity, req.params.id);
    await assertRecordVisible(db, req, entity, previous);
    if (entity === 'Job' && body && typeof body === 'object') {
      body = stripJobDerivedMoney(body);
      body = applyJobStatusFields(body, previous);
      body = applyJobArchiveFields(body, previous);
    }
    if (entity === 'Client' && body && typeof body === 'object') {
      body = applyClientPipelineFields(body, previous);
    }
    if (entity === 'WorkItem') body = prepareWorkItemUpdate(previous, body);
    if (entity === 'PunchList') body = preparePunchListUpdate(previous, body);
    if (entity === 'Crew' && body && typeof body === 'object') {
      await validateCrewMembers(db, req.ownerId, {
        leader_user_id: body.leader_user_id !== undefined ? body.leader_user_id : previous.leader_user_id,
        member_user_ids: body.member_user_ids !== undefined ? body.member_user_ids : previous.member_user_ids,
      });
    }
    await assertWriteAllowed(db, req, entity, body, previous);
    let withdrawingSignLink = false;
    if ((entity === 'Estimate' || entity === 'ChangeOrder') && previous) {
      assertScopeUpdatable(entity, previous, body);
      if (previous.status === 'sent') {
        withdrawingSignLink = true;
        body = { ...body, status: 'draft' };
      }
    }
    if (entity === 'Invoice' && body && typeof body === 'object' && previous) {
      const targetJobId = Object.prototype.hasOwnProperty.call(body, 'job_id') && body.job_id
        ? body.job_id
        : previous.job_id;
      const job = await getRecord(db, req.ownerId, 'Job', targetJobId);
      const timeline = await listJobDocuments(db, req.ownerId, 'TimelineEntry', targetJobId);
      body = prepareInvoicePatch(previous, body, { job, timeline });
    }

    const movingJob = previous && body && typeof body === 'object'
      && Object.prototype.hasOwnProperty.call(body, 'job_id')
      && body.job_id
      && body.job_id !== previous.job_id;

    const updated = await ownedTransaction(req.ownerId, async tx => {
      if (movingJob && SINGLE_DOC_ENTITIES.has(entity)) {
        await assertSingularDocument(tx, req.ownerId, entity, body.job_id, { excludeId: req.params.id });
        if (entity === 'Invoice') await assertInvoiceHasAuthorizedScope(tx, req.ownerId, body.job_id);
      } else if (movingJob && entity === 'Invoice') {
        await assertInvoiceHasAuthorizedScope(tx, req.ownerId, body.job_id);
      }
      let saved = await saveRecord(tx, req.ownerId, entity, body, req.params.id);
      if (entity === 'WorkItem') await completeJobWhenTasksDone(tx, req.ownerId, saved.job_id);
      if (entity === 'WorkItem' && req.body && Object.prototype.hasOwnProperty.call(req.body, 'materials')) {
        const lines = Array.isArray(saved.materials) && Array.isArray(req.body.materials) ? saved.materials : [];
        saved = await absorbWorkItemMaterials(tx, req.ownerId, saved, lines);
      }
      if (entity === 'WorkItem') saved = (await attachSharedMaterials(tx, req.ownerId, [saved]))[0];
      if (withdrawingSignLink) await invalidateSignLinks(tx, req.ownerId, entity, req.params.id);
      return saved;
    });

    if (entity === 'Invoice' && updated.job_id) {
      await ownedTransaction(req.ownerId, tx => refreshJobDocumentRollups(tx, req.ownerId, updated.job_id, { saveRecord, sumActiveInvoiceTotals }));
      if (movingJob && previous.job_id) {
        await ownedTransaction(req.ownerId, tx => refreshJobDocumentRollups(tx, req.ownerId, previous.job_id, { saveRecord, sumActiveInvoiceTotals }));
      }
    }
    if (entity === 'TimelineEntry' && updated?.job_id && (
      isFinancialTimelineEntry(updated)
      || (previous && isFinancialTimelineEntry(previous))
    )) {
      await ownedTransaction(req.ownerId, tx => refreshInvoicePaymentSync(tx, req.ownerId, updated.job_id));
    }
    // Keep estimate_amount rollup when estimate is saved (pre-accept edits)
    if (entity === 'Estimate' && updated.job_id) {
      await ownedTransaction(req.ownerId, tx => refreshJobDocumentRollups(tx, req.ownerId, updated.job_id, { saveRecord, sumActiveInvoiceTotals }));
      if (movingJob && previous.job_id) {
        await ownedTransaction(req.ownerId, tx => refreshJobDocumentRollups(tx, req.ownerId, previous.job_id, { saveRecord, sumActiveInvoiceTotals }));
      }
    }
    if (entity === 'MaterialOrder' && updated.job_id) {
      await ownedTransaction(req.ownerId, tx => refreshJobDocumentRollups(tx, req.ownerId, updated.job_id, { saveRecord, sumActiveInvoiceTotals }));
      if (movingJob && previous.job_id) {
        await ownedTransaction(req.ownerId, tx => refreshJobDocumentRollups(tx, req.ownerId, previous.job_id, { saveRecord, sumActiveInvoiceTotals }));
      }
    }
    const materialSyncJobId = entity === 'Job' ? updated.id : updated.job_id;
    if (MATERIAL_SYNC_ENTITIES.has(entity) && materialSyncJobId) {
      await ownedTransaction(req.ownerId, tx => maybeSyncMaterialOrder(tx, req.ownerId, materialSyncJobId));
      if (movingJob && previous.job_id) {
        await ownedTransaction(req.ownerId, tx => maybeSyncMaterialOrder(tx, req.ownerId, previous.job_id));
      }
    }
    if (movingJob && SINGLE_DOC_ENTITIES.has(entity) && entity !== 'Estimate' && entity !== 'Invoice' && previous?.job_id) {
      await ownedTransaction(req.ownerId, tx => refreshJobDocumentRollups(tx, req.ownerId, previous.job_id, { saveRecord, sumActiveInvoiceTotals }));
      if (updated.job_id) {
        await ownedTransaction(req.ownerId, tx => refreshJobDocumentRollups(tx, req.ownerId, updated.job_id, { saveRecord, sumActiveInvoiceTotals }));
      }
    }
    const normalized = normalizeEntityRecord(entity, updated);
    if (entity === 'Job' && scheduleAssignmentChanged(previous, updated)) {
      const { jobs, crewsById, equipmentById } = await loadScheduleContext(req.ownerId);
      const conflicts = findScheduleConflicts(jobs, {
        id: updated.id,
        start_date: updated.start_date,
        end_date: updated.end_date,
        crew_id: updated.crew_id,
        equipment_ids: updated.equipment_ids || [],
      }, { crewsById, equipmentById });
      if (conflicts.warnings.length) {
        return res.json({
          ...normalized,
          schedule_warnings: conflicts.warnings,
          schedule_conflicts: {
            ok: conflicts.ok,
            crewConflicts: conflicts.crewConflicts,
            equipmentConflicts: conflicts.equipmentConflicts,
          },
        });
      }
    }
    res.json(normalized);
  });
  app.delete('/api/entities/:entity/:id', async (req, res) => {
    let financialTimelineJobId = null;
    const existing = await getRecord(db, req.ownerId, req.params.entity, req.params.id);
    await assertRecordVisible(db, req, req.params.entity, existing);
    await assertWriteAllowed(db, req, req.params.entity, {}, existing);
    await ownedTransaction(req.ownerId, async tx => {
      const record = await getRecord(tx, req.ownerId, req.params.entity, req.params.id);
      if (req.params.entity === 'TimelineEntry' && isFinancialTimelineEntry(record)) {
        financialTimelineJobId = record.job_id;
      }
      if (req.params.entity === 'Estimate' || req.params.entity === 'ChangeOrder') assertScopeDeletable(req.params.entity, record);
      if (req.params.entity === 'WorkItem') {
        const [sourceRow] = record.source_type
          ? await tx.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? AND id = ?', [req.ownerId, record.source_type, record.source_id])
          : [];
        assertWorkItemDeletable(record, sourceRow ? decode(sourceRow) : null);
      }
      const removedEntries = req.params.entity === 'Job'
        ? [
          ...(await tx.all('SELECT data FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [req.ownerId, 'TimelineEntry', record.id])).map(row => JSON.parse(row.data)),
          ...(await tx.all('SELECT data FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [req.ownerId, 'Expense', record.id])).map(row => JSON.parse(row.data)),
        ]
        : (req.params.entity === 'TimelineEntry' || req.params.entity === 'Expense') ? [record] : [];
      if (req.params.entity === 'Client' && (await tx.all('SELECT id FROM records WHERE owner_id = ? AND parent_id = ?', [req.ownerId, record.id])).length)
        throw fail(409, 'Delete this client’s jobs and properties first');
      if (req.params.entity === 'Property') {
        // Clear optional links so deleting a property does not strand jobs/estimates.
        const linked = await tx.all(
          "SELECT id, entity, data FROM records WHERE owner_id = ? AND entity IN ('Job', 'Estimate')",
          [req.ownerId],
        );
        for (const row of linked) {
          const data = JSON.parse(row.data);
          if (data.property_id !== record.id) continue;
          const next = { ...data, property_id: undefined };
          delete next.property_id;
          await tx.run(
            'UPDATE records SET data = ?, updated_date = ? WHERE id = ? AND owner_id = ?',
            [JSON.stringify(next), new Date().toISOString(), row.id, req.ownerId],
          );
        }
      }
      if (req.params.entity === 'Job') {
        // 'WorkOrder' clears rows left from before the checklist replaced it (nothing else reads them).
        for (const child of [...JOB_CHILD_ENTITIES, ...JOB_DOCUMENT_ENTITIES]) {
          await tx.run('DELETE FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [req.ownerId, child, record.id]);
        }
        await tx.run('DELETE FROM sign_links WHERE owner_id = ? AND job_id = ?', [req.ownerId, record.id]);
      }
      await tx.run('DELETE FROM records WHERE owner_id = ? AND id = ?', [req.ownerId, record.id]);
      // A deleted task's tagged lines leave the buy list and the draft Material Order with it.
      if (req.params.entity === 'WorkItem') {
        await dropMaterialsForTask(tx, req.ownerId, record.job_id, record.id);
        await maybeSyncMaterialOrder(tx, req.ownerId, record.job_id);
        // Removing the last open task can leave every remaining one completed.
        await completeJobWhenTasksDone(tx, req.ownerId, record.job_id);
      }
      // Remove files no longer referenced by any remaining record. A signature file is referenced by
      // both its signed Estimate/ChangeOrder and its timeline entry, so deleting either one alone
      // must not orphan the file the other still points to.
      const candidates = new Set(removedEntries.map(entry => entry.photo_url).filter(Boolean).map(url => url.split('/').pop()));
      if (candidates.size) {
        const remaining = await tx.all('SELECT data FROM records WHERE owner_id = ?', [req.ownerId]);
        const stillReferenced = new Set(remaining.flatMap(row => fileIdsOf(JSON.parse(row.data))));
        for (const fileId of candidates) if (!stillReferenced.has(fileId))
          await tx.run('DELETE FROM files WHERE id = ? AND owner_id = ?', [fileId, req.ownerId]);
      }
    });
    if (financialTimelineJobId) {
      await ownedTransaction(req.ownerId, tx => refreshInvoicePaymentSync(tx, req.ownerId, financialTimelineJobId));
    }
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
    await ownedTransaction(req.ownerId, async tx => {
      const [usage] = await tx.all('SELECT COALESCE(SUM(size), 0) AS total FROM files WHERE owner_id = ?', [req.ownerId]);
      if (Number(usage.total) + bytes.length > Number(env.ACCOUNT_STORAGE_MB || 100) * 1024 * 1024) throw fail(413, 'Account photo storage limit reached');
      await tx.run('INSERT INTO files (id, owner_id, mime, content, size) VALUES (?, ?, ?, ?, ?)', [fileId, req.ownerId, mime, bytes, bytes.length]);
    });
    res.status(201).json({ file_url: `/api/files/${fileId}` });
  });
  app.get('/api/files/:id', async (req, res) => {
    const [file] = await db.all('SELECT * FROM files WHERE owner_id = ? AND id = ?', [req.ownerId, req.params.id]);
    if (!file) throw fail(404, 'File not found');
    res.set('Content-Type', file.mime).set('Content-Disposition', 'inline').send(Buffer.from(file.content));
  });
  app.get('/api/export', requirePermission('export_backup'), async (req, res) => {
    const data = await ownedTransaction(req.ownerId, async tx => ({ version: 1, exported_at: new Date().toISOString(),
      records: (await tx.all('SELECT * FROM records WHERE owner_id = ?', [req.ownerId])).map(row => ({ entity: row.entity, ...decode(row) })),
      files: (await tx.all('SELECT * FROM files WHERE owner_id = ?', [req.ownerId])).map(file => ({ id: file.id, mime: file.mime, content: Buffer.from(file.content).toString('base64') })),
    }));
    res.set('Content-Disposition', 'attachment; filename="jobsite-backup.json"').json(data);
  });
  app.use('/api', (req, res, next) => next(fail(404, 'Endpoint not found')));
  // Universal Links / App Links verification files (placeholders in public/.well-known).
  const wellKnownFile = name => [resolve('dist/.well-known', name), resolve('public/.well-known', name)].find(existsSync);
  app.get('/.well-known/apple-app-site-association', (req, res, next) => {
    const file = wellKnownFile('apple-app-site-association');
    if (!file) return next();
    res.type('application/json').sendFile(file);
  });
  app.get('/.well-known/assetlinks.json', (req, res, next) => {
    const file = wellKnownFile('assetlinks.json');
    if (!file) return next();
    res.type('application/json').sendFile(file);
  });
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
