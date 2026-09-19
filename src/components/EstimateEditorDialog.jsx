import React, { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, Printer, Send } from "lucide-react";
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
import { money, shortDate } from "@/lib/format";
import {
  catalogItemToFormLine,
  emptyEstimateLine,
  estimateTotals,
  lineTotal,
  serializeEstimateLine,
} from "@/lib/estimateMath";

/**
 * Estimate editor: dual line model + catalog search→fill + client e-sign send.
 */
export default function EstimateEditorDialog({ open, onOpenChange, document, jobId, jobTitle, onSaved, onRevised }) {
  const [form, setForm] = useState({
    number: "",
    status: "draft",
    date: "",
    valid_till: "",
    notes: "",
    tax_rate: "",
  });
  const [lines, setLines] = useState([emptyEstimateLine()]);
  const [saving, setSaving] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogTarget, setCatalogTarget] = useState(null);
  const [signChannel, setSignChannel] = useState("link");
  const [signRecipient, setSignRecipient] = useState("");
  const [signBusy, setSignBusy] = useState(false);
  const [signResult, setSignResult] = useState(null);

  useEffect(() => {
    if (!open || !document) return;
    setSignResult(null);
    setForm({
      number: document.number || "",
      status: document.status || "draft",
      date: document.date || "",
      valid_till: document.valid_till || "",
      notes: document.notes || "",
      tax_rate: document.tax_rate ?? "",
    });
    const existing = Array.isArray(document.lines) && document.lines.length
      ? document.lines.map((line) => ({
          description: line.description || "",
          material_amount: line.material_amount ?? "",
          labor_amount: line.labor_amount ?? "",
          equipment_amount: line.equipment_amount ?? "",
          labor_hours: line.labor_hours ?? "",
          labor_rate: line.labor_rate ?? "",
          category: line.category || "",
          notes: line.notes || "",
          tools: line.tools || "",
          catalog_id: line.catalog_id || "",
        }))
      : [emptyEstimateLine()];
    setLines(existing);

    if (document.tax_rate == null || document.tax_rate === "") {
      api.entities.CompanyProfile.list("-created_date", 1).then((rows) => {
        const profile = rows[0];
        if (profile?.default_tax_rate != null) {
          setForm((f) => (f.tax_rate === "" ? { ...f, tax_rate: String(profile.default_tax_rate) } : f));
        }
      }).catch(() => {});
    }
  }, [open, document]);

  const totals = useMemo(() => estimateTotals(lines.map(serializeEstimateLine), form.tax_rate), [lines, form.tax_rate]);

  if (!document) return null;

  const setLine = (index, patch) => {
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addLine = () => setLines((rows) => [...rows, emptyEstimateLine()]);
  const removeLine = (index) => setLines((rows) => (rows.length <= 1 ? [emptyEstimateLine()] : rows.filter((_, i) => i !== index)));

  const openCatalog = (index) => {
    setCatalogTarget(index);
    setCatalogOpen(true);
  };

  const onCatalogPick = (item) => {
    if (catalogTarget == null) return;
    setLine(catalogTarget, catalogItemToFormLine(item));
  };

  const save = async ({ markSent = false } = {}) => {
    setSaving(true);
    try {
      const nextStatus = markSent ? "sent" : form.status;
      const serialized = lines.map(serializeEstimateLine).filter((line) =>
        line.description || line.material_amount || line.labor_amount || line.equipment_amount
      );
      const nextTotals = estimateTotals(serialized, form.tax_rate);
      const payload = {
        number: form.number || undefined,
        status: nextStatus,
        date: form.date,
        valid_till: form.valid_till,
        notes: form.notes,
        tax_rate: form.tax_rate === "" ? undefined : Number(form.tax_rate),
        lines: serialized,
        subtotal: nextTotals.subtotal,
        tax_amount: nextTotals.tax_amount,
        total: nextTotals.total,
      };
      const previousStatus = document.status;
      await api.entities.Estimate.update(document.id, payload);
      try {
        await api.entities.Job.update(jobId, { estimate_amount: nextTotals.total });
      } catch { /* non-blocking */ }

      if (nextStatus === "sent" && previousStatus !== "sent" && previousStatus !== "accepted") {
        await api.entities.TimelineEntry.create({
          job_id: jobId,
          type: "estimate_sent",
          text: `Estimate ${form.number || ""} sent to client`.trim(),
          category: "financial",
        });
      }
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const sendSignLink = async () => {
    setSignBusy(true);
    setSignResult(null);
    try {
      const serialized = lines.map(serializeEstimateLine).filter((line) =>
        line.description || line.material_amount || line.labor_amount || line.equipment_amount
      );
      const nextTotals = estimateTotals(serialized, form.tax_rate);
      await api.entities.Estimate.update(document.id, {
        number: form.number || undefined,
        date: form.date,
        valid_till: form.valid_till,
        notes: form.notes,
        tax_rate: form.tax_rate === "" ? undefined : Number(form.tax_rate),
        lines: serialized,
        subtotal: nextTotals.subtotal,
        tax_amount: nextTotals.tax_amount,
        total: nextTotals.total,
      });
      const result = await api.estimates.sendSign(document.id, {
        channel: signChannel,
        recipient: signChannel === "link" ? undefined : signRecipient.trim(),
      });
      setSignResult(result);
      setForm((f) => ({ ...f, status: f.status === "draft" ? "sent" : f.status }));
      onSaved?.();
    } catch (e) {
      setSignResult({ delivery: "error", message: e.message || "Could not create sign link" });
    } finally {
      setSignBusy(false);
    }
  };

  const printEstimate = () => {
    const serialized = lines.map(serializeEstimateLine);
    const t = estimateTotals(serialized, form.tax_rate);
    const w = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
    if (!w) return;
    const rows = serialized.map((line) => `
      <tr>
        <td>${escapeHtml(line.description || "")}</td>
        <td class="num">${fmt(line.material_amount)}</td>
        <td class="num">${fmt(line.labor_amount)}</td>
        <td class="num">${fmt(line.equipment_amount)}</td>
        <td class="num">${fmt(lineTotal(line))}</td>
      </tr>`).join("");
    w.document.write(`<!doctype html><html><head><title>Estimate ${escapeHtml(form.number || "")}</title>
      <style>
        body{font-family:Georgia,serif;padding:32px;color:#111}
        h1{font-size:22px;margin:0 0 4px}
        .meta{color:#555;font-size:13px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border-bottom:1px solid #ddd;padding:8px 6px;text-align:left}
        th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#555}
        .num{text-align:right;white-space:nowrap}
        .totals{margin-top:16px;width:240px;margin-left:auto}
        .totals div{display:flex;justify-content:space-between;padding:4px 0}
        .totals .grand{font-weight:700;border-top:1px solid #111;margin-top:6px;padding-top:8px}
        @media print{body{padding:0}}
      </style></head><body>
      <h1>Construction Estimate</h1>
      <div class="meta">${escapeHtml(jobTitle || "Job")} · ${escapeHtml(form.number || "Draft")}
        ${form.date ? ` · ${escapeHtml(form.date)}` : ""}${form.valid_till ? ` · Valid till ${escapeHtml(form.valid_till)}` : ""}</div>
      <table><thead><tr><th>Description</th><th class="num">Material</th><th class="num">Labor</th><th class="num">Equipment</th><th class="num">Total</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=5>No lines</td></tr>"}</tbody></table>
      <div class="totals">
        <div><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>
        <div><span>Tax (${escapeHtml(String(form.tax_rate || 0))}%)</span><span>${fmt(t.tax_amount)}</span></div>
        <div class="grand"><span>Total</span><span>${fmt(t.total)}</span></div>
      </div>
      ${form.notes ? `<p style="margin-top:24px;font-size:13px;white-space:pre-wrap">${escapeHtml(form.notes)}</p>` : ""}
      <script>window.onload=()=>{window.print()}</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Estimate{form.number ? ` · ${form.number}` : ""}</DialogTitle>
          </DialogHeader>

          {document.status === "accepted" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Signed by <strong>{document.signer_name || "client"}</strong>
              {document.signed_at ? ` on ${shortDate(document.signed_at)}` : ""}.
              Fields stay editable. Accepted snapshot ({money(document.accepted_snapshot?.total ?? document.total)}) is kept for Work Order / Invoice carryover.
            </div>
          )}

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
                statuses={DOCUMENT_STATUSES.Estimate}
                entity="Estimate"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <Label>Valid till</Label>
              <Input type="date" value={form.valid_till} onChange={(e) => setForm((f) => ({ ...f, valid_till: e.target.value }))} />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Line items</div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => { setCatalogTarget(lines.length); setLines((r) => [...r, emptyEstimateLine()]); setCatalogOpen(true); }}>
                  <Search className="w-3.5 h-3.5 mr-1" /> From catalog
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Line
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                  <div className="flex gap-2 mb-2">
                    <Input
                      className="flex-1 bg-white"
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => setLine(index, { description: e.target.value })}
                    />
                    <Button type="button" variant="outline" size="icon" className="shrink-0" title="Fill from catalog" onClick={() => openCatalog(index)}>
                      <Search className="w-4 h-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" className="shrink-0 text-red-600" onClick={() => removeLine(index)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div>
                      <Label className="text-xs">Material $</Label>
                      <Input type="number" className="bg-white" value={line.material_amount} onChange={(e) => setLine(index, { material_amount: e.target.value })} placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-xs">Labor $</Label>
                      <Input type="number" className="bg-white" value={line.labor_amount} onChange={(e) => setLine(index, { labor_amount: e.target.value })} placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-xs">Equipment $</Label>
                      <Input type="number" className="bg-white" value={line.equipment_amount} onChange={(e) => setLine(index, { equipment_amount: e.target.value })} placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-xs">Hours</Label>
                      <Input type="number" className="bg-white" value={line.labor_hours} onChange={(e) => setLine(index, { labor_hours: e.target.value })} placeholder="—" />
                    </div>
                    <div>
                      <Label className="text-xs">Rate $/hr</Label>
                      <Input type="number" className="bg-white" value={line.labor_rate} onChange={(e) => setLine(index, { labor_rate: e.target.value })} placeholder="—" />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-2 mt-2">
                    <div>
                      <Label className="text-xs">Category</Label>
                      <Input className="bg-white" value={line.category} onChange={(e) => setLine(index, { category: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Input className="bg-white" value={line.notes} onChange={(e) => setLine(index, { notes: e.target.value })} />
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mt-2 text-right">Row total {money(lineTotal(serializeEstimateLine(line)))}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div>
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <div>
                <Label>Tax %</Label>
                <Input type="number" value={form.tax_rate} onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value }))} placeholder="Company default" />
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money(totals.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{money(totals.tax_amount)}</span></div>
                <div className="flex justify-between font-semibold text-slate-900 border-t border-slate-100 pt-1"><span>Total</span><span>{money(totals.total)}</span></div>
              </div>
            </div>
          </div>

          {form.status !== "void" && (
            <div className="mt-4 rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Send className="w-4 h-4" /> Send client sign link
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                <Select value={signChannel} onValueChange={setSignChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="link">Copy link</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">Text (SMS)</SelectItem>
                  </SelectContent>
                </Select>
                {signChannel !== "link" && (
                  <Input
                    className="sm:col-span-2"
                    value={signRecipient}
                    onChange={(e) => setSignRecipient(e.target.value)}
                    placeholder={signChannel === "email" ? "client@example.com" : "Phone number"}
                  />
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={sendSignLink} disabled={signBusy}>
                {signBusy ? "Creating…" : "Create / send sign link"}
              </Button>
              {signResult && (
                <div className={`text-xs rounded-md px-2 py-1.5 ${signResult.delivery === "error" ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-700"}`}>
                  <div>{signResult.message}</div>
                  {signResult.sign_url && (
                    <a href={signResult.sign_url} target="_blank" rel="noreferrer" className="underline break-all">
                      {signResult.sign_url}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2 sm:justify-between">
            <DocumentLifecycleActions
              entity="Estimate"
              document={document}
              disabled={saving}
              onSaved={() => { onSaved?.(); onOpenChange(false); }}
              onRevised={(created) => { onOpenChange(false); onRevised?.(created); }}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <Button variant="outline" onClick={printEstimate} disabled={saving}>
                <Printer className="w-4 h-4 mr-1" /> Print
              </Button>
              {form.status !== "sent" && form.status !== "accepted" && form.status !== "void" && (
                <Button variant="outline" onClick={() => save({ markSent: true })} disabled={saving}>Mark sent</Button>
              )}
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => save()} disabled={saving || form.status === "void"}>
                {saving ? "Saving…" : "Save estimate"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CatalogPickerDialog open={catalogOpen} onOpenChange={setCatalogOpen} onPick={onCatalogPick} />
    </>
  );
}

function fmt(n) {
  if (n == null || n === "") return "—";
  return money(n);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
