import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { money, shortDate } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NAV_ICONS } from "@/lib/navIcons";
import { JOB_STATUSES, jobBalance, paymentsByJobId } from "@/lib/jobFilters";
import { statusCardClass, statusColors } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

const AllJobsIcon = NAV_ICONS.allJobs;

export default function AllJobs() {
  const [jobs, setJobs] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    Promise.all([
      api.entities.Job.list("-created_date", 300),
      api.entities.TimelineEntry.list("-created_date", 1000),
    ])
      .then(([j, tl]) => {
        setJobs(j);
        setTimeline(tl);
      })
      .finally(() => setLoading(false));
  }, []);

  const paymentsMap = useMemo(() => paymentsByJobId(timeline), [timeline]);
  const shown = filter === "All" ? jobs : jobs.filter((j) => j.status === filter);
  const filterColors = filter === "All" ? null : statusColors(filter);

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="All Jobs"
        description={loading ? undefined : `${shown.length} shown`}
        secondary={
          <>
            <Link to="/jobs/active" className="text-sm font-medium text-primary hover:underline px-2">
              Active
            </Link>
            <Link to="/jobs/board" className="text-sm font-medium text-primary hover:underline px-2">
              Board
            </Link>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger
                className={cn(
                  "w-52 font-medium border-2",
                  filterColors ? cn(filterColors.border, filterColors.badge) : "border-border"
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All statuses</SelectItem>
                {JOB_STATUSES.map((s) => {
                  const c = statusColors(s);
                  return (
                    <SelectItem key={s} value={s} className={cn("font-medium", c.select)}>
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", c.swatch)} aria-hidden="true" />
                        {s}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </>
        }
      />

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <AllJobsIcon className="w-12 h-12 mx-auto mb-3 opacity-40" strokeWidth={1.5} />
          <p>No jobs here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((j) => {
            const balance = jobBalance(j, paymentsMap[j.id] || 0);
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
                <div className="text-right hidden sm:block">
                  {balance > 0 && <div className="text-xs font-semibold text-attention">{money(balance)} due</div>}
                  {j.start_date && <div className="text-xs text-muted-foreground">{shortDate(j.start_date)}</div>}
                </div>
                <StatusBadge status={j.status} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
