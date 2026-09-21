import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { money, shortDate } from "@/lib/format";
import { NAV_ICONS } from "@/lib/navIcons";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

const EstimatesIcon = NAV_ICONS.estimates;

/** Thin Estimates list — wires existing Estimate entities; create stays on the job. */
export default function Estimates() {
  const [estimates, setEstimates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.entities.Estimate.list("-updated_date", 300),
      api.entities.Job.list("-updated_date", 300),
    ])
      .then(([e, j]) => {
        setEstimates(e);
        setJobs(j);
      })
      .finally(() => setLoading(false));
  }, []);

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);
  const awaiting = useMemo(() => estimates.filter((e) => e.status === "sent").length, [estimates]);

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Estimates"
        description={
          loading
            ? undefined
            : `${estimates.length} estimate${estimates.length === 1 ? "" : "s"}${awaiting ? ` · ${awaiting} awaiting approval` : ""}`
        }
        secondary={
          <Link to="/jobs/action-items" className="text-sm font-medium text-primary hover:underline px-2">
            Action items
          </Link>
        }
      />

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : estimates.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <EstimatesIcon className="w-12 h-12 mx-auto mb-3 opacity-40" strokeWidth={1.5} />
          <p>No estimates yet. Use Quick Add → Estimate, or open a job’s Documents.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {estimates.map((est) => {
            const job = jobById[est.job_id];
            return (
              <Link
                key={est.id}
                to={est.job_id ? `/jobs/${est.job_id}` : "/jobs/active"}
                className={cn(
                  "block rounded-xl border p-4 hover:border-primary/40 transition-colors",
                  statusCardClass(est.status)
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground truncate">
                      {est.number || "Estimate"}
                      {job ? <span className="font-normal text-muted-foreground"> · {job.title}</span> : null}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {shortDate(est.date || est.updated_date || est.created_date)}
                      {est.total != null ? ` · ${money(est.total)}` : null}
                    </div>
                  </div>
                  <StatusBadge status={est.status} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
