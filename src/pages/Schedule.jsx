import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, List } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { shortDate } from "@/lib/format";
import { NAV_ICONS } from "@/lib/navIcons";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

const ScheduleIcon = NAV_ICONS.schedule;

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeek(offset = 0) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  today.setDate(today.getDate() - today.getDay() + offset * 7);
  return today;
}

/**
 * Schedule — week grid + agenda list from job start_date (no separate calendar backend).
 */
export default function Schedule() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState("week"); // week | agenda

  useEffect(() => {
    api.entities.Job.list("-updated_date", 400)
      .then(setJobs)
      .finally(() => setLoading(false));
  }, []);

  const days = useMemo(() => {
    const start = startOfWeek(weekOffset);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [weekOffset]);

  const jobsByDay = useMemo(
    () =>
      jobs.reduce((groups, job) => {
        if (job.start_date) (groups[job.start_date] ||= []).push(job);
        return groups;
      }, {}),
    [jobs]
  );

  const scheduled = useMemo(
    () =>
      jobs
        .filter((j) => j.start_date)
        .slice()
        .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))),
    [jobs]
  );

  const todayKey = dayKey(new Date());
  const weekLabel = days.length
    ? `${shortDate(dayKey(days[0]))} – ${shortDate(dayKey(days[6]))}`
    : "";

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Schedule"
        description={
          loading
            ? "Jobs by start date"
            : `${scheduled.length} dated job${scheduled.length === 1 ? "" : "s"} · ${weekLabel}`
        }
        primaryAction={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={view === "week" ? "default" : "outline"}
              size="sm"
              className={view === "week" ? "bg-primary text-primary-foreground" : undefined}
              onClick={() => setView("week")}
            >
              <CalendarDays className="w-4 h-4 mr-1" /> Week
            </Button>
            <Button
              type="button"
              variant={view === "agenda" ? "default" : "outline"}
              size="sm"
              className={view === "agenda" ? "bg-primary text-primary-foreground" : undefined}
              onClick={() => setView("agenda")}
            >
              <List className="w-4 h-4 mr-1" /> Agenda
            </Button>
          </div>
        }
        secondary={
          view === "week" ? (
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon" aria-label="Previous week" onClick={() => setWeekOffset((v) => v - 1)}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setWeekOffset(0)}>
                Today
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Next week" onClick={() => setWeekOffset((v) => v + 1)}>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          ) : null
        }
      />

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : view === "week" ? (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((date) => {
            const key = dayKey(date);
            const dayJobs = jobsByDay[key] || [];
            const isToday = key === todayKey;
            return (
              <section
                key={key}
                className={cn(
                  "min-h-40 rounded-xl border p-3",
                  isToday ? "border-primary/50 bg-primary/5" : "border-border bg-card"
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      {date.toLocaleDateString(undefined, { weekday: "short" })}
                    </div>
                    <div className={cn("text-lg font-bold", isToday ? "text-primary" : "text-foreground")}>
                      {date.getDate()}
                    </div>
                  </div>
                  {dayJobs.length > 0 ? <span className="text-xs text-muted-foreground">{dayJobs.length}</span> : null}
                </div>
                <div className="space-y-2">
                  {dayJobs.map((job) => (
                    <Link
                      key={job.id}
                      to={`/jobs/${job.id}`}
                      className={cn(
                        "block rounded-lg border border-border p-2 hover:border-primary/40 transition-colors",
                        statusCardClass(job.status)
                      )}
                    >
                      <div className="text-sm font-semibold text-foreground truncate">{job.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{job.client_name || "—"}</div>
                      <div className="mt-1">
                        <StatusBadge status={job.status} />
                      </div>
                    </Link>
                  ))}
                  {!dayJobs.length ? <div className="text-xs text-muted-foreground/60">Open</div> : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {scheduled.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
              <ScheduleIcon className="w-12 h-12 mx-auto mb-3 opacity-40" strokeWidth={1.5} />
              <p className="font-medium text-foreground mb-1">No dated jobs yet</p>
              <p className="text-sm max-w-sm mx-auto">
                Set a start date on a job to see it here. Open any job and edit its schedule fields.
              </p>
            </div>
          ) : (
            scheduled.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-4 hover:border-primary/40 transition-colors",
                  statusCardClass(job.status)
                )}
              >
                <div className="shrink-0 w-16 text-center">
                  <div className="text-xs uppercase text-muted-foreground">{shortDate(job.start_date)}</div>
                  {job.end_date ? <div className="text-[10px] text-muted-foreground">→ {shortDate(job.end_date)}</div> : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground truncate">{job.title}</div>
                  <div className="text-sm text-muted-foreground truncate flex items-center gap-1">
                    <Clock className="w-3 h-3 shrink-0" />
                    {job.client_name || "—"}
                  </div>
                </div>
                <StatusBadge status={job.status} />
              </Link>
            ))
          )}
        </div>
      )}

      {!loading && view === "week" && scheduled.length === 0 ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="w-4 h-4" />
          Schedule jobs from their detail page — set a start date.
        </div>
      ) : null}
    </div>
  );
}
