/**
 * Brittany document rules: one Estimate / Work Order / Invoice per job,
 * estimate freeze after accept, invoice gated on WO complete.
 */
import { fail, decode } from './domain.js';

export const SINGLE_DOC_ENTITIES = new Set(['Estimate', 'WorkOrder', 'Invoice']);

/** Content fields that must not change after an estimate is accepted. */
export const ESTIMATE_CONTENT_KEYS = [
  'number', 'date', 'valid_till', 'notes', 'tax_rate', 'lines',
  'subtotal', 'tax_amount', 'total', 'status',
];

export function isNonVoid(record) {
  return record && record.status !== 'void';
}

export async function listJobDocuments(db, ownerId, entity, jobId) {
  const rows = await db.all(
    'SELECT * FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
    [ownerId, entity, jobId],
  );
  return rows.map(decode);
}

export async function findActiveJobDocument(db, ownerId, entity, jobId) {
  const docs = await listJobDocuments(db, ownerId, entity, jobId);
  return docs.find(isNonVoid) || null;
}

export async function assertSingularDocument(db, ownerId, entity, jobId) {
  if (!SINGLE_DOC_ENTITIES.has(entity)) return;
  const existing = await findActiveJobDocument(db, ownerId, entity, jobId);
  if (existing) {
    throw fail(409, `This job already has a ${entity}. Open the existing document instead of creating another.`);
  }
}

export async function assertWorkOrderCompleteForInvoice(db, ownerId, jobId) {
  const workOrders = await listJobDocuments(db, ownerId, 'WorkOrder', jobId);
  const complete = workOrders.some((wo) => wo.status === 'complete');
  if (!complete) {
    throw fail(400, 'Complete the Work Order before creating an invoice.');
  }
}

/** Reject content mutations on accepted estimates (void-only status changes go through voidDocument). */
export function assertEstimateMutable(previous, input = {}) {
  if (!previous?.accepted_snapshot && previous?.status !== 'accepted') return;
  const touching = ESTIMATE_CONTENT_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(input, key));
  if (!touching.length) return;
  // Allow void via dedicated void endpoint only — block status/content here.
  throw fail(400, 'Accepted estimates are print/view only and cannot be edited. Void it if you need to replace it.');
}

/** Job money scalars are derived; strip client writes (server rollups still use saveRecord directly). */
export const JOB_DERIVED_MONEY_KEYS = ['estimate_amount', 'invoice_amount', 'deposit_amount', 'materials_cost'];

export function stripJobDerivedMoney(body) {
  if (!body || typeof body !== 'object') return body;
  const next = { ...body };
  for (const key of JOB_DERIVED_MONEY_KEYS) delete next[key];
  return next;
}
