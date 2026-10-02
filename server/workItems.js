/**
 * Job tasks (WorkItem): creating tasks for signed lines, what the owner may change through the
 * generic entity routes, and the one-time carryover of pre-task data.
 *
 * A WorkItem with a source (source_type/source_id/line_id) stands for one signed Estimate or
 * ChangeOrder line and carries that line's price, snapshotted at signing. Those fields, the price
 * and billed_invoice_id are server-owned: the owner can set a task's status, work its steps, notes,
 * measurements and materials, and add free-standing tasks of their own, but can never re-point or
 * re-price a signed task.
 */
import { fail, saveRecord, decode, getRecord } from './domain.js';
import { listJobDocuments } from './documentRules.js';
import { attachDefaultJobTasks } from './defaultJobTasks.js';
import { estimateLineAmount, changeOrderLineAmount } from './mapping.js';
import { toCents } from '../shared/money.js';
import { JOB_TASK_SORT } from '../shared/taskTemplates.js';
import { DEFAULT_TASK_STATUS, isTaskCompleted, normalizeTaskStatus, parseTaskStatusForWrite } from './taskStatus.js';
import { foldStoredTaskMaterials } from './jobMaterialList.js';

/** Scope tasks from signed lines follow Prep by sort_order. */
function nextScopeSortOrder(existingTasks = []) {
  const scopeOrders = existingTasks
    .filter((t) => t.template_key !== 'prep')
    .map((t) => t.sort_order)
    .filter((n) => Number.isFinite(n));
  if (scopeOrders.length) return Math.max(...scopeOrders) + 1000;
  return JOB_TASK_SORT.prep + 1000;
}

// `done` follows `status` (saveRecord), so it is server-owned too: set status 'completed' instead.
const SERVER_OWNED_FIELDS = ['template_key', 'source_type', 'source_id', 'line_id', 'amount_cents', 'billed_invoice_id', 'done', 'done_at'];
const EDITABLE_FIELDS = new Set(['description', 'category', 'tools', 'notes', 'steps', 'status', 'sort_order', 'measurements', 'materials', 'labor_hours', 'status_notes']);

/** Expected hours for a signed line: its labor_hours, or labor amount ÷ rate when only those are set. */
export function lineLaborHours(sourceType, line = {}) {
  const hours = Number(line.labor_hours);
  if (line.labor_hours != null && Number.isFinite(hours) && hours > 0) return hours;
  const amount = Number(line.labor_amount);
  const rate = Number(line.labor_rate);
  if (amount > 0 && rate > 0) return Math.round((amount / rate) * 100) / 100;
  return undefined;
}

/**
 * One WorkItem per signed line that has a description. Blank rows (a line the estimator never
 * filled in) are skipped. Lines signed before lines had ids get a positional id, so a backfill can
 * still tell which lines already have an item.
 */
