import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Trash2, X } from "lucide-react";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import StatusSelect from "@/components/StatusSelect";
import WorkTypeSelect from "@/components/WorkTypeSelect";
import MaterialStatusSelect from "@/components/MaterialStatusSelect";
import { materialRowForStorage } from "@/lib/materialStatus";
import { NoteList } from "@/components/TaskNotes";
import { money, moneyCents } from "@/lib/format";
import { TASK_STATUSES, taskStatus, taskStatusLabel, taskDeletable, taskSourceVoided } from "@/lib/tasks";
import { cn } from "@/lib/utils";

const blankStep = () => ({ text: "", done: false });
const blankMeasurement = () => ({ label: "", value: "" });
const blankMaterial = () => ({ description: "", qty: "", unit: "", unit_price: "", status: "needed", have: false });

function toDraft(item) {
  return {
    description: item.description || "",
    status: taskStatus(item),
    category: item.category || "",
    tools: item.tools || "",
    notes: item.notes || "",
    labor_hours: item.labor_hours ?? "",
    steps: (item.steps || []).map((s) => ({ ...s })),
    measurements: (item.measurements || []).map((m) => ({ ...m })),
    materials: (item.materials || []).map((m) => ({ ...m, qty: m.qty ?? "", unit_price: m.unit_price ?? "" })),
  };
}

/**
 * Everything about one job task: status, notes, steps (edit / reorder), measurements and the
 * material list. Lines not on hand feed the job's draft Material Order (server side).
 *
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void, item: object | null, documents?: Array, onChanged: () => void }} props
 */
