import React, { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "@/api/client";
import MaterialStatusSelect from "@/components/MaterialStatusSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/format";
import { serializeMaterialRows } from "@/lib/jobMaterials";
import { isHiddenBuiltInTask } from "@/lib/tasks";

const blankRow = () => ({ description: "", qty: "", unit: "", unit_price: "", status: "needed", have: false, notes: "", task_id: "" });

/**
 * The job buy list on Overview. Each line is Needed / Ordered / Waiting / On hand
 * and can be tagged to a task. The task T-chart edits these same rows.
 */
export default function JobMaterialsPanel({ jobId, materials = [], tasks = [], onChanged }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  const taskOptions = tasks.filter((task) => task?.id && !isHiddenBuiltInTask(task) && task.status !== "cancelled");

  useEffect(() => {
    setRows(
      materials.length
        ? materials.map((m) => ({
          ...m,
          qty: m.qty ?? "",
          unit_price: m.unit_price ?? "",
          task_id: m.task_id || "",
        }))
        : [blankRow()],
    );
  }, [materials]);

  const setRow = (index, patch) => setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const persist = async (nextRows) => {
    setSaving(true);
    try {
      await api.entities.Job.update(jobId, { materials: serializeMaterialRows(nextRows) });
      onChanged?.();
    } catch (e) {
      alert(e?.message || "Could not save materials.");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = (index, status) => {
    const next = rows.map((row, i) => (i === index ? { ...row, status, have: status === "on_hand" } : row));
    setRows(next);
    persist(next);
  };

  const setTask = (index, taskId) => {
    const next = rows.map((row, i) => (i === index ? { ...row, task_id: taskId } : row));
    setRows(next);
    if (String(next[index]?.description || "").trim()) persist(next);
  };

  const removeRow = (index) => {
    const next = rows.length <= 1 ? [blankRow()] : rows.filter((_, i) => i !== index);
    setRows(next);
    persist(next);
  };

  const total = rows.reduce((sum, m) => sum + (Number(m.qty) || 0) * (Number(m.unit_price) || 0), 0);

  return (
    <div className="bg-card rounded-xl border border-border p-4" data-testid="job-materials">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Materials</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Buy list for the whole job. Tag a line to a task to show it on that task, or leave it untagged. Status drives the header materials line.
          </p>
        </div>
        {total > 0 && <span className="text-xs text-muted-foreground tabular-nums">{money(total)} listed</span>}
      </div>

      <div className="space-y-2">
        {rows.map((m, i) => {
          const known = taskOptions.some((task) => task.id === m.task_id);
          return (
            <div key={m.id || `new-${i}`} data-testid={`job-material-row-${i}`} className="rounded-lg border border-border/70 p-2 bg-muted/30 space-y-2">
              <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_4rem_4rem_5rem_7rem_auto] gap-2 items-center">
                <Input
                  value={m.description}
                  onChange={(e) => setRow(i, { description: e.target.value })}
                  placeholder="Item"
                  aria-label="Material"
                  className="h-8 text-sm"
                />
                <Input
                  type="number"
                  min="0"
                  value={m.qty}
                  onChange={(e) => setRow(i, { qty: e.target.value })}
                  placeholder="Qty"
                  aria-label="Quantity"
                  className="h-8 text-sm"
                />
                <Input
                  value={m.unit || ""}
                  onChange={(e) => setRow(i, { unit: e.target.value })}
                  placeholder="Unit"
                  aria-label="Unit"
                  className="h-8 text-sm hidden sm:block"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={m.unit_price}
                  onChange={(e) => setRow(i, { unit_price: e.target.value })}
                  placeholder="$ each"
                  aria-label="Price each"
                  className="h-8 text-sm"
                />
                <MaterialStatusSelect
                  value={m.status}
                  have={m.have}
                  onValueChange={(status) => setStatus(i, status)}
                  triggerClassName="h-8"
                />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => removeRow(i)} aria-label="Remove material">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <select
                aria-label="Tag to task"
                data-testid={`job-material-task-${i}`}
                value={m.task_id || ""}
                onChange={(e) => setTask(i, e.target.value)}
                className="h-8 w-full max-w-xs rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Not tagged</option>
                {m.task_id && !known && <option value={m.task_id}>Tagged task</option>}
                {taskOptions.map((task) => (
                  <option key={task.id} value={task.id}>{task.description || "Task"}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((list) => [...list, blankRow()])}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add item
        </Button>
        <Button type="button" size="sm" className="bg-primary text-primary-foreground" onClick={() => persist(rows)} disabled={saving}>
          {saving ? "Saving…" : "Save materials"}
        </Button>
      </div>
    </div>
  );
}
