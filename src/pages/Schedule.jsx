import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  Sun,
  Users,
  Wrench,
} from "lucide-react";
import { api } from "@/api/client";
import { JobCardDataProvider, JobCustomer, JobRunningTotal, JobQuickAdd } from "@/components/JobCardInfo";
import BrokenSquareMark, { BrokenSquareEmpty } from "@/components/BrokenSquareMark";
import PageHeader from "@/components/PageHeader";
import ScheduleJobDialog from "@/components/ScheduleJobDialog";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addCalendarDays, dateKey, parseDateOnly, shortDate, todayKey } from "@/lib/format";
import { statusCardClass, statusColors } from "@/lib/statusColors";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { userCan } from "@/lib/permissions";

function startOfWeek(fromDate) {
  const date = parseDateOnly(fromDate) || parseDateOnly(new Date());
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function addDays(date, n) {
  return parseDateOnly(addCalendarDays(date, n));
}

function jobTouchesDay(job, dayKey) {
  if (!job.start_date) return false;
  const end = job.end_date || job.start_date;
  return job.start_date <= dayKey && end >= dayKey;
}

function JobChip({ job, dense = false, crewName = null, onReschedule = null }) {
  const colors = statusColors(job.status);
  return (
    <div
      className={cn(
        "group flex items-start gap-2 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors",
        statusCardClass(job.status),
        dense ? "p-2" : "p-3",
      )}
    >
      <Link to={`/jobs/${job.id}`} className="flex items-start gap-2 flex-1 min-w-0">
        <span className={cn("mt-1.5 w-1.5 h-1.5 rounded-full shrink-0", colors.swatch)} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className={cn("font-semibold text-foreground truncate", dense ? "text-xs" : "text-sm")}>
            {job.title || "Untitled job"}
          </div>
          {dense ? (
            <div className="text-muted-foreground truncate text-[10px]">
              {crewName ? `${crewName} · ` : ""}{job.client_name || "—"}
            </div>
          ) : (
            <>
              <JobCustomer job={job} className="text-xs" />
              {crewName ? <div className="text-[11px] text-muted-foreground mt-0.5">{crewName}</div> : null}
            </>
          )}
          {!dense ? (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <StatusBadge status={job.status} />
              <JobRunningTotal job={job} className="text-xs" />
            </div>
          ) : null}
        </div>
      </Link>
      {onReschedule ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 h-7 px-2 text-xs"
          onClick={() => onReschedule(job)}
        >
          Move
        </Button>
      ) : dense ? (
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
      ) : (
        <JobQuickAdd job={job} />
      )}
    </div>
  );
}

/**
 * Master schedule — day / week / agenda / resource lanes (crews + major machines).
 */
export default function Schedule() {
  return (
    <JobCardDataProvider>
      <SchedulePage />
    </JobCardDataProvider>
  );
}

