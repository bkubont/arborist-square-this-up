import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import StatusBadge from "@/components/StatusBadge";
import { money, shortDate } from "@/lib/format";
import { isActiveJob, jobBalance } from "@/lib/jobFilters";
import { NAV_ICONS } from "@/lib/navIcons";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

const ActiveIcon = NAV_ICONS.activeJobs;

export default function ActiveJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.entities.Job.list("-created_date", 300).then((d) => {
      setJobs(d.filter(isActiveJob));
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Active Jobs</h1>
        <p className="text-sm text-muted-foreground">Estimate, Scheduled, In Progress, or Waiting on Materials</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ActiveIcon className="w-12 h-12 mx-auto mb-3 opacity-40" strokeWidth={1.5} />
          <p>No active jobs.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => {
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
                <div className="text-right hidden sm:block">
                  {balance > 0 && (
                    <div className="text-xs font-semibold text-attention">{money(balance)} due</div>
                  )}
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
