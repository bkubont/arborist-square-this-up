import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DocumentLifecycleActions from "@/components/DocumentLifecycleActions";
import StatusSelect from "@/components/StatusSelect";
import { DOCUMENT_STATUSES } from "@/lib/documents";
import { money } from "@/lib/format";

function emptyLine() {
  return { description: "", qty: "", unit_price: "", supplier: "", notes: "" };
}

function lineAmount(line) {
  return (Number(line.qty) || 0) * (Number(line.unit_price) || 0);
}

/** Lightweight Material Order editor — available from day one on a job. */
export default function MaterialOrderEditorDialog({ open, onOpenChange, document, jobId, onSaved, onRevised }) {
  const [form, setForm] = useState({ number: "", status: "draft", date: "", notes: "" });
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !document) return;
    setForm({
      number: document.number || "",
      status: document.status || "draft",
      date: document.date || "",
      notes: document.notes || "",
    });
    const existing = Array.isArray(document.lines) && document.lines.length
      ? document.lines.map((l) => ({
          description: l.description || "",
          qty: l.qty ?? "",
          unit_price: l.unit_price ?? "",
          supplier: l.supplier || "",
          notes: l.notes || "",
        }))
      : [emptyLine()];
    setLines(existing);
  }, [open, document]);

  if (!document) return null;

  const setLine = (index, patch) => {
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const subtotal = lines.reduce((sum, line) => sum + lineAmount(line), 0);

  const save = async () => {
    setSaving(true);
    try {
      const serialized = lines
        .map((line) => ({
          description: line.description || "",
          qty: line.qty === "" || line.qty == null ? undefined : Number(line.qty),
          unit_price: line.unit_price === "" || line.unit_price == null ? undefined : Number(line.unit_price),
          supplier: line.supplier || undefined,
          notes: line.notes || undefined,
        }))
        .filter((line) => line.description || line.qty || line.unit_price);
      const total = Math.round(serialized.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0) * 100) / 100;
      const previousStatus = document.status;
      await api.entities.MaterialOrder.update(document.id, {
        number: form.number || undefined,
        status: form.status,
        date: form.date,
        notes: form.notes,
        lines: serialized,
        subtotal: total,
        total,
      });
      if (jobId && form.status !== previousStatus) {
        try {
          await api.entities.TimelineEntry.create({
            job_id: jobId,
            type: "note",
            text: `Material Order ${form.number || ""} status → ${form.status}`.trim(),
            category: "document",
          });
        } catch { /* non-blocking */ }
      }
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Material Order{form.number ? ` · ${form.number}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>Number</Label>
            <Input value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} />
          </div>
          <div>
            <Label>Status</Label>
            <StatusSelect
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              statuses={DOCUMENT_STATUSES.MaterialOrder}
              entity="MaterialOrder"
            />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Materials</div>
          </div>
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 space-y-2">
                <div className="flex gap-2">
                  <Input
                    className="flex-1 bg-white"
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) => setLine(index, { description: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 text-red-600"
                    onClick={() => setLines((rows) => (rows.length <= 1 ? [emptyLine()] : rows.filter((_, i) => i !== index)))}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" className="bg-white" value={line.qty} onChange={(e) => setLine(index, { qty: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Unit price $</Label>
                    <Input type="number" className="bg-white" value={line.unit_price} onChange={(e) => setLine(index, { unit_price: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Supplier</Label>
                    <Input className="bg-white" value={line.supplier} onChange={(e) => setLine(index, { supplier: e.target.value })} />
                  </div>
                </div>
                <div className="text-xs text-slate-500 text-right">Line {money(lineAmount(line))}</div>
              </div>
            ))}
          </div>
          <div className="mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((r) => [...r, emptyLine()])}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Line
            </Button>
          </div>
        </div>

        <div className="mt-3">
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="text-sm font-semibold text-right">Total {money(subtotal)}</div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
          <DocumentLifecycleActions
            entity="MaterialOrder"
            document={document}
            disabled={saving}
            onSaved={() => { onSaved?.(); onOpenChange(false); }}
            onRevised={(created) => { onOpenChange(false); onRevised?.(created); }}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={save} disabled={saving || form.status === "void"}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