function SchedulePage() {
  const { user } = useAuth();
  const canEdit = userCan(user, "edit_jobs");
  const [jobs, setJobs] = useState([]);
  const [crews, setCrews] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("week"); // day | week | agenda | resources
  const [focusKey, setFocusKey] = useState(() => todayKey());
  const [crewFilter, setCrewFilter] = useState("all");
  const [scheduleJob, setScheduleJob] = useState(null);
  const [scheduleMode, setScheduleMode] = useState("schedule");

  const load = () => {
    setLoading(true);
    Promise.all([
      api.entities.Job.listAll("-updated_date"),
      api.entities.Crew.list("-created_date", 100).catch(() => []),
      api.entities.Equipment.list("-created_date", 100).catch(() => []),
    ])
      .then(([jobRows, crewRows, equipRows]) => {
        setJobs(jobRows.filter((j) => !j.archived_at));
        setCrews(crewRows || []);
        setEquipment((equipRows || []).filter((e) => e.active !== false));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const crewsById = useMemo(
    () => Object.fromEntries(crews.map((c) => [c.id, c])),
    [crews],
  );

  const focusDate = useMemo(() => parseDateOnly(focusKey), [focusKey]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(focusDate);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [focusDate]);

  const filteredJobs = useMemo(() => {
    if (crewFilter === "all") return jobs;
    if (crewFilter === "unassigned") return jobs.filter((j) => !j.crew_id);
    return jobs.filter((j) => j.crew_id === crewFilter);
  }, [jobs, crewFilter]);

  const jobsByDay = useMemo(
    () =>
      filteredJobs.reduce((groups, job) => {
        if (!job.start_date) return groups;
        const end = job.end_date || job.start_date;
        let cursor = job.start_date;
        // Cap multi-day expansion to 60 days to avoid runaway loops.
        for (let i = 0; i < 60 && cursor <= end; i++) {
          (groups[cursor] ||= []).push(job);
          cursor = dateKey(addDays(parseDateOnly(cursor), 1));
        }
        return groups;
      }, {}),
    [filteredJobs],
  );

  const scheduled = useMemo(
    () =>
      filteredJobs
        .filter((j) => j.start_date)
        .slice()
        .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))),
    [filteredJobs],
  );

  const today = todayKey();
  const dayJobs = jobsByDay[focusKey] || [];
  const weekLabel = weekDays.length
    ? `${shortDate(dateKey(weekDays[0]))} – ${shortDate(dateKey(weekDays[6]))}`
    : "";

  const dayLabel = focusDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const description = loading
    ? "Crews and machines as resources"
    : view === "day"
      ? `${dayJobs.length} job${dayJobs.length === 1 ? "" : "s"} · ${dayLabel}`
      : view === "resources"
        ? `Resource lanes · ${weekLabel}`
        : `${scheduled.length} dated job${scheduled.length === 1 ? "" : "s"} · ${weekLabel}`;

  function goToday() {
    setFocusKey(today);
  }

  function shiftFocus(days) {
    setFocusKey(dateKey(addDays(focusDate, days)));
  }

  function openDay(key) {
    setFocusKey(key);
    setView("day");
  }

  function openReschedule(job) {
    setScheduleMode("reschedule");
    setScheduleJob(job);
  }

  const viewToggle = (
    <div className="flex items-center gap-1 flex-wrap">
      {[
        { id: "day", label: "Day", Icon: Sun },
        { id: "week", label: "Week", Icon: CalendarDays },
        { id: "resources", label: "Resources", Icon: Users },
        { id: "agenda", label: "Agenda", Icon: List },
      ].map(({ id, label, Icon }) => (
        <Button
          key={id}
          type="button"
          variant={view === id ? "default" : "outline"}
          size="sm"
          className={view === id ? "bg-primary text-primary-foreground" : undefined}
          onClick={() => setView(id)}
          data-testid={`schedule-view-${id}`}
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
    <div className="p-4 lg:p-8 max-w-6xl mx-auto" data-testid="schedule-page">
      <PageHeader
        title="Schedule"
        description={description}
        primaryAction={viewToggle}
        secondary={(
          <div className="flex flex-wrap items-center gap-2">
            {navControls}
            <Select value={crewFilter} onValueChange={setCrewFilter}>
              <SelectTrigger className="w-44" data-testid="schedule-crew-filter">
                <SelectValue placeholder="All crews" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All crews</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {crews.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild variant="outline" size="sm">
              <Link to="/jobs/ready-to-schedule">Ready to Schedule</Link>
            </Button>
          </div>
        )}
      />

      {loading ? (
        <p className="text-muted-foreground flex items-center gap-2">
          <BrokenSquareMark state="open" size={16} tone="muted" className="opacity-60 animate-pulse" />
          Loading…
        </p>
      ) : view === "day" ? (
        <DayView
          focusKey={focusKey}
          todayKey={today}
          dayLabel={dayLabel}
          dayJobs={dayJobs}
          crewsById={crewsById}
          onBackToWeek={() => setView("week")}
          onReschedule={canEdit ? openReschedule : null}
        />
      ) : view === "week" ? (
        <WeekView
          days={weekDays}
          jobsByDay={jobsByDay}
          todayKey={today}
          focusKey={focusKey}
          onOpenDay={openDay}
          empty={scheduled.length === 0}
          crewsById={crewsById}
          onReschedule={canEdit ? openReschedule : null}
        />
      ) : view === "resources" ? (
        <ResourceView
          days={weekDays}
          jobs={filteredJobs}
          crews={crews}
          equipment={equipment}
          todayKey={today}
          onReschedule={canEdit ? openReschedule : null}
        />
      ) : (
        <AgendaView
          scheduled={scheduled}
          crewsById={crewsById}
          onReschedule={canEdit ? openReschedule : null}
        />
      )}

      <ScheduleJobDialog
        open={Boolean(scheduleJob)}
        onOpenChange={(open) => { if (!open) setScheduleJob(null); }}
        job={scheduleJob}
        mode={scheduleMode}
        onScheduled={() => load()}
      />
    </div>
  );
}

function DayView({ focusKey, todayKey, dayLabel, dayJobs, crewsById, onBackToWeek, onReschedule }) {
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
            No jobs with a start date of {shortDate(focusKey)}. Schedule from Ready to Schedule, or pick another day.
          </p>
        </BrokenSquareEmpty>
      ) : (
        <div className="space-y-2">
          {dayJobs.map((job) => (
            <JobChip
              key={job.id}
              job={job}
              crewName={job.crew_id ? crewsById[job.crew_id]?.name : null}
              onReschedule={onReschedule}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekView({ days, jobsByDay, todayKey, focusKey, onOpenDay, empty, crewsById, onReschedule }) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((date) => {
          const key = dateKey(date);
          const dayJobs = jobsByDay[key] || [];
          const isToday = key === todayKey;
          const isFocus = key === focusKey;
          return (
            <section
              key={key}
              className={cn(
                "min-h-40 rounded-xl border p-3 flex flex-col",
                isToday ? "border-primary/50 bg-primary/5" : "border-border bg-card",
                isFocus && !isToday ? "ring-1 ring-brand/30" : null,
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
                  <JobChip
                    key={`${key}-${job.id}`}
                    job={job}
                    dense
                    crewName={job.crew_id ? crewsById[job.crew_id]?.name : null}
                    onReschedule={onReschedule}
                  />
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
              <Link to="/jobs/ready-to-schedule" className="text-sm font-medium text-primary hover:underline">
                Ready to Schedule →
              </Link>
            }
          >
            Assign a crew and date from the Ready to Schedule queue to populate the master schedule.
          </BrokenSquareEmpty>
        </div>
      ) : null}
    </>
  );
}

/** Crew + equipment resource lanes across the week. */
function ResourceView({ days, jobs, crews, equipment, todayKey, onReschedule }) {
  const dayKeys = days.map((d) => dateKey(d));
  const crewLanes = [
    ...crews.map((c) => ({ id: c.id, label: c.name, kind: "crew" })),
    { id: "__unassigned__", label: "Unassigned", kind: "crew" },
  ];
  const equipLanes = equipment.map((e) => ({ id: e.id, label: e.name, kind: "equipment" }));

  function jobsForLane(lane, dayKey) {
    return jobs.filter((job) => {
      if (!jobTouchesDay(job, dayKey)) return false;
      if (lane.kind === "crew") {
        if (lane.id === "__unassigned__") return !job.crew_id;
        return job.crew_id === lane.id;
      }
      return (job.equipment_ids || []).includes(lane.id);
    });
  }

  return (
    <div className="space-y-8" data-testid="schedule-resources">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" /> Crews
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left p-2 w-36 sticky left-0 bg-background">Resource</th>
                {days.map((d) => {
                  const key = dateKey(d);
                  return (
                    <th
                      key={key}
                      className={cn("p-2 text-center font-medium", key === todayKey ? "text-primary" : "text-muted-foreground")}
                    >
                      <div className="text-[10px] uppercase">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                      <div>{d.getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {crewLanes.map((lane) => (
                <tr key={lane.id} className="border-t border-border">
                  <td className="p-2 font-medium sticky left-0 bg-background align-top">{lane.label}</td>
                  {dayKeys.map((key) => {
                    const cellJobs = jobsForLane(lane, key);
                    return (
                      <td key={key} className="p-1 align-top min-w-[100px]">
                        <div className="space-y-1">
                          {cellJobs.map((job) => (
                            <JobChip key={job.id} job={job} dense onReschedule={onReschedule} />
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
          <Wrench className="w-4 h-4" /> Equipment
        </h2>
        {equipLanes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No machines yet. Add them under Team → Equipment.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="text-left p-2 w-36 sticky left-0 bg-background">Machine</th>
                  {days.map((d) => {
                    const key = dateKey(d);
                    return (
                      <th
                        key={key}
                        className={cn("p-2 text-center font-medium", key === todayKey ? "text-primary" : "text-muted-foreground")}
                      >
                        <div className="text-[10px] uppercase">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                        <div>{d.getDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {equipLanes.map((lane) => (
                  <tr key={lane.id} className="border-t border-border">
                    <td className="p-2 font-medium sticky left-0 bg-background align-top">{lane.label}</td>
                    {dayKeys.map((key) => {
                      const cellJobs = jobsForLane(lane, key);
                      return (
                        <td key={key} className="p-1 align-top min-w-[100px]">
                          <div className="space-y-1">
                            {cellJobs.map((job) => (
                              <JobChip key={job.id} job={job} dense onReschedule={onReschedule} />
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AgendaView({ scheduled, crewsById, onReschedule }) {
  if (scheduled.length === 0) {
    return (
      <BrokenSquareEmpty title="No dated jobs yet" state="open">
        Schedule jobs from the Ready to Schedule queue to see them here.
      </BrokenSquareEmpty>
    );
  }

  return (
    <div className="space-y-2">
      {scheduled.map((job) => (
        <div
          key={job.id}
          className={cn(
            "group flex items-center gap-3 rounded-xl border p-4",
            statusCardClass(job.status),
          )}
        >
          <Link to={`/jobs/${job.id}`} className="flex items-center gap-3 flex-1 min-w-0">
            <div className="shrink-0 w-16 text-center">
              <div className="text-xs uppercase text-muted-foreground">{shortDate(job.start_date)}</div>
              {job.end_date && job.end_date !== job.start_date ? (
                <div className="text-[10px] text-muted-foreground">→ {shortDate(job.end_date)}</div>
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-foreground truncate">{job.title}</div>
              <div className="text-sm text-muted-foreground flex items-center gap-1 min-w-0">
                <Clock className="w-3 h-3 shrink-0" />
                <JobCustomer job={job} />
              </div>
              {job.crew_id && crewsById[job.crew_id] ? (
                <div className="text-xs text-muted-foreground mt-0.5">{crewsById[job.crew_id].name}</div>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <StatusBadge status={job.status} />
              <JobRunningTotal job={job} className="text-xs" />
            </div>
          </Link>
          {onReschedule ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onReschedule(job)}>
              Reschedule
            </Button>
          ) : null}
          <JobQuickAdd job={job} />
        </div>
      ))}
    </div>
  );
}
