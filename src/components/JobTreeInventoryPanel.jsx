import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  COMMON_TREE_SPECIES,
  TREE_CONDITIONS,
  TREE_RECOMMENDED_WORK,
  TREE_METHOD_NEEDS,
} from "../../shared/arboristServicePresets.js";

const blankTree = () => ({
  label: "",
  species: "",
  dbh_inches: "",
  height_ft: "",
  condition: "unknown",
  location_note: "",
  recommended_work: [],
  method_needs: [],
  cleanup_notes: "",
  notes: "",
});

function conditionLabel(value) {
  return String(value || "unknown").replace(/_/g, " ");
}

function workLabel(value) {
  return String(value || "").replace(/_/g, " ");
}

/**
 * Per-job tree / work-area inventory — species, location, method needs, cleanup.
 */
export default function JobTreeInventoryPanel({ jobId, trees = [], onChanged }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(
      trees.length
        ? trees.map((t) => ({
            ...t,
            dbh_inches: t.dbh_inches ?? "",
            height_ft: t.height_ft ?? "",
            recommended_work: Array.isArray(t.recommended_work) ? t.recommended_work : [],
            method_needs: Array.isArray(t.method_needs) ? t.method_needs : [],
            cleanup_notes: t.cleanup_notes || "",
          }))
        : [],
    );
  }, [trees]);

  const setRow = (index, patch) => setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const toggleList = (index, field, value) => {
    setRows((list) =>
      list.map((row, i) => {
        if (i !== index) return row;
        const current = new Set(row[field] || []);
        if (current.has(value)) current.delete(value);
        else current.add(value);
        return { ...row, [field]: [...current] };
      }),
    );
  };

  const persistOne = async (row) => {
    const label = String(row.label || "").trim();
    if (!label) {
      setError("Each tree needs a label or tag.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        job_id: jobId,
        label,
        species: String(row.species || "").trim() || undefined,
        dbh_inches: row.dbh_inches === "" || row.dbh_inches == null ? undefined : Number(row.dbh_inches),
        height_ft: row.height_ft === "" || row.height_ft == null ? undefined : Number(row.height_ft),
        condition: row.condition || "unknown",
        location_note: String(row.location_note || "").trim() || undefined,
        recommended_work: row.recommended_work || [],
        method_needs: row.method_needs || [],
        cleanup_notes: String(row.cleanup_notes || "").trim() || undefined,
        notes: String(row.notes || "").trim() || undefined,
        photo_url: row.photo_url || undefined,
        estimate_line_id: row.estimate_line_id || undefined,
      };
      if (row.id) await api.entities.TreeInventory.update(row.id, payload);
      else await api.entities.TreeInventory.create(payload);
      onChanged?.();
    } catch (e) {
      setError(e?.message || "Could not save tree.");
    } finally {
      setSaving(false);
    }
  };

  const removeOne = async (row, index) => {
    if (!row.id) {
      setRows((list) => list.filter((_, i) => i !== index));
      return;
    }
    if (!window.confirm(`Remove tree “${row.label}” from this job?`)) return;
    setSaving(true);
    setError("");
    try {
      await api.entities.TreeInventory.delete(row.id);
      onChanged?.();
    } catch (e) {
      setError(e?.message || "Could not remove tree.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border p-4" data-testid="job-tree-inventory">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Trees / work areas</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Label each tree or area — species, location, method needs, and cleanup. Attach to estimate lines when quoting.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => setRows((list) => [...list, blankTree()])}
          data-testid="add-tree"
        >
          <Plus className="w-4 h-4 mr-1" /> Add tree
        </Button>
      </div>

      {error && <p className="text-sm text-destructive mb-2">{error}</p>}

      {!rows.length && (
        <p className="text-sm text-muted-foreground py-2">
          No trees listed yet. Add oaks, pines, and hazard trees as you walk the property.
        </p>
      )}

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div
            key={row.id || `new-tree-${i}`}
            data-testid={`tree-row-${i}`}
            className="rounded-lg border border-border/70 p-3 bg-muted/30 space-y-2"
          >
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5.5rem_5.5rem_8rem_auto] gap-2 items-center">
              <Input
                value={row.label}
                onChange={(e) => setRow(i, { label: e.target.value })}
                placeholder="Label / tag (e.g. T-1)"
                aria-label="Tree label"
                className="h-8 text-sm"
              />
              <Input
                list={`species-presets-${i}`}
                value={row.species || ""}
                onChange={(e) => setRow(i, { species: e.target.value })}
                placeholder="Species"
                aria-label="Species"
                className="h-8 text-sm"
              />
              <datalist id={`species-presets-${i}`}>
                {COMMON_TREE_SPECIES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={row.dbh_inches}
                onChange={(e) => setRow(i, { dbh_inches: e.target.value })}
                placeholder='DBH"'
                aria-label="DBH inches"
                className="h-8 text-sm"
              />
              <Input
                type="number"
                min="0"
                step="1"
                value={row.height_ft}
                onChange={(e) => setRow(i, { height_ft: e.target.value })}
                placeholder="Ht ft"
                aria-label="Height feet"
                className="h-8 text-sm"
              />
              <Select value={row.condition || "unknown"} onValueChange={(v) => setRow(i, { condition: v })}>
                <SelectTrigger className="h-8 text-xs" aria-label="Condition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TREE_CONDITIONS.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs capitalize">
                      {conditionLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1 justify-end">
                <Button type="button" size="sm" className="h-8" disabled={saving} onClick={() => persistOne(row)}>
                  Save
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  disabled={saving}
                  onClick={() => removeOne(row, i)}
                  aria-label="Remove tree"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Input
              value={row.location_note || ""}
              onChange={(e) => setRow(i, { location_note: e.target.value })}
              placeholder="Location on property (front yard, NE corner, …)"
              aria-label="Location"
              className="h-8 text-sm"
            />
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Recommended work</div>
              <div className="flex flex-wrap gap-1.5">
                {TREE_RECOMMENDED_WORK.map((work) => {
                  const on = (row.recommended_work || []).includes(work);
                  return (
                    <button
                      key={work}
                      type="button"
                      onClick={() => toggleList(i, "recommended_work", work)}
                      className={`text-[11px] px-2 py-0.5 rounded-md border capitalize ${
                        on
                          ? "bg-primary/10 border-primary/40 text-primary"
                          : "bg-background border-border text-muted-foreground"
                      }`}
                    >
                      {workLabel(work)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Method needs</div>
              <div className="flex flex-wrap gap-1.5">
                {TREE_METHOD_NEEDS.map((need) => {
                  const on = (row.method_needs || []).includes(need);
                  return (
                    <button
                      key={need}
                      type="button"
                      onClick={() => toggleList(i, "method_needs", need)}
                      className={`text-[11px] px-2 py-0.5 rounded-md border capitalize ${
                        on
                          ? "bg-primary/10 border-primary/40 text-primary"
                          : "bg-background border-border text-muted-foreground"
                      }`}
                    >
                      {workLabel(need)}
                    </button>
                  );
                })}
              </div>
            </div>
            <Textarea
              value={row.cleanup_notes || ""}
              onChange={(e) => setRow(i, { cleanup_notes: e.target.value })}
              placeholder="Cleanup (brush, logs, firewood, stump depth, hauling, restoration…)"
              rows={2}
              className="text-sm"
              aria-label="Cleanup notes"
            />
            <Textarea
              value={row.notes || ""}
              onChange={(e) => setRow(i, { notes: e.target.value })}
              placeholder="Notes (lean, target, access, …)"
              rows={2}
              className="text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
