/**
 * Derived money for jobs, additive alongside the existing Job.estimate_amount / invoice_amount /
 * deposit_amount rollup (server/documentRules.js's refreshJobDocumentRollups). Nothing here is
 * stored: every figure is recomputed from the estimate, change orders, invoices and payments, so a
 * summary can never disagree with the records behind it. Estimates and change orders still hold
 * dollar amounts, so they are converted to cents here.
 */
import { decode } from './domain.js';
import { ledger, computeInvoice, toCents } from '../shared/money.js';
import { pickAcceptedEstimate, computeAuthorizedTotal, authorizedBillingCeiling, approvedChangeOrderNet, changeOrderNet } from './mapping.js';

const MONEY_ENTITIES = ['Estimate', 'ChangeOrder', 'Invoice', 'Payment'];

/** Summary for one job from its decoded records. */
export function summarizeJob({ estimates = [], changeOrders = [], invoices = [], payments = [] } = {}) {
  const accepted = pickAcceptedEstimate(estimates);
  const baseline = accepted ? Number(accepted.accepted_snapshot?.total ?? accepted.total) || 0 : 0;
  const taxRate = accepted?.accepted_snapshot?.tax_rate ?? accepted?.tax_rate ?? 0;
  const approved = changeOrders.filter(order => order.status === 'approved');
  const books = ledger(
    invoices.map(invoice => ({ id: invoice.id, status: invoice.status, created_date: invoice.created_date, total_cents: computeInvoice(invoice).total_cents })),
    payments,
  );
  const billingCeiling = toCents(authorizedBillingCeiling(baseline, approved, taxRate));
  const recordsById = new Map(invoices.map(invoice => [invoice.id, invoice]));

  return {
    has_accepted_estimate: !!accepted,
    estimate_cents: toCents(baseline),
    approved_change_cents: toCents(approvedChangeOrderNet(approved)),
    authorized_cents: toCents(computeAuthorizedTotal(baseline, approved)),
    billing_ceiling_cents: billingCeiling,
    over_billed: !!accepted && books.invoiced_cents > billingCeiling,
    invoiced_cents: books.invoiced_cents,
    paid_cents: books.paid_cents,
    balance_cents: books.balance_cents,
    credit_cents: books.credit_cents,
    invoices: books.invoices.map(row => ({
      ...row,
      job_id: recordsById.get(row.id)?.job_id,
      number: recordsById.get(row.id)?.number || '',
      status: recordsById.get(row.id)?.status,
    })),
    awaiting_approval: [
      ...estimates.filter(estimate => estimate.status === 'sent')
        .map(estimate => ({ entity: 'Estimate', id: estimate.id, job_id: estimate.job_id, number: estimate.number || '', amount_cents: toCents(estimate.total) })),
      ...changeOrders.filter(order => order.status === 'sent')
        .map(order => ({ entity: 'ChangeOrder', id: order.id, job_id: order.job_id, number: order.number || '', amount_cents: toCents(changeOrderNet(order)) })),
    ],
  };
}

const inputsFor = rows => ({
  estimates: rows.filter(row => row.entity === 'Estimate').map(decode),
  changeOrders: rows.filter(row => row.entity === 'ChangeOrder').map(decode),
  invoices: rows.filter(row => row.entity === 'Invoice').map(decode),
  payments: rows.filter(row => row.entity === 'Payment').map(decode),
});

/** Decoded estimates, change orders, invoices and payments of one job. */
export async function loadJobMoney(db, ownerId, jobId) {
  const rows = await db.all(
    `SELECT * FROM records WHERE owner_id = ? AND parent_id = ? AND entity IN (${MONEY_ENTITIES.map(() => '?').join(', ')})`,
    [ownerId, jobId, ...MONEY_ENTITIES],
  );
  return inputsFor(rows);
}

export async function jobSummary(db, ownerId, jobId) {
  return summarizeJob(await loadJobMoney(db, ownerId, jobId));
}

/** Per-job summaries plus the account-wide buckets a Money/Today screen would show. */
export async function accountSummaries(db, ownerId) {
  const rows = await db.all(
    `SELECT * FROM records WHERE owner_id = ? AND entity IN ('Job', ${MONEY_ENTITIES.map(() => '?').join(', ')})`,
    [ownerId, ...MONEY_ENTITIES],
  );
  const byJob = new Map();
  for (const row of rows) {
    if (row.entity === 'Job') continue;
    byJob.set(row.parent_id, [...(byJob.get(row.parent_id) || []), row]);
  }
  const jobs = {};
  const totals = { invoiced_cents: 0, paid_cents: 0, outstanding_cents: 0, waiting_approval_cents: 0, waiting_approval_count: 0, waiting_payment_cents: 0, waiting_payment_count: 0 };
  const waitingApproval = [];
  const waitingPayment = [];
  for (const job of rows.filter(row => row.entity === 'Job')) {
    const summary = summarizeJob(inputsFor(byJob.get(job.id) || []));
    jobs[job.id] = summary;
    totals.invoiced_cents += summary.invoiced_cents;
    totals.paid_cents += summary.paid_cents;
    totals.outstanding_cents += summary.balance_cents;
    waitingApproval.push(...summary.awaiting_approval);
    waitingPayment.push(...summary.invoices
      .filter(invoice => invoice.status === 'sent' && invoice.balance_cents > 0)
      .map(invoice => ({ id: invoice.id, job_id: invoice.job_id, number: invoice.number, status: invoice.status, payment_status: invoice.payment_status, balance_cents: invoice.balance_cents })));
  }
  totals.waiting_approval_cents = waitingApproval.reduce((sum, item) => sum + item.amount_cents, 0);
  totals.waiting_approval_count = waitingApproval.length;
  totals.waiting_payment_cents = waitingPayment.reduce((sum, item) => sum + item.balance_cents, 0);
  totals.waiting_payment_count = waitingPayment.length;
  return { jobs, totals, waiting_approval: waitingApproval, waiting_payment: waitingPayment };
}
