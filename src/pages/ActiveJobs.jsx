import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import JobFormDialog from "@/components/JobFormDialog";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { money, shortDate } from "@/lib/format";
import { isActiveJob, isWorkingJob, jobBalance, paymentsByJobId } from "@/lib/jobFilters";
import { NAV_ICONS } from "@/lib/navIcons";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

const ActiveIcon = NAV_ICONS.jobs;

export default function ActiveJobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [clients, setClients] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jobDialog, setJobDialog] = useState(false);

  useEffect(() => {
    Promise.all([
      api.entities.Job.listAll("-updated_date"),
      api.entities.Client.list("-created_date", 200),
      api.entities.TimelineEntry.list("-created_date", 1000),
    ])
      .then(([j, c, tl]) => {
        setJobs(j.filter((job) => isWorkingJob(job) && isActiveJob(job)));
        setClients(c);
        setTimeline(tl);
      })
      .finally(() => setLoading(false));
  }, []);

  const paymentsMap = useMemo(() => paymentsByJobId(timeline), [timeline]);

  const saveJob = async (form) => {
    const created = await api.entities.Job.create(form);
    setJobDialog(false);
    navigate(`/jobs/${created.id}`);
  };

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Jobs"
        description={
          loading
            ? "Lead, working, and payment jobs in play"
            : `${jobs.length} active · non-terminal statuses across all phases`
        }
        primaryAction={
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setJobDialog(true)}
          >
            <Plus className="w-4 h-4 mr-1" /> New Job
          </Button>
        }
        secondary={
          <>
            <Link to="/jobs" className="text-sm font-medium text-primary hover:underline px-2">
              All Jobs
            </Link>
            <Link to="/jobs/archive" className="text-sm font-medium text-primary hover:underline px-2">
              Archive
            </Link>
            <Link to="/jobs/board" className="text-sm font-medium text-primary hover:underline px-2">
              Board
            </Link>
          </>
        }
      />

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

      <JobFormDialog open={jobDialog} onOpenChange={setJobDialog} onSave={saveJob} clients={clients} />
    </div>
  );
}
