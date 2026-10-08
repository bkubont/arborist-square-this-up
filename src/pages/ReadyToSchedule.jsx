import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarPlus, Filter, ListChecks } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import ScheduleJobDialog from "@/components/ScheduleJobDialog";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { READY_TO_SCHEDULE_STATUS } from "@/lib/jobStatus";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { userCan } from "@/lib/permissions";

const URGENCY_OPTIONS = [
  { value: "all", label: "Any urgency" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function PrereqFlags({ job, property }) {
  const approval = job.prereq_approval !== false; // Ready queue implies approved estimate
  const deposit = job.prereq_deposit != null
    ? Boolean(job.prereq_deposit)
    : Number(job.deposit_amount) > 0;
  const access = job.prereq_access != null
    ? Boolean(job.prereq_access)
    : Boolean(String(property?.access_notes || "").trim());
  const items = [
    { key: "approval", label: "Approval", ok: approval },
    { key: "deposit", label: "Deposit", ok: deposit },
    { key: "access", label: "Access", ok: access },
  ];
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={`rts-prereqs-${job.id}`}>
      {items.map((p) => (
        <span
          key={p.key}
          className={cn(
            "text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border",
            p.ok
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-amber-50 text-amber-900 border-amber-200",
          )}
        >
          {p.label}{p.ok ? "" : "?"}
        </span>
      ))}
    </div>
  );
}

/**
 * Ready to Schedule queue — approved jobs waiting for crew/date assignment.
 * Filters: area, capability, duration, urgency (Phase 3). Schedule action (Phase 4).
 */
export default function ReadyToSchedule() {
  const { user } = useAuth();
  const canSchedule = userCan(user, "edit_jobs");
  const [jobs, setJobs] = useState([]);
  const [properties, setProperties] = useState({});
  const [loading, setLoading] = useState(true);
  const [area, setArea] = useState("");
  const [capability, setCapability] = useState("");
  const [durationMax, setDurationMax] = useState("");
  const [urgency, setUrgency] = useState("all");
  const [scheduleJob, setScheduleJob] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.entities.Job.listAll("-updated_date"),
      api.entities.Property.listAll("-updated_date").catch(() => []),
    ])
      .then(([rows, props]) => {
        setJobs(rows.filter((j) => !j.archived_at && j.status === READY_TO_SCHEDULE_STATUS));
        setProperties(Object.fromEntries((props || []).map((p) => [p.id, p])));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const areaQ = area.trim().toLowerCase();
    const capQ = capability.trim().toLowerCase();
    const maxH = durationMax === "" ? null : Number(durationMax);
    return jobs.filter((job) => {
      if (areaQ) {
        const hay = `${job.service_area || ""} ${job.client_name || ""}`.toLowerCase();
        if (!hay.includes(areaQ)) return false;
      }
      if (capQ) {
        const tags = (job.required_capabilities || []).map((t) => String(t).toLowerCase());
        if (!tags.some((t) => t.includes(capQ) || capQ.includes(t))) return false;
      }
      if (Number.isFinite(maxH) && maxH > 0) {
        const hours = Number(job.estimated_duration_hours);
        if (Number.isFinite(hours) && hours > maxH) return false;
      }
      if (urgency !== "all" && String(job.urgency || "normal") !== urgency) return false;
      return true;
    });
  }, [jobs, area, capability, durationMax, urgency]);

  return (
    <div className="space-y-6" data-testid="ready-to-schedule-page">
      <PageHeader
        title="Ready to Schedule"
        description="Approved work waiting for a crew, date, and equipment. Filter by area, capability, duration, or urgency."
        secondary={(
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/schedule">Master schedule</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/jobs/board">Board</Link>
            </Button>
          </div>
        )}
      />

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Filter className="w-4 h-4" /> Filters
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Area</Label>
            <Input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="City, zip, zone…"
              data-testid="rts-filter-area"
            />
          </div>
          <div>
            <Label className="text-xs">Capability</Label>
            <Input
              value={capability}
              onChange={(e) => setCapability(e.target.value)}
              placeholder="crane, climbing…"
              data-testid="rts-filter-capability"
            />
          </div>
          <div>
            <Label className="text-xs">Max duration (hrs)</Label>
            <Input
              type="number"
              value={durationMax}
              onChange={(e) => setDurationMax(e.target.value)}
              placeholder="Any"
              data-testid="rts-filter-duration"
            />
          </div>
          <div>
            <Label className="text-xs">Urgency</Label>
            <Select value={urgency} onValueChange={setUrgency}>
              <SelectTrigger data-testid="rts-filter-urgency"><SelectValue /></SelectTrigger>
              <SelectContent>
                {URGENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading queue…</p>
      ) : !filtered.length ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-50" />
          {jobs.length
            ? "No jobs match these filters."
            : "Nothing in Ready to Schedule yet. Accept an estimate to land a job here."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((job) => (
            <li key={job.id}>
              <div
                className={cn(
                  "flex items-start gap-3 rounded-xl border border-border bg-card p-4",
                  "hover:border-primary/40 transition-colors",
                )}
                data-testid={`rts-job-${job.id}`}
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/jobs/${job.id}`} className="font-semibold text-foreground truncate hover:underline">
                      {job.title || "Untitled job"}
                    </Link>
                    <StatusBadge status={job.status} />
                    {job.urgency && job.urgency !== "normal" && (
                      <span className="text-[11px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        {job.urgency}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">{job.client_name || "—"}</div>
                  <PrereqFlags job={job} property={job.property_id ? properties[job.property_id] : null} />
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {job.service_area && <span>Area: {job.service_area}</span>}
                    {job.estimated_duration_hours != null && (
                      <span>Duration: {job.estimated_duration_hours} hrs</span>
                    )}
                    {(job.required_capabilities || []).length > 0 && (
                      <span>Needs: {(job.required_capabilities || []).join(", ")}</span>
                    )}
                    {job.estimate_amount != null && <span>Value: {money(job.estimate_amount)}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {canSchedule ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setScheduleJob(job)}
                      data-testid={`rts-schedule-${job.id}`}
                    >
                      <CalendarPlus className="w-4 h-4 mr-1" /> Schedule
                    </Button>
                  ) : (
                    <Link
                      to={`/jobs/${job.id}`}
                      className="text-xs font-medium text-primary inline-flex items-center gap-0.5"
                    >
                      Open <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ScheduleJobDialog
        open={Boolean(scheduleJob)}
        onOpenChange={(open) => { if (!open) setScheduleJob(null); }}
        job={scheduleJob}
        mode="schedule"
        onScheduled={() => load()}
      />
    </div>
  );
}
