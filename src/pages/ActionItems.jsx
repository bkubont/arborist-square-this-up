import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { JobCardDataProvider, JobCustomer, JobRunningTotal, JobQuickAdd } from "@/components/JobCardInfo";
import { collectActionItems, isWorkingJob } from "@/lib/jobFilters";
import { NAV_ICONS } from "@/lib/navIcons";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

const ActionIcon = NAV_ICONS.actionItems;

export default function ActionItems() {
  return (
    <JobCardDataProvider>
      <ActionItemsPage />
    </JobCardDataProvider>
  );
}

function ActionItemsPage() {
  const [jobs, setJobs] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.entities.Job.listAll("-updated_date"),
      api.entities.Estimate.list("-updated_date", 300),
      api.entities.ChangeOrder.list("-updated_date", 300),
    ])
      .then(([j, e, c]) => {
        setJobs(j.filter(isWorkingJob));
        setEstimates(e);
        setChangeOrders(c);
      })
      .finally(() => setLoading(false));
  }, []);

  const items = useMemo(
    () => collectActionItems(jobs, estimates, changeOrders),
    [jobs, estimates, changeOrders]
  );

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Action items"
        description={
          loading
            ? "Jobs blocked by materials or waiting on estimate / change-order approval"
            : `${items.length} item${items.length === 1 ? "" : "s"} · materials or approval`
        }
        secondary={
          <Link to="/jobs/outstanding" className="text-sm font-medium text-primary hover:underline px-2">
            Invoices
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
          {items.map(({ job, reasons }) => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className={cn(
                "flex items-start gap-3 bg-card rounded-xl border p-4 hover:shadow-sm transition-colors",
                statusCardClass(job.status)
              )}
            >
              <div className="w-9 h-9 rounded-lg bg-attention-muted text-attention-muted-foreground flex items-center justify-center shrink-0">
                <ActionIcon className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground truncate">{job.title}</div>
                <JobCustomer job={job} />
                <div className="text-xs font-medium text-attention mt-1">{reasons.join(" · ")}</div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusBadge status={job.status} />
                <JobRunningTotal job={job} />
              </div>
              <JobQuickAdd job={job} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
