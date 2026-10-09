/**
 * Completion checklist + configurable quality review gate (multi-crew Phase 6 / PDF §6).
 */
import { fail } from './domain.js';
import {
  DEFAULT_COMPLETION_CHECKLIST,
  normalizeReviewGateRules,
  defaultReviewGateRules,
} from '../shared/completionChecklist.js';
import { applyJobStatusFields } from './jobStatus.js';
import { findLiveAcceptedEstimate, listJobDocuments } from './documentRules.js';
import { computeAuthorizedTotal, approvedChangeOrderNet } from './mapping.js';

export { DEFAULT_COMPLETION_CHECKLIST, normalizeReviewGateRules, defaultReviewGateRules };

/**
 * Auto-detect checklist item done state from job-linked records.
 * @param {{
 *   job: object,
 *   timeline?: object[],
 *   workItems?: object[],
 *   changeOrders?: object[],
 * }} ctx
 */
export function autoChecklistFlags(ctx) {
  const timeline = ctx.timeline || [];
  const workItems = ctx.workItems || [];
  const changeOrders = ctx.changeOrders || [];
  const photos = timeline.filter((e) => e?.type === 'photo');
  const before = photos.some((e) => e.category === 'before' || /before/i.test(e.text || ''));
  const after = photos.some((e) => e.category === 'after' || /after/i.test(e.text || ''));
  const openTasks = workItems.filter((w) => w && w.status !== 'completed' && w.status !== 'cancelled' && !w.done);
  const pendingCos = changeOrders.filter((c) => c && ['draft', 'sent'].includes(c.status));
  return {
    approved_work: openTasks.length === 0 && pendingCos.length === 0,
    photos: photos.length >= 2 || (before && after) || photos.length >= 1,
  };
}

/**
 * Build merged checklist rows (defaults + stored + auto).
 * @param {object|null|undefined} stored
 * @param {ReturnType<typeof autoChecklistFlags>} [auto]
 */
export function mergeCompletionChecklist(stored, auto = {}) {
  const byKey = new Map();
  for (const item of (stored?.items || [])) {
    if (item?.key) byKey.set(item.key, item);
  }
  const items = DEFAULT_COMPLETION_CHECKLIST.map((def) => {
    const prev = byKey.get(def.key);
    const autoDone = def.auto ? Boolean(auto[def.key]) : false;
    const done = Boolean(prev?.done) || autoDone;
    return {
      key: def.key,
      label: def.label,
      auto: Boolean(def.auto),
      done,
      auto_done: autoDone,
    };
  });
  const complete = items.every((i) => i.done);
  return {
    items,
    complete,
    completed_at: stored?.completed_at || (complete ? undefined : undefined),
    submitted_by: stored?.submitted_by,
    customer_informed_at: stored?.customer_informed_at,
  };
}

/**
 * Apply manual checklist toggles from a PATCH body.
 * @param {object|null|undefined} previous
 * @param {{ items?: Array<{ key: string, done?: boolean }>, customer_informed?: boolean }} body
 * @param {object} [meta]
 */
export function prepareChecklistUpdate(previous, body = {}, meta = {}) {
  const merged = mergeCompletionChecklist(previous);
  const toggles = new Map((body.items || []).map((i) => [i.key, i]));
  const items = merged.items.map((row) => {
    const t = toggles.get(row.key);
    if (!t) return { key: row.key, label: row.label, done: row.done, auto: row.auto };
    return {
      key: row.key,
      label: row.label,
      done: t.done != null ? Boolean(t.done) : row.done,
      auto: row.auto,
    };
  });
  const next = {
    items,
    submitted_by: meta.submitted_by || previous?.submitted_by,
    completed_at: previous?.completed_at,
    customer_informed_at: previous?.customer_informed_at,
  };
  if (body.customer_informed === true || items.find((i) => i.key === 'customer_informed')?.done) {
    next.customer_informed_at = previous?.customer_informed_at || new Date().toISOString();
    const ci = items.find((i) => i.key === 'customer_informed');
    if (ci) ci.done = true;
  }
  if (items.every((i) => i.done)) {
    next.completed_at = previous?.completed_at || new Date().toISOString();
  }
  return next;
}

/**
 * Decide whether office review is required before invoicing.
 * @param {object} job
 * @param {object|null} company
 * @param {{ timeline?: object[], authorizedTotal?: number }} [ctx]
 */
