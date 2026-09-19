/**
 * Brittany document rules: one Estimate / Work Order / Invoice per job,
 * estimate freeze after accept, invoice gated on WO complete.
 */
import { fail, decode } from './domain.js';

export const SINGLE_DOC_ENTITIES = new Set(['Estimate', 'WorkOrder', 'Invoice']);

/** Content + acceptance/signature fields that must not change after an estimate is accepted. */
export const ESTIMATE_CONTENT_KEYS = [
  'number', 'date', 'valid_till', 'notes', 'tax_rate', 'lines',
  'subtotal', 'tax_amount', 'total', 'status',
  'accepted_snapshot', 'signed_at', 'signer_name', 'signature_file_url',
];

export function isNonVoid(record) {
  return record && record.status !== 'void';
}

/** Live accepted estimate (voided snapshots do not authorize). */
export function isLiveAcceptedEstimate(record) {
  if (!record || record.status === 'void') return false;
  return record.status === 'accepted' || !!record.accepted_snapshot;
}

export function findLiveAcceptedEstimate(estimates = []) {
  return estimates.find((e) => e.status === 'accepted')
    || estimates.find((e) => isLiveAcceptedEstimate(e))
    || null;
}

export async function listJobDocuments(db, ownerId, entity, jobId) {
  const rows = await db.all(
    'SELECT * FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
    [ownerId, entity, jobId],
  );
  return rows.map(decode);
}

export async function findActiveJobDocument(db, ownerId, entity, jobId, { excludeId } = {}) {
  const docs = await listJobDocuments(db, ownerId, entity, jobId);
  return docs.find((d) => isNonVoid(d) && d.id !== excludeId) || null;
}

export async function assertSingularDocument(db, ownerId, entity, jobId, { excludeId } = {}) {
  if (!SINGLE_DOC_ENTITIES.has(entity)) return;
  const existing = await findActiveJobDocument(db, ownerId, entity, jobId, { excludeId });
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

/**
 * Deposits = legacy job.deposit_amount + all amount-bearing deposit_received timeline entries.
 * Do not drop the legacy amount when the first timeline deposit is logged.
 */
export function sumDepositsApplied(job, timeline = []) {
  const legacy = Number(job?.deposit_amount) || 0;
  const logged = timeline
    .filter((e) => e.type === 'deposit_received' && e.amount != null)
    .reduce((sum, e) => sum + Number(e.amount), 0);
  return legacy + logged;
}

/** Reject content / signature mutations on accepted (or snapshotted non-void) estimates. */
export function assertEstimateMutable(previous, input = {}) {
  if (!previous) return;
  // Voided estimates keep snapshot for history but are not editable either.
  if (!previous.accepted_snapshot && previous.status !== 'accepted') return;
  const touching = ESTIMATE_CONTENT_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(input, key));
  if (!touching.length) return;
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

/** Roll up estimate_amount / materials_cost / invoice_amount from live (non-void) docs. */
export async function refreshJobDocumentRollups(db, ownerId, jobId, { saveRecord, sumActiveInvoiceTotals }) {
  const estimates = await listJobDocuments(db, ownerId, 'Estimate', jobId);
  const accepted = findLiveAcceptedEstimate(estimates);
  const estimateAmount = accepted
    ? (accepted.accepted_snapshot?.total ?? accepted.total ?? 0)
    : 0;

  const orders = await listJobDocuments(db, ownerId, 'MaterialOrder', jobId);
  const materials = orders
    .filter(isNonVoid)
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const invoices = await listJobDocuments(db, ownerId, 'Invoice', jobId);
  const invoiceAmount = sumActiveInvoiceTotals(invoices);

  await saveRecord(db, ownerId, 'Job', {
    estimate_amount: estimateAmount,
    materials_cost: materials,
    invoice_amount: invoiceAmount,
  }, jobId);
}
