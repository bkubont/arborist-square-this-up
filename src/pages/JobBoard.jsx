import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { api } from "@/api/client";
import JobKanbanCard from "@/components/JobKanbanCard";
import JobTasks from "@/components/JobTasks";
import PageHeader from "@/components/PageHeader";
import {
  depositsByJobId,
  invoicesByJobId,
  isWorkingJob,
  paymentsByJobId,
  JOB_PHASES,
  JOB_PHASE_ORDER,
} from "@/lib/jobFilters";
import { applyInvoicedGate, statusesForPhase } from "@/lib/jobStatus";
import { statusColors } from "@/lib/statusColors";
import { useWorkTypes } from "@/hooks/useWorkTypes";
import {
  encodeTypeDroppableId,
  normalizeWorkType,
  parseTypeDroppableId,
  workTypeColumnKeys,
  workTypeForStorage,
  workTypeLabel,
} from "@/lib/workTypes";
import { cn } from "@/lib/utils";

/** Encode phase + status for cross-board drag targets. */
function droppableId(phase, status) {
  return `${phase}::${status}`;
}

function parseDroppableId(id) {
  const sep = id.indexOf("::");
  if (sep < 0) return null;
  const phase = id.slice(0, sep);
  const rest = id.slice(sep + 2);
  const workType = parseTypeDroppableId(rest);
  if (workType) return { phase, workType };
  return { phase, status: rest };
}

/** Brittany: Working → task board; Lead & Payment → Overview. */
function jobCardHref(job) {
  if (job.phase === "working") return `/jobs/${job.id}?tab=tasks`;
  return `/jobs/${job.id}`;
}

