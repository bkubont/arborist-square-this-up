import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  MapPin,
  Phone,
  RefreshCw,
  Sun,
  Users,
  Wrench,
} from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { shortDate, todayKey } from "@/lib/format";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

function directionsUrl(property) {
  if (!property) return null;
  const parts = [property.address, property.city, property.state, property.zip].filter(Boolean);
  if (!parts.length) return null;
  return `https://maps.google.com/?q=${encodeURIComponent(parts.join(", "))}`;
}

function JobTodayCard({ job }) {
  const property = job.property;
  const maps = directionsUrl(property);
  const crewName = job.crew?.name;
  const equipmentNames = (job.equipment || []).map((e) => e.name).filter(Boolean);
  const instructions = [
    property?.access_notes && `Access: ${property.access_notes}`,
    property?.hazard_notes && `Hazards: ${property.hazard_notes}`,
    property?.special_instructions && property.special_instructions,
    job.notes && `Job: ${job.notes}`,
  ].filter(Boolean);

  return (
    <article
      className={cn(
        "rounded-xl border border-border bg-card overflow-hidden",
        statusCardClass(job.status),
        job.active_visit ? "ring-2 ring-primary/40" : null,
      )}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground leading-tight truncate">
              {job.title || "Untitled job"}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {job.client?.name || job.client_name || "Customer"}
              {property?.name ? ` · ${property.name}` : ""}
            </p>
          </div>
          <StatusBadge status={job.status} />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {crewName ? (
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-4 h-4 shrink-0" aria-hidden />
              {crewName}
            </span>
          ) : null}
          {equipmentNames.length ? (
            <span className="inline-flex items-center gap-1.5">
              <Wrench className="w-4 h-4 shrink-0" aria-hidden />
              {equipmentNames.join(", ")}
            </span>
          ) : null}
          {job.estimated_duration_hours != null ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4 shrink-0" aria-hidden />
              {job.estimated_duration_hours}h
            </span>
          ) : null}
          {job.open_task_count > 0 ? (
            <span>{job.open_task_count} open task{job.open_task_count === 1 ? "" : "s"}</span>
          ) : null}
        </div>

        {(property?.address || job.client?.phone) && (
          <div className="flex flex-wrap gap-2">
            {maps ? (
              <a
                href={maps}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 px-3 rounded-lg border border-border hover:bg-muted"
              >
                <MapPin className="w-4 h-4" aria-hidden />
                Directions
              </a>
            ) : null}
            {job.client?.phone ? (
              <a
                href={`tel:${job.client.phone}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground min-h-11 px-3 rounded-lg border border-border hover:bg-muted"
              >
                <Phone className="w-4 h-4" aria-hidden />
                {job.client.phone}
              </a>
            ) : null}
          </div>
        )}

        {instructions.length ? (
          <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground space-y-1">
            {instructions.slice(0, 3).map((line) => (
              <p key={line} className="leading-snug">{line}</p>
            ))}
          </div>
        ) : null}

        {job.active_visit ? (
          <p className="text-sm font-medium text-primary">Visit in progress</p>
        ) : null}
      </div>

      <Link
        to={`/jobs/${job.id}/field`}
        className="flex items-center justify-between gap-2 min-h-14 px-4 border-t border-border bg-muted/40 text-base font-semibold text-foreground hover:bg-muted"
      >
        Open field screen
        <ChevronRight className="w-5 h-5 text-muted-foreground" aria-hidden />
      </Link>
    </article>
  );
}

/**
 * Mobile-first Today workspace — ordered jobs, crew, equipment, instructions.
 */
export default function Today() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const date = todayKey();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.today({ date }));
    } catch (e) {
      setError(e?.message || "Could not load today");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const jobs = data?.jobs || [];
  const missing = data?.missing_clock_outs || [];

  return (
    <div className="max-w-lg mx-auto pb-24">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Sun className="w-6 h-6 text-primary" aria-hidden />
            Today
          </span>
        }
        description={shortDate(date)}
        primaryAction={
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 mr-1.5", loading && "animate-spin")} aria-hidden />
            Refresh
          </Button>
        }
      />

      {missing.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" aria-hidden />
          <div>
            <p className="font-semibold">Missing clock-outs need review</p>
            <p className="mt-0.5 text-amber-900/80">
              {missing.length} open time entr{missing.length === 1 ? "y" : "ies"} from a prior day.
            </p>
          </div>
        </div>
      ) : null}

      {data?.my_open_time_entry ? (
        <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <p className="font-semibold text-foreground">You are clocked in</p>
          <p className="text-muted-foreground mt-0.5">
            On a job since {new Date(data.my_open_time_entry.clock_in).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
            Open the job field screen to clock out.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive mb-4">{error}</p>
      ) : null}

      {loading && !data ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Loading today…</div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <Sun className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" aria-hidden />
          <p className="font-medium text-foreground">No jobs scheduled today</p>
          <p className="text-sm text-muted-foreground mt-1">
            Assigned production work for {shortDate(date)} will show here.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/schedule">Open schedule</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <JobTodayCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
