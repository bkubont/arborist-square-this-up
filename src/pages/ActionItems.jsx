import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, AlertTriangle, Inbox } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { buildAttentionItems } from "@/lib/attentionItems";
import { addCalendarDays, todayKey } from "@/lib/format";
import { isWorkingJob } from "@/lib/jobFilters";
import { NAV_ICONS } from "@/lib/navIcons";
import { cn } from "@/lib/utils";

const ActionIcon = NAV_ICONS.actionItems;

/**
 * Same rows as Dashboard "Needs Attention" — receipts, materials/approvals, payments, and schedule.
 */
export default function ActionItems() {
  const [jobs, setJobs] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.entities.Job.listAll("-updated_date"),
      api.entities.Estimate.list("-updated_date", 300),
      api.entities.ChangeOrder.list("-updated_date", 300),
      api.entities.Invoice.list("-updated_date", 300),
      api.entities.Expense.list("-created_date", 400),
    ])
      .then(([j, e, c, inv, ex]) => {
        setJobs(j.filter(isWorkingJob));
        setEstimates(e);
        setChangeOrders(c);
        setInvoices(inv);
        setExpenses(ex);
      })
      .finally(() => setLoading(false));
  }, []);

  const today = todayKey();
  const tomorrow = useMemo(() => addCalendarDays(today, 1), [today]);
  const items = useMemo(
    () =>
      buildAttentionItems({
        jobs,
        estimates,
        changeOrders,
        invoices,
        expenses,
        today,
        tomorrow,
      }),
    [jobs, estimates, changeOrders, invoices, expenses, today, tomorrow]
  );

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Needs Attention"
        description={
          loading
            ? "Receipts, materials and approvals, payments, and jobs scheduled today or tomorrow"
            : `${items.length} item${items.length === 1 ? "" : "s"} · same list as the dashboard`
        }
        secondary={
          <Link to="/" className="text-sm font-medium text-primary hover:underline px-2">
            Dashboard
          </Link>
        }
      />

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ActionIcon className="w-12 h-12 mx-auto mb-3 opacity-40" strokeWidth={1.5} />
          <p>Nothing needs attention right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((row) => (
            <AttentionRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function AttentionRow({ row }) {
  const toneClass =
    row.tone === "payment"
      ? "border-attention-payment-border bg-attention-payment-muted/30"
      : row.tone === "receipt"
        ? "border-attention-border bg-attention-muted/25"
        : row.tone === "schedule"
          ? "border-border bg-card"
          : "border-attention-border bg-attention-muted/20";
  return (
    <Link
      to={row.to}
      className={cn("flex items-start gap-3 rounded-xl border p-4 hover:shadow-sm transition-colors", toneClass)}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
          row.tone === "payment"
            ? "bg-attention-payment-muted text-attention-payment-foreground"
            : "bg-attention-muted text-attention-muted-foreground"
        )}
      >
        {row.tone === "schedule" ? (
          <Calendar className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
        ) : row.tone === "payment" ? (
          <AlertTriangle className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
        ) : row.tone === "receipt" ? (
          <Inbox className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <ActionIcon className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-foreground">{row.title}</div>
        <div className={cn("text-xs font-medium mt-0.5", row.tone === "payment" ? "text-foreground" : "text-foreground")}>
          {row.detail}
        </div>
        {row.cta ? <div className="text-xs font-semibold text-primary mt-1">{row.cta}</div> : null}
      </div>
      {row.status ? <StatusBadge status={row.status} className="shrink-0" /> : null}
    </Link>
  );
}
