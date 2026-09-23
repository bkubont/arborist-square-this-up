/**
 * The job checklist (WorkItem): creating items for signed lines, what the owner may change through
 * the generic entity routes, and the one-time carryover of pre-checklist data.
 *
 * A WorkItem with a source (source_type/source_id/line_id) stands for one signed Estimate or
 * ChangeOrder line and carries that line's price, snapshotted at signing. Those fields, the price
 * and billed_invoice_id are server-owned: the owner can tick items off, add steps and notes, and add
 * free-standing tasks of their own, but can never re-point or re-price a signed item.
 */
import { fail, saveRecord, decode } from './domain.js';
import { estimateLineAmount, changeOrderLineAmount } from './mapping.js';
import { toCents } from '../shared/money.js';

const SERVER_OWNED_FIELDS = ['source_type', 'source_id', 'line_id', 'amount_cents', 'billed_invoice_id', 'done_at'];
const EDITABLE_FIELDS = new Set(['description', 'category', 'tools', 'notes', 'steps', 'done']);

/**
 * One WorkItem per signed line that has a description. Blank rows (a line the estimator never
 * filled in) are skipped. Lines signed before lines had ids get a positional id, so a backfill can
 * still tell which lines already have an item.
 */
export async function createWorkItemsForLines(tx, ownerId, { jobId, sourceType, sourceId, lines }) {
  const lineAmount = sourceType === 'Estimate' ? estimateLineAmount : changeOrderLineAmount;
  let created = 0;
  for (const [index, line] of (lines || []).entries()) {
    if (!String(line.description || '').trim()) continue;
    await saveRecord(tx, ownerId, 'WorkItem', {
      job_id: jobId,
      source_type: sourceType,
      source_id: sourceId,
      line_id: line.id || `line-${index + 1}`,
      // Snapshotted once, here: the source line can never change after signing, so this stays
      // correct and billing completed work needs no join back to the source document.
      amount_cents: Math.max(0, toCents(lineAmount(line))),
      description: line.description,
      category: line.category,
      tools: line.tools,
      notes: line.notes,
      steps: line.steps || [],
    });
    created += 1;
  }
  return created;
}

function assertNoServerOwnedFields(input) {
  const sent = SERVER_OWNED_FIELDS.filter(key => Object.prototype.hasOwnProperty.call(input || {}, key));
  if (sent.length) throw fail(400, `${sent.join(', ')} cannot be set on a checklist task`);
}

/** Owner-created tasks are always free-standing; signed-line tasks only come from signing. */
export function prepareWorkItemCreate(input) {
  assertNoServerOwnedFields(input);
  return input?.done ? { ...input, done_at: new Date().toISOString() } : input;
}

/**
 * @param {object} previous the stored WorkItem
 * @param {object} input the PATCH body
 */
export function prepareWorkItemUpdate(previous, input) {
  const body = input && typeof input === 'object' ? input : {};
  assertNoServerOwnedFields(body);
  const other = Object.keys(body).filter(key => !EDITABLE_FIELDS.has(key));
  if (other.length) throw fail(400, `${other.join(', ')} cannot be changed on a checklist task`);
  if (previous.source_type && Object.prototype.hasOwnProperty.call(body, 'description') && body.description !== previous.description) {
    throw fail(400, 'A task from a signed document keeps its signed description. Add a note instead.');
  }
  if (body.done === undefined || !!body.done === !!previous.done) return body;
  return { ...body, done_at: body.done ? new Date().toISOString() : undefined };
}

/**
 * A signed-line task is signed scope, so it can't be deleted while its document stands; untick it
 * instead. Once that document is void the scope is gone, and the leftover task can be cleared.
 * @param {object} item @param {object | null} source the item's source document, if any
 */
export function assertWorkItemDeletable(item, source) {
  if (item.source_type && source?.status !== 'void') {
    throw fail(409, 'This task comes from a signed document and cannot be deleted.');
  }
}

const ownerRows = (db, ownerId, entity) => db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ?', [ownerId, entity]);

/**
 * Carry pre-checklist data into WorkItems. Safe to run on every start: each step only acts on data
 * that has not been carried over yet.
 * - Job.checklist (free-text tasks, Base44 and early app) becomes free-standing WorkItems, then is cleared.
 * - An estimate or change order signed before signing created WorkItems gets its items now.
 * Old WorkOrder rows are left in place untouched; nothing reads them any more.
 */
export async function carryOverChecklists(db) {
  const owners = await db.all('SELECT id FROM users');
  let created = 0;
  for (const { id: ownerId } of owners) {
    await db.transaction(async tx => {
      const sourced = new Set((await ownerRows(tx, ownerId, 'WorkItem')).map(decode).map(item => item.source_id).filter(Boolean));

      for (const job of (await ownerRows(tx, ownerId, 'Job')).map(decode)) {
        if (!Array.isArray(job.checklist) || !job.checklist.length) continue;
        for (const entry of job.checklist.filter(e => String(e?.text || '').trim())) {
          await saveRecord(tx, ownerId, 'WorkItem', { job_id: job.id, description: entry.text.trim(), done: !!entry.done });
          created += 1;
        }
        await saveRecord(tx, ownerId, 'Job', { checklist: undefined }, job.id);
      }

      for (const [entity, signedStatus] of [['Estimate', 'accepted'], ['ChangeOrder', 'approved']]) {
        for (const doc of (await ownerRows(tx, ownerId, entity)).map(decode)) {
          if (doc.status !== signedStatus || sourced.has(doc.id)) continue;
          const lines = (doc.accepted_snapshot || doc).lines || [];
          created += await createWorkItemsForLines(tx, ownerId, { jobId: doc.job_id, sourceType: entity, sourceId: doc.id, lines });
        }
      }
    });
  }
  return created;
}
