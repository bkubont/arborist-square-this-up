import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Calendar } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { money, shortDate } from "@/lib/format";
import {
  ACTIVE_STATUSES,
  JOB_STATUSES,
  collectActionItems,
  countByStatus,
  jobBalance,
  moneySummary,
} from "@/lib/jobFilters";
import { NAV_ICONS } from "@/lib/navIcons";
import { cn } from "@/lib/utils";
import { statusCardClass } from "@/lib/statusColors";

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.entities.Job.list("-created_date", 300),
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

  const today = new Date().toISOString().slice(0, 10);
  const active = useMemo(() => jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)), [jobs]);
  const todayJobs = useMemo(() => jobs.filter((j) => j.start_date === today), [jobs, today]);
  const statusCounts = useMemo(() => countByStatus(jobs), [jobs]);
  const moneyBuckets = useMemo(() => moneySummary(jobs, estimates, changeOrders), [jobs, estimates, changeOrders]);
  const actionItems = useMemo(
    () => collectActionItems(jobs, estimates, changeOrders),
    [jobs, estimates, changeOrders]
  );

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Today</h1>
        <p className="text-muted-foreground text-sm">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <MoneyTile loading={loading} buckets={moneyBuckets} />
        <JobsTile loading={loading} total={jobs.length} counts={statusCounts} />
        <ActionItemsTile loading={loading} count={actionItems.length} items={actionItems.slice(0, 3)} />
      </div>

      <Section title="Today's Jobs">
        {loading ? (
          <Loading />
        ) : todayJobs.length ? (
          <div className="space-y-2">
            {todayJobs.map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </div>
        ) : (
          <Empty text="No jobs scheduled for today." />
        )}
      </Section>

      <Section title="Active Jobs">
        {loading ? (
          <Loading />
        ) : active.length ? (
          <div className="space-y-2">
            {active.map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </div>
        ) : (
          <Empty text="No active jobs. Create one from Clients." />
        )}
      </Section>
    </div>
  );
}

function MoneyTile({ loading, buckets }) {
  const Icon = NAV_ICONS.money;
  return (
    <Link
      to="/jobs/outstanding"
      className="block bg-card rounded-xl border border-border p-4 transition-all hover:shadow-sm hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-brand-muted text-brand-muted-foreground">
          <Icon className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Money</div>
          <div className="text-sm font-bold text-attention">
            {loading ? "…" : `${money(buckets.outstanding)} due`}
          </div>
        </div>
      </div>
      <dl className="space-y-1.5 text-sm">
        <BucketRow label="Invoiced" value={loading ? "…" : money(buckets.invoiced)} />
        <BucketRow label="Received" value={loading ? "…" : money(buckets.received)} />
        <BucketRow label="Outstanding" value={loading ? "…" : money(buckets.outstanding)} attention />
        <BucketRow
          label="Waiting approval"
          value={
            loading
              ? "…"
              : buckets.waitingDocCount
                ? `${money(buckets.waitingApproval)} · ${buckets.waitingDocCount}`
                : money(0)
          }
          attention={buckets.waitingDocCount > 0}
        />
      </dl>
    </Link>
  );
}

function JobsTile({ loading, total, counts }) {
  const Icon = NAV_ICONS.allJobs;
  return (
    <div className="bg-card rounded-xl border border-border p-4 transition-all hover:shadow-sm hover:border-brand">
      <div className="flex items-center justify-between gap-2 mb-3">
        <Link to="/jobs" className="flex items-center gap-2 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-brand-muted text-brand-muted-foreground shrink-0">
            <Icon className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Jobs</div>
            <div className="text-sm font-bold text-foreground">{loading ? "…" : `${total} total`}</div>
          </div>
        </Link>
        <Link to="/jobs/board" className="text-xs font-semibold text-primary hover:underline shrink-0">
          Board
        </Link>
      </div>
      <Link to="/jobs" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          {JOB_STATUSES.map((status) => (
            <BucketRow key={status} label={shortStatus(status)} value={loading ? "…" : String(counts[status] || 0)} compact />
          ))}
        </dl>
      </Link>
    </div>
  );
}

function ActionItemsTile({ loading, count, items }) {
  const Icon = NAV_ICONS.actionItems;
  return (
    <Link
      to="/jobs/action-items"
      className="block bg-card rounded-xl border border-border p-4 transition-all hover:shadow-sm hover:border-attention focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-attention-muted text-attention-muted-foreground">
          <Icon className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action items</div>
          <div className="text-sm font-bold text-attention">{loading ? "…" : `${count} need attention`}</div>
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : count === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing blocked right now.</p>
      ) : (
        <ul className="space-y-2">
          {items.map(({ job, reasons }) => (
            <li key={job.id} className="text-sm min-w-0">
              <div className="font-medium text-foreground truncate">{job.title}</div>
              <div className="text-xs text-attention truncate">{reasons.join(" · ")}</div>
            </li>
          ))}
          {count > items.length && (
            <li className="text-xs text-muted-foreground">+{count - items.length} more</li>
          )}
        </ul>
      )}
    </Link>
  );
}

function BucketRow({ label, value, attention = false, compact = false }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2", compact && "gap-1")}>
      <dt className={cn("text-muted-foreground truncate", compact ? "text-xs" : "text-xs")}>{label}</dt>
      <dd className={cn("font-semibold tabular-nums shrink-0", attention ? "text-attention" : "text-foreground", compact && "text-xs")}>
        {value}
      </dd>
    </div>
  );
}

function shortStatus(status) {
  if (status === "Waiting on Materials") return "Materials";
  if (status === "In Progress") return "In progress";
  return status;
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</h2>
      {children}
    </div>
  );
}

function JobRow({ job }) {
  const balance = jobBalance(job);
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

function Loading() {
  return <div className="text-muted-foreground text-sm py-6">Loading…</div>;
}
function Empty({ text }) {
  return <div className="text-muted-foreground text-sm py-6">{text}</div>;
}
