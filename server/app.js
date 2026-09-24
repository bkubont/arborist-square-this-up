import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { schemas, fail, decode, getRecord, saveRecord, JOB_DOCUMENT_ENTITIES, fileIdsOf } from './domain.js';
import { searchCatalog } from './catalog.js';
import { suggestAddresses } from './addressSuggest.js';
import { createSignLink, loadPublicSign, completeSign, jobAuthorizedTotal } from './sign.js';
import { mapEstimateToWorkOrderLines, workOrderTotals, buildInvoiceAutofill, sumActiveInvoiceTotals } from './mapping.js';
import { syncDraftMaterialOrder } from './materialOrderSync.js';
import { voidDocument, reviseDocument, assertDocumentEntity } from './documents.js';
import {
  assertSingularDocument,
  assertWorkOrderCompleteForInvoice,
  assertEstimateMutable,
  stripJobDerivedMoney,
  findActiveJobDocument,
  listJobDocuments,
  findLiveAcceptedEstimate,
  isLiveAcceptedEstimate,
  sumDepositsApplied,
  refreshJobDocumentRollups,
  SINGLE_DOC_ENTITIES,
} from './documentRules.js';
import {
  isFinancialTimelineEntry,
  prepareInvoicePatch,
  refreshInvoicePaymentSync,
} from './invoiceSync.js';
import { applyJobArchiveFields } from './jobArchive.js';
import { emailSchema, passwordSchema, passwordHash, verifyPassword, hash, token } from './security.js';
import { DEFAULT_SALES_TAX_RATE, resolveSalesTaxRate } from './salesTax.js';

const MATERIAL_SYNC_ENTITIES = new Set(['Estimate', 'WorkOrder', 'ChangeOrder']);

