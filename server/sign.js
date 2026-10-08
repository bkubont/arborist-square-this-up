import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail, getRecord, saveRecord, decode } from './domain.js';
import { hash, token, emailSchema } from './security.js';
import { computeAuthorizedTotal, changeOrderNet, pickAcceptedEstimate } from './mapping.js';
import { assertJobHasActiveEstimate } from './lifecycle.js';
import { createWorkItemsForLines } from './workItems.js';
import {
  bindingEstimateTotals,
  capabilitiesFromTrees,
  durationHoursFromEstimateLines,
  jobFieldsAfterEstimateAccept,
} from './readyToSchedule.js';

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SIGNABLE = new Set(['Estimate', 'ChangeOrder']);
// A link's used_at is also set when the document is voided (below), so the customer's page must
// not read "used" as "signed" — a stale link to a voided/declined document must say so, not thank them.
const UNSIGNABLE_STATUSES = new Set(['void', 'declined', 'rejected']);

// The signer sees description and price only; labor hours/rate, catalog id, tools and notes stay internal.
const publicEstimateLines = lines => (lines || []).map(({ description, material_amount, labor_amount, equipment_amount, is_optional }) =>
  ({ description, material_amount, labor_amount, equipment_amount, ...(is_optional ? { is_optional: true } : {}) }));
const publicChangeOrderLines = lines => (lines || []).map(({ description, material_amount, labor_amount, equipment_amount, amount }) =>
  ({ description, material_amount, labor_amount, equipment_amount, amount }));

export function parsePngDataUrl(dataUrl) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) throw fail(400, 'Draw a signature before submitting');
  const bytes = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
  if (bytes.length < 32 || bytes.length > 1024 * 1024) throw fail(400, 'Signature image is invalid or too large');
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) throw fail(400, 'Signature must be a PNG image');
  return bytes;
}

export async function createSignLink(db, { ownerId, entity, record, channel, recipient, origin, env }) {
  if (!SIGNABLE.has(entity)) throw fail(400, 'E-sign is only available for estimates and change orders');
  const value = token();
  const now = new Date().toISOString();
  const expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
  await db.run(
    'INSERT INTO sign_links (token_hash, owner_id, entity, record_id, job_id, channel, recipient, expires_at, used_at, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)',
    [hash(value), ownerId, entity, record.id, record.job_id, channel, recipient || null, expiresAt, now],
  );
  const signUrl = `${origin}/sign/${value}`;
  const label = entity === 'ChangeOrder' ? 'change order' : 'estimate';
  const number = record.number || '';

  let delivery = 'stubbed';
  let message = `Share this sign link with the client: ${signUrl}`;

  if (channel === 'email' && recipient) {
    emailSchema.parse(recipient);
    if (env.SMTP_HOST && env.MAIL_FROM) {
      try {
        const transport = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT || 465),
          secure: env.SMTP_SECURE !== 'false',
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
        });
        await transport.sendMail({
          from: env.MAIL_FROM,
          to: recipient,
          subject: `Please sign ${label} ${number}`.trim(),
          text: `Please review and sign this ${label}:\n\n${signUrl}\n\nThis link expires in 14 days.`,
        });
        delivery = 'sent';
        message = `Sign link emailed to ${recipient}`;
      } catch {
        delivery = 'stubbed';
        message = `Email delivery failed; share this link instead: ${signUrl}`;
      }
    }
  }

  if (channel === 'sms') {
    message = `SMS provider not configured; share this link by text: ${signUrl}`;
  }

  return { token: value, sign_url: signUrl, delivery, message, expires_at: new Date(expiresAt).toISOString() };
}

/** @deprecated use createSignLink */
export async function createEstimateSignLink(db, opts) {
  return createSignLink(db, { ...opts, entity: 'Estimate', record: opts.estimate });
}

export async function getSignLink(db, rawToken) {
  const digest = hash(z.string().regex(/^[a-f0-9]{64}$/).parse(rawToken));
  const [link] = await db.all('SELECT * FROM sign_links WHERE token_hash = ?', [digest]);
  if (!link || link.expires_at < Date.now()) throw fail(404, 'Sign link is invalid or expired');
  return link;
}

