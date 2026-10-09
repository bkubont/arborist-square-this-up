/**
 * Job and crew production comparisons (multi-crew Phase 6 / PDF §7).
 * Estimated vs actual hours, duration, direct costs, invoice, and gross profit.
 * Company overhead is intentionally excluded — crew gross profit only.
 */
import { decode } from './domain.js';
import { findLiveAcceptedEstimate, listJobDocuments } from './documentRules.js';
import { computeAuthorizedTotal, approvedChangeOrderNet } from './mapping.js';
import { computeInvoice, toCents, fromCents } from '../shared/money.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Hours between clock_in and clock_out (open entries count 0 toward actual until closed). */
export function hoursFromTimeEntry(entry) {
  if (!entry?.clock_in || !entry.clock_out) return 0;
  const start = Date.parse(entry.clock_in);
  const end = Date.parse(entry.clock_out);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return (end - start) / (1000 * 60 * 60);
}

/** Sum labor_hours on accepted estimate (+ approved CO) lines. */
export function estimatedHoursFromScope(estimate, changeOrders = []) {
  const source = estimate?.accepted_snapshot || estimate || {};
  let hours = 0;
  for (const line of source.lines || []) {
    hours += Number(line.labor_hours) || 0;
  }
  for (const co of changeOrders.filter((c) => c.status === 'approved')) {
    for (const line of co.lines || []) {
      hours += Number(line.labor_hours) || 0;
    }
  }
  return round2(hours);
}

/** Calendar-day span of scheduled production (inclusive). */
export function scheduledDurationDays(job) {
  if (!job?.start_date) return null;
  const start = Date.parse(job.start_date);
  const end = Date.parse(job.end_date || job.start_date);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
}

/**
 * Build production comparison for one job.
 * @param {{
 *   job: object,
 *   estimates?: object[],
 *   changeOrders?: object[],
 *   invoices?: object[],
 *   expenses?: object[],
 *   timeEntries?: object[],
 *   timeline?: object[],
 * }} input
 */
