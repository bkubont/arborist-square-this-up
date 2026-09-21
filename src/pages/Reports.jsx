import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { money } from "@/lib/format";
import {
  countByStatus,
  JOB_STATUSES,
  moneySummary,
} from "@/lib/jobFilters";
import { NAV_ICONS } from "@/lib/navIcons";

const ReportsIcon = NAV_ICONS.reports;

/**
 * Reports — lean read-only rollups from jobs / docs / financials (no BI).
 */
export default function Reports() {
  const [jobs, setJobs] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.entities.Job.list("-updated_date", 400),
      api.entities.Estimate.list("-updated_date", 300),
      api.entities.ChangeOrder.list("-updated_date", 300),
      api.entities.Invoice.list("-updated_date", 300),
      api.entities.TimelineEntry.list("-created_date", 500),
      api.entities.Expense.list("-created_date", 400),
    ])
      .then(([j, e, c, inv, tl, ex]) => {
        setJobs(j);
        setEstimates(e);
        setChangeOrders(c);
        setInvoices(inv);
        setTimeline(tl);
        setExpenses(ex);
      })
      .finally(() => setLoading(false));
  }, []);

  const buckets = useMemo(
    () => moneySummary(jobs, estimates, changeOrders, invoices, timeline),
    [jobs, estimates, changeOrders, invoices, timeline]
  );

  const statusCounts = useMemo(() => countByStatus(jobs), [jobs]);

  const materialsCost = useMemo(
    () => jobs.reduce((sum, j) => sum + (Number(j.materials_cost) || 0), 0),
    [jobs]
  );

  const expenseTotal = useMemo(
    () => expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [expenses]
  );

  const empty = !loading && jobs.length === 0 && expenses.length === 0;

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Reports"
        description={
          loading
            ? "Money, jobs, and materials at a glance"
            : `${jobs.length} job${jobs.length === 1 ? "" : "s"} · read-only rollups`
        }
        secondary={
          <Link to="/jobs/outstanding" className="text-sm font-medium text-primary hover:underline px-2">
            Invoices
          </Link>
        }
      />

      {empty ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
          <ReportsIcon className="w-12 h-12 mx-auto mb-3 opacity-40" strokeWidth={1.5} />
          <p className="font-medium text-foreground mb-1">Nothing to report yet</p>
          <p className="text-sm max-w-sm mx-auto">
            Add jobs and documents — money outstanding, status counts, and materials cost will show up here.
          </p>
        </div>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Money</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard label="Received" value={loading ? "…" : money(buckets.received)} />
              <StatCard label="Outstanding" value={loading ? "…" : money(buckets.outstanding)} attention />
              <StatCard label="Invoiced" value={loading ? "…" : money(buckets.invoiced)} />
              <StatCard
                label="Waiting for approval"
                value={loading ? "…" : money(buckets.waitingApproval)}
                hint={loading ? undefined : `${buckets.waitingDocCount} estimate/CO`}
                tone="approval"
              />
              <StatCard
                label="Waiting on payment"
                value={loading ? "…" : money(buckets.waitingPayment)}
                hint={loading ? undefined : `${buckets.waitingPaymentCount} invoice${buckets.waitingPaymentCount === 1 ? "" : "s"}`}
                tone="payment"
              />
              <StatCard
                label="Logged expenses"
                value={loading ? "…" : money(expenseTotal)}
                hint={loading ? undefined : `${expenses.length} record${expenses.length === 1 ? "" : "s"}`}
              />
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Jobs by status</h2>
            {loading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No jobs yet.</p>
            ) : (
              <div className="space-y-2">
                {JOB_STATUSES.map((status) => {
                  const count = statusCounts[status] || 0;
                  if (!count) return null;
                  return (
                    <div
                      key={status}
                      className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
                    >
                      <StatusBadge status={status} />
                      <span className="text-sm font-semibold tabular-nums text-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Materials cost</h2>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground mb-1">From job material order rollups</div>
              <div className="text-2xl font-bold tabular-nums text-foreground">
                {loading ? "…" : money(materialsCost)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Derived from Material Orders on jobs — not edited here. Open a job’s Costs tab for detail.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, hint = undefined, attention = false, tone = "base" }) {
  const valueClass =
    tone === "approval"
      ? "text-attention-approval"
      : tone === "payment"
        ? "text-attention-payment"
        : attention
          ? "text-attention"
          : "text-foreground";
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${valueClass}`}>{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div> : null}
    </div>
  );
}