async function partyContext(db, ownerId, jobId) {
  const job = await getRecord(db, ownerId, 'Job', jobId);
  let company = null;
  const profiles = await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? ORDER BY created_date DESC LIMIT 1', [ownerId, 'CompanyProfile']);
  if (profiles[0]) company = decode(profiles[0]);
  let client = null;
  try { client = await getRecord(db, ownerId, 'Client', job.client_id); } catch { /* optional */ }
  return {
    company: company ? { name: company.name, phone: company.phone, email: company.email } : null,
    client: client ? { name: client.name } : null,
    job: { title: job.title, id: job.id },
  };
}

export async function loadPublicSign(db, rawToken) {
  const link = await getSignLink(db, rawToken);
  const parties = await partyContext(db, link.owner_id, link.job_id);
  const record = await getRecord(db, link.owner_id, link.entity, link.record_id);
  // `used` only means the token was consumed; that happens on a real signature, on void/decline, and
  // when a live edit pulls a sent document back to draft (server/app.js) — a consumed link with no
  // accepted_snapshot to show for it means the last of those, so treat it as withdrawn rather than
  // silently serving whatever the document looks like now.
  const withdrawn = !!link.used_at && !record.accepted_snapshot;
  const unavailable = UNSIGNABLE_STATUSES.has(record.status) ? record.status : withdrawn ? 'withdrawn' : null;

  if (link.entity === 'Estimate') {
    return {
      link: {
        entity: link.entity, channel: link.channel, used: !!link.used_at,
        signed: record.status === 'accepted',
        unavailable,
        expires_at: new Date(link.expires_at).toISOString(),
      },
      ...parties,
      estimate: {
        id: record.id,
        number: record.number,
        date: record.date,
        valid_till: record.valid_till,
        notes: record.notes,
        tax_rate: record.tax_rate,
        lines: publicEstimateLines(record.lines),
        subtotal: record.subtotal,
        tax_amount: record.tax_amount,
        total: record.total,
        status: record.status,
        signed_at: record.signed_at,
        signer_name: record.signer_name,
      },
    };
  }

  if (link.entity === 'ChangeOrder') {
    return {
      link: {
        entity: link.entity, channel: link.channel, used: !!link.used_at,
        signed: record.status === 'approved',
        unavailable,
        expires_at: new Date(link.expires_at).toISOString(),
      },
      ...parties,
      change_order: {
        id: record.id,
        number: record.number,
        reason: record.reason,
        description: record.description,
        added_cost: record.added_cost,
        credit: record.credit,
        net_change: record.net_change,
        added_days: record.added_days,
        revised_contract_total: record.revised_contract_total,
        notes: record.notes,
        lines: publicChangeOrderLines(record.lines),
        status: record.status,
        signed_at: record.signed_at,
        signer_name: record.signer_name,
      },
    };
  }

  throw fail(400, 'Unsupported sign document');
}

/** @deprecated */
export async function loadPublicEstimateSign(db, rawToken) {
  return loadPublicSign(db, rawToken);
}

async function acceptedEstimateBaseline(tx, ownerId, jobId) {
  const rows = await tx.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [ownerId, 'Estimate', jobId]);
  const accepted = pickAcceptedEstimate(rows.map(decode));
  if (!accepted) return { estimate: null, baseline: 0 };
  const baseline = accepted.accepted_snapshot?.total ?? accepted.total ?? 0;
  return { estimate: accepted, baseline: Number(baseline) || 0 };
}

async function listJobChangeOrders(tx, ownerId, jobId) {
  const rows = await tx.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [ownerId, 'ChangeOrder', jobId]);
  return rows.map(decode);
}

export async function jobAuthorizedTotal(db, ownerId, jobId) {
  const { baseline } = await acceptedEstimateBaseline(db, ownerId, jobId);
  const cos = await listJobChangeOrders(db, ownerId, jobId);
  return {
    baseline,
    approved_net: cos.filter(c => c.status === 'approved').reduce((s, c) => s + changeOrderNet(c), 0),
    authorized_total: computeAuthorizedTotal(baseline, cos),
    approved_change_order_ids: cos.filter(c => c.status === 'approved').map(c => c.id),
  };
}

/**
 * Accept an Estimate / approve a ChangeOrder: freeze its signed snapshot, update the job's money,
 * log it, and create a task per line. Used by the customer's signature (completeSign) and by the
 * owner's status override without one (server/statusOverride.js; `manual`, no signer or file).
 */
