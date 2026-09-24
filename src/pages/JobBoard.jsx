import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { money, shortDate } from "@/lib/format";
import { depositsByJobId, invoicesByJobId, JOB_STATUSES, isWorkingJob, jobBalance, paymentsByJobId } from "@/lib/jobFilters";
import { statusCardClass, statusColors } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

export default function JobBoard() {
  const [jobs, setJobs] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(() => {
    return Promise.all([
      api.entities.Job.listAll("-updated_date"),
      api.entities.TimelineEntry.list("-created_date", 1000),
      api.entities.Invoice.list("-updated_date", 500),
    ])
      .then(([j, tl, inv]) => {
        setJobs(j.filter(isWorkingJob));
        setTimeline(tl);
        setInvoices(inv);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const paymentsMap = useMemo(() => paymentsByJobId(timeline), [timeline]);
  const depositsMap = useMemo(() => depositsByJobId(timeline), [timeline]);
  const invoiceMap = useMemo(() => invoicesByJobId(invoices), [invoices]);

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
        title="Board"
        description="Drag a job to change its status"
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
          <div className="flex gap-3 overflow-x-auto pb-4 flex-1 min-h-0 items-start">
            {JOB_STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                jobs={columns[status] || []}
                savingId={savingId}
                paymentsMap={paymentsMap}
              />
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}

function BoardColumn({ status, jobs, savingId, paymentsMap }) {
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
              const balance = jobBalance(job, paymentsMap[job.id] || 0, depositsMap[job.id] || 0, invoiceMap[job.id]);
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
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{job.client_name || "—"}</div>
                      </Link>
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <StatusBadge status={job.status} className="scale-90 origin-left" />
                        {balance > 0 && (
                          <span className="text-[10px] font-semibold text-attention">{money(balance)}</span>
                        )}
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
