import { money } from "./format.js";
import { collectActionItems, invoiceBalanceDue } from "./jobFilters.js";

/**
 * @typedef {"receipt" | "attention" | "payment" | "schedule"} AttentionTone
 * @typedef {{
 *   id: string,
 *   to: string,
 *   title: string,
 *   detail: string,
 *   cta?: string,
 *   status: string | null,
 *   tone: AttentionTone,
 * }} AttentionItem
 */

/**
 * Build Needs Attention / notification rows from account-owned entity lists.
 * Same signals as the Dashboard attention section — reusable by the top-bar panel.
 *
 * @param {{
 *   jobs?: object[],
 *   estimates?: object[],
 *   changeOrders?: object[],
 *   invoices?: object[],
 *   expenses?: object[],
 *   today?: string,
 *   tomorrow?: string,
 * }} [input]
 * @returns {AttentionItem[]}
 */
export function buildAttentionItems({
  jobs = [],
  estimates = [],
  changeOrders = [],
  invoices = [],
  expenses = [],
  today = new Date().toISOString().slice(0, 10),
  tomorrow,
} = {}) {
  const tomorrowIso =
    tomorrow ||
    (() => {
      const d = new Date(`${today}T12:00:00`);
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    })();

  const actionItems = collectActionItems(jobs, estimates, changeOrders);
  const unassignedReceipts = expenses.filter((e) => e.photo_url && !e.job_id);
  /** @type {AttentionItem[]} */
  const rows = [];

  if (unassignedReceipts.length > 0) {
    const sample = unassignedReceipts[0];
    const amountHint = sample.amount != null ? ` · latest ${money(sample.amount)}` : "";
    rows.push({
      id: "receipts-inbox",
      to: "/receipts",
      title:
        unassignedReceipts.length === 1
          ? "1 receipt needs a job"
          : `${unassignedReceipts.length} receipts need a job`,
      detail: `Unassigned in Receipts inbox${amountHint}`,
      cta: "Open Receipts",
      status: null,
      tone: /** @type {AttentionTone} */ ("receipt"),
    });
  }

  for (const { job, reasons } of actionItems) {
    rows.push({
      id: `action-${job.id}`,
      to: `/jobs/${job.id}`,
      title: job.title || "Untitled job",
      detail: reasons.join(" · "),
      status: job.status ?? null,
      tone: /** @type {AttentionTone} */ ("attention"),
    });
  }

  for (const inv of invoices.filter((i) => i.status === "sent" || i.status === "partial")) {
    const due = invoiceBalanceDue(inv);
    if (due <= 0) continue;
    const job = jobs.find((j) => j.id === inv.job_id);
    rows.push({
      id: `inv-${inv.id}`,
      to: inv.job_id ? `/jobs/${inv.job_id}` : "/jobs/outstanding",
      title: job?.title || inv.number || "Invoice",
      detail: `${money(due)} waiting on payment`,
      status: inv.status ?? null,
      tone: /** @type {AttentionTone} */ ("payment"),
    });
  }

  for (const job of jobs.filter((j) => j.start_date === today || j.start_date === tomorrowIso)) {
    if (rows.some((r) => r.id === `action-${job.id}` || r.id === `sched-${job.id}`)) continue;
    const when = job.start_date === today ? "Scheduled today" : "Scheduled tomorrow";
    rows.push({
      id: `sched-${job.id}`,
      to: `/jobs/${job.id}`,
      title: job.title || "Untitled job",
      detail: when,
      status: job.status ?? null,
      tone: /** @type {AttentionTone} */ ("schedule"),
    });
  }

  return rows;
}
