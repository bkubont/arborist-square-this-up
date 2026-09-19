/**
 * Job status columns used by Dashboard Jobs tile, lists, and Kanban.
 * Active / in-play first; Completed & Paid are terminal but shown on board.
 */
export const JOB_STATUSES = [
  "Estimate",
  "Scheduled",
  "In Progress",
  "Waiting on Materials",
  "Completed",
  "Paid",
];

/** Statuses still in play (Dashboard Active list). Terminal: Completed, Paid. */
export const ACTIVE_STATUSES = [
  "Estimate",
  "Scheduled",
  "In Progress",
  "Waiting on Materials",
];

export function isActiveJob(job) {
  return ACTIVE_STATUSES.includes(job?.status);
}

/** Simple outstanding balance (invoice − deposit), matching Dashboard. */
export function jobBalance(job) {
  return Math.max(0, (Number(job?.invoice_amount) || 0) - (Number(job?.deposit_amount) || 0));
}

export function hasOutstandingBalance(job) {
  return jobBalance(job) > 0;
}

export function countByStatus(jobs) {
  const counts = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0]));
  for (const job of jobs) {
    if (counts[job.status] != null) counts[job.status] += 1;
  }
  return counts;
}

/** Estimate / CO awaiting client sign (status `sent`). */
export function isAwaitingApproval(doc) {
  return doc?.status === "sent";
}

export function docMoneyAmount(doc) {
  if (doc == null) return 0;
  if (doc.total != null && Number.isFinite(Number(doc.total))) return Number(doc.total);
  if (doc.net_change != null && Number.isFinite(Number(doc.net_change))) return Number(doc.net_change);
  return 0;
}

/**
 * Money buckets for Dashboard Money tile (job fields + sent docs).
 */
export function moneySummary(jobs, estimates = [], changeOrders = []) {
  let invoiced = 0;
  let received = 0;
  let outstanding = 0;
  for (const job of jobs) {
    invoiced += Number(job.invoice_amount) || 0;
    received += Number(job.deposit_amount) || 0;
    outstanding += jobBalance(job);
  }

  const waitingDocs = [...estimates, ...changeOrders].filter(isAwaitingApproval);
  const waitingApproval = waitingDocs.reduce((sum, d) => sum + docMoneyAmount(d), 0);

  return {
    invoiced,
    received,
    outstanding,
    waitingApproval,
    waitingDocCount: waitingDocs.length,
  };
}

/**
 * Action-item reasons for a job (blocked / waiting).
 * Returns array of short labels; empty = not an action item.
 */
export function actionReasonsForJob(job, estimates = [], changeOrders = []) {
  const reasons = [];
  if (job?.status === "Waiting on Materials") reasons.push("Waiting on materials");

  const jobEstimates = estimates.filter((e) => e.job_id === job.id && isAwaitingApproval(e));
  if (jobEstimates.length) reasons.push("Estimate awaiting approval");

  const jobCos = changeOrders.filter((c) => c.job_id === job.id && isAwaitingApproval(c));
  if (jobCos.length) reasons.push("Change order awaiting approval");

  return reasons;
}

export function collectActionItems(jobs, estimates = [], changeOrders = []) {
  return jobs
    .map((job) => ({
      job,
      reasons: actionReasonsForJob(job, estimates, changeOrders),
    }))
    .filter((row) => row.reasons.length > 0);
}
