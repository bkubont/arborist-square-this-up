import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock, List, Sun } from "lucide-react";
import { api } from "@/api/client";
import { JobCardDataProvider, JobCustomer, JobRunningTotal, JobQuickAdd } from "@/components/JobCardInfo";
import BrokenSquareMark, { BrokenSquareEmpty } from "@/components/BrokenSquareMark";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { shortDate } from "@/lib/format";
import { statusCardClass, statusColors } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDay(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  return date;
}

function startOfWeek(fromDate) {
  const date = new Date(fromDate);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function addDays(date, n) {
  const next = new Date(date);
  next.setDate(next.getDate() + n);
  return next;
}

/**
 * Compact job chip — status edge + title/client + jump affordance.
 */
function JobChip({ job, dense = false }) {
  const colors = statusColors(job.status);
  return (
    <Link
      to={`/jobs/${job.id}`}
      className={cn(
        "group flex items-start gap-2 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors",
        statusCardClass(job.status),
        dense ? "p-2" : "p-3"
      )}
    >
      <span className={cn("mt-1.5 w-1.5 h-1.5 rounded-full shrink-0", colors.swatch)} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className={cn("font-semibold text-foreground truncate", dense ? "text-xs" : "text-sm")}>
          {job.title || "Untitled job"}
        </div>
        {dense ? (
          <div className="text-muted-foreground truncate text-[10px]">{job.client_name || "—"}</div>
        ) : (
          <JobCustomer job={job} className="text-xs" />
        )}
        {!dense ? (
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={job.status} />
            <JobRunningTotal job={job} className="text-xs" />
            <span className="text-[11px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-0.5">
              Open job <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        ) : null}
      </div>
      {dense ? (
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary" aria-hidden="true" />
      ) : (
        <JobQuickAdd job={job} />
      )}
    </Link>
  );
}

/**
 * Schedule — day / week / agenda from job start_date (no separate calendar backend).
 */
export default function Schedule() {
  return (
    <JobCardDataProvider>
      <SchedulePage />
    </JobCardDataProvider>
  );
}

function SchedulePage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("week"); // day | week | agenda
  const [focusKey, setFocusKey] = useState(() => dayKey(new Date()));

  useEffect(() => {
    api.entities.Job.list("-updated_date", 400)
      .then(setJobs)
      .finally(() => setLoading(false));
  }, []);

  const focusDate = useMemo(() => parseDay(focusKey), [focusKey]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(focusDate);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [focusDate]);

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
  const dayJobs = jobsByDay[focusKey] || [];
  const weekLabel = weekDays.length
    ? `${shortDate(dayKey(weekDays[0]))} – ${shortDate(dayKey(weekDays[6]))}`
    : "";

  const dayLabel = focusDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const description = loading
    ? "Jobs by start date"
    : view === "day"
      ? `${dayJobs.length} job${dayJobs.length === 1 ? "" : "s"} · ${dayLabel}`
      : `${scheduled.length} dated job${scheduled.length === 1 ? "" : "s"} · ${weekLabel}`;

  function goToday() {
    setFocusKey(todayKey);
  }

  function shiftFocus(days) {
    setFocusKey(dayKey(addDays(focusDate, days)));
  }

  function openDay(key) {
    setFocusKey(key);
    setView("day");
  }

  const viewToggle = (
    <div className="flex items-center gap-1">
      {[
        { id: "day", label: "Day", Icon: Sun },
        { id: "week", label: "Week", Icon: CalendarDays },
        { id: "agenda", label: "Agenda", Icon: List },
      ].map(({ id, label, Icon }) => (
        <Button
          key={id}
          type="button"
          variant={view === id ? "default" : "outline"}
          size="sm"
          className={view === id ? "bg-primary text-primary-foreground" : undefined}
          onClick={() => setView(id)}
        >
          <Icon className="w-4 h-4 mr-1" /> {label}
        </Button>
      ))}
    </div>
  );

  const navControls =
    view === "agenda" ? null : (
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={view === "day" ? "Previous day" : "Previous week"}
          onClick={() => shiftFocus(view === "day" ? -1 : -7)}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={goToday}>
          Today
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={view === "day" ? "Next day" : "Next week"}
          onClick={() => shiftFocus(view === "day" ? 1 : 7)}
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>
    );

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <PageHeader title="Schedule" description={description} primaryAction={viewToggle} secondary={navControls} />

      {loading ? (
        <p className="text-muted-foreground flex items-center gap-2">
          <BrokenSquareMark state="open" size={16} tone="muted" className="opacity-60 animate-pulse" />
          Loading…
        </p>
      ) : view === "day" ? (
        <DayView
          focusKey={focusKey}
          todayKey={todayKey}
          dayLabel={dayLabel}
          dayJobs={dayJobs}
          onBackToWeek={() => setView("week")}
        />
      ) : view === "week" ? (
        <WeekView
          days={weekDays}
          jobsByDay={jobsByDay}
          todayKey={todayKey}
          focusKey={focusKey}
          onOpenDay={openDay}
          empty={scheduled.length === 0}
        />
      ) : (
        <AgendaView scheduled={scheduled} />
      )}
    </div>
  );
}

