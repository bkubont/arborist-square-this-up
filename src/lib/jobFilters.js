import {
  ACTIVE_JOB_STATUSES,
  ARCHIVE_JOB_STATUSES,
  JOB_PHASE_ORDER,
  JOB_PHASES,
  STORED_JOB_STATUSES,
  phaseForStatus,
} from "./jobStatus.js";

/** Stored job statuses across Lead, Working, and Payment (Invoiced is a Payment status). */
export const JOB_STATUSES = STORED_JOB_STATUSES;

/** Statuses still in play on working lists (non-terminal). */
export const ACTIVE_STATUSES = ACTIVE_JOB_STATUSES;

export { JOB_PHASE_ORDER, JOB_PHASES, ARCHIVE_JOB_STATUSES };

export function isArchivedJob(job) {
  if (job?.status === "Completed") return false;
  if (job?.archived_at) return true;
  return ARCHIVE_JOB_STATUSES.has(job?.status);
}

/** Non-archived jobs — shown on board, active list, schedule, etc. */
export function isWorkingJob(job) {
  return !isArchivedJob(job);
}

export function isActiveJob(job) {
  return isWorkingJob(job) && ACTIVE_STATUSES.includes(job?.status);
}

/** Sum of TimelineEntry `payment_received` amounts. */
export function sumPaymentReceived(entries = []) {
  return entries
    .filter((e) => e?.type === "payment_received" && e.amount != null)
    .reduce((sum, e) => sum + Number(e.amount), 0);
}

/** Sum of TimelineEntry `deposit_received` amounts. */
export function sumDepositReceived(entries = []) {
  return entries
    .filter((e) => e?.type === "deposit_received" && e.amount != null)
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

/** Map job_id → logged deposit_received total. */
export function depositsByJobId(timeline = []) {
  const map = Object.create(null);
  for (const e of timeline) {
    if (e?.type !== "deposit_received" || e.amount == null || e.job_id == null) continue;
    const id = e.job_id;
    map[id] = (map[id] || 0) + Number(e.amount);
  }
  return map;
}

/**
 * Deposit + logged payments (aligns with FinancialPanel).
 * Always include legacy job.deposit_amount plus timeline deposit_received amounts.
 */
export function jobReceived(job, paymentsLogged = 0, depositsLogged = 0) {
  const deposit = (Number(job?.deposit_amount) || 0) + (Number(depositsLogged) || 0);
  return deposit + (Number(paymentsLogged) || 0);
}

/** Active (non-void) invoice for a job, if any. */
export function activeInvoiceForJob(invoices = [], jobId) {
  return invoices.find((inv) => inv?.job_id === jobId && inv.status !== "void") || null;
}

/** Map job_id → active invoice. */
export function invoicesByJobId(invoices = []) {
  const map = Object.create(null);
  for (const inv of invoices) {
    if (!inv?.job_id || inv.status === "void") continue;
    if (!map[inv.job_id]) map[inv.job_id] = inv;
  }
  return map;
}

/**
 * Outstanding balance for a job.
 * Prefers the active invoice balance_due when present; otherwise invoice_amount − received.
 */
export function jobBalance(job, paymentsLogged = 0, depositsLogged = 0, invoice = null) {
  if (invoice && invoice.status !== "void") {
    return invoiceBalanceDue(invoice);
  }
  return Math.max(0, (Number(job?.invoice_amount) || 0) - jobReceived(job, paymentsLogged, depositsLogged));
}

export function hasOutstandingBalance(job, paymentsLogged = 0, depositsLogged = 0, invoice = null) {
  return jobBalance(job, paymentsLogged, depositsLogged, invoice) > 0;
}

export function countByStatus(jobs) {
  const counts = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0]));
  for (const job of jobs) {
    if (counts[job.status] != null) counts[job.status] += 1;
  }
  return counts;
}

/**
 * Jobs on each board phase. Same rule as the board: stored `phase`, else the status's phase.
 * Counts add up to the jobs passed in (one phase per job).
 * @param {object[]} jobs
 * @returns {{ lead: number, working: number, payment: number }}
 */
