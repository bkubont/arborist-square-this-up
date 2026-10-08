/**
 * Ready to Schedule queue helpers (multi-crew Phase 3).
 * Approved work lands here when prerequisites are met; dispatch filters by area,
 * capability, duration, and urgency before assigning a crew/date (Phase 4).
 */
import { applyJobStatusFields } from './jobStatus.js';
import { estimateLineAmount } from './mapping.js';

export const READY_TO_SCHEDULE_STATUS = 'Ready to Schedule';

/** Working statuses that may auto-advance into Ready to Schedule on estimate accept. */
export const PRE_SCHEDULE_QUEUE_STATUSES = new Set([
  'New inquiry',
  'Site visit',
  'Estimate sent',
  'Approved',
  READY_TO_SCHEDULE_STATUS,
]);

/**
 * Binding estimate lines: required lines always; optional lines only when listed in
 * included_optional_line_ids (or, when that list is omitted, no optionals).
 */
export function bindingEstimateLines(lines = [], includedOptionalIds = null) {
  const included = includedOptionalIds == null
    ? null
    : new Set(includedOptionalIds);
  return (lines || []).filter((line) => {
    if (!line?.is_optional) return true;
    if (!included) return false;
    return included.has(line.id);
  });
}

/** Subtotal / tax / total for binding (non-optional + explicitly included optional) lines. */
export function bindingEstimateTotals(lines = [], taxRate = 0, includedOptionalIds = null) {
  const bound = bindingEstimateLines(lines, includedOptionalIds);
  const subtotal = Math.round(bound.reduce((sum, line) => sum + estimateLineAmount(line), 0) * 100) / 100;
  const rate = Number(taxRate) || 0;
  const tax_amount = Math.round(subtotal * (rate / 100) * 100) / 100;
  const total = Math.round((subtotal + tax_amount) * 100) / 100;
  return { subtotal, tax_amount, total, lines: bound };
}

/**
 * Prerequisites for the Ready to Schedule queue after estimate approval.
 * v1: accepted estimate (caller), not already dated for production, not past Prep.
 */
export function readyToSchedulePrerequisites(job = {}) {
  const missing = [];
  if (job.start_date) missing.push('start_date');
  const status = job.status || '';
  if (!PRE_SCHEDULE_QUEUE_STATUSES.has(status) && status !== READY_TO_SCHEDULE_STATUS) {
    missing.push('status');
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Job fields to apply after an estimate is accepted, when the job should enter the queue.
 * Returns null when the job should not move (already scheduled / in production).
 */
export function jobFieldsAfterEstimateAccept(job = {}) {
  const { ok } = readyToSchedulePrerequisites(job);
  if (!ok) return null;
  if (job.status === READY_TO_SCHEDULE_STATUS) return null;
  return applyJobStatusFields(
    { status: READY_TO_SCHEDULE_STATUS, phase: 'working' },
    job,
  );
}

/**
 * Filter Ready to Schedule jobs for dispatch.
 * @param {object[]} jobs
 * @param {{ area?: string, capability?: string, durationMaxHours?: number, urgency?: string }} [filters]
 */
export function filterReadyToScheduleQueue(jobs = [], filters = {}) {
  const area = String(filters.area || '').trim().toLowerCase();
  const capability = String(filters.capability || '').trim().toLowerCase();
  const urgency = String(filters.urgency || '').trim().toLowerCase();
  const durationMax = filters.durationMaxHours != null && filters.durationMaxHours !== ''
    ? Number(filters.durationMaxHours)
    : null;

  return jobs.filter((job) => {
    if ((job.status || '') !== READY_TO_SCHEDULE_STATUS) return false;
    if (job.archived_at) return false;
    if (area) {
      const hay = `${job.service_area || ''} ${job.client_name || ''}`.toLowerCase();
      if (!hay.includes(area)) return false;
    }
    if (capability) {
      const tags = (job.required_capabilities || []).map((t) => String(t).toLowerCase());
      if (!tags.some((t) => t.includes(capability) || capability.includes(t))) return false;
    }
    if (Number.isFinite(durationMax) && durationMax > 0) {
      const hours = Number(job.estimated_duration_hours);
      if (Number.isFinite(hours) && hours > durationMax) return false;
    }
    if (urgency && String(job.urgency || 'normal').toLowerCase() !== urgency) return false;
    return true;
  });
}

/** Derive required_capabilities from tree method_needs when the job has none set. */
export function capabilitiesFromTrees(trees = []) {
  const tags = new Set();
  for (const tree of trees) {
    for (const need of tree.method_needs || []) {
      if (need) tags.add(String(need));
    }
  }
  return [...tags];
}

/** Sum labor_hours on binding estimate lines for estimated_duration_hours. */
export function durationHoursFromEstimateLines(lines = [], includedOptionalIds = null) {
  const bound = bindingEstimateLines(lines, includedOptionalIds);
  const hours = bound.reduce((sum, line) => sum + (Number(line.labor_hours) || 0), 0);
  return hours > 0 ? Math.round(hours * 100) / 100 : undefined;
}
