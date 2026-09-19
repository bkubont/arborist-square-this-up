import React, { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CatalogPickerDialog from "@/components/CatalogPickerDialog";
import DocumentLifecycleActions from "@/components/DocumentLifecycleActions";
import StatusSelect from "@/components/StatusSelect";
import { DOCUMENT_STATUSES } from "@/lib/documents";
import { money } from "@/lib/format";
import {
  WORK_CATEGORIES,
  catalogItemToWorkOrderLine,
  workOrderLineAmount,
  workOrderTotals,
} from "@/lib/documentMapping";

function emptyLine(kind = "labor") {
  return {
    kind,
    description: "",
    qty: kind === "material" ? "1" : "",
    unit_price: "",
    hours: "",
    rate: "",
    work_category: "",
    notes: "",
    catalog_id: "",
  };
}

function toFormLine(line) {
  return {
    kind: line.kind || "labor",
    description: line.description || "",
    qty: line.qty ?? "",
    unit_price: line.unit_price ?? "",
    hours: line.hours ?? "",
    rate: line.rate ?? "",
    work_category: line.work_category || "",
    notes: line.notes || "",
    catalog_id: line.catalog_id || "",
  };
}

function serializeLine(line) {
  const num = (v) => (v === "" || v == null ? undefined : Number(v));
  return {
    kind: line.kind,
    description: line.description || "",
    qty: num(line.qty),
    unit_price: num(line.unit_price),
    hours: num(line.hours),
    rate: num(line.rate),
    work_category: line.work_category || undefined,
    notes: line.notes || undefined,
    catalog_id: line.catalog_id || undefined,
  };
}

/** Unified Work Order editor (Phase 3) — one type, per-line work category. */
export default function WorkOrderEditorDialog({ open, onOpenChange, document, jobId, onSaved, onRevised }) {
  const [form, setForm] = useState({
    number: "", status: "draft", crew: "", start_date: "", end_date: "",
    instructions: "", notes: "", tax_rate: "",
  });
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogTarget, setCatalogTarget] = useState(null);

  useEffect(() => {
    if (!open || !document) return;
    setForm({
      number: document.number || "",
      status: document.status || "draft",
      crew: document.crew || "",
      start_date: document.start_date || "",
      end_date: document.end_date || "",
      instructions: document.instructions || "",
      notes: document.notes || "",
      tax_rate: document.tax_rate ?? "",
    });
    setLines(Array.isArray(document.lines) && document.lines.length
      ? document.lines.map(toFormLine)
      : [emptyLine()]);
  }, [open, document]);

  const totals = useMemo(() => workOrderTotals(lines.map(serializeLine), form.tax_rate), [lines, form.tax_rate]);
  if (!document) return null;

  const setLine = (index, patch) => setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    setSaving(true);
    try {
      const serialized = lines.map(serializeLine).filter((l) => l.description || l.hours || l.qty || l.unit_price || l.rate);
      const next = workOrderTotals(serialized, form.tax_rate);
      await api.entities.WorkOrder.update(document.id, {
        number: form.number || undefined,
        status: form.status,
        crew: form.crew,
        start_date: form.start_date,
        end_date: form.end_date,
        instructions: form.instructions,
        notes: form.notes,
        tax_rate: form.tax_rate === "" ? undefined : Number(form.tax_rate),
        lines: serialized,
        ...next,
      });
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const onCatalogPick = (item) => {
    if (catalogTarget == null) return;
    const mapped = catalogItemToWorkOrderLine(item);
    setLine(catalogTarget, {
      kind: "labor",
      description: mapped.description,
      hours: mapped.hours ?? "",
      rate: mapped.rate ?? "",
      work_category: mapped.work_category || "",
      notes: mapped.notes || "",
      catalog_id: mapped.catalog_id || "",
      qty: "",
      unit_price: "",
    });
  };

  const categoryOptions = (current) => {
    const set = new Set(WORK_CATEGORIES);
    if (current) set.add(current);
    return [...set];
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Work Order{form.number ? ` · ${form.number}` : ""}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500 -mt-1">
            Unified work order — use work category on each line (not separate Construction/Maintenance forms).
            {document.related_estimate_id ? " Prefill from accepted estimate; all fields stay editable." : ""}
          </p>

          <div className="grid sm:grid-cols-4 gap-3">
            <div>
              <Label>Number</Label>
              <Input value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} />
            </div>
            <div>
              <Label>Status</Label>
              <StatusSelect
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                statuses={DOCUMENT_STATUSES.WorkOrder}
              />
            </div>
            <div>
              <Label>Start</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div>
              <Label>Crew</Label>
              <Input value={form.crew} onChange={(e) => setForm((f) => ({ ...f, crew: e.target.value }))} />
            </div>
            <div>
              <Label>Tax %</Label>
              <Input type="number" value={form.tax_rate} onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value }))} />
            </div>
          </div>

          <div className="mt-3">
            <Label>Instructions</Label>
            <Textarea rows={2} value={form.instructions} onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))} />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Lines</div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => { setCatalogTarget(lines.length); setLines((r) => [...r, emptyLine("labor")]); setCatalogOpen(true); }}>
                  <Search className="w-3.5 h-3.5 mr-1" /> Catalog
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setLines((r) => [...r, emptyLine("labor")])}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Labor
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setLines((r) => [...r, emptyLine("material")])}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Material
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 space-y-2">
                  <div className="flex gap-2">
                    <Select value={line.kind} onValueChange={(v) => setLine(index, { kind: v })}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="labor">Labor</SelectItem>
                        <SelectItem value="material">Material</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input className="flex-1 bg-white" placeholder="Description" value={line.description} onChange={(e) => setLine(index, { description: e.target.value })} />
                    <Button type="button" variant="outline" size="icon" onClick={() => { setCatalogTarget(index); setCatalogOpen(true); }}>
                      <Search className="w-4 h-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" className="text-red-600" onClick={() => setLines((rows) => rows.length <= 1 ? [emptyLine()] : rows.filter((_, i) => i !== index))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {line.kind === "labor" ? (
                      <>
                        <div>
                          <Label className="text-xs">Hours</Label>
                          <Input type="number" className="bg-white" value={line.hours} onChange={(e) => setLine(index, { hours: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Rate $/hr</Label>
                          <Input type="number" className="bg-white" value={line.rate} onChange={(e) => setLine(index, { rate: e.target.value })} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <Label className="text-xs">Qty</Label>
                          <Input type="number" className="bg-white" value={line.qty} onChange={(e) => setLine(index, { qty: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Unit price</Label>
                          <Input type="number" className="bg-white" value={line.unit_price} onChange={(e) => setLine(index, { unit_price: e.target.value })} />
                        </div>
                      </>
                    )}
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Work category</Label>
                      <Select value={line.work_category || "__none"} onValueChange={(v) => setLine(index, { work_category: v === "__none" ? "" : v })}>
                        <SelectTrigger className="bg-white"><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent className="max-h-64">
                          <SelectItem value="__none">—</SelectItem>
                          {categoryOptions(line.work_category).map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Input className="bg-white" placeholder="Notes" value={line.notes} onChange={(e) => setLine(index, { notes: e.target.value })} />
                  <div className="text-xs text-slate-500 text-right">Line {money(workOrderLineAmount(serializeLine(line)))}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm space-y-1 self-start">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{money(totals.tax_amount)}</span></div>
              <div className="flex justify-between font-semibold border-t border-slate-100 pt-1"><span>Total</span><span>{money(totals.total)}</span></div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2 sm:justify-between">
            <DocumentLifecycleActions
              entity="WorkOrder"
              document={document}
              disabled={saving}
              onSaved={() => { onSaved?.(); onOpenChange(false); }}
              onRevised={(created) => { onOpenChange(false); onRevised?.(created); }}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={save} disabled={saving || form.status === "void"}>{saving ? "Saving…" : "Save work order"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CatalogPickerDialog open={catalogOpen} onOpenChange={setCatalogOpen} onPick={onCatalogPick} />
    </>
  );
}
