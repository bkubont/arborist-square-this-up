import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { api } from "@/api/client";
import JobKanbanCard from "@/components/JobKanbanCard";
import PageHeader from "@/components/PageHeader";
import { isWorkingJob, paymentsByJobId, JOB_PHASES, JOB_PHASE_ORDER } from "@/lib/jobFilters";
import { applyInvoicedGate, statusesForPhase } from "@/lib/jobStatus";
import { statusColors } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

/** Encode phase + status for cross-board drag targets. */
function droppableId(phase, status) {
  return `${phase}::${status}`;
}

function parseDroppableId(id) {
  const sep = id.indexOf("::");
  if (sep < 0) return null;
  return { phase: id.slice(0, sep), status: id.slice(sep + 2) };
}

/** Brittany: Working → task board; Lead & Payment → Overview. */
function jobCardHref(job) {
  if (job.phase === "working") return `/jobs/${job.id}?tab=tasks`;
  return `/jobs/${job.id}`;
}

export default function JobBoard() {
  const [jobs, setJobs] = useState([]);
  const [clients, setClients] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(() => {
    return Promise.all([
      api.entities.Job.listAll("-updated_date"),
      api.entities.Client.list("-created_date", 500),
      api.entities.Estimate.list("-updated_date", 500),
      api.entities.TimelineEntry.list("-created_date", 1000),
    ])
      .then(([j, c, est, tl]) => {
        setJobs(j.filter(isWorkingJob));
        setClients(c);
        setEstimates(est);
        setTimeline(tl);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clientsById = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c])),
    [clients]
  );

  const paymentsMap = useMemo(() => paymentsByJobId(timeline), [timeline]);

  const columnsByPhase = useMemo(() => {
    const result = {};
    for (const phase of JOB_PHASE_ORDER) {
      const statuses = statusesForPhase(phase);
      const map = Object.fromEntries(statuses.map((s) => [s, []]));
      for (const job of jobs) {
        const jobPhase = job.phase || "lead";
        if (jobPhase !== phase) continue;
        if (map[job.status]) map[job.status].push(job);
      }
      result[phase] = map;
    }
    return result;
  }, [jobs]);

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const target = parseDroppableId(destination.droppableId);
    if (!target) return;

    const jobId = draggableId;
    const previous = jobs.find((j) => String(j.id) === String(jobId));
    if (!previous || (previous.phase === target.phase && previous.status === target.status)) return;

    const nextFields = applyInvoicedGate({ phase: target.phase, status: target.status });
    setJobs((list) =>
      list.map((j) =>
        String(j.id) === String(jobId) ? { ...j, ...nextFields } : j
      )
    );
    setSavingId(jobId);
    try {
      await api.entities.Job.update(jobId, nextFields);
      try {
        const phaseLabel = JOB_PHASES[nextFields.phase]?.label || nextFields.phase;
        const gateNote = target.status !== nextFields.status ? " (invoiced)" : "";
        await api.entities.TimelineEntry.create({
          job_id: jobId,
          type: "status_change",
          text: `Status changed to ${phaseLabel} · ${nextFields.status}${gateNote}`,
          category: "note",
        });
      } catch {
        /* non-blocking */
      }
    } catch {
      setJobs((list) =>
        list.map((j) =>
          String(j.id) === String(jobId) ? { ...j, phase: previous.phase, status: previous.status } : j
        )
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-4 lg:p-6 min-h-0">
      <PageHeader
        className="mb-4 shrink-0"
        title="Board"
        description="Lead, Working, and Payment — drag jobs across all three boards"
        secondary={
          <Link to="/jobs" className="text-sm font-medium text-primary hover:underline shrink-0">
            List view
          </Link>
        }
      />

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="space-y-8 pb-8">
            {JOB_PHASE_ORDER.map((phase) => (
              <PhaseBoard
                key={phase}
                phase={phase}
                label={JOB_PHASES[phase].label}
                statuses={statusesForPhase(phase)}
                columns={columnsByPhase[phase]}
                clientsById={clientsById}
                estimates={estimates}
                savingId={savingId}
                paymentsMap={paymentsMap}
                onChanged={load}
              />
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}

function PhaseBoard({
  phase,
  label,
  statuses,
  columns,
  clientsById,
  estimates,
  savingId,
  paymentsMap,
  onChanged,
}) {
  const jobCount = statuses.reduce((sum, s) => sum + (columns[s]?.length || 0), 0);

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">{label}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{jobCount} jobs</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 items-start">
        {statuses.map((status) => (
          <BoardColumn
            key={status}
            phase={phase}
            status={status}
            jobs={columns[status] || []}
            clientsById={clientsById}
            estimates={estimates}
            savingId={savingId}
            paymentsMap={paymentsMap}
            onChanged={onChanged}
          />
        ))}
      </div>
    </section>
  );
}

function BoardColumn({
  phase,
  status,
  jobs,
  clientsById,
  estimates,
  savingId,
  paymentsMap,
  onChanged,
}) {
  const colors = statusColors(status);
  const dropId = droppableId(phase, status);

  return (
    <Droppable droppableId={dropId}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn(
            "w-64 shrink-0 rounded-xl border-2 bg-surface-muted/80 flex flex-col max-h-[28rem]",
            colors.column,
            snapshot.isDraggingOver && cn("ring-2", colors.ring, colors.columnHeader)
          )}
        >
          <div className={cn("px-3 py-2 border-b sticky top-0 rounded-t-[10px] z-10", colors.columnHeader)}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                <span className={cn("w-2 h-2 rounded-full", colors.swatch)} aria-hidden="true" />
                {status}
              </span>
              <span className="text-[11px] font-bold tabular-nums text-foreground">{jobs.length}</span>
            </div>
          </div>
          <div className="p-2 space-y-2 overflow-y-auto flex-1 min-h-[4rem]">
            {jobs.map((job, index) => (
              <Draggable key={job.id} draggableId={String(job.id)} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <JobKanbanCard
                    job={job}
                    client={clientsById[job.client_id]}
                    estimates={estimates}
                    paymentsLogged={paymentsMap[job.id] || 0}
                    href={jobCardHref(job)}
                    dragProvided={dragProvided}
                    dragSnapshot={dragSnapshot}
                    saving={savingId === String(job.id)}
                    onChanged={onChanged}
                  />
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {jobs.length === 0 && (
              <div className="text-[11px] text-muted-foreground text-center py-4 px-1">Drop jobs here</div>
            )}
          </div>
        </div>
      )}
    </Droppable>
  );
}
