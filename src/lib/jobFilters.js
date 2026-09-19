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

/** Sum of TimelineEntry `payment_received` amounts. */
export function sumPaymentReceived(entries = []) {
  return entries
    .filter((e) => e?.type === "payment_received" && e.amount != null)
    .reduce((sum, e) => sum + Number(e.amount), 0);
}

/** Map job_id → logged payment_received total. */
export function paymentsByJobId(timeline = []) {
  const map = Object.create(null);
  for (const e of timeline) {
    if (e?.type !== "payment_received" || e.amount == null || e.job_id == null) continue;
    const id = e.job_id;
    map[id] = (map[id] || 0) + Number(e.amount);
  }
  return map;
}

/** Deposit + logged payments (aligns with FinancialPanel). */
export function jobReceived(job, paymentsLogged = 0) {
  return (Number(job?.deposit_amount) || 0) + (Number(paymentsLogged) || 0);
}

/**
 * Outstanding balance for a job: invoice − deposit − payment_received timeline amounts.
 * Pass paymentsLogged from TimelineEntry type payment_received for that job.
 */
export function jobBalance(job, paymentsLogged = 0) {
  return Math.max(0, (Number(job?.invoice_amount) || 0) - jobReceived(job, paymentsLogged));
}

export function hasOutstandingBalance(job, paymentsLogged = 0) {
  return jobBalance(job, paymentsLogged) > 0;
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

/** Invoice amount still owed (after deposits/payments). Prefer stored `balance_due`. */
export function invoiceBalanceDue(invoice) {
  if (invoice == null) return 0;
  if (invoice.balance_due != null && Number.isFinite(Number(invoice.balance_due))) {
    return Math.max(0, Number(invoice.balance_due));
  }
  const total = Number(invoice.total) || 0;
  const deposits = Number(invoice.deposits_applied) || 0;
  const payments = Number(invoice.payments_applied) || 0;
  return Math.max(0, total - deposits - payments);
}

/**
 * Money buckets for Dashboard Money tile / Outstanding page.
 * received / outstanding include deposit_amount + payment_received timeline entries.
 * waitingApproval = Estimate/CO status `sent`
 * waitingPayment = Invoice status `sent` or `partial` — sum of balance_due (not full total)
 */
export function moneySummary(jobs, estimates = [], changeOrders = [], invoices = [], timeline = []) {
  const paymentsMap = paymentsByJobId(timeline);
  let invoiced = 0;
  let received = 0;
  let outstanding = 0;
  for (const job of jobs) {
    const logged = paymentsMap[job.id] || 0;
    invoiced += Number(job.invoice_amount) || 0;
    received += jobReceived(job, logged);
    outstanding += jobBalance(job, logged);
  }

  const waitingApprovalDocs = [...estimates, ...changeOrders].filter(isAwaitingApproval);
  const waitingApproval = waitingApprovalDocs.reduce((sum, d) => sum + docMoneyAmount(d), 0);

  const waitingPaymentDocs = invoices.filter((inv) => inv?.status === "sent" || inv?.status === "partial");
  const waitingPayment = waitingPaymentDocs.reduce((sum, d) => sum + invoiceBalanceDue(d), 0);

  return {
    invoiced,
    received,
    outstanding,
    waitingApproval,
    waitingDocCount: waitingApprovalDocs.length,
    waitingPayment,
    waitingPaymentCount: waitingPaymentDocs.length,
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
