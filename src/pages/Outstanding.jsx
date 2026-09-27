import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import MoneyGroups from "@/components/MoneyGroups";
import { money } from "@/lib/format";
import {
  invoiceBalanceDue,
  isWorkingJob,
  moneyGroups,
} from "@/lib/jobFilters";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

export default function Outstanding() {
  return <OutstandingPage />;
}

function OutstandingPage() {
  const [searchParams] = useSearchParams();
  const group = searchParams.get("group") || "";
  const [jobs, setJobs] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    return Promise.all([
      api.entities.Job.listAll("-updated_date"),
      api.entities.Estimate.list("-updated_date", 300),
      api.entities.ChangeOrder.list("-updated_date", 300),
      api.entities.Invoice.list("-updated_date", 300),
      api.entities.TimelineEntry.list("-created_date", 1000),
    ])
      .then(([j, e, c, inv, tl]) => {
        setJobs(j.filter(isWorkingJob));
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

  const groups = useMemo(
    () => moneyGroups({ jobs, estimates, invoices, timeline }),
    [jobs, estimates, invoices, timeline]
  );
  const activeGroup = groups[group] ? group : "";
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
            : "Issued invoices, uninvoiced deposits, and unbilled work — separate scopes"
        }
        secondary={
          <Link to="/estimates" className="text-sm font-medium text-primary hover:underline px-2">
            Estimates
          </Link>
        }
      />

      <div className="mb-6">
        <MoneyGroups groups={groups} loading={loading} activeGroup={activeGroup} />
      </div>

      {(activeGroup ? [activeGroup] : ["issued", "deposits", "unbilled"]).map((key) => (
        <RecordSection
          key={key}
          title={groups[key].label}
          subtitle={groups[key].scope}
          loading={loading}
          records={groups[key].records}
          empty={`Nothing in ${groups[key].label.toLowerCase()}.`}
          showInvoiceFigures={key === "issued"}
        />
      ))}

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

function RecordSection({ title, subtitle, loading, records, empty, showInvoiceFigures = false }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">{title}</h2>
      <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>
      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{empty}</p>
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <Link
              key={record.id}
              to={record.to}
              className="flex items-center gap-3 bg-card rounded-xl border border-border p-4 hover:shadow-sm transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground truncate">{record.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{record.detail}</div>
              </div>
              <div className="text-right shrink-0 text-sm tabular-nums">
                {showInvoiceFigures ? (
                  <>
                    <div className="text-foreground font-semibold">{money(record.remaining)} remaining</div>
                    <div className="text-[11px] text-muted-foreground">
                      {money(record.billed)} billed · {money(record.applied)} applied
                    </div>
                  </>
                ) : (
                  <div className="font-semibold text-foreground">{money(record.amount)}</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
