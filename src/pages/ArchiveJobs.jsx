import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { money, shortDate } from "@/lib/format";
import { NAV_ICONS } from "@/lib/navIcons";
import { depositsByJobId, invoicesByJobId, isArchivedJob, jobBalance, paymentsByJobId } from "@/lib/jobFilters";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

const ArchiveIcon = NAV_ICONS.archive;

export default function ArchiveJobs() {
  const [jobs, setJobs] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.entities.Job.listAll("-updated_date"),
      api.entities.TimelineEntry.list("-created_date", 1000),
      api.entities.Invoice.list("-updated_date", 500),
    ])
      .then(([j, tl, inv]) => {
        setJobs(j.filter(isArchivedJob));
        setTimeline(tl);
        setInvoices(inv);
      })
      .finally(() => setLoading(false));
  }, []);

  const paymentsMap = useMemo(() => paymentsByJobId(timeline), [timeline]);
  const depositsMap = useMemo(() => depositsByJobId(timeline), [timeline]);
  const invoiceMap = useMemo(() => invoicesByJobId(invoices), [invoices]);

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Archive"
        description={loading ? "Paid, declined, and cancelled jobs" : `${jobs.length} archived`}
        secondary={
          <>
            <Link to="/jobs/active" className="text-sm font-medium text-primary hover:underline px-2">
              Active
            </Link>
            <Link to="/jobs" className="text-sm font-medium text-primary hover:underline px-2">
              All Jobs
            </Link>
          </>
        }
      />

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ArchiveIcon className="w-12 h-12 mx-auto mb-3 opacity-40" strokeWidth={1.5} />
          <p>No archived jobs yet.</p>
          <p className="text-sm mt-2">Jobs move here when marked Completed or Paid.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => {
            const balance = jobBalance(j, paymentsMap[j.id] || 0, depositsMap[j.id] || 0, invoiceMap[j.id]);
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
                  {j.archived_at && (
                    <div className="text-xs text-muted-foreground mt-0.5">Archived {shortDate(j.archived_at)}</div>
                  )}
                </div>
                <div className="text-right hidden sm:block">
                  {balance > 0 && <div className="text-xs font-semibold text-attention">{money(balance)} due</div>}
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
