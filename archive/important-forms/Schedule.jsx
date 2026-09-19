import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { api } from "@/api/client";
import StatusBadge from "@/components/StatusBadge";
import { shortDate } from "@/lib/format";

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

export default function Schedule() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    api.entities.Job.list("start_date", 200).then(setJobs).finally(() => setLoading(false));
  }, []);

  const days = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    today.setDate(today.getDate() - today.getDay() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      return date;
    });
  }, [weekOffset]);

  const jobsByDay = useMemo(() => jobs.reduce((groups, job) => {
    if (job.start_date) (groups[job.start_date] ||= []).push(job);
    return groups;
  }, {}), [jobs]);

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schedule</h1>
          <p className="text-sm text-slate-500">Upcoming work at a glance</p>
        </div>
        <div className="flex items-center gap-1">
          <button aria-label="Previous week" className="p-2 rounded-lg hover:bg-white" onClick={() => setWeekOffset((value) => value - 1)}><ChevronLeft className="w-5 h-5" /></button>
          <button className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white" onClick={() => setWeekOffset(0)}>Today</button>
          <button aria-label="Next week" className="p-2 rounded-lg hover:bg-white" onClick={() => setWeekOffset((value) => value + 1)}><ChevronRight className="w-5 h-5" /></button>
        </div>
      </div>

      {loading ? <div className="text-sm text-slate-400 py-8">Loading...</div> : (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((date) => {
            const key = dayKey(date);
            const dayJobs = jobsByDay[key] || [];
            const isToday = key === dayKey(new Date());
            return (
              <section key={key} className={`min-h-40 rounded-xl border p-3 ${isToday ? "border-amber-400 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-xs font-semibold uppercase text-slate-400">{date.toLocaleDateString(undefined, { weekday: "short" })}</div>
                    <div className={`text-lg font-bold ${isToday ? "text-amber-600" : "text-slate-800"}`}>{date.getDate()}</div>
                  </div>
                  {dayJobs.length > 0 && <span className="text-xs text-slate-400">{dayJobs.length}</span>}
                </div>
                <div className="space-y-2">
                  {dayJobs.map((job) => (
                    <Link key={job.id} to={`/jobs/${job.id}`} className="block rounded-lg border border-slate-100 p-2 hover:border-amber-400">
                      <div className="text-sm font-semibold text-slate-800 truncate">{job.title}</div>
                      <div className="flex items-center gap-1 mt-1 text-xs text-slate-400"><Clock className="w-3 h-3" />{shortDate(job.start_date)}</div>
                      <StatusBadge status={job.status} />
                    </Link>
                  ))}
                  {!dayJobs.length && <div className="text-xs text-slate-300">Open</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {!loading && !jobs.some((job) => job.start_date) && <div className="mt-6 flex items-center gap-2 text-sm text-slate-400"><CalendarDays className="w-4 h-4" />Schedule jobs from their detail page.</div>}
    </div>
  );
}
