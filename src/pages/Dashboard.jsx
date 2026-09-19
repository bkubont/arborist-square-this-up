import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Calendar } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { money, shortDate } from "@/lib/format";
import { ACTIVE_STATUSES, jobBalance } from "@/lib/jobFilters";
import { NAV_ICONS } from "@/lib/navIcons";

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.entities.Job.list("-created_date", 200).then((data) => {
      setJobs(data);
      setLoading(false);
    });
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const active = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
  const todayJobs = jobs.filter((j) => j.start_date === today);
  const owed = jobs.reduce((sum, j) => sum + jobBalance(j), 0);

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Today</h1>
        <p className="text-muted-foreground text-sm">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard
          to="/jobs/active"
          label="Active Jobs"
          value={active.length}
          icon={NAV_ICONS.activeJobs}
          tint="bg-brand-muted text-brand-muted-foreground"
        />
        <StatCard
          to="/jobs/outstanding"
          label="Outstanding"
          value={money(owed)}
          icon={NAV_ICONS.outstanding}
          tint="bg-attention-muted text-attention-muted-foreground"
          attention
        />
        <StatCard
          to="/jobs"
          label="Total Jobs"
          value={jobs.length}
          icon={NAV_ICONS.allJobs}
          tint="bg-secondary text-secondary-foreground"
        />
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

function StatCard({ to, label, value, icon: Icon, tint, attention = false }) {
  return (
    <Link
      to={to}
      className={cnStat(
        "block bg-card rounded-xl border border-border p-4 transition-all hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        attention ? "hover:border-attention" : "hover:border-brand"
      )}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${tint}`}>
        <Icon className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${attention ? "text-attention" : "text-foreground"}`}>{value}</div>
    </Link>
  );
}

function cnStat(...parts) {
  return parts.filter(Boolean).join(" ");
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
      className="block bg-card rounded-xl border border-border p-4 hover:border-brand hover:shadow-sm transition-all"
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
