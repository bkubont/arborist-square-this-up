import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Calendar, AlertTriangle, Inbox } from "lucide-react";
import BrokenSquareMark, { BrokenSquareEmpty } from "@/components/BrokenSquareMark";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { money, shortDate, timeAgo } from "@/lib/format";
import { buildAttentionItems } from "@/lib/attentionItems";
import {
  ACTIVE_STATUSES,
  countByStatus,
  isWorkingJob,
  jobBalance,
  moneySummary,
  paymentsByJobId,
} from "@/lib/jobFilters";
import { NAV_ICONS } from "@/lib/navIcons";
import { cn } from "@/lib/utils";
import { statusCardClass } from "@/lib/statusColors";

const ACTIVITY_LABELS = {
  note: "Note",
  photo: "Photo",
  receipt: "Receipt",
  document: "Document",
  estimate_sent: "Estimate sent",
  estimate_signed: "Estimate signed",
  deposit_received: "Deposit received",
  invoice_sent: "Invoice sent",
  payment_received: "Payment received",
  status_change: "Status change",
  checklist: "Checklist",
  work_order_created: "Work order created",
  change_order_sent: "Change order sent",
  change_order_signed: "Change order signed",
  document_created: "Document created",
  document_voided: "Document voided",
};

const ACTIVE_PREVIEW = 8;
const ACTIVITY_PREVIEW = 10;

/**
 * Dashboard IA (design guide): Needs Attention → Summary → Active Jobs → Recent Activity.
 * Reuses existing money / action / job data; preserves links to Board, Action items, Invoices.
 */