export default function JobBoard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get("view") === "tasks" ? "tasks" : "jobs";
  const boardGroupBy = searchParams.get("group") === "type" ? "type" : "stage";
  const setMode = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === "tasks") params.set("view", "tasks");
    else params.delete("view");
    setSearchParams(params, { replace: true });
  };
  const setBoardGroupBy = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === "type") params.set("group", "type");
    else params.delete("group");
    setSearchParams(params, { replace: true });
  };
  const [tasks, setTasks] = useState(null);
  const [scopeDocs, setScopeDocs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [clients, setClients] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const { types: catalogTypes } = useWorkTypes();
  const [activePhase, setActivePhase] = useState(
    () => searchParams.get("phase") || "working",
  );
  const touchStartX = useRef(null);

  useEffect(() => {
    const phase = searchParams.get("phase");
    if (phase && JOB_PHASE_ORDER.includes(phase)) setActivePhase(phase);
  }, [searchParams]);

  const choosePhase = (phase) => {
    setActivePhase(phase);
    const params = new URLSearchParams(searchParams);
    if (phase === "working") params.delete("phase");
    else params.set("phase", phase);
    setSearchParams(params, { replace: true });
  };

  const onPhaseTouchStart = (e) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const onPhaseTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    const idx = JOB_PHASE_ORDER.indexOf(activePhase);
    if (dx < -48 && idx < JOB_PHASE_ORDER.length - 1) choosePhase(JOB_PHASE_ORDER[idx + 1]);
    if (dx > 48 && idx > 0) choosePhase(JOB_PHASE_ORDER[idx - 1]);
    touchStartX.current = null;
  };

  const load = useCallback(() => {
    return Promise.all([
      api.entities.Job.listAll("-updated_date"),
      api.entities.Client.list("-created_date", 500),
      api.entities.Estimate.list("-updated_date", 500),
      api.entities.TimelineEntry.list("-created_date", 1000),
      api.entities.Invoice.list("-updated_date", 500),
    ])
      .then(([j, c, est, tl, inv]) => {
        setJobs(j.filter(isWorkingJob));
        setClients(c);
        setEstimates(est);
        setTimeline(tl);
        setInvoices(inv);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadTasks = useCallback(() => Promise.all([
    api.entities.WorkItem.list("-created_date", 2000),
    api.entities.Estimate.list("-updated_date", 500),
    api.entities.ChangeOrder.list("-updated_date", 500),
  ]).then(([items, estimateDocs, changeOrders]) => {
    setTasks(items);
    setScopeDocs([...estimateDocs, ...changeOrders]);
  }), []);

  useEffect(() => {
    if (mode === "tasks") loadTasks();
  }, [mode, loadTasks]);

  const jobsById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);
  const clientsById = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c])),
    [clients],
  );
  const paymentsMap = useMemo(() => paymentsByJobId(timeline), [timeline]);
  const depositsMap = useMemo(() => depositsByJobId(timeline), [timeline]);
  const invoiceMap = useMemo(() => invoicesByJobId(invoices), [invoices]);

  const columnsByPhase = useMemo(() => {
    const result = {};
    for (const phase of JOB_PHASE_ORDER) {
      const phaseJobs = jobs.filter((job) => (job.phase || "lead") === phase);
      if (boardGroupBy === "type") {
        const typeKeys = workTypeColumnKeys(phaseJobs, (job) => job.work_type, catalogTypes);
        const map = Object.fromEntries(typeKeys.map((t) => [t, []]));
        for (const job of phaseJobs) {
          const key = normalizeWorkType(job.work_type);
          if (map[key]) map[key].push(job);
        }
        result[phase] = { mode: "type", columns: map, keys: typeKeys };
      } else {
        const statuses = statusesForPhase(phase);
        const map = Object.fromEntries(statuses.map((s) => [s, []]));
        for (const job of phaseJobs) {
          if (map[job.status]) map[job.status].push(job);
        }
        result[phase] = { mode: "stage", columns: map, keys: statuses };
      }
    }
    return result;
  }, [jobs, boardGroupBy, catalogTypes]);

  const onDragEndStage = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const target = parseDroppableId(destination.droppableId);
    if (!target?.status) return;

    const jobId = draggableId;
    const previous = jobs.find((j) => String(j.id) === String(jobId));
    if (!previous || (previous.phase === target.phase && previous.status === target.status)) return;

    const nextFields = applyInvoicedGate({ phase: target.phase, status: target.status });
    setJobs((list) =>
      list.map((j) =>
        String(j.id) === String(jobId) ? { ...j, ...nextFields } : j,
      ),
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
          job_status: nextFields.status,
        });
      } catch {
        /* non-blocking */
      }
    } catch {
      setJobs((list) =>
        list.map((j) =>
          String(j.id) === String(jobId) ? { ...j, phase: previous.phase, status: previous.status } : j,
        ),
      );
    } finally {
      setSavingId(null);
    }
  };

  const onDragEndType = async (result) => {
    const { destination, draggableId } = result;
    if (!destination) return;

    const target = parseDroppableId(destination.droppableId);
    if (!target?.workType) return;

    const jobId = draggableId;
    const previous = jobs.find((j) => String(j.id) === String(jobId));
    const work_type = workTypeForStorage(target.workType);
    if (!previous || (previous.phase === target.phase && normalizeWorkType(previous.work_type) === target.workType)) return;

    const nextFields = { phase: target.phase, work_type };
    setJobs((list) =>
      list.map((j) => (String(j.id) === String(jobId) ? { ...j, ...nextFields } : j)),
    );
    setSavingId(jobId);
    try {
      await api.entities.Job.update(jobId, nextFields);
    } catch {
      setJobs((list) =>
        list.map((j) => (String(j.id) === String(jobId) ? { ...j, phase: previous.phase, work_type: previous.work_type } : j)),
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
        description={mode === "tasks"
          ? boardGroupBy === "type"
            ? "Every job's tasks — drag a task to change its work type"
            : "Every job's tasks — drag a task to change its status"
          : boardGroupBy === "type"
            ? "Lead, Working, and Payment — drag jobs by work type within each phase"
            : "Lead, Working, and Payment — drag jobs across all three boards"}
        secondary={
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/60" role="group" aria-label="Board shows">
              {[["jobs", "Jobs"], ["tasks", "Tasks"]].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md",
                    mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/60" role="group" aria-label="Group by">
              {[["stage", "Stage"], ["type", "Type"]].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={boardGroupBy === value}
                  onClick={() => setBoardGroupBy(value)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md",
                    boardGroupBy === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
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
          <JobTasks
            items={tasks}
            documents={scopeDocs}
            jobsById={jobsById}
            onChanged={() => { loadTasks(); load(); }}
            view="board"
            boardGroupBy={boardGroupBy}
          />
        )
      ) : loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <DragDropContext onDragEnd={boardGroupBy === "type" ? onDragEndType : onDragEndStage}>
          <div
            className="lg:hidden mb-4 inline-flex w-full rounded-lg border border-border p-0.5 bg-muted/60"
            role="tablist"
            aria-label="Board phase"
          >
            {JOB_PHASE_ORDER.map((phase) => (
              <button
                key={phase}
                type="button"
                role="tab"
                aria-selected={activePhase === phase}
                onClick={() => choosePhase(phase)}
                className={cn(
                  "flex-1 px-2 py-1.5 text-xs font-medium rounded-md",
                  activePhase === phase
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {JOB_PHASES[phase].label}
              </button>
            ))}
          </div>
          <p className="lg:hidden text-[11px] text-muted-foreground mb-3 -mt-2">
            Swipe left or right to change phase
          </p>
          <div
            className="space-y-8 pb-8"
            onTouchStart={onPhaseTouchStart}
            onTouchEnd={onPhaseTouchEnd}
          >
            {JOB_PHASE_ORDER.map((phase) => (
              <div
                key={phase}
                className={cn(phase !== activePhase && "hidden lg:block")}
              >
                <PhaseBoard
                  phase={phase}
                  label={JOB_PHASES[phase].label}
                  board={columnsByPhase[phase]}
                  clientsById={clientsById}
                  estimates={estimates}
                  savingId={savingId}
                  paymentsMap={paymentsMap}
                  depositsMap={depositsMap}
                  invoiceMap={invoiceMap}
                  onChanged={load}
                />
              </div>
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
  board,
  clientsById,
  estimates,
  savingId,
  paymentsMap,
  depositsMap,
  invoiceMap,
  onChanged,
}) {
  const jobCount = board.keys.reduce((sum, key) => sum + (board.columns[key]?.length || 0), 0);

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">{label}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{jobCount} jobs</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 items-start">
        {board.mode === "type"
          ? board.keys.map((workType) => (
            <TypeBoardColumn
              key={workType}
              phase={phase}
              workType={workType}
              jobs={board.columns[workType] || []}
              clientsById={clientsById}
              estimates={estimates}
              savingId={savingId}
              paymentsMap={paymentsMap}
              depositsMap={depositsMap}
              invoiceMap={invoiceMap}
              onChanged={onChanged}
            />
          ))
          : board.keys.map((status) => (
            <StageBoardColumn
              key={status}
              phase={phase}
              status={status}
              jobs={board.columns[status] || []}
              clientsById={clientsById}
              estimates={estimates}
              savingId={savingId}
              paymentsMap={paymentsMap}
              depositsMap={depositsMap}
              invoiceMap={invoiceMap}
              onChanged={onChanged}
            />
          ))}
      </div>
    </section>
  );
}

function TypeBoardColumn({
  phase,
  workType,
  jobs,
  clientsById,
  estimates,
  savingId,
  paymentsMap,
  depositsMap,
  invoiceMap,
  onChanged,
}) {
  const dropId = `${phase}::${encodeTypeDroppableId(workType)}`;

  return (
    <Droppable droppableId={dropId}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn(
            jobs.length === 0 ? "w-40" : "w-64",
            "shrink-0 rounded-xl border-2 border-slate-200 bg-surface-muted/80 flex flex-col max-h-[28rem]",
            snapshot.isDraggingOver && "ring-2 ring-primary/30 bg-primary/5",
          )}
        >
          <div className="px-3 py-2 border-b sticky top-0 rounded-t-[10px] z-10 bg-slate-100/80">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-[11px] font-semibold text-foreground leading-tight line-clamp-3">{workTypeLabel(workType)}</span>
              <span className="text-[11px] font-bold tabular-nums text-foreground shrink-0">{jobs.length}</span>
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
                    depositsLogged={depositsMap[job.id] || 0}
                    activeInvoice={invoiceMap[job.id]}
                    href={jobCardHref(job)}
                    dragProvided={dragProvided}
                    dragSnapshot={dragSnapshot}
                    saving={savingId === String(job.id)}
                    onChanged={onChanged}
                    showStatus
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

function StageBoardColumn({
  phase,
  status,
  jobs,
  clientsById,
  estimates,
  savingId,
  paymentsMap,
  depositsMap,
  invoiceMap,
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
          data-testid={`job-column-${phase}-${status}`}
          className={cn(
            jobs.length === 0 ? "w-40" : "w-64",
            "shrink-0 rounded-xl border-2 bg-surface-muted/80 flex flex-col max-h-[28rem]",
            colors.column,
            snapshot.isDraggingOver && cn("ring-2", colors.ring, colors.columnHeader),
          )}
        >
          <div className={cn("px-3 py-2 border-b sticky top-0 rounded-t-[10px] z-10", colors.columnHeader)}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-start gap-1.5 min-w-0 text-[11px] font-semibold uppercase tracking-wide text-foreground leading-tight">
                <span className={cn("w-2 h-2 rounded-full mt-0.5 shrink-0", colors.swatch)} aria-hidden="true" />
                <span className="break-words">{status}</span>
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
                    depositsLogged={depositsMap[job.id] || 0}
                    activeInvoice={invoiceMap[job.id]}
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