function DayView({ focusKey, todayKey, dayLabel, dayJobs, onBackToWeek }) {
  const isToday = focusKey === todayKey;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isToday ? "Today" : shortDate(focusKey)}
          </div>
          <h2 className={cn("text-xl font-bold", isToday ? "text-primary" : "text-foreground")}>{dayLabel}</h2>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onBackToWeek}>
          Week view
        </Button>
      </div>

      {dayJobs.length === 0 ? (
        <BrokenSquareEmpty title="Nothing on this day" state="open">
          <p>
            No jobs with a start date of {shortDate(focusKey)}. Set a start date on a job, or pick another day from
            Week.
          </p>
        </BrokenSquareEmpty>
      ) : (
        <div className="space-y-2">
          {dayJobs.map((job) => (
            <JobChip key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekView({ days, jobsByDay, todayKey, focusKey, onOpenDay, empty }) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((date) => {
          const key = dayKey(date);
          const dayJobs = jobsByDay[key] || [];
          const isToday = key === todayKey;
          const isFocus = key === focusKey;
          return (
            <section
              key={key}
              className={cn(
                "min-h-40 rounded-xl border p-3 flex flex-col",
                isToday ? "border-primary/50 bg-primary/5" : "border-border bg-card",
                isFocus && !isToday ? "ring-1 ring-brand/30" : null
              )}
            >
              <button
                type="button"
                onClick={() => onOpenDay(key)}
                className="flex items-center justify-between mb-3 text-left w-full rounded-md hover:bg-muted/40 -mx-1 px-1 py-0.5 transition-colors"
                aria-label={`Open ${date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`}
              >
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    {date.toLocaleDateString(undefined, { weekday: "short" })}
                  </div>
                  <div className={cn("text-lg font-bold", isToday ? "text-primary" : "text-foreground")}>
                    {date.getDate()}
                  </div>
                </div>
                {dayJobs.length > 0 ? (
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">{dayJobs.length}</span>
                ) : (
                  <BrokenSquareMark state="open" size={12} tone="muted" className="opacity-30" />
                )}
              </button>
              <div className="space-y-1.5 flex-1">
                {dayJobs.map((job) => (
                  <JobChip key={job.id} job={job} dense />
                ))}
                {!dayJobs.length ? (
                  <button
                    type="button"
                    onClick={() => onOpenDay(key)}
                    className="w-full text-left text-[11px] text-muted-foreground/70 hover:text-primary py-1"
                  >
                    Open day
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {empty ? (
        <div className="mt-6">
          <BrokenSquareEmpty
            title="No dated jobs yet"
            state="open"
            action={
              <Link to="/jobs" className="text-sm font-medium text-primary hover:underline">
                Browse jobs →
              </Link>
            }
          >
            Set a start date on a job to see it on the schedule. Open any job and edit its schedule fields.
          </BrokenSquareEmpty>
        </div>
      ) : null}
    </>
  );
}

function AgendaView({ scheduled }) {
  if (scheduled.length === 0) {
    return (
      <BrokenSquareEmpty title="No dated jobs yet" state="open">
        Set a start date on a job to see it here. Open any job and edit its schedule fields.
      </BrokenSquareEmpty>
    );
  }

  return (
    <div className="space-y-2">
      {scheduled.map((job) => (
        <Link
          key={job.id}
          to={`/jobs/${job.id}`}
          className={cn(
            "group flex items-center gap-3 rounded-xl border p-4 hover:border-primary/40 transition-colors",
            statusCardClass(job.status)
          )}
        >
          <div className="shrink-0 w-16 text-center">
            <div className="text-xs uppercase text-muted-foreground">{shortDate(job.start_date)}</div>
            {job.end_date ? <div className="text-[10px] text-muted-foreground">→ {shortDate(job.end_date)}</div> : null}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-foreground truncate">{job.title}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1 min-w-0">
              <Clock className="w-3 h-3 shrink-0" />
              <JobCustomer job={job} />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <StatusBadge status={job.status} />
            <JobRunningTotal job={job} className="text-xs" />
          </div>
          <JobQuickAdd job={job} />
          <span className="text-[11px] font-medium text-primary hidden sm:inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            Open <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      ))}
    </div>
  );
}
