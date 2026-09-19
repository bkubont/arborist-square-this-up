/**
 * Document lifecycle helpers: void and revise (Phase 6).
 */
import { fail, getRecord, saveRecord, JOB_DOCUMENT_ENTITIES } from './domain.js';

const SIGNABLE = new Set(['Estimate', 'ChangeOrder']);

const STRIP_ON_REVISE = new Set([
  'id',
  'created_date',
  'updated_date',
  'signed_at',
  'signer_name',
  'signature_file_url',
  'accepted_snapshot',
  'entity',
]);

export function assertDocumentEntity(entity) {
  if (!JOB_DOCUMENT_ENTITIES.includes(entity)) throw fail(400, 'Unknown document type');
  return entity;
}

/** Build a draft revision payload from a live document (clears sign/accept metadata). */
export function revisionPayload(entity, record, number) {
  assertDocumentEntity(entity);
  const data = {};
  for (const [key, value] of Object.entries(record || {})) {
    if (STRIP_ON_REVISE.has(key)) continue;
    data[key] = value;
  }
  data.status = 'draft';
  data.number = number;
  return data;
}

/** Next document number for a revision (keeps prior label when possible). */
export function nextRevisionNumber(record, existingCount) {
  const base = String(record?.number || '').trim();
  if (base) {
    const match = /^(.*?)(?:-R(\d+))?$/.exec(base);
    const stem = match?.[1] || base;
    const rev = match?.[2] ? Number(match[2]) + 1 : 2;
    return `${stem}-R${rev}`;
  }
  const prefixes = { Estimate: 'EST', WorkOrder: 'WO', ChangeOrder: 'CO', Invoice: 'INV' };
  const prefix = prefixes[record?.entity] || 'DOC';
  return `${prefix}-${String((existingCount || 0) + 1).padStart(3, '0')}`;
}

/**
 * Mark a job document void; invalidate unused sign links for Estimate/CO.
 * Accepted snapshots are retained for history; void docs are excluded from money rollups.
 */
export async function voidDocument(tx, ownerId, entity, recordId) {
  assertDocumentEntity(entity);
  const record = await getRecord(tx, ownerId, entity, recordId);
  if (record.status === 'void') return record;
  if (record.status === 'paid') throw fail(400, 'Paid invoices cannot be voided; create a credit revision instead');
  const updated = await saveRecord(tx, ownerId, entity, { status: 'void' }, recordId);
  if (SIGNABLE.has(entity)) {
    const now = new Date().toISOString();
    await tx.run(
      'UPDATE sign_links SET used_at = COALESCE(used_at, ?) WHERE owner_id = ? AND entity = ? AND record_id = ? AND used_at IS NULL',
      [now, ownerId, entity, recordId],
    );
  }
  await saveRecord(tx, ownerId, 'TimelineEntry', {
    job_id: record.job_id,
    type: 'note',
    text: `${entity} ${record.number || ''} marked void`.trim(),
    category: 'financial',
  });
  return updated;
}

/**
 * Create a new draft revision from an existing document.
 * Source is left as-is (void separately if needed). Clears accept/sign fields so it can be re-sent.
 */
export async function reviseDocument(tx, ownerId, entity, recordId) {
  assertDocumentEntity(entity);
  const record = await getRecord(tx, ownerId, entity, recordId);
  const existing = await tx.all(
    'SELECT id FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
    [ownerId, entity, record.job_id],
  );
  const number = nextRevisionNumber({ ...record, entity }, existing.length);
  const payload = revisionPayload(entity, record, number);
  const created = await saveRecord(tx, ownerId, entity, payload);
  await saveRecord(tx, ownerId, 'TimelineEntry', {
    job_id: record.job_id,
    type: 'note',
    text: `Revision ${number} created from ${entity} ${record.number || ''}`.trim(),
    category: 'financial',
  });
  return created;
}
