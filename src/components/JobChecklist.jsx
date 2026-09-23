import React, { useState } from "react";
import { Plus, X, Check, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { moneyCents } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The job's internal task list (WorkItem), replacing the free-text Job.checklist and the Work
 * Order. One task per signed Estimate/ChangeOrder line (created at signing; see server/sign.js),
 * plus any free-standing task the owner adds by hand. Steps and notes here are never shown to the
 * customer. A signed task can't be renamed or removed while its document stands (server/workItems.js).
 *
 * @param {{ jobId: string, items: Array, documents?: Array, onChanged: () => void }} props
 */
export default function JobChecklist({ jobId, items = [], documents = [], onChanged }) {
  const [adding, setAdding] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [open, setOpen] = useState(/** @type {Record<string, boolean>} */ ({}));

  const sorted = [...items].sort((a, b) => Number(a.done) - Number(b.done) || (a.created_date || "").localeCompare(b.created_date || ""));
  const doneCount = items.filter((i) => i.done).length;
  const sourceVoided = (item) => !!item.source_id && documents.some((d) => d.id === item.source_id && d.status === "void");

  const run = async (itemId, action) => {
    setBusyId(itemId);
    try {
      await action();
      await onChanged?.();
    } catch (e) {
      alert(e?.message || "Could not update the checklist.");
    } finally {
      setBusyId(null);
    }
  };

  const patch = (item, data) => run(item.id, () => api.entities.WorkItem.update(item.id, data));

  const stepsOf = (item) => item.steps || [];

  const toggleStep = (item, stepId) => {
    const steps = stepsOf(item).map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
    const allDone = steps.length > 0 && steps.every((s) => s.done);
    patch(item, allDone && !item.done ? { steps, done: true } : { steps });
  };

  // New steps go up without an id; the server assigns one.
  const addStep = (item, text) => patch(item, { steps: [...stepsOf(item), { text: text.trim(), done: false }] });

  const removeStep = (item, stepId) => patch(item, { steps: stepsOf(item).filter((s) => s.id !== stepId) });

  const addTask = () => {
    const description = adding.trim();
    if (!description) return;
    setAdding("");
    run("new", () => api.entities.WorkItem.create({ job_id: jobId, description }));
  };

  const deleteTask = (item) => {
    if (!confirm(`Remove "${item.description}"?`)) return;
    run(item.id, () => api.entities.WorkItem.delete(item.id));
  };

  return (
    <div>
      <div className="text-xs text-slate-500 mb-2">
        {items.length ? `${doneCount}/${items.length} done` : "No tasks yet. Signed estimate and change order lines show up here."}
      </div>

      <div className="space-y-2 mb-3">
        {sorted.map((item) => {
          const steps = stepsOf(item);
          // Open by default so a task doesn't collapse the moment its first step is added.
          const isOpen = open[item.id] ?? true;
          const stepsDone = steps.filter((s) => s.done).length;
          const voided = sourceVoided(item);
          return (
            <div key={item.id} data-testid={`checklist-task-${item.id}`} className={cn("rounded-lg border p-2.5", item.done || voided ? "border-slate-100 bg-slate-50/60" : "border-slate-200 bg-white")}>
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => patch(item, { done: !item.done })}
                  disabled={busyId === item.id}
                  aria-label={item.done ? "Mark not done" : "Mark done"}
                  className={cn(
                    "w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                    item.done ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-slate-400"
                  )}
                >
                  {item.done && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => steps.length > 0 && setOpen((o) => ({ ...o, [item.id]: !isOpen }))}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn("text-sm font-medium", item.done ? "line-through text-slate-400" : "text-slate-800")}>{item.description}</span>
                    {item.category && <Tag>{item.category}</Tag>}
                    {item.source_type && <Tag tone="brand">{item.source_type === "ChangeOrder" ? "Change order" : "Estimate"}</Tag>}
                    {voided && <Tag tone="void">Voided</Tag>}
                    {item.amount_cents != null && <Tag tone="money">{moneyCents(item.amount_cents)}{item.billed_invoice_id ? " · billed" : ""}</Tag>}
                  </div>
                  {(item.tools || item.notes) && (
                    <div className="text-xs text-slate-500 mt-0.5">{[item.tools && `Tools: ${item.tools}`, item.notes].filter(Boolean).join(" · ")}</div>
                  )}
                </button>
                {steps.length > 0 && (
                  <button type="button" aria-label={isOpen ? "Hide steps" : "Show steps"} className="text-slate-400 hover:text-slate-600 mt-0.5" onClick={() => setOpen((o) => ({ ...o, [item.id]: !isOpen }))}>
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                )}
                {(!item.source_type || voided) && (
                  <button type="button" className="text-slate-300 hover:text-red-500 mt-0.5" onClick={() => deleteTask(item)} title="Remove task" aria-label="Remove task">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="mt-2 ml-7 space-y-1">
                  {steps.length > 0 && (
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">{stepsDone}/{steps.length} steps</div>
                  )}
                  {steps.map((step) => (
                    <div key={step.id} className="flex items-center gap-2 group">
                      <button
                        type="button"
                        data-testid={`checklist-step-${step.id}`}
                        onClick={() => toggleStep(item, step.id)}
                        disabled={busyId === item.id}
                        aria-label={step.done ? "Mark step not done" : "Mark step done"}
                        className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                          step.done ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-slate-400"
                        )}
                      >
                        {step.done && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <span className={cn("text-xs flex-1", step.done ? "line-through text-slate-400" : "text-slate-600")}>{step.text}</span>
                      <button type="button" aria-label="Remove step" className="text-slate-300 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => removeStep(item, step.id)}>
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <StepAdder disabled={busyId === item.id} onAdd={(text) => addStep(item, text)} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
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
    </div>
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
    void: "bg-red-50 text-red-600",
  };
  return <span className={cn("text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded", tones[tone])}>{children}</span>;
}