export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.entities.Job.listAll("-updated_date"),
      api.entities.Estimate.list("-updated_date", 300),
      api.entities.ChangeOrder.list("-updated_date", 300),
      api.entities.Invoice.list("-updated_date", 300),
      api.entities.TimelineEntry.list("-created_date", 1000),
      api.entities.Expense.list("-created_date", 400),
    ])
      .then(([j, e, c, inv, tl, ex]) => {
        setJobs(j.filter(isWorkingJob));
        setEstimates(e);
        setChangeOrders(c);
        setInvoices(inv);
        setTimeline(tl);
        setExpenses(ex);
      })
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const active = useMemo(() => jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)), [jobs]);
  const statusCounts = useMemo(() => countByStatus(jobs), [jobs]);
  const paymentsMap = useMemo(() => paymentsByJobId(timeline), [timeline]);
  const moneyBuckets = useMemo(
    () => moneySummary(jobs, estimates, changeOrders, invoices, timeline),
    [jobs, estimates, changeOrders, invoices, timeline]
  );
  const unassignedReceipts = useMemo(
    () => expenses.filter((e) => e.photo_url && !e.job_id),
    [expenses]
  );

  const attentionRows = useMemo(
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

  const recentActivity = useMemo(() => {
    const jobById = Object.fromEntries(jobs.map((j) => [j.id, j]));
    return [...timeline]
      .sort((a, b) => String(b.created_date || b.at || "").localeCompare(String(a.created_date || a.at || "")))
      .slice(0, ACTIVITY_PREVIEW)
      .map((e) => ({
        entry: e,
        job: e.job_id ? jobById[e.job_id] : null,
      }));
  }, [timeline, jobs]);

  const attentionCount = attentionRows.length;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Dashboard"
        description={
          loading
            ? new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
            : `${attentionCount} need attention · ${active.length} active jobs`
        }
        secondary={
          <>
            <Link to="/jobs/action-items" className="text-sm font-medium text-primary hover:underline px-2">
              Action items
            </Link>
            <Link to="/jobs/board" className="text-sm font-medium text-primary hover:underline px-2">
              Board
            </Link>
          </>
        }
      />

      {/* 1. Needs Attention */}
      <Section
        title="Needs Attention"
        action={
          <Link to="/jobs/action-items" className="text-xs font-semibold text-primary hover:underline">
            View all
          </Link>
        }
      >
        {loading ? (
          <Loading />
        ) : attentionRows.length === 0 ? (
          <BrokenSquareEmpty title="All squared up" state="closed" className="py-8">
            Nothing needs attention right now.
          </BrokenSquareEmpty>
        ) : (
          <div className="space-y-2">
            {attentionRows.slice(0, 8).map((row) => (
              <AttentionRow key={row.id} row={row} />
            ))}
            {attentionRows.length > 8 && (
              <p className="text-xs text-muted-foreground px-1">
                +{attentionRows.length - 8} more — see{" "}
                <Link to="/jobs/action-items" className="text-primary hover:underline">
                  Action items
                </Link>
                {unassignedReceipts.length > 0 ? (
                  <>
                    ,{" "}
                    <Link to="/receipts" className="text-primary hover:underline">
                      Receipts
                    </Link>
                  </>
                ) : null}{" "}
                or{" "}
                <Link to="/jobs/outstanding" className="text-primary hover:underline">
                  Invoices
                </Link>
              </p>
            )}
          </div>
        )}
      </Section>

      {/* 2. Summary */}
      <Section title="Summary">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryLink
            to="/jobs/outstanding"
            label="Outstanding"
            value={loading ? "…" : money(moneyBuckets.outstanding)}
            hint={loading ? undefined : `${moneyBuckets.waitingPaymentCount} awaiting payment`}
            attention
          />
          <SummaryLink
            to="/jobs/outstanding"
            label="Waiting approval"
            value={loading ? "…" : money(moneyBuckets.waitingApproval)}
            hint={loading ? undefined : `${moneyBuckets.waitingDocCount} estimate/CO`}
            attention={moneyBuckets.waitingDocCount > 0}
            tone="approval"
          />
          <SummaryLink
            to="/jobs/active"
            label="Active jobs"
            value={loading ? "…" : String(active.length)}
            hint={loading ? undefined : `${jobs.length} total`}
          />
          <SummaryLink
            to="/jobs"
            label="By status"
            value={
              loading
                ? "…"
                : String(
                    ACTIVE_STATUSES.reduce((sum, s) => sum + (statusCounts[s] || 0), 0)
                  )
            }
            hint={
              loading
                ? undefined
                : `Lead ${(statusCounts["Plan / draft estimate"] || 0) + (statusCounts["Waiting on approval"] || 0)} · Work ${statusCounts["In progress"] || 0} · Pay ${statusCounts["Waiting on payment"] || 0}`
            }
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Link to="/jobs/outstanding" className="hover:text-primary hover:underline">
            Money / Invoices →
          </Link>
          <Link to="/jobs/action-items" className="hover:text-primary hover:underline">
            Action items →
          </Link>
          <Link to="/receipts" className="hover:text-primary hover:underline">
            Receipts{!loading && unassignedReceipts.length > 0 ? ` (${unassignedReceipts.length})` : ""} →
          </Link>
          <Link to="/jobs/board" className="hover:text-primary hover:underline">
            Board →
          </Link>
          <Link to="/estimates" className="hover:text-primary hover:underline">
            Estimates →
          </Link>
        </div>
      </Section>

      {/* 3. Active Jobs */}
      <Section
        title="Active Jobs"
        action={
          <Link to="/jobs/active" className="text-xs font-semibold text-primary hover:underline">
            View all
          </Link>
        }
      >
        {loading ? (
          <Loading />
        ) : active.length ? (
          <div className="space-y-2">
            {active.slice(0, ACTIVE_PREVIEW).map((j) => (
              <JobRow key={j.id} job={j} paymentsLogged={paymentsMap[j.id] || 0} />
            ))}
            {active.length > ACTIVE_PREVIEW && (
              <p className="text-xs text-muted-foreground px-1">
                +{active.length - ACTIVE_PREVIEW} more on{" "}
                <Link to="/jobs/active" className="text-primary hover:underline">
                  Jobs
                </Link>
              </p>
            )}
          </div>
        ) : (
          <Empty text="No active jobs. Use Quick Add → Job or open Customers." />
        )}
      </Section>

      {/* 4. Recent Activity */}
      <Section title="Recent Activity">
        {loading ? (
          <Loading />
        ) : recentActivity.length ? (
          <div className="space-y-2">
            {recentActivity.map(({ entry, job }) => (
              <ActivityRow key={entry.id} entry={entry} job={job} />
            ))}
          </div>
        ) : (
          <Empty text="No recent activity yet." />
        )}
      </Section>
    </div>
  );
}