export function summarizeJobProduction(input) {
  const job = input.job || {};
  const estimates = input.estimates || [];
  const changeOrders = input.changeOrders || [];
  const invoices = (input.invoices || []).filter((i) => i && i.status !== 'void');
  const expenses = input.expenses || [];
  const timeEntries = input.timeEntries || [];
  const timeline = input.timeline || [];

  const accepted = findLiveAcceptedEstimate(estimates);
  const baseline = accepted
    ? Number(accepted.accepted_snapshot?.total ?? accepted.total) || 0
    : Number(job.estimate_amount) || 0;
  const approved = changeOrders.filter((c) => c.status === 'approved');
  const estimated_revenue = round2(computeAuthorizedTotal(baseline, approved));
  const original_invoice_estimate = round2(baseline);
  const approved_changes = round2(approvedChangeOrderNet(approved));

  const estimated_hours = estimatedHoursFromScope(accepted, approved)
    || round2(Number(job.estimated_duration_hours) || 0);
  const actual_hours = round2(timeEntries.reduce((sum, e) => sum + hoursFromTimeEntry(e), 0));

  const estimated_duration_hours = round2(Number(job.estimated_duration_hours) || estimated_hours || 0);
  const scheduled_days = scheduledDurationDays(job);

  const invoice_totals = invoices.map((inv) => {
    const computed = computeInvoice(inv);
    return {
      id: inv.id,
      number: inv.number || '',
      status: inv.status,
      total: fromCents(computed.total_cents),
      deposits_applied: Number(inv.deposits_applied) || 0,
      payments_applied: Number(inv.payments_applied) || 0,
      balance_due: inv.balance_due != null
        ? Number(inv.balance_due)
        : fromCents(Math.max(0, computed.total_cents
          - toCents(Number(inv.deposits_applied) || 0)
          - toCents(Number(inv.payments_applied) || 0))),
    };
  });
  const final_invoice_total = round2(invoice_totals.reduce((s, i) => s + i.total, 0));
  const payments_applied = round2(invoice_totals.reduce((s, i) => s + i.payments_applied, 0));
  const deposits_applied = round2(invoice_totals.reduce((s, i) => s + i.deposits_applied, 0));
  const balance_due = round2(invoice_totals.reduce((s, i) => s + i.balance_due, 0));

  const expense_total = round2(expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const materials_cost = round2(Number(job.materials_cost) || 0);
  const direct_costs = round2(expense_total + materials_cost);

  const revenue_for_profit = final_invoice_total > 0 ? final_invoice_total : estimated_revenue;
  const expected_gross_profit = round2(estimated_revenue - direct_costs);
  const actual_gross_profit = round2(revenue_for_profit - direct_costs);

  const problems = timeline.filter((e) => e?.type === 'problem').length;
  const change_requests = timeline.filter((e) => e?.type === 'change_request').length;

  return {
    job_id: job.id,
    crew_id: job.crew_id || null,
    title: job.title || '',
    status: job.status,
    review_status: job.review_status || null,
    estimated_hours,
    actual_hours,
    hours_variance: round2(actual_hours - estimated_hours),
    estimated_duration_hours,
    scheduled_days,
    estimated_revenue,
    original_estimate: original_invoice_estimate,
    approved_changes,
    final_invoice_total,
    invoice_variance: round2(final_invoice_total - estimated_revenue),
    deposits_applied,
    payments_applied,
    balance_due,
    materials_cost,
    expense_total,
    direct_costs,
    expected_gross_profit,
    actual_gross_profit,
    gross_profit_variance: round2(actual_gross_profit - expected_gross_profit),
    invoices: invoice_totals,
    problem_count: problems,
    change_request_count: change_requests,
    equipment_ids: job.equipment_ids || [],
  };
}

/**
 * Roll up per-crew dashboard metrics from job production rows.
 * @param {object[]} jobSummaries from summarizeJobProduction
 * @param {{ crew?: object }} [opts]
 */
export function summarizeCrewDashboard(jobSummaries, opts = {}) {
  const jobs = jobSummaries || [];
  const completed = jobs.filter((j) => j.status === 'Completed' || j.status === 'Paid'
    || j.status === 'Invoiced' || j.status === 'Waiting on payment' || j.status === 'Partial');
  const production_revenue = round2(completed.reduce((s, j) => s + (j.final_invoice_total || j.estimated_revenue || 0), 0));
  const direct_costs = round2(jobs.reduce((s, j) => s + (j.direct_costs || 0), 0));
  const gross_profit = round2(production_revenue - direct_costs);
  const actual_hours = round2(jobs.reduce((s, j) => s + (j.actual_hours || 0), 0));
  const estimated_hours = round2(jobs.reduce((s, j) => s + (j.estimated_hours || 0), 0));
  const durations = completed
    .map((j) => j.scheduled_days)
    .filter((d) => d != null && d > 0);
  const avg_job_duration_days = durations.length
    ? round2(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;
  const problems = jobs.reduce((s, j) => s + (j.problem_count || 0), 0);
  const change_requests = jobs.reduce((s, j) => s + (j.change_request_count || 0), 0);

  return {
    crew_id: opts.crew?.id || jobs[0]?.crew_id || null,
    crew_name: opts.crew?.name || null,
    jobs_total: jobs.length,
    jobs_completed: completed.length,
    production_revenue,
    direct_costs,
    gross_profit,
    estimated_hours,
    actual_hours,
    hours_variance: round2(actual_hours - estimated_hours),
    estimate_accuracy_hours: estimated_hours > 0
      ? round2(1 - Math.abs(actual_hours - estimated_hours) / estimated_hours)
      : null,
    average_job_duration_days: avg_job_duration_days,
    problem_count: problems,
    change_request_count: change_requests,
    jobs,
  };
}

/**
 * Load records needed for one job's production summary.
 * @param {any} db
 * @param {string} ownerId
 * @param {object} job
 */
export async function loadJobProduction(db, ownerId, job) {
  const jobId = job.id;
  const [estimates, changeOrders, invoices, expenses, timeRows, timeline] = await Promise.all([
    listJobDocuments(db, ownerId, 'Estimate', jobId),
    listJobDocuments(db, ownerId, 'ChangeOrder', jobId),
    listJobDocuments(db, ownerId, 'Invoice', jobId),
    listJobDocuments(db, ownerId, 'Expense', jobId),
    db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [ownerId, 'TimeEntry', jobId])
      .then((rows) => rows.map(decode))
      .catch(async () => {
        // TimeEntry may not always set parent_id — fall back to scan.
        const rows = await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'TimeEntry']);
        return rows.map(decode).filter((e) => e.job_id === jobId);
      }),
    listJobDocuments(db, ownerId, 'TimelineEntry', jobId),
  ]);
  // Prefer filter if parent_id query returned empty but records exist without parent.
  let timeEntries = timeRows;
  if (!timeEntries.length) {
    const rows = await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'TimeEntry']);
    timeEntries = rows.map(decode).filter((e) => e.job_id === jobId);
  }
  return summarizeJobProduction({
    job, estimates, changeOrders, invoices, expenses, timeEntries, timeline,
  });
}

/**
 * Company-wide or single-crew dashboard.
 * @param {any} db
 * @param {string} ownerId
 * @param {{ crew_id?: string, jobs?: object[], crews?: object[] }} [opts]
 */
export async function loadCrewDashboards(db, ownerId, opts = {}) {
  const jobs = opts.jobs || (await db.all(
    'SELECT * FROM records WHERE owner_id = ? AND entity = ?',
    [ownerId, 'Job'],
  )).map(decode);
  const crews = opts.crews || (await db.all(
    'SELECT * FROM records WHERE owner_id = ? AND entity = ?',
    [ownerId, 'Crew'],
  )).map(decode);

  let scoped = jobs;
  if (opts.crew_id) scoped = jobs.filter((j) => j.crew_id === opts.crew_id);

  const summaries = [];
  for (const job of scoped) {
    summaries.push(await loadJobProduction(db, ownerId, job));
  }

  if (opts.crew_id) {
    const crew = crews.find((c) => c.id === opts.crew_id) || null;
    return {
      crews: [summarizeCrewDashboard(summaries, { crew })],
      jobs: summaries,
    };
  }

  const byCrew = new Map();
  for (const row of summaries) {
    const key = row.crew_id || '__unassigned__';
    if (!byCrew.has(key)) byCrew.set(key, []);
    byCrew.get(key).push(row);
  }
  const crewDashboards = [...byCrew.entries()].map(([key, rows]) => {
    const crew = key === '__unassigned__' ? null : crews.find((c) => c.id === key) || null;
    return summarizeCrewDashboard(rows, {
      crew: crew || (key === '__unassigned__' ? { id: null, name: 'Unassigned' } : { id: key, name: 'Crew' }),
    });
  });

  return { crews: crewDashboards, jobs: summaries };
}