export function countByPhase(jobs = []) {
  const counts = { lead: 0, working: 0, payment: 0 };
  for (const job of jobs) {
    const phase = JOB_PHASE_ORDER.includes(job?.phase) ? job.phase : null;
    const key = phase || phaseForStatus(job?.status) || "lead";
    counts[key] += 1;
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
 * received / outstanding include legacy deposit_amount + deposit_received + payment_received.
 * waitingApproval = Estimate/CO status `sent`
 * waitingPayment = Invoice status `sent` or `partial` — sum of balance_due (not full total)
 */
export function moneySummary(jobs, estimates = [], changeOrders = [], invoices = [], timeline = []) {
  const paymentsMap = paymentsByJobId(timeline);
  const depositsMap = depositsByJobId(timeline);
  const invoiceMap = invoicesByJobId(invoices);
  const jobIds = new Set(jobs.map((job) => job.id));
  let invoiced = 0;
  let received = 0;
  let outstanding = 0;
  for (const job of jobs) {
    const logged = paymentsMap[job.id] || 0;
    const deposits = depositsMap[job.id] || 0;
    const invoice = invoiceMap[job.id] || null;
    if (invoice) {
      invoiced += Number(invoice.total) || Number(job.invoice_amount) || 0;
      received += (Number(invoice.deposits_applied) || 0) + (Number(invoice.payments_applied) || 0);
      outstanding += invoiceBalanceDue(invoice);
    } else {
      invoiced += Number(job.invoice_amount) || 0;
      received += jobReceived(job, logged, deposits);
      outstanding += jobBalance(job, logged, deposits);
    }
  }
  // Archived / completed jobs may be omitted from working lists but still owe on an invoice.
  for (const invoice of invoices) {
    if (!invoice?.job_id || invoice.status === "void" || jobIds.has(invoice.job_id)) continue;
    invoiced += Number(invoice.total) || 0;
    received += (Number(invoice.deposits_applied) || 0) + (Number(invoice.payments_applied) || 0);
    outstanding += invoiceBalanceDue(invoice);
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

/** An invoice that has left draft. Void invoices are not issued. */
export function isIssuedInvoice(invoice) {
  if (!invoice) return false;
  const status = invoice.status || "";
  return status !== "void" && status !== "draft";
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Quote still not on an issued invoice: accepted estimate, else a live estimate, else the job amount.
 * @param {object} job
 * @param {object[]} estimates
 */
function unbilledWorkAmount(job, estimates = []) {
  const docs = estimates.filter((e) => e?.job_id === job?.id && e.status !== "void");
  const accepted = docs.find((e) => e.status === "accepted");
  if (accepted) {
    const snap = accepted.accepted_snapshot?.total;
    return roundMoney(snap != null ? snap : accepted.total);
  }
  const live = docs.find((e) => e.status === "sent" || e.status === "draft");
  if (live) return roundMoney(live.total);
  if (Number(job?.estimate_amount)) return roundMoney(job.estimate_amount);
  if (Number(job?.invoice_amount)) return roundMoney(job.invoice_amount);
  return 0;
}

/**
 * Three labeled money scopes. They are not one equation:
 * issued invoice billed / applied / remaining stay on the invoice,
 * uninvoiced deposits are deposits not already applied on an issued invoice,
 * unbilled work is quoted work with no issued invoice.
 *
 * @param {{ jobs?: object[], estimates?: object[], invoices?: object[], timeline?: object[] }} input
 */
export function moneyGroups({ jobs = [], estimates = [], invoices = [], timeline = [] } = {}) {
  const depositsMap = depositsByJobId(timeline);
  /** @type {Map<string, object>} */
  const issuedByJob = new Map();
  for (const invoice of invoices) {
    if (!isIssuedInvoice(invoice) || !invoice.job_id) continue;
    if (!issuedByJob.has(invoice.job_id)) issuedByJob.set(invoice.job_id, invoice);
  }

  const jobById = new Map(jobs.filter((job) => job?.id != null).map((job) => [job.id, job]));

  /** @type {object[]} */
  const issuedRecords = [];
  let billed = 0;
  let applied = 0;
  let remaining = 0;
  for (const invoice of invoices) {
    if (!isIssuedInvoice(invoice)) continue;
    const invoiceBilled = roundMoney(invoice.total);
    const invoiceApplied = roundMoney((Number(invoice.deposits_applied) || 0) + (Number(invoice.payments_applied) || 0));
    const invoiceRemaining = roundMoney(invoiceBalanceDue(invoice));
    billed += invoiceBilled;
    applied += invoiceApplied;
    remaining += invoiceRemaining;
    const job = invoice.job_id ? jobById.get(invoice.job_id) : null;
    issuedRecords.push({
      id: `invoice-${invoice.id}`,
      kind: "invoice",
      title: job?.title || invoice.number || "Invoice",
      detail: invoice.number ? `${invoice.number} · ${invoice.status || "issued"}` : (invoice.status || "issued"),
      amount: invoiceRemaining,
      billed: invoiceBilled,
      applied: invoiceApplied,
      remaining: invoiceRemaining,
      to: invoice.job_id ? `/jobs/${invoice.job_id}` : "/jobs/outstanding?group=issued",
    });
  }

  const depositJobIds = new Set([
    ...jobById.keys(),
    ...Object.keys(depositsMap),
  ]);
  /** @type {object[]} */
  const depositRecords = [];
  let depositTotal = 0;
  for (const jobId of depositJobIds) {
    const job = jobById.get(jobId);
    const logged = roundMoney((Number(job?.deposit_amount) || 0) + (Number(depositsMap[jobId]) || 0));
    const invoice = issuedByJob.get(jobId);
    const alreadyApplied = invoice ? roundMoney(invoice.deposits_applied) : 0;
    const amount = roundMoney(Math.max(0, logged - alreadyApplied));
    if (amount <= 0) continue;
    depositTotal += amount;
    depositRecords.push({
      id: `deposit-${jobId}`,
      kind: "deposit",
      title: job?.title || "Deposit",
      detail: invoice ? "Deposit not applied on the issued invoice" : "No issued invoice",
      amount,
      to: `/jobs/${jobId}`,
    });
  }

  /** @type {object[]} */
  const unbilledRecords = [];
  let unbilledTotal = 0;
  for (const job of jobs) {
    if (!job?.id || issuedByJob.has(job.id)) continue;
    const amount = unbilledWorkAmount(job, estimates);
    if (amount <= 0) continue;
    unbilledTotal += amount;
    unbilledRecords.push({
      id: `unbilled-${job.id}`,
      kind: "unbilled",
      title: job.title || "Untitled job",
      detail: "Quoted work with no issued invoice",
      amount,
      to: `/jobs/${job.id}`,
    });
  }

  return {
    issued: {
      id: "issued",
      label: "Issued invoices",
      scope: "Sent, partial, and paid invoices. Billed, applied, and remaining stay on these invoices.",
      billed: roundMoney(billed),
      applied: roundMoney(applied),
      remaining: roundMoney(remaining),
      records: issuedRecords,
    },
    deposits: {
      id: "deposits",
      label: "Uninvoiced deposits",
      scope: "Deposits that are not already applied on an issued invoice.",
      total: roundMoney(depositTotal),
      records: depositRecords,
    },
    unbilled: {
      id: "unbilled",
      label: "Unbilled work",
      scope: "Quoted or estimated work that has no issued invoice.",
      total: roundMoney(unbilledTotal),
      records: unbilledRecords,
    },
  };
}

/**
 * Action-item reasons for a job (blocked / waiting).
 * Returns array of short labels; empty = not an action item.
 */
export function actionReasonsForJob(job, estimates = [], changeOrders = []) {
  const reasons = [];
  if (job?.status === "Blocked") reasons.push("Blocked");
  if (job?.status === "Waiting on approval") reasons.push("Waiting on client approval");

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