export async function createWorkItemsForLines(tx, ownerId, { jobId, sourceType, sourceId, lines }) {
  const lineAmount = sourceType === 'Estimate' ? estimateLineAmount : changeOrderLineAmount;
  const jobTasks = await listJobDocuments(tx, ownerId, 'WorkItem', jobId);
  // A document reopened and accepted again keeps the tasks already started for its lines.
  const existing = new Set(jobTasks.filter(item => item.source_id === sourceId).map(item => item.line_id));
  let sortOrder = nextScopeSortOrder(jobTasks);
  let created = 0;
  for (const [index, line] of (lines || []).entries()) {
    if (!String(line.description || '').trim()) continue;
    if (existing.has(line.id || `line-${index + 1}`)) continue;
    await saveRecord(tx, ownerId, 'WorkItem', {
      job_id: jobId,
      source_type: sourceType,
      source_id: sourceId,
      line_id: line.id || `line-${index + 1}`,
      // Snapshotted once, here: the source line can never change after signing, so this stays
      // correct and billing completed work needs no join back to the source document.
      amount_cents: Math.max(0, toCents(lineAmount(line))),
      labor_hours: lineLaborHours(sourceType, line),
      description: line.description,
      category: line.category,
      tools: line.tools,
      notes: line.notes,
      steps: line.steps || [],
      sort_order: sortOrder,
    });
    sortOrder += 1000;
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
  if (input?.status === undefined) return input;
  const parsed = parseTaskStatusForWrite(input.status);
  if (parsed === null) throw fail(400, `Invalid task status: ${input.status}`);
  return isTaskCompleted(parsed) ? { ...input, status: parsed, done_at: new Date().toISOString() } : { ...input, status: parsed };
}

/**
 * @param {object} previous the stored WorkItem
 * @param {object} input the PATCH body
 */
export function prepareWorkItemUpdate(previous, input) {
  // null clears an optional field (JSON has no undefined): { labor_hours: null } removes the hours.
  let body = Object.fromEntries(Object.entries(input && typeof input === 'object' ? input : {})
    .map(([key, value]) => [key, value === null ? undefined : value]));
  assertNoServerOwnedFields(body);
  const other = Object.keys(body).filter(key => !EDITABLE_FIELDS.has(key));
  if (other.length) throw fail(400, `${other.join(', ')} cannot be changed on a checklist task`);
  if (previous.source_type && Object.prototype.hasOwnProperty.call(body, 'description') && body.description !== previous.description) {
    throw fail(400, 'A task from a signed document keeps its signed description. Add a note instead.');
  }
  const prevStatus = normalizeTaskStatus(previous.status ?? (previous.done ? 'completed' : DEFAULT_TASK_STATUS));
  const wasDone = isTaskCompleted(prevStatus);
  let nextStatus;
  if (body.status !== undefined) {
    nextStatus = parseTaskStatusForWrite(body.status);
    if (nextStatus === null) throw fail(400, `Invalid task status: ${body.status}`);
    body = { ...body, status: nextStatus };
  }
  if (nextStatus === undefined || isTaskCompleted(nextStatus) === wasDone) return body;
  return { ...body, done_at: isTaskCompleted(nextStatus) ? new Date().toISOString() : undefined };
}

/**
 * A signed-line task is signed scope, so it can't be deleted while its document stands; untick it
 * instead. Once that document is void the scope is gone, and the leftover task can be cleared.
 * @param {object} item @param {object | null} source the item's source document, if any
 */
export function assertWorkItemDeletable(item, source) {
  if (item.template_key) throw fail(409, 'Built-in job tasks cannot be deleted.');
  if (item.source_type && source?.status !== 'void') {
    throw fail(409, 'This task comes from a signed document and cannot be deleted.');
  }
}

/** Job statuses the automatic "all tasks completed" move never overrides. */
const JOB_FINISHED_STATUSES = new Set(['Completed', 'Paid']);

/**
 * When every task on a job is completed (cancelled ones don't count, and there must be at least
 * one), move the job to Completed and log it. Only ever moves a job forward; reopening a task
 * afterwards leaves the job's status for the owner to set.
 * @returns {Promise<object|null>} the updated job, or null when nothing changed
 */
export async function completeJobWhenTasksDone(tx, ownerId, jobId) {
  const tasks = (await listJobDocuments(tx, ownerId, 'WorkItem', jobId))
    .filter((task) => task.template_key !== 'prep' && task.template_key !== 'materials')
    .filter(task => normalizeTaskStatus(task.status ?? (task.done ? 'completed' : DEFAULT_TASK_STATUS)) !== 'cancelled');
  if (!tasks.length || !tasks.every(task => isTaskCompleted(task.status ?? (task.done ? 'completed' : DEFAULT_TASK_STATUS)))) return null;
  const job = await getRecord(tx, ownerId, 'Job', jobId);
  if (JOB_FINISHED_STATUSES.has(job.status)) return null;
  const updated = await saveRecord(tx, ownerId, 'Job', { status: 'Completed' }, jobId);
  await saveRecord(tx, ownerId, 'TimelineEntry', {
    job_id: jobId,
    type: 'status_change',
    text: 'Status changed to Completed (all tasks completed)',
    category: 'note',
  });
  return updated;
}

const ownerRows = (db, ownerId, entity) => db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ?', [ownerId, entity]);

/**
 * Carry pre-checklist data into WorkItems. Safe to run on every start: each step only acts on data
 * that has not been carried over yet.
 * - Job.checklist (free-text tasks, Base44 and early app) becomes free-standing WorkItems, then is cleared.
 * - An estimate or change order signed before signing created WorkItems gets its items now.
 * - A WorkItem saved before tasks had a status gets one from its old done flag.
 * - A signed-estimate task created before tasks carried hours gets its line's labor hours.
 * - A task's single card note (status_note) becomes the first entry of its note list.
 * Old WorkOrder rows are left in place untouched; nothing reads them any more.
 */
export async function carryOverChecklists(db) {
  const owners = await db.all('SELECT id FROM users');
  let created = 0;
  for (const { id: ownerId } of owners) {
    await db.transaction(async tx => {
      const items = (await ownerRows(tx, ownerId, 'WorkItem')).map(decode);
      const sourced = new Set(items.map(item => item.source_id).filter(Boolean));
      // saveRecord derives status from done when it is missing.
      for (const item of items.filter(i => !i.status)) await saveRecord(tx, ownerId, 'WorkItem', {}, item.id);
      for (const item of items.filter(i => i.status_note !== undefined)) {
        const text = String(item.status_note || '').trim();
        const moved = text ? [{ text, status: normalizeTaskStatus(item.status ?? (item.done ? 'completed' : DEFAULT_TASK_STATUS)), created_at: item.updated_date }] : [];
        await saveRecord(tx, ownerId, 'WorkItem', { status_notes: [...moved, ...(item.status_notes || [])], status_note: undefined }, item.id);
      }
      const estimates = new Map((await ownerRows(tx, ownerId, 'Estimate')).map(decode).map(e => [e.id, e]));
      for (const item of items.filter(i => i.source_type === 'Estimate' && i.labor_hours === undefined)) {
        const lines = (estimates.get(item.source_id)?.accepted_snapshot || estimates.get(item.source_id) || {}).lines || [];
        const line = lines.find((l, index) => (l.id || `line-${index + 1}`) === item.line_id);
        const hours = line && lineLaborHours('Estimate', line);
        if (hours !== undefined) await saveRecord(tx, ownerId, 'WorkItem', { labor_hours: hours }, item.id);
      }

      for (const job of (await ownerRows(tx, ownerId, 'Job')).map(decode)) {
        created += await attachDefaultJobTasks(tx, ownerId, job.id);
        if (!Array.isArray(job.checklist) || !job.checklist.length) continue;
        for (const entry of job.checklist.filter(e => String(e?.text || '').trim())) {
          await saveRecord(tx, ownerId, 'WorkItem', { job_id: job.id, description: entry.text.trim(), status: entry.done ? 'completed' : DEFAULT_TASK_STATUS });
          created += 1;
        }
        await saveRecord(tx, ownerId, 'Job', { checklist: undefined }, job.id);
      }

      await foldStoredTaskMaterials(tx, ownerId);

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