function AttentionRow({ row }) {
  const Icon = NAV_ICONS.actionItems;
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
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5 hover:shadow-sm transition-colors",
        toneClass
      )}
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
          <Icon className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-foreground truncate">{row.title}</div>
        <div
          className={cn(
            "text-xs font-medium mt-0.5 truncate",
            row.tone === "payment" ? "text-attention-payment" : "text-attention"
          )}
        >
          {row.detail}
        </div>
        {row.cta ? (
          <div className="text-xs font-semibold text-primary mt-1 inline-flex items-center gap-1">
            {row.cta}
            <BrokenSquareMark state="open" size={11} tone="brand" className="opacity-80" />
          </div>
        ) : null}
      </div>
      {row.status ? <StatusBadge status={row.status} className="shrink-0" /> : null}
    </Link>
  );
}

function SummaryLink({ to, label, value, hint = null, attention = false, tone = null }) {
  return (
    <Link
      to={to}
      className={cn(
        "block rounded-xl border bg-card p-3.5 transition-all hover:shadow-sm hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        attention && tone === "approval" && "border-attention-approval-border",
        attention && !tone && "border-attention-border"
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-lg font-bold tabular-nums mt-1",
          attention ? (tone === "approval" ? "text-attention-approval" : "text-attention") : "text-foreground"
        )}
      >
        {value}
      </div>
      {hint ? <div className="text-xs text-muted-foreground mt-0.5 truncate">{hint}</div> : null}
    </Link>
  );
}

function Section({ title, children, action = null }) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function JobRow({ job, paymentsLogged = 0 }) {
  const balance = jobBalance(job, paymentsLogged);
  return (
    <Link
      to={`/jobs/${job.id}`}
      className={cn(
        "block bg-card rounded-xl border p-4 hover:shadow-sm transition-all",
        statusCardClass(job.status)
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-foreground truncate">{job.title}</div>
          <div className="text-sm text-muted-foreground truncate">{job.client_name || "—"}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={job.status} />
          {balance > 0 && <span className="text-xs font-semibold text-attention">{money(balance)} due</span>}
        </div>
      </div>
      {(job.start_date || job.end_date) && (
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3" strokeWidth={1.75} />
          {shortDate(job.start_date)} {job.end_date && `→ ${shortDate(job.end_date)}`}
        </div>
      )}
    </Link>
  );
}

function ActivityRow({ entry, job }) {
  const at = entry.at || entry.created_date;
  const label = ACTIVITY_LABELS[entry.type] || entry.type || "Activity";
  const detail = entry.text || (entry.amount != null ? money(entry.amount) : null);
  const inner = (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3.5 hover:border-brand/40 transition-colors">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate">
          {label}
          {job ? <span className="font-normal text-muted-foreground"> · {job.title}</span> : null}
        </div>
        {detail ? <div className="text-xs text-muted-foreground mt-0.5 truncate">{detail}</div> : null}
      </div>
      <div className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{at ? timeAgo(at) : ""}</div>
    </div>
  );
  if (entry.job_id) {
    return (
      <Link to={`/jobs/${entry.job_id}`} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

function Loading() {
  return (
    <div className="text-muted-foreground text-sm py-6 flex items-center gap-2">
      <BrokenSquareMark state="open" size={14} tone="muted" className="opacity-50 animate-pulse" />
      Loading…
    </div>
  );
}
function Empty({ text }) {
  return <div className="text-muted-foreground text-sm py-6">{text}</div>;
}
