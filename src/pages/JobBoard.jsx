import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { useJobCardData, JobCustomer, JobRunningTotal, JobQuickAdd } from "@/components/JobCardInfo";
import JobTasks from "@/components/JobTasks";
import { money, shortDate } from "@/lib/format";
import { JOB_STATUSES, jobBalance, paymentsByJobId } from "@/lib/jobFilters";
import { statusCardClass, statusColors } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

/**
 * Kanban: every job by job status, or (Tasks) every job's tasks by task status. Either way,
 * dragging a card to another column changes its status. The choice lives in the URL (?view=tasks).
 */
export default function JobBoard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get("view") === "tasks" ? "tasks" : "jobs";
  const setMode = (next) => setSearchParams(next === "tasks" ? { view: "tasks" } : {}, { replace: true });
  const [tasks, setTasks] = useState(null);
  const [scopeDocs, setScopeDocs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const { clientsById, summaries, reload } = useJobCardData();

  const load = useCallback(() => {
    return Promise.all([
      api.entities.Job.list("-updated_date", 400),
      api.entities.TimelineEntry.list("-created_date", 1000),
    ])
      .then(([j, tl]) => {
        setJobs(j);
        setTimeline(tl);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Tasks view: all tasks, plus estimate / change order statuses so voided-source tasks show as such.
  const loadTasks = useCallback(() => Promise.all([
    api.entities.WorkItem.list("-created_date", 2000),
    api.entities.Estimate.list("-updated_date", 500),
    api.entities.ChangeOrder.list("-updated_date", 500),
  ]).then(([items, estimates, changeOrders]) => {
    setTasks(items);
    setScopeDocs([...estimates, ...changeOrders]);
  }), []);

  useEffect(() => {
    if (mode === "tasks") loadTasks();
  }, [mode, loadTasks]);

  const jobsById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  const paymentsMap = useMemo(() => paymentsByJobId(timeline), [timeline]);

  const columns = useMemo(() => {
    const map = Object.fromEntries(JOB_STATUSES.map((s) => [s, []]));
    for (const job of jobs) {
      if (map[job.status]) map[job.status].push(job);
      else map.Estimate.push(job);
    }
    return map;
  }, [jobs]);

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    // Same status column: no-op (reorder not supported yet — no PATCH / timeline)
    if (destination.droppableId === source.droppableId) return;

    const nextStatus = destination.droppableId;
    const jobId = draggableId;
    const previousStatus = jobs.find((j) => String(j.id) === String(jobId))?.status;
    if (!previousStatus || previousStatus === nextStatus) return;

    setJobs((list) => list.map((j) => (String(j.id) === String(jobId) ? { ...j, status: nextStatus } : j)));
    setSavingId(jobId);
    try {
      await api.entities.Job.update(jobId, { status: nextStatus });
      try {
        await api.entities.TimelineEntry.create({
          job_id: jobId,
          type: "status_change",
          text: `Status changed to ${nextStatus}`,
          category: "note",
        });
      } catch {
        // Status already saved — do not roll back the card if only the timeline write fails
      }
    } catch {
      // Revert only this card to its prior status (do not wipe concurrent successful moves)
      setJobs((list) =>
        list.map((j) => (String(j.id) === String(jobId) ? { ...j, status: previousStatus } : j))
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-4 lg:p-6 h-full flex flex-col min-h-0">
      <PageHeader
        className="mb-4 shrink-0"
        title="Kanban"
        description={mode === "tasks" ? "Every job's tasks — drag a task to change its status" : "Drag a job to change its status"}
        secondary={
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/60" role="group" aria-label="Board shows">
              {[["jobs", "Jobs"], ["tasks", "Tasks"]].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md",
                    mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Link to="/jobs" className="text-sm font-medium text-primary hover:underline shrink-0">
              List view
            </Link>
          </div>
        }
      />

      {mode === "tasks" ? (
        tasks == null ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <JobTasks items={tasks} documents={scopeDocs} jobsById={jobsById} onChanged={() => { loadTasks(); load(); }} view="board" />
        )
      ) : loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4 flex-1 min-h-0 items-start">
            {JOB_STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                jobs={columns[status] || []}
                savingId={savingId}
                paymentsMap={paymentsMap}
                clientsById={clientsById}
                summaries={summaries}
                onQuickAdded={() => { load(); reload(); }}
              />
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}

function BoardColumn({ status, jobs, savingId, paymentsMap, clientsById, summaries, onQuickAdded }) {
  const colors = statusColors(status);
  return (
    <Droppable droppableId={status}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn(
            "w-64 shrink-0 rounded-xl border-2 bg-surface-muted/80 flex flex-col max-h-[calc(100vh-8rem)]",
            colors.column,
            snapshot.isDraggingOver && cn("ring-2", colors.ring, colors.columnHeader)
          )}
        >
          <div className={cn("px-3 py-2.5 border-b sticky top-0 rounded-t-[10px] z-10", colors.columnHeader)}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
                <span className={cn("w-2 h-2 rounded-full", colors.swatch)} aria-hidden="true" />
                {status}
              </span>
              <span className="text-xs font-bold tabular-nums text-foreground">{jobs.length}</span>
            </div>
          </div>
          <div className="p-2 space-y-2 overflow-y-auto flex-1">
            {jobs.map((job, index) => {
              const balance = jobBalance(job, paymentsMap[job.id] || 0);
              return (
                <Draggable key={job.id} draggableId={String(job.id)} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      {...dragProvided.dragHandleProps}
                      className={cn(
                        "bg-card rounded-lg border p-3 shadow-sm",
                        statusCardClass(job.status),
                        dragSnapshot.isDragging && "shadow-md ring-2 ring-primary/40",
                        savingId === String(job.id) && "opacity-60"
                      )}
                    >
                      <Link to={`/jobs/${job.id}`} className="block" onClick={(e) => e.stopPropagation()}>
                        <div className="font-semibold text-sm text-foreground leading-snug line-clamp-2">{job.title}</div>
                        <JobCustomer job={job} client={clientsById[job.client_id]} className="text-xs mt-0.5" />
                      </Link>
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <JobRunningTotal summary={summaries[job.id]} className="text-xs" />
                        {balance > 0 && (
                          <span className="text-[10px] font-semibold text-attention">{money(balance)} due</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1.5">
                        <StatusBadge status={job.status} className="scale-90 origin-left" />
                        <JobQuickAdd job={job} onSaved={onQuickAdded} />
                      </div>
                      {job.start_date && (
                        <div className="text-[10px] text-muted-foreground mt-1">{shortDate(job.start_date)}</div>
                      )}
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
            {jobs.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6 px-2">Drop jobs here</div>
            )}
          </div>
        </div>
      )}
    </Droppable>
  );
}