export async function acceptScopeDocument(tx, ownerId, entity, record, { signedAt, signerName, fileUrl, manual = false }) {
  const by = manual ? 'marked accepted (no signature)' : `signed by ${signerName}`;
  const signMeta = manual
    ? { signed_at: signedAt, accepted_manually: true }
    : { signed_at: signedAt, signer_name: signerName, signature_file_url: fileUrl };
  if (entity === 'Estimate') {
    // Optional lines stay on the document for the customer to see, but are excluded from the
    // binding total / WorkItems unless explicitly listed (v1: none — use a change order to add them).
    const includedOptionalIds = Array.isArray(record.accepted_snapshot?.included_optional_line_ids)
      ? record.accepted_snapshot.included_optional_line_ids
      : [];
    const binding = bindingEstimateTotals(record.lines || [], record.tax_rate, includedOptionalIds);
    const snapshot = {
      number: record.number,
      notes: record.notes,
      tax_rate: record.tax_rate,
      lines: record.lines || [],
      subtotal: binding.subtotal,
      tax_amount: binding.tax_amount,
      total: binding.total,
      included_optional_line_ids: includedOptionalIds,
      accepted_at: signedAt,
    };
    // Preserve prior approvals so an accepted estimate is never silently overwritten.
    const priorHistory = Array.isArray(record.version_history) ? [...record.version_history] : [];
    if (record.accepted_snapshot) {
      priorHistory.push({
        accepted_at: record.accepted_snapshot.accepted_at || record.signed_at || signedAt,
        accepted_manually: record.accepted_manually || undefined,
        signer_name: record.signer_name || undefined,
        snapshot: record.accepted_snapshot,
      });
    }
    const updated = await saveRecord(tx, ownerId, 'Estimate', {
      status: 'accepted',
      ...signMeta,
      accepted_snapshot: snapshot,
      version_history: priorHistory,
      subtotal: binding.subtotal,
      tax_amount: binding.tax_amount,
      total: binding.total,
    }, record.id);

    const job = await getRecord(tx, ownerId, 'Job', record.job_id);
    const trees = (await tx.all(
      'SELECT * FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
      [ownerId, 'TreeInventory', record.job_id],
    )).map(decode);
    const jobPatch = {
      estimate_amount: snapshot.total,
    };
    if (!job.estimated_duration_hours) {
      const hours = durationHoursFromEstimateLines(snapshot.lines, includedOptionalIds);
      if (hours != null) jobPatch.estimated_duration_hours = hours;
    }
    if (!(job.required_capabilities || []).length) {
      const caps = capabilitiesFromTrees(trees);
      if (caps.length) jobPatch.required_capabilities = caps;
    }
    const queueFields = jobFieldsAfterEstimateAccept(job);
    if (queueFields) {
      Object.assign(jobPatch, {
        status: queueFields.status,
        phase: queueFields.phase,
        working_status: queueFields.working_status,
      });
    }
    await saveRecord(tx, ownerId, 'Job', jobPatch, record.job_id);

    await saveRecord(tx, ownerId, 'TimelineEntry', {
      job_id: record.job_id,
      type: 'estimate_signed',
      category: 'document',
      text: `Estimate ${record.number || ''} ${by}`.replace(/\s+/g, ' ').trim(),
      ...(fileUrl && { photo_url: fileUrl }),
    });
    if (queueFields) {
      await saveRecord(tx, ownerId, 'TimelineEntry', {
        job_id: record.job_id,
        type: 'status_change',
        category: 'note',
        text: 'Moved to Ready to Schedule after estimate approval',
        job_status: queueFields.status,
      });
    }
    // Tasks only for binding lines — optionals need a change order (controlled scope change).
    await createWorkItemsForLines(tx, ownerId, {
      jobId: record.job_id,
      sourceType: 'Estimate',
      sourceId: record.id,
      lines: binding.lines,
    });
    return updated;
  }
  const { estimate: activeEstimate, baseline } = await acceptedEstimateBaseline(tx, ownerId, record.job_id);
  assertJobHasActiveEstimate(!!activeEstimate, 'signing');
  const cos = await listJobChangeOrders(tx, ownerId, record.job_id);
  const others = cos.filter(c => c.id !== record.id);
  const thisNet = changeOrderNet(record);
  const provisional = [...others, { ...record, status: 'approved', net_change: thisNet }];
  const revised = computeAuthorizedTotal(baseline, provisional);
  const snapshot = {
    reason: record.reason,
    description: record.description,
    added_cost: record.added_cost,
    credit: record.credit,
    net_change: thisNet,
    added_days: record.added_days,
    revised_contract_total: revised,
    lines: record.lines || [],
    notes: record.notes,
  };
  const updated = await saveRecord(tx, ownerId, 'ChangeOrder', {
    status: 'approved',
    net_change: thisNet,
    revised_contract_total: revised,
    ...signMeta,
    accepted_snapshot: snapshot,
  }, record.id);
  await saveRecord(tx, ownerId, 'TimelineEntry', {
    job_id: record.job_id,
    type: 'change_order_signed',
    category: 'document',
    text: `Change order ${record.number || ''} ${manual ? 'marked approved (no signature)' : `signed by ${signerName}`} (revised total ${revised})`.replace(/\s+/g, ' ').trim(),
    ...(fileUrl && { photo_url: fileUrl }),
  });
  await saveRecord(tx, ownerId, 'TimelineEntry', {
    job_id: record.job_id,
    type: 'note',
    category: 'financial',
    text: `Authorized total updated to $${revised.toFixed(2)} (approved CO ${record.number || ''})`.trim(),
    amount: Math.max(0, revised),
  });
  await createWorkItemsForLines(tx, ownerId, { jobId: record.job_id, sourceType: 'ChangeOrder', sourceId: record.id, lines: snapshot.lines });
  return updated;
}

