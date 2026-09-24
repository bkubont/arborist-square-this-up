import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { JobCardDataProvider, JobCustomer, JobRunningTotal, JobQuickAdd } from "@/components/JobCardInfo";
import { money } from "@/lib/format";
import {
  hasOutstandingBalance,
  invoiceBalanceDue,
  invoicesByJobId,
  jobBalance,
  moneySummary,
  paymentsByJobId,
} from "@/lib/jobFilters";
import { NAV_ICONS } from "@/lib/navIcons";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

const MoneyIcon = NAV_ICONS.invoices;

export default function Outstanding() {
  return (
    <JobCardDataProvider>
      <OutstandingPage />
    </JobCardDataProvider>
  );
}

function OutstandingPage() {
  const [jobs, setJobs] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    return Promise.all([
      api.entities.Job.list("-updated_date", 300),
      api.entities.Estimate.list("-updated_date", 300),
      api.entities.ChangeOrder.list("-updated_date", 300),
      api.entities.Invoice.list("-updated_date", 300),
      api.entities.TimelineEntry.list("-created_date", 1000),
    ])
      .then(([j, e, c, inv, tl]) => {
        setJobs(j);
        setEstimates(e);
        setChangeOrders(c);
        setInvoices(inv);
        setTimeline(tl);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const paymentsMap = useMemo(() => paymentsByJobId(timeline), [timeline]);
  const invoiceByJob = useMemo(() => invoicesByJobId(invoices), [invoices]);
  const buckets = useMemo(
    () => moneySummary(jobs, estimates, changeOrders, invoices, timeline),
    [jobs, estimates, changeOrders, invoices, timeline]
  );
  const unpaid = useMemo(
    () => jobs.filter((j) => hasOutstandingBalance(j, paymentsMap[j.id] || 0, 0, invoiceByJob[j.id])),
    [jobs, paymentsMap, invoiceByJob]
  );
  const waitingApprovalDocs = useMemo(() => {
    const est = estimates.filter((e) => e.status === "sent").map((e) => ({ ...e, kind: "Estimate", entity: "Estimate" }));
    const cos = changeOrders.filter((c) => c.status === "sent").map((c) => ({ ...c, kind: "Change order", entity: "ChangeOrder" }));
    return [...est, ...cos];
  }, [estimates, changeOrders]);
  const waitingPaymentDocs = useMemo(
    () =>
      invoices
        .filter((inv) => inv.status === "sent" || inv.status === "partial")
        .map((inv) => ({ ...inv, kind: "Invoice", entity: "Invoice" })),
    [invoices]
  );

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Invoices"
        description={
          loading
            ? "Invoiced, received, outstanding, and waiting buckets"
            : `${unpaid.length} with balance · ${buckets.waitingPaymentCount} awaiting payment · ${buckets.waitingDocCount} awaiting approval`
        }
        secondary={
          <Link to="/estimates" className="text-sm font-medium text-primary hover:underline px-2">
            Estimates
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <SummaryCard label="Invoiced" value={loading ? "…" : money(buckets.invoiced)} />
        <SummaryCard label="Received" value={loading ? "…" : money(buckets.received)} />
        <SummaryCard label="Outstanding" value={loading ? "…" : money(buckets.outstanding)} attention />
        <SummaryCard
          label="Waiting for approval"
          value={loading ? "…" : money(buckets.waitingApproval)}
          hint={loading ? undefined : `${buckets.waitingDocCount} estimate/CO`}
          attention={buckets.waitingDocCount > 0}
          tone="approval"
        />
        <SummaryCard
          label="Waiting on payment"
          value={loading ? "…" : money(buckets.waitingPayment)}
          hint={loading ? undefined : `${buckets.waitingPaymentCount} invoice${buckets.waitingPaymentCount === 1 ? "" : "s"}`}
          attention={buckets.waitingPaymentCount > 0}
          tone="payment"
        />
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Needs payment</h2>
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : unpaid.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
            <MoneyIcon className="w-10 h-10 mx-auto mb-2 opacity-40" strokeWidth={1.5} />
            <p>No outstanding balances.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {unpaid.map((j) => {
              const balance = jobBalance(j, paymentsMap[j.id] || 0, 0, invoiceByJob[j.id]);
              return (
                <Link
                  key={j.id}
                  to={`/jobs/${j.id}`}
                  className={cn(
                    "flex items-center gap-3 bg-card rounded-xl border p-4 hover:shadow-sm transition-colors",
                    statusCardClass(j.status)
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground truncate">{j.title}</div>
                    <JobCustomer job={j} />
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-attention-payment">{money(balance)} due</div>
                    <JobRunningTotal job={j} className="text-xs font-medium text-muted-foreground" />
                    <div className="mt-1 flex justify-end">
                      <StatusBadge status={j.status} />
                    </div>
                  </div>
                  <JobQuickAdd job={j} onSaved={load} />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <DocSection
        title="Waiting for approval"
        subtitle="Estimates & change orders awaiting client sign"
        loading={loading}
        docs={waitingApprovalDocs}
        empty="No estimates or change orders awaiting client sign."
      />

      <DocSection
        title="Waiting on payment"
        subtitle="Invoices sent or partial — amount still due"
        loading={loading}
        docs={waitingPaymentDocs}
        empty="No invoices awaiting payment."
        amountFor={invoiceBalanceDue}
      />
    </div>
  );
}

function DocSection({ title, subtitle, loading, docs, empty, amountFor = undefined }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">{title}</h2>
      <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>
      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{empty}</p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <Link
              key={`${d.entity}-${d.id}`}
              to={`/jobs/${d.job_id}`}
              className={cn(
                "flex items-center gap-3 bg-card rounded-xl border p-4 hover:shadow-sm transition-colors",
                statusCardClass(d.status, { entity: d.entity })
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d.kind}</span>
                  <StatusBadge status={d.status} entity={d.entity} />
                </div>
                <div className="font-semibold text-foreground truncate">{d.number || d.title || d.id}</div>
              </div>
              <div className="text-sm font-semibold tabular-nums text-attention">
                {money(amountFor ? amountFor(d) : d.total ?? d.net_change ?? 0)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function SummaryCard({ label, value, hint = undefined, attention = false, tone = "base" }) {
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
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
