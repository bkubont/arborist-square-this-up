/**
 * Keep job money, timeline payments, and the active invoice aligned.
 * Marking paid totals the invoice — no synthetic payments or job-status side effects.
 */
import { saveRecord, getRecord } from './domain.js';
import { listJobDocuments, findActiveJobDocument, sumDepositsApplied } from './documentRules.js';
import { deriveInvoiceStatus, invoiceTotals } from './mapping.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function sumTimelinePayments(timeline = []) {
  return round2(
    timeline
      .filter((e) => e?.type === 'payment_received' && e.amount != null)
      .reduce((sum, e) => sum + Number(e.amount), 0),
  );
}

const FINANCIAL_TIMELINE = new Set(['payment_received', 'deposit_received']);

export function isFinancialTimelineEntry(entry) {
  return FINANCIAL_TIMELINE.has(entry?.type);
}

/**
 * Normalize invoice payment fields from timeline + optional explicit status intent.
 * @param {object} invoice merged invoice payload
 * @param {{ job?: object, timeline?: object[], requestedStatus?: string, preferEditorPayments?: boolean }} opts
 */
export function normalizeInvoicePayments(invoice, { job, timeline = [], requestedStatus, preferEditorPayments = false } = {}) {
  const totals = invoiceTotals({
    material_lines: invoice.material_lines || [],
    labor_lines: invoice.labor_lines || [],
    misc_lines: invoice.misc_lines || [],
    tax_rate: invoice.tax_rate,
    deposits_applied: 0,
    payments_applied: 0,
  });
  const total = Number(invoice.total ?? totals.total) || 0;
  const deposits_applied = preferEditorPayments && invoice.deposits_applied != null
    ? round2(Number(invoice.deposits_applied) || 0)
    : sumDepositsApplied(job, timeline);
  const timelinePayments = sumTimelinePayments(timeline);

  let payments_applied = preferEditorPayments && invoice.payments_applied != null
    ? round2(Number(invoice.payments_applied) || 0)
    : timelinePayments;

  if (requestedStatus === 'paid') {
    payments_applied = round2(Math.max(0, total - deposits_applied));
    return {
      payments_applied,
      deposits_applied,
      balance_due: 0,
      status: 'paid',
      total,
    };
  }

  const balance_due = round2(Math.max(0, total - deposits_applied - payments_applied));
  const status = deriveInvoiceStatus({
    balance_due,
    payments_applied,
    deposits_applied,
    status: requestedStatus ?? invoice.status ?? 'draft',
  });
  return { payments_applied, deposits_applied, balance_due, status, total };
}

/** Sync the active invoice payment fields from the job timeline. */
export async function refreshInvoicePaymentSync(tx, ownerId, jobId) {
  if (!jobId) return null;
  const job = await getRecord(tx, ownerId, 'Job', jobId);
  const invoice = await findActiveJobDocument(tx, ownerId, 'Invoice', jobId);
  if (!invoice) return null;

  // Brittany: marking paid just totals — do not reopen from timeline drift.
  if (invoice.status === 'paid') return invoice;

  const timeline = await listJobDocuments(tx, ownerId, 'TimelineEntry', jobId);
  const normalized = normalizeInvoicePayments(invoice, { job, timeline });
  return saveRecord(tx, ownerId, 'Invoice', normalized, invoice.id);
}

/**
 * Prepare an invoice PATCH body: honor editor payment fields, or mark paid / sync from timeline.
 */
export function prepareInvoicePatch(previous, body, { job, timeline } = {}) {
  const merged = { ...previous, ...body };
  const requestedStatus = Object.prototype.hasOwnProperty.call(body, 'status') ? body.status : undefined;
  const markPaid = requestedStatus === 'paid';
  const preferEditorPayments = !markPaid && (
    Object.prototype.hasOwnProperty.call(body, 'payments_applied')
    || Object.prototype.hasOwnProperty.call(body, 'deposits_applied')
  );

  const normalized = normalizeInvoicePayments(merged, {
    job,
    timeline,
    requestedStatus: markPaid ? 'paid' : requestedStatus,
    preferEditorPayments,
  });

  return { ...body, ...normalized };
}
