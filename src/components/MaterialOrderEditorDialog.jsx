import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Plus, Printer, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Image } from "@/components/ui/image";
import DocumentLifecycleActions from "@/components/DocumentLifecycleActions";
import StatusSelect from "@/components/StatusSelect";
import SupplierTypeahead from "@/components/SupplierTypeahead";
import { DOCUMENT_STATUSES, MATERIAL_LINE_STATUSES, statusLabel } from "@/lib/documents";
import { money } from "@/lib/format";

function emptyLine() {
  return {
    description: "",
    qty: "",
    unit_price: "",
    wo_line_number: "",
    category: "",
    notes: "",
    supplier: "",
    on_hand: false,
    /** Optional procurement status — blank by default (not Pricing). */
    line_status: "",
    source_entity: undefined,
    source_id: undefined,
    source_line_index: undefined,
  };
}

function toFormLine(line) {
  return {
    description: line.description || "",
    qty: line.qty ?? "",
    unit_price: line.unit_price ?? "",
    wo_line_number: line.wo_line_number ?? "",
    category: line.category || "",
    notes: line.notes || "",
    supplier: line.supplier || "",
    on_hand: !!line.on_hand,
    line_status: line.line_status || "",
    source_entity: line.source_entity,
    source_id: line.source_id,
    source_line_index: line.source_line_index,
  };
}

function lineAmount(line) {
  return (Number(line.qty) || 0) * (Number(line.unit_price) || 0);
}