export async function completeSign(db, { rawToken, signerName, signatureDataUrl, env }) {
  const link = await getSignLink(db, rawToken);
  if (!SIGNABLE.has(link.entity)) throw fail(400, 'Unsupported sign document');
  if (link.used_at) {
    // Voiding/declining and a withdrawing edit also consume the link (below), so a stale link says
    // why it's dead rather than claiming it was signed.
    const record = await getRecord(db, link.owner_id, link.entity, link.record_id);
    throw fail(400, UNSIGNABLE_STATUSES.has(record.status) ? 'This document is no longer available to sign'
      : record.accepted_snapshot ? 'This document was already signed'
      : 'This document was withdrawn; ask for a new sign link');
  }

  const name = z.string().trim().min(1).max(200).parse(signerName);
  const png = parsePngDataUrl(signatureDataUrl);
  const fileId = randomUUID();
  const fileUrl = `/api/files/${fileId}`;
  const signedAt = new Date().toISOString();

  return db.transaction(async tx => {
    await tx.all('SELECT id FROM users WHERE id = ?' + (db.dialect === 'mysql' ? ' FOR UPDATE' : ''), [link.owner_id]);
    const [fresh] = await tx.all('SELECT * FROM sign_links WHERE token_hash = ?' + (db.dialect === 'mysql' ? ' FOR UPDATE' : ''), [link.token_hash]);
    if (!fresh) throw fail(400, 'This document was already signed');
    if (fresh.expires_at < Date.now()) throw fail(404, 'Sign link is invalid or expired');

    const record = await getRecord(tx, link.owner_id, link.entity, link.record_id);
    if (UNSIGNABLE_STATUSES.has(record.status)) throw fail(400, 'This document is no longer available to sign');
    // Freeze on accepted_snapshot, not live status: it's the one field a sign can set that a
    // withdrawing edit (server/app.js) never touches, so it cleanly distinguishes the two.
    if (record.accepted_snapshot) throw fail(400, 'This document was already signed');
    if (fresh.used_at) throw fail(400, 'This document was withdrawn; ask for a new sign link');

    const [usage] = await tx.all('SELECT COALESCE(SUM(size), 0) AS total FROM files WHERE owner_id = ?', [link.owner_id]);
    if (Number(usage.total) + png.length > Number(env.ACCOUNT_STORAGE_MB || 100) * 1024 * 1024) {
      throw fail(413, 'Account photo storage limit reached');
    }
    await tx.run('INSERT INTO files (id, owner_id, mime, content, size) VALUES (?, ?, ?, ?, ?)', [fileId, link.owner_id, 'image/png', png, png.length]);

    const updated = await acceptScopeDocument(tx, link.owner_id, link.entity, record, { signedAt, signerName: name, fileUrl });

    // Consume this token and invalidate any other unused links for the same document
    // so a leftover/resent URL cannot overwrite the frozen accepted_snapshot.
    await tx.run('UPDATE sign_links SET used_at = ? WHERE token_hash = ?', [signedAt, link.token_hash]);
    await tx.run(
      'UPDATE sign_links SET used_at = ? WHERE owner_id = ? AND entity = ? AND record_id = ? AND used_at IS NULL AND token_hash != ?',
      [signedAt, link.owner_id, link.entity, link.record_id, link.token_hash],
    );
    return updated;
  });
}

/** @deprecated */
export async function completeEstimateSign(db, opts) {
  return completeSign(db, opts);
}