async function maybeSyncMaterialOrder(tx, ownerId, jobId, opts = {}) {
  if (!jobId) return null;
  const synced = await syncDraftMaterialOrder(tx, ownerId, jobId, opts);
  if (synced?.job_id) {
    await refreshJobDocumentRollups(tx, ownerId, synced.job_id, { saveRecord, sumActiveInvoiceTotals });
  }
  return synced;
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
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // Require the configured frontend origin on every mutation, including login.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== origin)
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
    const taxRaw = req.body.default_tax_rate ?? req.body.sales_tax_rate;
    const defaultTaxRate = taxRaw === undefined || taxRaw === null || taxRaw === ''
      ? DEFAULT_SALES_TAX_RATE
      : z.number().finite().min(0).max(100).parse(Number(taxRaw));
    const digest = await passwordHash(password);
    const userId = randomUUID();
    await db.transaction(async tx => {
      const lock = db.dialect === 'mysql' ? ' FOR UPDATE' : '';
      const [row] = await tx.all('SELECT * FROM tokens WHERE token_hash = ? AND kind = ? AND email = ? AND expires_at > ?' + lock, [hash(invite), 'invite', email, Date.now()]);
      if (!row) throw fail(400, 'Invitation is invalid or expired');
      if ((await tx.all('SELECT id FROM users WHERE email = ?', [email])).length) throw fail(409, 'Account already exists. Please log in.');
      await tx.run('INSERT INTO users (id, email, password_hash, created_date) VALUES (?, ?, ?, ?)', [userId, email, digest, new Date().toISOString()]);
      await tx.run('DELETE FROM tokens WHERE token_hash = ?', [hash(invite)]);
      // Seed company profile with sales tax so docs can autofill immediately.
      await saveRecord(tx, userId, 'CompanyProfile', {
        name: '',
        default_tax_rate: defaultTaxRate,
      });
    });
    await session(res, userId);
    res.status(201).json({ id: userId, email, default_tax_rate: defaultTaxRate });
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
        await transport.sendMail({ from: env.MAIL_FROM, to: email, subject: 'Reset your Square This Up password',
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
  app.get('/api/catalog', async (req, res) => {
    const q = z.string().max(200).optional().parse(req.query.q);
    const category = z.string().max(200).optional().parse(req.query.category);
    const maintenance = z.string().max(40).optional().parse(req.query.maintenance);
    const source = z.enum(['everyday', 'less_frequent', '']).optional().parse(req.query.source || '');
    const limit = z.coerce.number().int().min(1).max(100).parse(req.query.limit || 40);
    res.json(searchCatalog({ q: q || '', category: category || '', maintenance: maintenance || '', source: source || '', limit }));
  });
  /** Free address typeahead (Photon). Google Places is client-side when VITE_GOOGLE_PLACES_API_KEY is set. */
  app.get('/api/address-suggest', async (req, res) => {
    const q = z.string().trim().min(1).max(200).parse(req.query.q || '');
    const items = await suggestAddresses(q);
    res.json({ items });
  });
  app.param('entity', (req, res, next, entity) => { if (!Object.hasOwn(schemas, entity)) return next(fail(404, 'Unknown record type')); next(); });
  app.get('/api/entities/:entity', async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(500).parse(req.query.limit || 200);
    const offset = z.coerce.number().int().min(0).parse(req.query.offset || 0);
    // created_date | updated_date; leading "-" = DESC (Dashboard / Money / Board use -updated_date)
    const sort = z.enum(['created_date', '-created_date', 'updated_date', '-updated_date']).parse(req.query.sort || '-created_date');
    const parent = req.query.job_id || req.query.client_id;
    if (parent !== undefined) z.string().min(1).max(36).parse(parent);
    const sortColumn = sort.includes('updated_date') ? 'updated_date' : 'created_date';
    const sortDir = sort.startsWith('-') ? 'DESC' : 'ASC';
    const rows = await db.all(
      `SELECT * FROM records WHERE owner_id = ? AND entity = ?${parent ? ' AND parent_id = ?' : ''} ORDER BY ${sortColumn} ${sortDir}, id ASC LIMIT ${limit} OFFSET ${offset}`,
      [req.user.id, req.params.entity, ...(parent ? [parent] : [])]
    );
    res.json(rows.map(decode));
  });
  app.get('/api/entities/:entity/:id', async (req, res) => res.json(await getRecord(db, req.user.id, req.params.entity, req.params.id)));
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
    const estimate = await getRecord(db, req.user.id, 'Estimate', req.params.id);
    if (estimate.status === 'void') throw fail(400, 'Cannot send a void estimate');
    if (estimate.accepted_snapshot) throw fail(400, 'Estimate already has an accepted snapshot; create a revision instead of re-signing');
    const result = await createSignLink(db, {
      ownerId: req.user.id,
      entity: 'Estimate',
      record: estimate,
      channel,
      recipient,
      origin,
      env,
    });
    await ownedTransaction(req.user.id, async tx => {
      if (estimate.status === 'draft') await saveRecord(tx, req.user.id, 'Estimate', { status: 'sent' }, estimate.id);
      await saveRecord(tx, req.user.id, 'TimelineEntry', {
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
    const changeOrder = await getRecord(db, req.user.id, 'ChangeOrder', req.params.id);
    if (changeOrder.status === 'void' || changeOrder.status === 'rejected') throw fail(400, 'Cannot send this change order');
    if (changeOrder.accepted_snapshot) throw fail(400, 'Change order already has an accepted snapshot; create a revision instead of re-signing');
    const result = await createSignLink(db, {
      ownerId: req.user.id,
      entity: 'ChangeOrder',
      record: changeOrder,
      channel,
      recipient,
      origin,
      env,
    });
    await ownedTransaction(req.user.id, async tx => {
      if (changeOrder.status === 'draft') await saveRecord(tx, req.user.id, 'ChangeOrder', { status: 'sent' }, changeOrder.id);
      await saveRecord(tx, req.user.id, 'TimelineEntry', {
        job_id: changeOrder.job_id,
        type: 'change_order_sent',
        text: `Change order ${changeOrder.number || ''} sign link sent (${channel})`.trim(),
        category: 'financial',
      });
    });
    res.status(201).json(result);
  });
  app.post('/api/work-orders/from-estimate', async (req, res) => {
    const estimateId = z.string().min(1).max(36).parse(req.body.estimate_id);
    const estimate = await getRecord(db, req.user.id, 'Estimate', estimateId);
    if (!isLiveAcceptedEstimate(estimate)) {
      throw fail(400, 'Accept the estimate before creating a work order from it');
    }
    let company = null;
    const profiles = await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? ORDER BY created_date DESC LIMIT 1', [req.user.id, 'CompanyProfile']);
    if (profiles[0]) company = decode(profiles[0]);
    const result = await ownedTransaction(req.user.id, async tx => {
      const existingWo = await findActiveJobDocument(tx, req.user.id, 'WorkOrder', estimate.job_id);
      if (existingWo) return { existing: existingWo };
      const lines = mapEstimateToWorkOrderLines(estimate);
      const taxRate = estimate.accepted_snapshot?.tax_rate ?? estimate.tax_rate ?? resolveSalesTaxRate(company);
      const totals = workOrderTotals(lines, taxRate);
      const existing = await tx.all('SELECT id FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [req.user.id, 'WorkOrder', estimate.job_id]);
      const wo = await saveRecord(tx, req.user.id, 'WorkOrder', {
        job_id: estimate.job_id,
        number: `WO-${String(existing.length + 1).padStart(3, '0')}`,
        related_estimate_id: estimate.id,
        status: 'draft',
        tax_rate: taxRate,
        instructions: estimate.accepted_snapshot?.notes || estimate.notes || '',
        lines,
        ...totals,
      });
      await saveRecord(tx, req.user.id, 'TimelineEntry', {
        job_id: estimate.job_id,
        type: 'work_order_created',
        text: `Work Order ${wo.number || ''} created from estimate ${estimate.number || ''}`.trim(),
        category: 'document',
      });
      await maybeSyncMaterialOrder(tx, req.user.id, estimate.job_id);
      return { created: wo };
    });
    if (result.existing) {
      res.json(result.existing);
      return;
    }
    res.status(201).json(result.created);
  });
  app.get('/api/jobs/:id/authorized-total', async (req, res) => {
    await getRecord(db, req.user.id, 'Job', req.params.id);
    res.json(await jobAuthorizedTotal(db, req.user.id, req.params.id));
  });
  app.post('/api/invoices/from-job', async (req, res) => {
    const jobId = z.string().min(1).max(36).parse(req.body.job_id);
    const job = await getRecord(db, req.user.id, 'Job', jobId);
    let company = null;
    const profiles = await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? ORDER BY created_date DESC LIMIT 1', [req.user.id, 'CompanyProfile']);
    if (profiles[0]) company = decode(profiles[0]);

    const result = await ownedTransaction(req.user.id, async tx => {
      await assertWorkOrderCompleteForInvoice(tx, req.user.id, jobId);
      const existingInv = await findActiveJobDocument(tx, req.user.id, 'Invoice', jobId);
      if (existingInv) return { existing: existingInv };

      const estimates = await listJobDocuments(tx, req.user.id, 'Estimate', jobId);
      const estimate = findLiveAcceptedEstimate(estimates);
      if (!estimate) throw fail(400, 'Accept an estimate before creating an invoice from this job');
      const cos = await listJobDocuments(tx, req.user.id, 'ChangeOrder', jobId);
      const approved = cos.filter(c => c.status === 'approved');
      const timeline = await listJobDocuments(tx, req.user.id, 'TimelineEntry', jobId);
      const payments_applied = timeline
        .filter(e => e.type === 'payment_received' && e.amount != null)
        .reduce((sum, e) => sum + Number(e.amount), 0);
      const deposits_applied = sumDepositsApplied(job, timeline);
      const existingRows = await listJobDocuments(tx, req.user.id, 'Invoice', jobId);
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
      const inv = await saveRecord(tx, req.user.id, 'Invoice', built.invoice);
      await saveRecord(tx, req.user.id, 'TimelineEntry', {
        job_id: jobId,
        type: 'document_created',
        text: `Invoice ${inv.number || ''} created from accepted estimate`.trim(),
        category: 'document',
      });
      const invoicedRollup = sumActiveInvoiceTotals([...activeInvoices, inv]);
      await saveRecord(tx, req.user.id, 'Job', { invoice_amount: invoicedRollup }, job.id);
      return {
        created: {
          ...inv,
          authorized_total: built.authorized_total,
          billing_ceiling: built.billing_ceiling,
          prior_invoiced: built.prior_invoiced,
          over_authorized: built.over_authorized,
        },
      };
    });
    if (result.existing) {
      res.json(result.existing);
      return;
    }
    res.status(201).json(result.created);
  });
  app.post('/api/documents/:entity/:id/void', async (req, res) => {
    const entity = assertDocumentEntity(req.params.entity);
    const updated = await ownedTransaction(req.user.id, async tx => {
      const voided = await voidDocument(tx, req.user.id, entity, req.params.id);
      // Drop voided Estimate / WO / CO materials from draft MOs + rollup
      if (MATERIAL_SYNC_ENTITIES.has(entity) && voided.job_id) {
        await maybeSyncMaterialOrder(tx, req.user.id, voided.job_id);
      }
      if (['Invoice', 'Estimate', 'MaterialOrder'].includes(entity) && voided.job_id) {
        await refreshJobDocumentRollups(tx, req.user.id, voided.job_id, { saveRecord, sumActiveInvoiceTotals });
      }
      return voided;
    });
    res.json(updated);
  });
  app.post('/api/documents/:entity/:id/revise', async (req, res) => {
    const entity = assertDocumentEntity(req.params.entity);
    const created = await ownedTransaction(req.user.id, tx => reviseDocument(tx, req.user.id, entity, req.params.id));
    res.status(201).json(created);
  });
  app.post('/api/entities/:entity', async (req, res) => {
    const entity = req.params.entity;
    let body = req.body;
    if (entity === 'Job') {
      body = stripJobDerivedMoney(body);
      body = applyJobArchiveFields(body);
    }
    const created = await ownedTransaction(req.user.id, async tx => {
      if (JOB_DOCUMENT_ENTITIES.includes(entity) && body?.job_id) {
        await assertSingularDocument(tx, req.user.id, entity, body.job_id);
        if (entity === 'Invoice') await assertWorkOrderCompleteForInvoice(tx, req.user.id, body.job_id);
      }
      let record = await saveRecord(tx, req.user.id, entity, body);
      if (entity === 'MaterialOrder' && record.job_id) {
        const hasLines = Array.isArray(record.lines)
          && record.lines.some((l) => l.description || l.qty || l.unit_price);
        if (!hasLines) {
          const synced = await maybeSyncMaterialOrder(tx, req.user.id, record.job_id, {
            preferId: record.id,
            createIfMissing: false,
          });
          if (synced) record = synced;
        } else {
          await refreshJobDocumentRollups(tx, req.user.id, record.job_id, { saveRecord, sumActiveInvoiceTotals });
        }
      }
      if (MATERIAL_SYNC_ENTITIES.has(entity) && record.job_id) {
        await maybeSyncMaterialOrder(tx, req.user.id, record.job_id);
      }
      return record;
    });
    if (entity === 'TimelineEntry' && isFinancialTimelineEntry(created) && created.job_id) {
      await ownedTransaction(req.user.id, tx => refreshInvoicePaymentSync(tx, req.user.id, created.job_id));
    }
    res.status(201).json(created);
  });
  app.patch('/api/entities/:entity/:id', async (req, res) => {
    const entity = req.params.entity;
    let body = req.body;
    const previous = entity === 'Job' || JOB_DOCUMENT_ENTITIES.includes(entity) || entity === 'Estimate' || entity === 'Invoice'
      ? await getRecord(db, req.user.id, entity, req.params.id)
      : null;
    if (entity === 'Job' && body && typeof body === 'object') {
      body = stripJobDerivedMoney(body);
      body = applyJobArchiveFields(body, previous);
    }
    if (entity === 'Estimate' && previous) {
      assertEstimateMutable(previous, body);
    }
    if (entity === 'Invoice' && body && typeof body === 'object' && previous) {
      const targetJobId = Object.prototype.hasOwnProperty.call(body, 'job_id') && body.job_id
        ? body.job_id
        : previous.job_id;
      const job = await getRecord(db, req.user.id, 'Job', targetJobId);
      const timeline = await listJobDocuments(db, req.user.id, 'TimelineEntry', targetJobId);
      body = prepareInvoicePatch(previous, body, { job, timeline });
    }

    const movingJob = previous && body && typeof body === 'object'
      && Object.prototype.hasOwnProperty.call(body, 'job_id')
      && body.job_id
      && body.job_id !== previous.job_id;

    const updated = await ownedTransaction(req.user.id, async tx => {
      if (movingJob && SINGLE_DOC_ENTITIES.has(entity)) {
        await assertSingularDocument(tx, req.user.id, entity, body.job_id, { excludeId: req.params.id });
        if (entity === 'Invoice') await assertWorkOrderCompleteForInvoice(tx, req.user.id, body.job_id);
      } else if (movingJob && entity === 'Invoice') {
        await assertWorkOrderCompleteForInvoice(tx, req.user.id, body.job_id);
      }
      return saveRecord(tx, req.user.id, entity, body, req.params.id);
    });

    if (entity === 'Invoice' && updated.job_id) {
      await ownedTransaction(req.user.id, tx => refreshJobDocumentRollups(tx, req.user.id, updated.job_id, { saveRecord, sumActiveInvoiceTotals }));
      if (movingJob && previous.job_id) {
        await ownedTransaction(req.user.id, tx => refreshJobDocumentRollups(tx, req.user.id, previous.job_id, { saveRecord, sumActiveInvoiceTotals }));
      }
    }
    if (entity === 'TimelineEntry' && updated?.job_id && (
      isFinancialTimelineEntry(updated)
      || (previous && isFinancialTimelineEntry(previous))
    )) {
      await ownedTransaction(req.user.id, tx => refreshInvoicePaymentSync(tx, req.user.id, updated.job_id));
    }
    // Keep estimate_amount rollup when estimate is saved (pre-accept edits)
    if (entity === 'Estimate' && updated.job_id) {
      await ownedTransaction(req.user.id, tx => refreshJobDocumentRollups(tx, req.user.id, updated.job_id, { saveRecord, sumActiveInvoiceTotals }));
      if (movingJob && previous.job_id) {
        await ownedTransaction(req.user.id, tx => refreshJobDocumentRollups(tx, req.user.id, previous.job_id, { saveRecord, sumActiveInvoiceTotals }));
      }
    }
    if (entity === 'MaterialOrder' && updated.job_id) {
      await ownedTransaction(req.user.id, tx => refreshJobDocumentRollups(tx, req.user.id, updated.job_id, { saveRecord, sumActiveInvoiceTotals }));
      if (movingJob && previous.job_id) {
        await ownedTransaction(req.user.id, tx => refreshJobDocumentRollups(tx, req.user.id, previous.job_id, { saveRecord, sumActiveInvoiceTotals }));
      }
    }
    if (MATERIAL_SYNC_ENTITIES.has(entity) && updated.job_id) {
      await ownedTransaction(req.user.id, tx => maybeSyncMaterialOrder(tx, req.user.id, updated.job_id));
      if (movingJob && previous.job_id) {
        await ownedTransaction(req.user.id, tx => maybeSyncMaterialOrder(tx, req.user.id, previous.job_id));
      }
    }
    if (movingJob && SINGLE_DOC_ENTITIES.has(entity) && entity !== 'Estimate' && entity !== 'Invoice' && previous?.job_id) {
      await ownedTransaction(req.user.id, tx => refreshJobDocumentRollups(tx, req.user.id, previous.job_id, { saveRecord, sumActiveInvoiceTotals }));
      if (updated.job_id) {
        await ownedTransaction(req.user.id, tx => refreshJobDocumentRollups(tx, req.user.id, updated.job_id, { saveRecord, sumActiveInvoiceTotals }));
      }
    }
    res.json(updated);
  });
  app.delete('/api/entities/:entity/:id', async (req, res) => {
    let financialTimelineJobId = null;
    await ownedTransaction(req.user.id, async tx => {
      const record = await getRecord(tx, req.user.id, req.params.entity, req.params.id);
      if (req.params.entity === 'TimelineEntry' && isFinancialTimelineEntry(record)) {
        financialTimelineJobId = record.job_id;
      }
      const removedEntries = req.params.entity === 'Job'
        ? [
          ...(await tx.all('SELECT data FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [req.user.id, 'TimelineEntry', record.id])).map(row => JSON.parse(row.data)),
          ...(await tx.all('SELECT data FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [req.user.id, 'Expense', record.id])).map(row => JSON.parse(row.data)),
        ]
        : (req.params.entity === 'TimelineEntry' || req.params.entity === 'Expense') ? [record] : [];
      if (req.params.entity === 'Client' && (await tx.all('SELECT id FROM records WHERE owner_id = ? AND parent_id = ?', [req.user.id, record.id])).length)
        throw fail(409, 'Delete this client’s jobs first');
      if (req.params.entity === 'Job') {
        for (const child of ['TimelineEntry', 'Expense', ...JOB_DOCUMENT_ENTITIES]) {
          await tx.run('DELETE FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [req.user.id, child, record.id]);
        }
        await tx.run('DELETE FROM sign_links WHERE owner_id = ? AND job_id = ?', [req.user.id, record.id]);
      }
      await tx.run('DELETE FROM records WHERE owner_id = ? AND id = ?', [req.user.id, record.id]);
      // Remove files no longer referenced by any remaining record. A signature file is referenced by
      // both its signed Estimate/ChangeOrder and its timeline entry, so deleting either one alone
      // must not orphan the file the other still points to.
      const candidates = new Set(removedEntries.map(entry => entry.photo_url).filter(Boolean).map(url => url.split('/').pop()));
      if (candidates.size) {
        const remaining = await tx.all('SELECT data FROM records WHERE owner_id = ?', [req.user.id]);
        const stillReferenced = new Set(remaining.flatMap(row => fileIdsOf(JSON.parse(row.data))));
        for (const fileId of candidates) if (!stillReferenced.has(fileId))
          await tx.run('DELETE FROM files WHERE id = ? AND owner_id = ?', [fileId, req.user.id]);
      }
    });
    if (financialTimelineJobId) {
      await ownedTransaction(req.user.id, tx => refreshInvoicePaymentSync(tx, req.user.id, financialTimelineJobId));
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
