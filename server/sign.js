import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail, getRecord, saveRecord, decode } from './domain.js';
import { hash, token, emailSchema } from './security.js';

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function parsePngDataUrl(dataUrl) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) throw fail(400, 'Draw a signature before submitting');
  const bytes = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
  if (bytes.length < 32 || bytes.length > 1024 * 1024) throw fail(400, 'Signature image is invalid or too large');
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) throw fail(400, 'Signature must be a PNG image');
  return bytes;
}

export async function createEstimateSignLink(db, { ownerId, estimate, channel, recipient, origin, env }) {
  const value = token();
  const now = new Date().toISOString();
  const expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
  await db.run(
    'INSERT INTO sign_links (token_hash, owner_id, entity, record_id, job_id, channel, recipient, expires_at, used_at, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)',
    [hash(value), ownerId, 'Estimate', estimate.id, estimate.job_id, channel, recipient || null, expiresAt, now],
  );
  const signUrl = `${origin}/sign/${value}`;

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
          subject: `Please sign estimate ${estimate.number || ''}`.trim(),
          text: `Please review and sign this estimate:\n\n${signUrl}\n\nThis link expires in 14 days.`,
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

export async function getSignLink(db, rawToken) {
  const digest = hash(z.string().regex(/^[a-f0-9]{64}$/).parse(rawToken));
  const [link] = await db.all('SELECT * FROM sign_links WHERE token_hash = ?', [digest]);
  if (!link || link.expires_at < Date.now()) throw fail(404, 'Sign link is invalid or expired');
  return link;
}

export async function loadPublicEstimateSign(db, rawToken) {
  const link = await getSignLink(db, rawToken);
  const estimate = await getRecord(db, link.owner_id, 'Estimate', link.record_id);
  const job = await getRecord(db, link.owner_id, 'Job', estimate.job_id);
  let company = null;
  const profiles = await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? ORDER BY created_date DESC LIMIT 1', [link.owner_id, 'CompanyProfile']);
  if (profiles[0]) company = decode(profiles[0]);
  let client = null;
  try { client = await getRecord(db, link.owner_id, 'Client', job.client_id); } catch { /* optional */ }

  return {
    link: {
      entity: link.entity,
      channel: link.channel,
      used: !!link.used_at,
      expires_at: new Date(link.expires_at).toISOString(),
    },
    company: company ? { name: company.name, phone: company.phone, email: company.email } : null,
    client: client ? { name: client.name } : null,
    job: { title: job.title },
    estimate: {
      id: estimate.id,
      number: estimate.number,
      date: estimate.date,
      valid_till: estimate.valid_till,
      notes: estimate.notes,
      tax_rate: estimate.tax_rate,
      lines: estimate.lines || [],
      subtotal: estimate.subtotal,
      tax_amount: estimate.tax_amount,
      total: estimate.total,
      status: estimate.status,
      signed_at: estimate.signed_at,
      signer_name: estimate.signer_name,
    },
  };
}

export async function completeEstimateSign(db, { rawToken, signerName, signatureDataUrl, env }) {
  const link = await getSignLink(db, rawToken);
  if (link.entity !== 'Estimate') throw fail(400, 'This link is not for an estimate');
  if (link.used_at) throw fail(400, 'This estimate was already signed');

  const name = z.string().trim().min(1).max(200).parse(signerName);
  const png = parsePngDataUrl(signatureDataUrl);
  const fileId = randomUUID();
  const fileUrl = `/api/files/${fileId}`;
  const signedAt = new Date().toISOString();

  return db.transaction(async tx => {
    await tx.all('SELECT id FROM users WHERE id = ?' + (db.dialect === 'mysql' ? ' FOR UPDATE' : ''), [link.owner_id]);
    const [fresh] = await tx.all('SELECT * FROM sign_links WHERE token_hash = ?' + (db.dialect === 'mysql' ? ' FOR UPDATE' : ''), [link.token_hash]);
    if (!fresh || fresh.used_at) throw fail(400, 'This estimate was already signed');
    if (fresh.expires_at < Date.now()) throw fail(404, 'Sign link is invalid or expired');

    const estimate = await getRecord(tx, link.owner_id, 'Estimate', link.record_id);
    if (estimate.status === 'void') throw fail(400, 'This estimate can no longer be signed');

    const [usage] = await tx.all('SELECT COALESCE(SUM(size), 0) AS total FROM files WHERE owner_id = ?', [link.owner_id]);
    if (Number(usage.total) + png.length > Number(env.ACCOUNT_STORAGE_MB || 100) * 1024 * 1024) {
      throw fail(413, 'Account photo storage limit reached');
    }
    await tx.run('INSERT INTO files (id, owner_id, mime, content, size) VALUES (?, ?, ?, ?, ?)', [fileId, link.owner_id, 'image/png', png, png.length]);

    const snapshot = {
      number: estimate.number,
      notes: estimate.notes,
      tax_rate: estimate.tax_rate,
      lines: estimate.lines || [],
      subtotal: estimate.subtotal,
      tax_amount: estimate.tax_amount,
      total: estimate.total,
    };
    const updated = await saveRecord(tx, link.owner_id, 'Estimate', {
      status: 'accepted',
      signed_at: signedAt,
      signer_name: name,
      signature_file_url: fileUrl,
      accepted_snapshot: snapshot,
    }, estimate.id);

    await saveRecord(tx, link.owner_id, 'TimelineEntry', {
      job_id: estimate.job_id,
      type: 'document',
      category: 'document',
      text: `Signed estimate ${estimate.number || ''} — ${name}`.trim(),
      photo_url: fileUrl,
    });

    await tx.run('UPDATE sign_links SET used_at = ? WHERE token_hash = ?', [signedAt, link.token_hash]);
    return updated;
  });
}
