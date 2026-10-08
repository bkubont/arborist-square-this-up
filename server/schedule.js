/**
 * Multi-crew scheduling helpers (Phase 4): prerequisites, assign, weather reschedule history.
 */
import { applyJobStatusFields } from './jobStatus.js';
import { READY_TO_SCHEDULE_STATUS } from './readyToSchedule.js';

export const SCHEDULED_STATUS = 'Scheduled';

export const SCHEDULE_REASONS = /** @type {const} */ ([
  'initial',
  'weather',
  'customer_request',
  'crew_availability',
  'equipment',
  'other',
]);

/**
 * Prerequisite flags for dispatch (approval, deposit, access).
 * Approval is true when status is Ready to Schedule / Scheduled / past, or estimate was accepted.
 * Deposit / access are explicit job flags when set; otherwise inferred lightly.
 *
 * @param {object} job
 * @param {{ property?: object|null, hasAcceptedEstimate?: boolean, depositReceived?: boolean }} [ctx]
 */
export function schedulePrerequisiteFlags(job = {}, ctx = {}) {
  const status = job.status || '';
  const pastApproval = [
    READY_TO_SCHEDULE_STATUS,
    SCHEDULED_STATUS,
    'Prep',
    'In progress',
    'Waiting on',
    'Blocked',
    'Completed',
  ].includes(status) || status === 'Approved';

  const approval = job.prereq_approval != null
    ? Boolean(job.prereq_approval)
    : Boolean(ctx.hasAcceptedEstimate || pastApproval);

  const deposit = job.prereq_deposit != null
    ? Boolean(job.prereq_deposit)
    : Boolean(ctx.depositReceived || (Number(job.deposit_amount) > 0));

  const property = ctx.property || null;
  const accessNotes = String(property?.access_notes || job.access_notes || '').trim();
  const access = job.prereq_access != null
    ? Boolean(job.prereq_access)
    : Boolean(accessNotes);

  const flags = { approval, deposit, access };
  const missing = /** @type {string[]} */ ([]);
  if (!flags.approval) missing.push('approval');
  if (!flags.deposit) missing.push('deposit');
  if (!flags.access) missing.push('access');
  return { ...flags, missing, ok: missing.length === 0 };
}

/**
 * Append a schedule history row (weather / move / initial).
 * @param {object} job
 * @param {{
 *   reason: string,
 *   previous_start_date?: string,
 *   previous_end_date?: string,
 *   previous_crew_id?: string,
 *   new_start_date?: string,
 *   new_end_date?: string,
 *   new_crew_id?: string,
 *   note?: string,
 *   customer_notified?: boolean,
 *   changed_by?: string,
 *   at?: string,
 * }} entry
 */
export function appendScheduleHistory(job = {}, entry = {}) {
  const history = Array.isArray(job.schedule_history) ? [...job.schedule_history] : [];
  history.push({
    at: entry.at || new Date().toISOString(),
    reason: entry.reason || 'other',
    previous_start_date: entry.previous_start_date || '',
    previous_end_date: entry.previous_end_date || '',
    previous_crew_id: entry.previous_crew_id || undefined,
    new_start_date: entry.new_start_date || '',
    new_end_date: entry.new_end_date || '',
    new_crew_id: entry.new_crew_id || undefined,
    note: entry.note || undefined,
    customer_notified: Boolean(entry.customer_notified),
    changed_by: entry.changed_by || undefined,
  });
  // Cap history length (Zod max 100).
  return history.slice(-100);
}

/**
 * Build Job patch fields for an initial schedule assignment.
 * Moves Ready to Schedule → Scheduled when applicable.
 *
 * @param {object} job — previous job
 * @param {{
 *   start_date: string,
 *   end_date?: string,
 *   crew_id?: string,
 *   equipment_ids?: string[],
 *   estimated_duration_hours?: number,
 *   prereq_approval?: boolean,
 *   prereq_deposit?: boolean,
 *   prereq_access?: boolean,
 *   customer_notified?: boolean,
 *   note?: string,
 *   changed_by?: string,
 * }} assignment
 */
export function jobFieldsForScheduleAssign(job, assignment) {
  if (!assignment?.start_date) {
    throw Object.assign(new Error('start_date is required to schedule'), { status: 400 });
  }
  const equipment_ids = Array.isArray(assignment.equipment_ids)
    ? assignment.equipment_ids.filter(Boolean)
    : (job.equipment_ids || []);

  const history = appendScheduleHistory(job, {
    reason: job.start_date ? 'other' : 'initial',
    previous_start_date: job.start_date || '',
    previous_end_date: job.end_date || '',
    previous_crew_id: job.crew_id,
    new_start_date: assignment.start_date,
    new_end_date: assignment.end_date || assignment.start_date,
    new_crew_id: assignment.crew_id ?? job.crew_id,
    note: assignment.note,
    customer_notified: assignment.customer_notified,
    changed_by: assignment.changed_by,
  });

  /** @type {Record<string, unknown>} */
  let fields = {
    start_date: assignment.start_date,
    end_date: assignment.end_date || assignment.start_date,
    equipment_ids,
    schedule_history: history,
  };
  if (assignment.crew_id !== undefined) fields.crew_id = assignment.crew_id || undefined;
  if (assignment.estimated_duration_hours != null && assignment.estimated_duration_hours !== '') {
    fields.estimated_duration_hours = Number(assignment.estimated_duration_hours);
  }
  if (assignment.prereq_approval != null) fields.prereq_approval = Boolean(assignment.prereq_approval);
  if (assignment.prereq_deposit != null) fields.prereq_deposit = Boolean(assignment.prereq_deposit);
  if (assignment.prereq_access != null) fields.prereq_access = Boolean(assignment.prereq_access);

  if (job.status === READY_TO_SCHEDULE_STATUS || job.status === 'Approved') {
    fields = {
      ...fields,
      ...applyJobStatusFields({ status: SCHEDULED_STATUS, phase: 'working' }, job),
    };
  }

  return fields;
}

/**
 * Weather / general reschedule — retains prior dates in schedule_history.
 *
 * @param {object} job
 * @param {{
 *   start_date: string,
 *   end_date?: string,
 *   reason?: string,
 *   note?: string,
 *   customer_notified?: boolean,
 *   changed_by?: string,
 *   crew_id?: string,
 * }} move
 */
export function jobFieldsForReschedule(job, move) {
  if (!move?.start_date) {
    throw Object.assign(new Error('start_date is required to reschedule'), { status: 400 });
  }
  const reason = move.reason && SCHEDULE_REASONS.includes(/** @type {any} */ (move.reason))
    ? move.reason
    : (move.reason === 'weather' ? 'weather' : 'other');

  const history = appendScheduleHistory(job, {
    reason,
    previous_start_date: job.start_date || '',
    previous_end_date: job.end_date || '',
    previous_crew_id: job.crew_id,
    new_start_date: move.start_date,
    new_end_date: move.end_date || move.start_date,
    new_crew_id: move.crew_id ?? job.crew_id,
    note: move.note,
    customer_notified: move.customer_notified,
    changed_by: move.changed_by,
  });

  /** @type {Record<string, unknown>} */
  const fields = {
    start_date: move.start_date,
    end_date: move.end_date || move.start_date,
    schedule_history: history,
  };
  if (move.crew_id !== undefined) fields.crew_id = move.crew_id || undefined;
  return fields;
}
