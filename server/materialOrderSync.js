/**
 * Sync Material Order draft lines from the job's task material lists (items not on hand).
 * Multiple MOs remain allowed; only draft MOs are auto-updated.
 */
import { saveRecord } from './domain.js';
import {
  findLiveAcceptedEstimate,
  listJobDocuments,
} from './documentRules.js';
import {
  collectJobMaterialLines,
  mergeMaterialOrderLines,
  materialOrderTotals,
  materialOrderSourceKey,
  filterIncomingNotClaimedElsewhere,
} from './mapping.js';

const DRAFT_SYNC_STATUSES = new Set(['draft']);

function pickEstimate(estimates = []) {
  return findLiveAcceptedEstimate(estimates)
    || estimates.find((e) => e.status !== 'void')
    || null;
}

function draftHasSyncedSourceLines(order) {
  return (order?.lines || []).some((line) => materialOrderSourceKey(line));
}

/** Build incoming MO lines from live job documents. */
export async function collectMaterialLinesForJob(db, ownerId, jobId) {
  return collectJobMaterialLines({ workItems: await listJobDocuments(db, ownerId, 'WorkItem', jobId) });
}

/**
 * Upsert synced lines onto a draft Material Order (or create one when materials exist).
 * Never clones source lines already present on another non-void MO (draft or purchased/etc.).
 * @param {{ preferId?: string, createIfMissing?: boolean }} [opts]
 * @returns {Promise<object|null>} updated/created draft MO, or null when nothing to do
 */
export async function syncDraftMaterialOrder(db, ownerId, jobId, opts = {}) {
  const { preferId, createIfMissing = true } = opts;
  const rawIncoming = await collectMaterialLinesForJob(db, ownerId, jobId);
  const orders = await listJobDocuments(db, ownerId, 'MaterialOrder', jobId);
  const drafts = orders
    .filter((o) => DRAFT_SYNC_STATUSES.has(o.status))
    .sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')));

  const otherDraftWithSynced = preferId
    ? drafts.find((o) => o.id !== preferId && draftHasSyncedSourceLines(o))
    : null;

  let target = null;
  if (preferId) {
    const preferred = drafts.find((o) => o.id === preferId)
      || orders.find((o) => o.id === preferId && DRAFT_SYNC_STATUSES.has(o.status));
    // Avoid cloning already-synced source lines into a second active draft MO
    if (preferred && otherDraftWithSynced && rawIncoming.length) {
      return preferred;
    }
    target = preferred || null;
  }
  if (!target) target = drafts[0] || null;

  const otherOrders = orders.filter((o) => !target || o.id !== target.id);
  const incoming = filterIncomingNotClaimedElsewhere(rawIncoming, otherOrders);

  if (!target) {
    if (!createIfMissing || !incoming.length) return null;
    const relatedEstimate = pickEstimate(await listJobDocuments(db, ownerId, 'Estimate', jobId));
    const totals = materialOrderTotals(incoming);
    return saveRecord(db, ownerId, 'MaterialOrder', {
      job_id: jobId,
      number: `MO-${String(orders.length + 1).padStart(3, '0')}`,
      status: 'draft',
      date: new Date().toISOString().slice(0, 10),
      related_estimate_id: relatedEstimate?.id,
      lines: incoming,
      ...totals,
    });
  }

  if (!DRAFT_SYNC_STATUSES.has(target.status)) return target;

  const merged = mergeMaterialOrderLines(target.lines || [], incoming);
  return saveRecord(db, ownerId, 'MaterialOrder', { lines: merged, ...materialOrderTotals(merged) }, target.id);
}