export default function TaskDetailDialog({ open, onOpenChange, item, documents = [], onChanged }) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item) setDraft(toDraft(item));
  }, [open, item]);

  if (!item || !draft) return null;

  const signed = !!item.source_type;
  const materialsTotal = draft.materials.reduce((sum, m) => sum + (Number(m.qty) || 0) * (Number(m.unit_price) || 0), 0);
  const voided = taskSourceVoided(item, documents);
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const setRow = (key, index, patch) => set(key, draft[key].map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeRow = (key, index) => set(key, draft[key].filter((_, i) => i !== index));
  const moveStep = (index, delta) => {
    const next = [...draft.steps];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    set("steps", next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const num = (v) => (v === "" || v == null ? undefined : Number(v));
      await api.entities.WorkItem.update(item.id, {
        // A signed task keeps its signed description (server/workItems.js).
        ...(!signed && { description: draft.description.trim() || item.description }),
        status: draft.status,
        // "" / null clear a field; undefined would be dropped from the request and keep the old value.
        category: draft.category.trim(),
        tools: draft.tools.trim(),
        notes: draft.notes,
        labor_hours: num(draft.labor_hours) ?? null,
        steps: draft.steps.filter((s) => s.text.trim()).map((s) => ({ ...s, text: s.text.trim() })),
        measurements: draft.measurements.filter((m) => m.label.trim() || m.value.trim()),
        materials: draft.materials
          .filter((m) => m.description.trim())
          .map((m) => materialRowForStorage({
            ...m,
            description: m.description.trim(),
            qty: num(m.qty),
            unit: m.unit || undefined,
            unit_price: num(m.unit_price),
          })),
      });
      await onChanged?.();
      onOpenChange(false);
    } catch (e) {
      alert(e?.message || "Could not save the task.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove "${item.description}"?`)) return;
    setSaving(true);
    try {
      await api.entities.WorkItem.delete(item.id);
      await onChanged?.();
      onOpenChange(false);
    } catch (e) {
      alert(e?.message || "Could not remove the task.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label>Task</Label>
              <Input value={draft.description} onChange={(e) => set("description", e.target.value)} disabled={signed} />
            </div>
            <div>
              <Label>Status</Label>
              <StatusSelect
                value={draft.status}
                onValueChange={(v) => set("status", v)}
                statuses={TASK_STATUSES}
                formatLabel={taskStatusLabel}
                className="sm:w-56"
              />
            </div>
          </div>
          {signed && (
            <p className="text-xs text-slate-500 -mt-2">
              From the signed {item.source_type === "ChangeOrder" ? "change order" : "estimate"}
              {item.amount_cents != null && <> · {moneyCents(item.amount_cents)}</>}
              {item.billed_invoice_id && " · billed"}
              {voided ? " · that document is now void" : " · the description stays as signed"}
            </p>
          )}

          {(item.status_notes || []).length > 0 && (
            <div>
              <Label>Card notes</Label>
              <p className="text-[11px] text-slate-500 mb-1">Add or remove these on the task card.</p>
              <NoteList notes={item.status_notes} />
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label>Labor hours</Label>
              <Input type="number" min="0" step="0.25" inputMode="decimal" value={draft.labor_hours} onChange={(e) => set("labor_hours", e.target.value)} />
            </div>
            <div>
              <Label>Work type</Label>
              <WorkTypeSelect value={draft.category} onValueChange={(v) => set("category", v)} placeholder="e.g. Plumbing" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>Tools</Label>
              <Input value={draft.tools} onChange={(e) => set("tools", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Internal — never shown to the customer" />
          </div>

          <Section title="Steps" onAdd={() => set("steps", [...draft.steps, blankStep()])} addLabel="Add step">
            {draft.steps.map((step, i) => (
              <div key={step.id || `new-${i}`} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRow("steps", i, { done: !step.done })}
                  aria-label={step.done ? "Mark step not done" : "Mark step done"}
                  className={cn(
                    "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0",
                    step.done ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-slate-400"
                  )}
                >
                  {step.done && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
                <Input value={step.text} onChange={(e) => setRow("steps", i, { text: e.target.value })} className={cn("h-8 text-sm", step.done && "line-through text-slate-400")} />
                <IconButton label="Move step up" onClick={() => moveStep(i, -1)} disabled={i === 0}><ArrowUp className="w-3.5 h-3.5" /></IconButton>
                <IconButton label="Move step down" onClick={() => moveStep(i, 1)} disabled={i === draft.steps.length - 1}><ArrowDown className="w-3.5 h-3.5" /></IconButton>
                <IconButton label="Remove step" onClick={() => removeRow("steps", i)} danger><X className="w-3.5 h-3.5" /></IconButton>
              </div>
            ))}
          </Section>

          <Section title="Measurements" onAdd={() => set("measurements", [...draft.measurements, blankMeasurement()])} addLabel="Add measurement">
            {draft.measurements.map((m, i) => (
              <div key={m.id || `new-${i}`} className="flex items-center gap-1.5">
                <Input value={m.label} onChange={(e) => setRow("measurements", i, { label: e.target.value })} placeholder="What (e.g. Wall width)" className="h-8 text-sm" />
                <Input value={m.value} onChange={(e) => setRow("measurements", i, { value: e.target.value })} placeholder={'Size (e.g. 72 1/4")'} className="h-8 text-sm" />
                <IconButton label="Remove measurement" onClick={() => removeRow("measurements", i)} danger><X className="w-3.5 h-3.5" /></IconButton>
              </div>
            ))}
          </Section>

          <Section
            title="Materials"
            hint={`Anything not on hand is added to the job’s draft Material Order, with its price.${materialsTotal ? ` Materials total ${money(materialsTotal)}.` : ""}`}
            onAdd={() => set("materials", [...draft.materials, blankMaterial()])}
            addLabel="Add material"
          >
            {draft.materials.map((m, i) => (
              <div key={m.id || `new-${i}`} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_4rem_5rem_5.5rem_7rem_auto] gap-1.5 items-center pb-1.5 sm:pb-0 border-b border-slate-100 sm:border-0 last:border-0">
                <Input value={m.description} onChange={(e) => setRow("materials", i, { description: e.target.value })} placeholder="Item" className="h-8 text-sm" />
                <Input type="number" min="0" value={m.qty} onChange={(e) => setRow("materials", i, { qty: e.target.value })} placeholder="Qty" className="h-8 text-sm" />
                <Input value={m.unit || ""} onChange={(e) => setRow("materials", i, { unit: e.target.value })} placeholder="Unit" className="h-8 text-sm" />
                <Input type="number" min="0" step="0.01" inputMode="decimal" value={m.unit_price} onChange={(e) => setRow("materials", i, { unit_price: e.target.value })} placeholder="$ each" aria-label="Price each" className="h-8 text-sm" />
                <MaterialStatusSelect
                  value={m.status}
                  have={m.have}
                  onValueChange={(status) => setRow("materials", i, { status, have: status === "on_hand" })}
                  triggerClassName="h-8"
                />
                <IconButton label="Remove material" onClick={() => removeRow("materials", i)} danger><X className="w-3.5 h-3.5" /></IconButton>
              </div>
            ))}
          </Section>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between mt-2">
          <div>
            {taskDeletable(item, documents) && (
              <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={remove} disabled={saving}>
                <Trash2 className="w-4 h-4 mr-1" /> Remove task
              </Button>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, hint = undefined, onAdd, addLabel, children }) {
  const empty = !React.Children.toArray(children).length;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5 mr-1" /> {addLabel}
        </Button>
      </div>
      {hint && <p className="text-[11px] text-slate-500 mb-1.5">{hint}</p>}
      <div className="space-y-1.5">
        {empty ? <p className="text-xs text-slate-400">None yet.</p> : children}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled = false, danger = false, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn("p-1 rounded text-slate-400 disabled:opacity-30", danger ? "hover:text-red-500" : "hover:text-slate-700")}
    >
      {children}
    </button>
  );
}
