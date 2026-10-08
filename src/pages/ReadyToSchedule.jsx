import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Filter, ListChecks } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { READY_TO_SCHEDULE_STATUS } from "@/lib/jobStatus";
import { cn } from "@/lib/utils";

const URGENCY_OPTIONS = [
  { value: "all", label: "Any urgency" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

/**
 * Ready to Schedule queue — approved jobs waiting for crew/date assignment.
 * Filters: area, capability, duration, urgency (Phase 3).
 */
export default function ReadyToSchedule() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [area, setArea] = useState("");
  const [capability, setCapability] = useState("");
  const [durationMax, setDurationMax] = useState("");
  const [urgency, setUrgency] = useState("all");

  const load = () => {
    setLoading(true);
    api.entities.Job.listAll("-updated_date")
      .then((rows) => setJobs(rows.filter((j) => !j.archived_at && j.status === READY_TO_SCHEDULE_STATUS)))
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
        description="Approved work waiting for a crew and date. Filter by area, capability, duration, or urgency."
        secondary={(
          <Button asChild variant="outline" size="sm">
            <Link to="/jobs/board">Board</Link>
          </Button>
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
              <Link
                to={`/jobs/${job.id}`}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border border-border bg-card p-4",
                  "hover:border-primary/40 transition-colors",
                )}
                data-testid={`rts-job-${job.id}`}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground truncate">{job.title || "Untitled job"}</span>
                    <StatusBadge status={job.status} />
                    {job.urgency && job.urgency !== "normal" && (
                      <span className="text-[11px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        {job.urgency}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">{job.client_name || "—"}</div>
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
                <span className="text-xs font-medium text-primary inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1">
                  Open <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
