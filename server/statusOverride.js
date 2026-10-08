/**
 * The owner's status override for an Estimate or Change Order: set its status without a customer
 * signature — e.g. accepted on paper or by phone, or declined in person.
 *
 * - Accepting / approving this way does everything a signature does (acceptScopeDocument): the
 *   snapshot freezes, the job's totals update and a task is made per line. The record is flagged
 *   accepted_manually. Prior approvals are appended to version_history.
 * - Accepted estimates cannot be reopened (Phase 3 / PDF): the original approved version is never
 *   silently overwritten. Void it and create a new estimate, or add a change order for scope changes.
 * - Reopening an approved change order (back to draft, sent or rejected) is only allowed while
 *   nothing is built on it: no active invoice on the job. Unstarted tasks go; started ones stay.
 * - Void stays its own action (a void document is retired; revise it instead).
 */
import { fail, getRecord, saveRecord, SCOPE_SIGNED_STATUS } from './domain.js';
import { listJobDocuments, refreshJobDocumentRollups } from './documentRules.js';
import { invalidateSignLinks } from './documents.js';
import { acceptScopeDocument } from './sign.js';
import { sumActiveInvoiceTotals } from './mapping.js';
import { DEFAULT_TASK_STATUS, LEGACY_TASK_STATUS_MAP, normalizeTaskStatus } from './taskStatus.js';

export const OVERRIDE_STATUSES = {
  Estimate: ['draft', 'sent', 'accepted', 'declined'],
  ChangeOrder: ['draft', 'sent', 'approved', 'rejected'],
};

const noun = entity => (entity === 'ChangeOrder' ? 'change order' : 'estimate');

/** A task the owner has done something with, so reopening its document must not delete it. */
function taskStarted(item) {
  const raw = item.status;
  const normalized = normalizeTaskStatus(raw ?? (item.done ? 'completed' : DEFAULT_TASK_STATUS));
  return (normalized !== DEFAULT_TASK_STATUS)
    || (raw && raw in LEGACY_TASK_STATUS_MAP)
    || (item.steps || []).some(step => step.done)
    || (item.status_notes || []).length > 0
    || (item.materials || []).length > 0
    || (item.measurements || []).length > 0;
}

async function assertNothingBuiltOn(tx, ownerId, entity, record) {
  const invoice = (await listJobDocuments(tx, ownerId, 'Invoice', record.job_id)).find(inv => inv.status !== 'void');
  if (invoice) throw fail(409, `Invoice ${invoice.number || ''} is built on this ${noun(entity)}. Void the invoice first.`.replace(/\s+/g, ' '));
  if (entity === 'Estimate') {
    const live = (await listJobDocuments(tx, ownerId, 'ChangeOrder', record.job_id)).filter(co => !['void', 'rejected'].includes(co.status));
    if (live.length) throw fail(409, `Scope add-on ${live.map(co => co.number).filter(Boolean).join(', ')} is built on this estimate. Void it first.`.replace(/\s+/g, ' '));
  }
}

export async function overrideScopeStatus(tx, ownerId, entity, recordId, status) {
  if (!OVERRIDE_STATUSES[entity]) throw fail(400, 'Only estimates and change orders have a status override');
  if (!OVERRIDE_STATUSES[entity].includes(status)) throw fail(400, `Choose one of: ${OVERRIDE_STATUSES[entity].join(', ')}`);
  const record = await getRecord(tx, ownerId, entity, recordId);
  if (record.status === 'void') throw fail(409, `This ${noun(entity)} is void. Revise it to make a new one.`);
  if (record.status === status) return record;

  const signed = SCOPE_SIGNED_STATUS[entity];
  const label = `${entity === 'ChangeOrder' ? 'Scope add-on' : 'Estimate'} ${record.number || ''}`.replace(/\s+/g, ' ').trim();

  if (status === signed) {
    const updated = await acceptScopeDocument(tx, ownerId, entity, record, { signedAt: new Date().toISOString(), manual: true });
    await invalidateSignLinks(tx, ownerId, entity, recordId);
    return updated;
  }

  const reopening = record.status === signed || !!record.accepted_snapshot;
  // PDF controlled changes: never clear an accepted estimate's approved snapshot in place.
  if (entity === 'Estimate' && reopening) {
    throw fail(409, 'Accepted estimates cannot be reopened. Void this estimate and create a new one, or add a scope add-on for changes.');
  }
  if (reopening) {
    await assertNothingBuiltOn(tx, ownerId, entity, record);
    const job = await getRecord(tx, ownerId, 'Job', record.job_id);
    const tagged = new Set((job.materials || []).filter((row) => row.task_id).map((row) => row.task_id));
    for (const task of await listJobDocuments(tx, ownerId, 'WorkItem', record.job_id)) {
      if (task.source_id === recordId && !taskStarted(task) && !tagged.has(task.id)) {
        await tx.run('DELETE FROM records WHERE owner_id = ? AND id = ?', [ownerId, task.id]);
      }
    }
  }
  const updated = await saveRecord(tx, ownerId, entity, {
    status,
    ...(reopening && {
      accepted_snapshot: undefined,
      signed_at: undefined,
      signer_name: undefined,
      signature_file_url: undefined,
      accepted_manually: undefined,
    }),
  }, recordId);
  // A link sent earlier must not let the customer sign something the owner has since changed.
  if (status !== 'sent') await invalidateSignLinks(tx, ownerId, entity, recordId);
  if (reopening && entity === 'Estimate') await refreshJobDocumentRollups(tx, ownerId, record.job_id, { saveRecord, sumActiveInvoiceTotals });
  await saveRecord(tx, ownerId, 'TimelineEntry', {
    job_id: record.job_id,
    type: 'status_change',
    text: `${label} set to ${status}${reopening ? ` (reopened from ${record.status})` : ''} without a signature`,
    category: 'document',
  });
  return updated;
}
