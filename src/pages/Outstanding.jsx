import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import StatusBadge from "@/components/StatusBadge";
import { money } from "@/lib/format";
import { hasOutstandingBalance, jobBalance, moneySummary } from "@/lib/jobFilters";
import { NAV_ICONS } from "@/lib/navIcons";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

const MoneyIcon = NAV_ICONS.money;

export default function Outstanding() {
  const [jobs, setJobs] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.entities.Job.list("-updated_date", 300),
      api.entities.Estimate.list("-updated_date", 300),
      api.entities.ChangeOrder.list("-updated_date", 300),
    ])
      .then(([j, e, c]) => {
        setJobs(j);
        setEstimates(e);
        setChangeOrders(c);
      })
      .finally(() => setLoading(false));
  }, []);

  const buckets = useMemo(() => moneySummary(jobs, estimates, changeOrders), [jobs, estimates, changeOrders]);
  const unpaid = useMemo(() => jobs.filter(hasOutstandingBalance), [jobs]);
  const waitingDocs = useMemo(() => {
    const est = estimates.filter((e) => e.status === "sent").map((e) => ({ ...e, kind: "Estimate" }));
    const cos = changeOrders.filter((c) => c.status === "sent").map((c) => ({ ...c, kind: "Change order" }));
    return [...est, ...cos];
  }, [estimates, changeOrders]);

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Money</h1>
        <p className="text-sm text-muted-foreground">Invoiced, received, outstanding, and docs waiting on approval</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Invoiced" value={loading ? "…" : money(buckets.invoiced)} />
        <SummaryCard label="Received" value={loading ? "…" : money(buckets.received)} />
        <SummaryCard label="Outstanding" value={loading ? "…" : money(buckets.outstanding)} attention />
        <SummaryCard
          label="Waiting approval"
          value={loading ? "…" : money(buckets.waitingApproval)}
          hint={loading ? undefined : `${buckets.waitingDocCount} doc${buckets.waitingDocCount === 1 ? "" : "s"}`}
          attention={buckets.waitingDocCount > 0}
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
              const balance = jobBalance(j);
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
                    <div className="text-sm text-muted-foreground truncate">{j.client_name || "—"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-attention">{money(balance)}</div>
                    <div className="mt-1 flex justify-end">
                      <StatusBadge status={j.status} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Waiting for approval
        </h2>
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : waitingDocs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No estimates or change orders awaiting client sign.</p>
        ) : (
          <div className="space-y-2">
            {waitingDocs.map((d) => (
              <Link
                key={`${d.kind}-${d.id}`}
                to={`/jobs/${d.job_id}`}
                className="flex items-center gap-3 bg-card rounded-xl border border-border p-4 hover:border-attention transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-attention">{d.kind} · sent</div>
                  <div className="font-semibold text-foreground truncate">{d.number || d.title || d.id}</div>
                </div>
                <div className="text-sm font-semibold text-attention tabular-nums">
                  {money(d.total ?? d.net_change ?? 0)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, hint, attention = false }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${attention ? "text-attention" : "text-foreground"}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
