/**
 * Production visit lifecycle for the field job screen (multi-crew Phase 5).
 * Start / finish visit, report problem, request change, complete job.
 */
import { fail, saveRecord } from './domain.js';
import { applyJobStatusFields } from './jobStatus.js';

/** @param {object} job */
export function hasActiveVisit(job) {
  return Boolean(job?.active_visit?.started_at);
}

/**
 * @param {object} job
 * @param {{ started_by?: string, started_by_user_id?: string, note?: string, at?: string }} opts
 */
export function fieldsForStartVisit(job, opts = {}) {
  if (hasActiveVisit(job)) throw fail(409, 'A visit is already in progress on this job');
  const started_at = opts.at || new Date().toISOString();
  const active_visit = {
    started_at,
    started_by: opts.started_by || undefined,
    started_by_user_id: opts.started_by_user_id || undefined,
    note: opts.note || undefined,
  };
  let fields = applyJobStatusFields(
    {
      active_visit,
      status: 'In progress',
      phase: 'working',
      working_status: 'In progress',
    },
    job,
  );
  return { fields, started_at };
}

/**
 * End today's visit without closing a multi-day job.
 * @param {object} job
 * @param {{ note?: string, at?: string }} opts
 */
export function fieldsForFinishVisit(job, opts = {}) {
  if (!hasActiveVisit(job)) throw fail(409, 'No active visit to finish');
  const finished_at = opts.at || new Date().toISOString();
  return {
    fields: {
      active_visit: null,
    },
    finished_at,
    started_at: job.active_visit.started_at,
  };
}

/**
 * Mark production complete (board → Completed). Clears any open visit.
 * @param {object} job
 * @param {{ note?: string }} opts
 */
export function fieldsForCompleteJob(job, opts = {}) {
  void opts;
  return applyJobStatusFields(
    {
      active_visit: null,
      status: 'Completed',
      phase: 'working',
      working_status: 'Completed',
    },
    job,
  );
}

/**
 * Append a timeline row for a field event.
 * @param {any} tx
 * @param {string} ownerId
 * @param {{ job_id: string, type: string, text?: string, category?: string, visibility?: 'customer'|'internal', photo_url?: string, job_status?: string }} data
 */
export async function appendFieldTimeline(tx, ownerId, data) {
  return saveRecord(tx, ownerId, 'TimelineEntry', {
    category: data.category || 'note',
    visibility: data.visibility || 'internal',
    ...data,
  });
}

/**
 * @param {string} reason
 * @param {string} [note]
 */
export function scheduleChangeTimelineText(reason, note) {
  const label = String(reason || 'other').replace(/_/g, ' ');
  return note ? `Schedule change (${label}): ${note}` : `Schedule change (${label})`;
}
