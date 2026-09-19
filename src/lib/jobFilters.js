/**
 * Statuses still “in play” for Dashboard Active Jobs / Active Jobs list.
 * Includes Estimate (quoting). Terminal: Completed, Paid.
 */
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