function serializeLine(line) {
  const num = (v) => (v === "" || v == null ? undefined : Number(v));
  const woNum = num(line.wo_line_number);
  return {
    description: line.description || "",
    qty: num(line.qty),
    unit_price: num(line.unit_price),
    supplier: line.supplier || undefined,
    notes: line.notes || undefined,
    wo_line_number: woNum != null && Number.isFinite(woNum) ? Math.round(woNum) : undefined,
    category: line.category || undefined,
    on_hand: !!line.on_hand || undefined,
    // Omit when unset — never coerce to pricing
    line_status: line.line_status || undefined,
    source_entity: line.source_entity || undefined,
    source_id: line.source_id || undefined,
    source_line_index: line.source_line_index != null ? Number(line.source_line_index) : undefined,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isMoReceipt(entry, materialOrderId) {
  return Boolean(
    entry?.photo_url
    && entry.related_material_order_id === materialOrderId
    && (entry.category === "receipt" || entry.type === "receipt"),
  );
}

/** Material Order editor — two-row lines, WO Line#, receipts, catalog/seed supplier typeahead. */
export default function MaterialOrderEditorDialog({ open, onOpenChange, document, jobId, onSaved, onRevised }) {
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const [form, setForm] = useState({ number: "", status: "draft", date: "", notes: "" });
  const [lines, setLines] = useState([emptyLine()]);
  const [receipts, setReceipts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const loadReceipts = useCallback(async () => {
    if (!jobId || !document?.id) {
      setReceipts([]);
      return;
    }
    try {
      const entries = await api.entities.TimelineEntry.filter({ job_id: jobId }, "-created_date", 500);
      setReceipts((entries || []).filter((e) => isMoReceipt(e, document.id)));
    } catch {
      setReceipts([]);
    }
  }, [jobId, document?.id]);

  useEffect(() => {
    if (!open || !document) return;
    setForm({
      number: document.number || "",
      status: document.status === "ordered" ? "purchased" : (document.status || "draft"),
      date: document.date || "",
      notes: document.notes || "",
    });
    const existing = Array.isArray(document.lines) && document.lines.length
      ? document.lines.map(toFormLine)
      : [emptyLine()];
    setLines(existing);
    loadReceipts();
  }, [open, document, loadReceipts]);

  if (!document) return null;

  const setLine = (index, patch) => {
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const subtotal = lines.reduce((sum, line) => sum + lineAmount(line), 0);
  const readOnly = form.status === "void";

  const uploadReceipts = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || !jobId || !document.id) return;
    setPhotoBusy(true);
    try {
      for (const file of files) {
        const { file_url } = await api.uploadFile({ file });
        await api.entities.TimelineEntry.create({
          job_id: jobId,
          type: "receipt",
          text: `Receipt · Material Order ${form.number || document.number || ""}`.trim(),
          photo_url: file_url,
          category: "receipt",
          related_material_order_id: document.id,
        });
      }
      await loadReceipts();
      onSaved?.();
    } catch (e) {
      console.error(e);
      alert("Receipt upload failed. Try again.");
    } finally {
      setPhotoBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  };

  const removeReceipt = async (entry) => {
    if (!confirm("Delete this receipt photo?")) return;
    await api.entities.TimelineEntry.delete(entry.id);
    await loadReceipts();
    onSaved?.();
  };

  const save = async () => {
    setSaving(true);
    try {
      const serialized = lines
        .map(serializeLine)
        .filter((line) => line.description || line.qty || line.unit_price || line.wo_line_number);
      const total = Math.round(
        serialized.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0) * 100,
      ) / 100;
      const previousStatus = document.status === "ordered" ? "purchased" : document.status;
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

  const print = () => {
    const rows = lines
      .map(serializeLine)
      .filter((line) => line.description || line.qty || line.unit_price);
    const html = `<!DOCTYPE html><html><head><title>Material Order ${escapeHtml(form.number)}</title>
<style>
  body{font-family:system-ui,sans-serif;padding:24px;color:#111}
  h1{font-size:18px;margin:0 0 8px}
  .meta{color:#555;font-size:13px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f5f5f5}
  .num{text-align:right}
  .sub{color:#555;font-size:12px}
</style></head><body>
<h1>Material Order ${escapeHtml(form.number || "")}</h1>
<div class="meta">Status: ${escapeHtml(statusLabel(form.status))} · Date: ${escapeHtml(form.date || "")}</div>
<table>
<thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th><th>Line#</th><th>Category</th><th>Spec / notes</th><th>Supplier</th><th>On hand</th><th>Status</th></tr></thead>
<tbody>
${rows.map((line) => `<tr>
  <td>${escapeHtml(line.description)}</td>
  <td class="num">${line.qty ?? ""}</td>
  <td class="num">${line.unit_price != null ? money(line.unit_price) : ""}</td>
  <td class="num">${money((Number(line.qty) || 0) * (Number(line.unit_price) || 0))}</td>
  <td>${line.wo_line_number ?? ""}</td>
  <td>${escapeHtml(line.category || "")}</td>
  <td class="sub">${escapeHtml(line.notes || "")}</td>
  <td>${escapeHtml(line.supplier || "")}</td>
  <td>${line.on_hand ? "Yes" : ""}</td>
  <td>${escapeHtml(line.line_status ? statusLabel(line.line_status) : "")}</td>
</tr>`).join("")}
</tbody></table>
<p style="text-align:right;font-weight:600;margin-top:12px">Total ${money(subtotal)}</p>
${form.notes ? `<p class="sub">Notes: ${escapeHtml(form.notes)}</p>` : ""}
<script>window.print()</script></body></html>`;
    // Open a writable same-origin window first; sever opener after (noopener returns null).
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    try { w.opener = null; } catch { /* ignore */ }
    w.document.write(html);
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Material Order{form.number ? ` · ${form.number}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>Number</Label>
            <Input value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} disabled={readOnly} />
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
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} disabled={readOnly} />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Materials</div>
            <Button type="button" variant="outline" size="sm" onClick={print}>
              <Printer className="w-3.5 h-3.5 mr-1" /> Print
            </Button>
          </div>
          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={index} className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 space-y-2">
                {/* Row 1: Item | Qty | Unit Price | Total */}
                <div className="grid grid-cols-[1fr_5rem_6.5rem_5.5rem_auto] gap-2 items-end">
                  <div className="min-w-0">
                    <Label className="text-xs">Item</Label>
                    <Input
                      className="bg-white"
                      placeholder="Item"
                      value={line.description}
                      onChange={(e) => setLine(index, { description: e.target.value })}
                      disabled={readOnly}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" className="bg-white" value={line.qty} onChange={(e) => setLine(index, { qty: e.target.value })} disabled={readOnly} />
                  </div>
                  <div>
                    <Label className="text-xs">Unit Price</Label>
                    <Input type="number" className="bg-white" value={line.unit_price} onChange={(e) => setLine(index, { unit_price: e.target.value })} disabled={readOnly} />
                  </div>
                  <div>
                    <Label className="text-xs">Total</Label>
                    <div className="h-9 flex items-center justify-end text-sm font-medium tabular-nums px-1">{money(lineAmount(line))}</div>
                  </div>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0 text-red-600 mb-0.5"
                      onClick={() => setLines((rows) => (rows.length <= 1 ? [emptyLine()] : rows.filter((_, i) => i !== index)))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {/* Row 2: Line# | Category | Spec/notes | Supplier | On hand | optional status */}
                <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-1">
                    <Label className="text-xs">Line#</Label>
                    <Input
                      type="number"
                      className="bg-white"
                      value={line.wo_line_number}
                      onChange={(e) => setLine(index, { wo_line_number: e.target.value })}
                      disabled={readOnly}
                      title="Work Order line number"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Category</Label>
                    <Input className="bg-white" value={line.category} onChange={(e) => setLine(index, { category: e.target.value })} disabled={readOnly} />
                  </div>
                  <div className="sm:col-span-3">
                    <Label className="text-xs">Spec. / notes</Label>
                    <Input className="bg-white" value={line.notes} onChange={(e) => setLine(index, { notes: e.target.value })} disabled={readOnly} />
                  </div>
                  <div className="sm:col-span-3">
                    <Label className="text-xs">Supplier</Label>
                    <SupplierTypeahead
                      value={line.supplier}
                      onChange={(v) => setLine(index, { supplier: v })}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="sm:col-span-3 flex flex-wrap items-center gap-3 pb-1">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={!!line.on_hand}
                        onChange={(e) => setLine(index, { on_hand: e.target.checked })}
                        disabled={readOnly}
                      />
                      On hand
                    </label>
                    <div className="min-w-[8rem] flex-1">
                      <Select
                        value={line.line_status || "__none__"}
                        onValueChange={(v) => setLine(index, { line_status: v === "__none__" ? "" : v })}
                        disabled={readOnly}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue placeholder="">
                            {line.line_status ? statusLabel(line.line_status) : ""}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            <span className="text-slate-400">&nbsp;</span>
                          </SelectItem>
                          {MATERIAL_LINE_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2">
            {!readOnly && (
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((r) => [...r, emptyLine()])}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Line
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Receipts</div>
            {!readOnly && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={photoBusy}
                  onClick={() => cameraRef.current?.click()}
                >
                  {photoBusy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Camera className="w-3.5 h-3.5 mr-1" />}
                  Camera
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={photoBusy}
                  onClick={() => libraryRef.current?.click()}
                >
                  Upload
                </Button>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 mb-2">
            Receipts attach to this Material Order, the job photo gallery (Receipt), and the job timeline.
          </p>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => uploadReceipts(e.target.files)}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => uploadReceipts(e.target.files)}
          />
          {receipts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
              No receipts yet
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {receipts.map((entry) => (
                <div key={entry.id} className="relative group rounded-md overflow-hidden border border-slate-200 aspect-square bg-slate-100">
                  <Image src={entry.photo_url} fittingType="fill" className="w-full h-full" alt={entry.text || "Receipt"} />
                  {!readOnly && (
                    <button
                      type="button"
                      className="absolute top-1 right-1 p-1 rounded bg-white/90 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeReceipt(entry)}
                      title="Delete receipt"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3">
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} disabled={readOnly} />
        </div>
        <div className="text-sm font-semibold text-right">Total {money(subtotal)}</div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
          <DocumentLifecycleActions
            entity="MaterialOrder"
            document={document}
            disabled={saving || photoBusy}
            onSaved={() => { onSaved?.(); onOpenChange(false); }}
            onRevised={(created) => { onOpenChange(false); onRevised?.(created); }}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={save} disabled={saving || readOnly}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
