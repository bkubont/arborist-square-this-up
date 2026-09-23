import React, { useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Link } from "react-router-dom";
import { Plus, X, Check, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { api } from "@/api/client";
import StatusSelect from "@/components/StatusSelect";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import TaskNotes from "@/components/TaskNotes";
import { moneyCents } from "@/lib/format";
import { TASK_STATUSES, NOTE_PROMPT_STATUSES, taskStatus, taskStatusLabel, sortTasks, taskSourceVoided, formatHours, hoursRemaining } from "@/lib/tasks";
import { statusColors, statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

/**
 * A job's tasks (WorkItem), as a list or a board. One task per signed Estimate/ChangeOrder line
 * (created at signing; see server/sign.js) plus any the owner adds. Each task has its own status,
 * so one can be waiting on materials while another is done. Each card shows its expected labor
 * hours and its notes, each tinted with the status it was written under, with an "Add a note…" box
 * always there; moving a task to Waiting on Materials, On Hold or Cancelled puts the cursor in it.
 * Clicking a task opens its details (steps, measurements, materials). Never shown to the customer.
 *
 * Without a jobId (the Kanban page's Tasks board) it shows every job's tasks, each card naming its
 * job; new tasks are then added from a job.
 *
 * @param {{ jobId?: string, items: Array, documents?: Array, onChanged: () => void, view?: "list" | "board", jobsById?: Record<string, any> }} props
 */
export default function JobTasks({ jobId = undefined, items = [], documents = [], onChanged, view = "list", jobsById = undefined }) {
  const [adding, setAdding] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [openId, setOpenId] = useState(null);
  // The task whose "Add a note…" box gets the cursor (after a move into a status that needs a reason).
  const [noteFocusId, setNoteFocusId] = useState(null);
  // Optimistic status/position while a board move saves, so the card doesn't snap back.
  const [pending, setPending] = useState(/** @type {Record<string, { status: string, sort_order: number }>} */ ({}));

  const shown = useMemo(() => sortTasks(items.map((item) => (pending[item.id] ? { ...item, ...pending[item.id] } : item))), [items, pending]);
  const doneCount = shown.filter((i) => taskStatus(i) === "done").length;
  const openItem = items.find((i) => i.id === openId) || null;

  const run = async (itemId, action) => {
    setBusyId(itemId);
    try {
      await action();
      await onChanged?.();
    } catch (e) {
      alert(e?.message || "Could not update the task.");
    } finally {
      setBusyId(null);
    }
  };

  const patch = (item, data) => run(item.id, () => api.entities.WorkItem.update(item.id, data));

  const changeStatus = (item, status) => {
    setNoteFocusId(NOTE_PROMPT_STATUSES.includes(status) ? item.id : null);
    return patch(item, { status });
  };

  // New notes go up without id/status/time; the server stamps them with the task's current status.
  const noteProps = (item) => ({
    focus: noteFocusId === item.id,
    disabled: busyId === item.id,
    onAdd: (text) => { setNoteFocusId(null); patch(item, { status_notes: [...(item.status_notes || []), { text }] }); },
    onRemove: (noteId) => patch(item, { status_notes: (item.status_notes || []).filter((n) => n.id !== noteId) }),
  });

  const addTask = () => {
    const description = adding.trim();
    if (!description) return;
    setAdding("");
    run("new", () => api.entities.WorkItem.create({ job_id: jobId, description }));
  };

  const onDragEnd = async ({ source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const moved = shown.find((i) => i.id === draggableId);
    if (!moved) return;
    const status = destination.droppableId;
    const column = shown.filter((i) => taskStatus(i) === status && i.id !== draggableId);
    column.splice(destination.index, 0, { ...moved, status });
    // Renumber the destination column; only tasks whose position changed are saved.
    const updates = column
      .map((item, index) => ({ item, status, sort_order: (index + 1) * 1000 }))
      .filter(({ item, sort_order }) => item.id === draggableId || item.sort_order !== sort_order);
    setPending((p) => ({ ...p, ...Object.fromEntries(updates.map((u) => [u.item.id, { status: u.status, sort_order: u.sort_order }])) }));
    setBusyId(draggableId);
    try {
      for (const u of updates) {
        await api.entities.WorkItem.update(u.item.id, u.item.id === draggableId ? { status, sort_order: u.sort_order } : { sort_order: u.sort_order });
      }
      if (source.droppableId !== status) setNoteFocusId(NOTE_PROMPT_STATUSES.includes(status) ? draggableId : null);
      await onChanged?.();
    } catch (e) {
      alert(e?.message || "Could not move the task.");
      await onChanged?.();
    } finally {
      setPending({});
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="text-xs text-slate-500 mb-2">
        {items.length
          ? [`${doneCount}/${items.length} done`, formatHours(hoursRemaining(shown)) && `${formatHours(hoursRemaining(shown))} left`].filter(Boolean).join(" · ")
          : "No tasks yet. Signed estimate and change order lines show up here."}
      </div>

      {view === "board" ? (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-3 items-start">
            {TASK_STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                items={shown.filter((i) => taskStatus(i) === status)}
                documents={documents}
                busyId={busyId}
                onOpen={setOpenId}
                noteProps={noteProps}
                jobsById={jobsById}
              />
            ))}
          </div>
        </DragDropContext>
      ) : (
        <div className="space-y-2 mb-3">
          {shown.map((item) => (
            <TaskRow key={item.id} item={item} documents={documents} busy={busyId === item.id} onPatch={patch} onStatus={changeStatus} onOpen={() => setOpenId(item.id)} note={noteProps(item)} />
          ))}
        </div>
      )}

      {jobId && (
      <div className="flex gap-2 mt-3">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="Add a task…"
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button type="button" onClick={addTask} disabled={busyId === "new"} aria-label="Add task" className="px-3 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      )}

      <TaskDetailDialog
        open={!!openItem}
        onOpenChange={(next) => { if (!next) setOpenId(null); }}
        item={openItem}
        documents={documents}
        onChanged={onChanged}
      />
    </div>
  );
}

function TaskTags({ item, documents }) {
  const steps = item.steps || [];
  const needed = (item.materials || []).filter((m) => !m.have).length;
  return (
    <>
      {/* Most tasks come from the estimate, so only work added later by a change order is tagged. */}
      {item.source_type === "ChangeOrder" && <Tag tone="brand">Change order</Tag>}
      {taskSourceVoided(item, documents) && <Tag tone="void">Voided</Tag>}
      {formatHours(item.labor_hours) && <Tag><Clock className="inline w-2.5 h-2.5 mr-0.5 -mt-px" aria-hidden="true" />{formatHours(item.labor_hours)}</Tag>}
      {item.amount_cents != null && <Tag tone="money">{moneyCents(item.amount_cents)}{item.billed_invoice_id ? " · billed" : ""}</Tag>}
      {steps.length > 0 && <Tag>{steps.filter((s) => s.done).length}/{steps.length} steps</Tag>}
      {needed > 0 && <Tag tone="materials">{needed} to get</Tag>}
    </>
  );
}

function TaskRow({ item, documents, busy, onPatch, onStatus, onOpen, note }) {
  const [expanded, setExpanded] = useState(true);
  const status = taskStatus(item);
  const steps = item.steps || [];
  const closed = status === "done" || status === "cancelled";

  const toggleStep = (stepId) => onPatch(item, { steps: steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s)) });
  // New steps go up without an id; the server assigns one.
  const addStep = (text) => onPatch(item, { steps: [...steps, { text: text.trim(), done: false }] });
  const removeStep = (stepId) => onPatch(item, { steps: steps.filter((s) => s.id !== stepId) });

  return (
    <div data-testid={`task-${item.id}`} className={cn("rounded-lg border p-2.5", statusCardClass(status), closed ? "bg-slate-50/60" : "bg-white")}>
      <div className="flex flex-wrap items-start gap-2">
        <button type="button" className="flex-1 min-w-[10rem] text-left" onClick={onOpen}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("text-sm font-medium hover:underline", closed ? "text-slate-400" : "text-slate-800", status === "cancelled" && "line-through")}>{item.description}</span>
            <TaskTags item={item} documents={documents} />
          </div>
        </button>
        <div className="flex items-center gap-1">
          <StatusSelect
            value={status}
            onValueChange={(next) => onStatus(item, next)}
            statuses={TASK_STATUSES}
            formatLabel={taskStatusLabel}
            triggerClassName="h-7 text-xs w-auto min-w-[7.5rem] px-2"
          />
          <button type="button" aria-label={expanded ? "Hide steps" : "Show steps"} className="text-slate-400 hover:text-slate-600 p-1" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <TaskNotes item={item} {...note} className="mt-1.5" />

      {expanded && (
        <div className="mt-2 ml-1 space-y-1">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-2 group">
              <button
                type="button"
                data-testid={`task-step-${step.id}`}
                onClick={() => toggleStep(step.id)}
                disabled={busy}
                aria-label={step.done ? "Mark step not done" : "Mark step done"}
                className={cn(
                  "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                  step.done ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-slate-400"
                )}
              >
                {step.done && <Check className="w-3 h-3 text-white" />}
              </button>
              <span className={cn("text-xs flex-1", step.done ? "line-through text-slate-400" : "text-slate-600")}>{step.text}</span>
              <button type="button" aria-label="Remove step" className="text-slate-300 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => removeStep(step.id)}>
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <StepAdder disabled={busy} onAdd={addStep} />
        </div>
      )}
    </div>
  );
}

function BoardColumn({ status, items, documents, busyId, onOpen, noteProps, jobsById = undefined }) {
  const colors = statusColors(status);
  return (
    <Droppable droppableId={status}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          data-testid={`task-column-${status}`}
          className={cn(
            "w-60 shrink-0 rounded-xl border-2 bg-surface-muted/80 flex flex-col",
            colors.column,
            snapshot.isDraggingOver && cn("ring-2", colors.ring, colors.columnHeader)
          )}
        >
          <div className={cn("px-3 py-2 border-b rounded-t-[10px]", colors.columnHeader)}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
                <span className={cn("w-2 h-2 rounded-full", colors.swatch)} aria-hidden="true" />
                {taskStatusLabel(status)}
              </span>
              <span className="text-xs font-bold tabular-nums text-foreground">
                {items.length}
                {formatHours(hoursRemaining(items)) && <span className="ml-1 font-medium text-muted-foreground">· {formatHours(hoursRemaining(items))}</span>}
              </span>
            </div>
          </div>
          <div className="p-2 space-y-2 min-h-[4rem]">
            {items.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    data-testid={`task-card-${item.id}`}
                    onClick={() => onOpen(item.id)}
                    className={cn(
                      "bg-card rounded-lg border p-2.5 shadow-sm cursor-pointer",
                      statusCardClass(status),
                      dragSnapshot.isDragging && "shadow-md ring-2 ring-primary/40",
                      busyId === item.id && "opacity-60"
                    )}
                  >
                    {jobsById && (
                      <Link
                        to={`/jobs/${item.job_id}?tab=tasks`}
                        onClick={(e) => e.stopPropagation()}
                        className="block text-[11px] font-medium text-primary hover:underline truncate mb-0.5"
                      >
                        {jobsById[item.job_id]?.title || "Job"}
                        {jobsById[item.job_id]?.client_name ? ` · ${jobsById[item.job_id].client_name}` : ""}
                      </Link>
                    )}
                    <div className="text-sm font-medium text-foreground leading-snug line-clamp-3">{item.description}</div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <TaskTags item={item} documents={documents} />
                    </div>
                    <TaskNotes item={item} {...noteProps(item)} className="mt-1.5" />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {items.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">Drop tasks here</div>}
          </div>
        </div>
      )}
    </Droppable>
  );
}

function StepAdder({ onAdd, disabled }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim() || disabled) return;
    onAdd(text);
    setText("");
  };
  return (
    <div className="flex items-center gap-2 pt-1">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Add a step…"
        className="flex-1 px-2 py-1 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
      />
      <button type="button" onClick={submit} aria-label="Add step" className="text-slate-400 hover:text-primary">
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function Tag({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    brand: "bg-brand-muted text-brand-muted-foreground",
    money: "bg-emerald-100 text-emerald-700",
    materials: "bg-attention-materials-muted text-attention-materials-foreground",
    void: "bg-red-50 text-red-600",
  };
  return <span className={cn("text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded", tones[tone])}>{children}</span>;
}
