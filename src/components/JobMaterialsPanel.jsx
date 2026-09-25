import React, { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/format";

const blankRow = () => ({ description: "", qty: "", unit: "", unit_price: "", have: false, notes: "" });

/**
 * Job-level materials list (not on estimates). Items not on hand feed the draft Material Order.
 */
export default function JobMaterialsPanel({ jobId, materials = [], onChanged }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(
      materials.length
        ? materials.map((m) => ({
          ...m,
          qty: m.qty ?? "",
          unit_price: m.unit_price ?? "",
        }))
        : [blankRow()],
    );
  }, [materials]);

  const setRow = (index, patch) => setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeRow = (index) => setRows((list) => (list.length <= 1 ? [blankRow()] : list.filter((_, i) => i !== index)));

  const save = async () => {
    setSaving(true);
    try {
      const num = (v) => (v === "" || v == null ? undefined : Number(v));
      const payload = rows
        .filter((m) => m.description.trim())
        .map((m) => ({
          ...m,
          description: m.description.trim(),
          qty: num(m.qty),
          unit: m.unit || undefined,
          unit_price: num(m.unit_price),
          notes: m.notes?.trim() || undefined,
        }));
      await api.entities.Job.update(jobId, { materials: payload });
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  const total = rows.reduce((sum, m) => sum + (Number(m.qty) || 0) * (Number(m.unit_price) || 0), 0);

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Materials</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Job-level list on Overview — separate from task materials on the Tasks tab. Unticked items feed the draft Material Order.
          </p>
        </div>
        {total > 0 && <span className="text-xs text-muted-foreground tabular-nums">{money(total)} listed</span>}
      </div>

      <div className="space-y-2">
        {rows.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_4rem_4rem_5rem_auto_auto] gap-2 items-center rounded-lg border border-border/70 p-2 bg-muted/30">
            <Input
              value={m.description}
              onChange={(e) => setRow(i, { description: e.target.value })}
              placeholder="Item"
              className="h-8 text-sm"
            />
            <Input
              type="number"
              min="0"
              value={m.qty}
              onChange={(e) => setRow(i, { qty: e.target.value })}
              placeholder="Qty"
              className="h-8 text-sm"
            />
            <Input
              value={m.unit || ""}
              onChange={(e) => setRow(i, { unit: e.target.value })}
              placeholder="Unit"
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
              className="h-8 text-sm"
            />
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap px-1">
              <input
                type="checkbox"
                checked={!!m.have}
                onChange={(e) => setRow(i, { have: e.target.checked })}
              />
              Have
            </label>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => removeRow(i)} aria-label="Remove">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((list) => [...list, blankRow()])}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add item
        </Button>
        <Button type="button" size="sm" className="bg-primary text-primary-foreground" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save materials"}
        </Button>
      </div>
    </div>
  );
}