export function evaluateReviewGate(job, company, ctx = {}) {
  const rules = normalizeReviewGateRules(company?.review_gate);
  if (!rules.enabled) {
    return { required: false, reasons: [], rules };
  }
  const reasons = [];
  const price = Number(ctx.authorizedTotal ?? job?.estimate_amount ?? 0) || 0;
  if (rules.min_price > 0 && price >= rules.min_price) {
    reasons.push(`price >= ${rules.min_price}`);
  }
  const jobType = String(job?.job_type || '').trim();
  if (jobType && rules.job_types.includes(jobType)) {
    reasons.push(`job_type=${jobType}`);
  }
  const hasProblem = (ctx.timeline || []).some((e) => e?.type === 'problem');
  if (rules.require_on_problem && hasProblem) {
    reasons.push('reported_problem');
  }
  return { required: reasons.length > 0, reasons, rules };
}

/**
 * Fields for completing a job with checklist + review gate.
 * @param {object} job
 * @param {{
 *   note?: string,
 *   checklist?: object,
 *   company?: object|null,
 *   timeline?: object[],
 *   workItems?: object[],
 *   changeOrders?: object[],
 *   estimates?: object[],
 *   force?: boolean,
 *   allow_incomplete?: boolean,
 *   submitted_by?: string,
 * }} opts
 */
export function fieldsForCompleteWithChecklist(job, opts = {}) {
  const auto = autoChecklistFlags({
    job,
    timeline: opts.timeline,
    workItems: opts.workItems,
    changeOrders: opts.changeOrders,
  });
  const stored = opts.checklist || job.completion_checklist;
  const checklist = mergeCompletionChecklist(stored, auto);
  // Persist auto-detected done flags onto the stored shape.
  const persisted = {
    items: checklist.items.map(({ key, label, done, auto: isAuto }) => ({
      key, label, done, auto: isAuto,
    })),
    completed_at: checklist.complete ? (stored?.completed_at || new Date().toISOString()) : stored?.completed_at,
    submitted_by: opts.submitted_by || stored?.submitted_by,
    customer_informed_at: stored?.customer_informed_at,
  };

  if (!checklist.complete && !opts.allow_incomplete && !opts.force) {
    const missing = checklist.items.filter((i) => !i.done).map((i) => i.key);
    throw fail(400, `Completion checklist incomplete: ${missing.join(', ')}`);
  }

  const estimates = opts.estimates || [];
  const accepted = findLiveAcceptedEstimate(estimates);
  const baseline = accepted
    ? Number(accepted.accepted_snapshot?.total ?? accepted.total) || 0
    : Number(job.estimate_amount) || 0;
  const approved = (opts.changeOrders || []).filter((c) => c.status === 'approved');
  const authorizedTotal = computeAuthorizedTotal(baseline, approved);

  const gate = evaluateReviewGate(job, opts.company, {
    timeline: opts.timeline,
    authorizedTotal,
  });

  const review_status = gate.required ? 'pending' : 'not_required';
  const review_reasons = gate.required ? gate.reasons : [];

  const fields = applyJobStatusFields(
    {
      active_visit: null,
      status: 'Completed',
      phase: 'working',
      working_status: 'Completed',
      completion_checklist: persisted,
      review_status,
      review_reasons,
      review_approved_at: undefined,
      review_approved_by: undefined,
    },
    job,
  );

  return {
    fields,
    checklist: mergeCompletionChecklist(persisted, auto),
    review: { status: review_status, reasons: review_reasons, required: gate.required },
    authorizedTotal,
    approvedChangeNet: approvedChangeOrderNet(approved),
  };
}

/** Assert office can approve a pending completion review. */
export function fieldsForApproveReview(job, opts = {}) {
  if (job.review_status !== 'pending') {
    throw fail(400, 'This job is not awaiting completion review');
  }
  return {
    review_status: 'approved',
    review_approved_at: new Date().toISOString(),
    review_approved_by: opts.approved_by || undefined,
    review_reasons: job.review_reasons || [],
  };
}

/** Invoice creation blocked while review is pending. */
export function assertInvoiceAllowedAfterReview(job) {
  if (job?.review_status === 'pending') {
    throw fail(409, 'Completion review is required before creating an invoice for this job');
  }
}

/**
 * Load checklist context for a job from the DB.
 * @param {any} tx
 * @param {string} ownerId
 * @param {string} jobId
 */
export async function loadCompletionContext(tx, ownerId, jobId) {
  const [timeline, workItems, changeOrders, estimates] = await Promise.all([
    listJobDocuments(tx, ownerId, 'TimelineEntry', jobId),
    listJobDocuments(tx, ownerId, 'WorkItem', jobId),
    listJobDocuments(tx, ownerId, 'ChangeOrder', jobId),
    listJobDocuments(tx, ownerId, 'Estimate', jobId),
  ]);
  return { timeline, workItems, changeOrders, estimates };
}
