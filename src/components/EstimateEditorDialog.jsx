import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Printer, Send, Camera, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CatalogTypeahead from "@/components/CatalogTypeahead";
import DocumentLifecycleActions from "@/components/DocumentLifecycleActions";
import StatusSelect from "@/components/StatusSelect";
import { DOCUMENT_STATUSES } from "@/lib/documents";
import { WORK_CATEGORIES } from "@/lib/documentMapping";
import { money, shortDate } from "@/lib/format";
import {
  addDaysIso,
  catalogItemToFormLine,
  DEFAULT_LABOR_RATE,
  emptyEstimateLine,
  ESTIMATE_VALID_DAYS,
  estimateLineAmount,
  estimateTotals,
  normalizeEstimateLinesForEditor,
  laborAmountFromHours,
  serializeEstimateLine,
  todayIso,
} from "@/lib/estimateMath";
import { isEstimateReadOnly } from "@/lib/documentAvailability";
import { loadAccountTaxRate } from "@/lib/salesTax";

/**
 * Estimate editor: whole-line amounts (materials included) + catalog typeahead + e-sign.
 * Hours × rate can suggest the line amount; hours kept for Work Order mapping.
 * After client accept: print/view only (no content edits).
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
  const [defaultLaborRate, setDefaultLaborRate] = useState(DEFAULT_LABOR_RATE);
  const [signChannel, setSignChannel] = useState("link");
  const [signRecipient, setSignRecipient] = useState("");
  const [signBusy, setSignBusy] = useState(false);
  const [signResult, setSignResult] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const cameraRef = useRef(null);

  useEffect(() => {
    if (!open || !document) return;
    setSignResult(null);
    const date = document.date || todayIso();
    const valid_till = document.valid_till || addDaysIso(date, ESTIMATE_VALID_DAYS);
    setForm({
      number: document.number || "",
      status: document.status || "draft",
      date,
      valid_till,
      notes: document.notes || "",
      tax_rate: document.tax_rate ?? "",
    });
    const existing = Array.isArray(document.lines) && document.lines.length
      ? normalizeEstimateLinesForEditor(document.lines)
      : [emptyEstimateLine()];
    setLines(existing);

    api.catalog.search({ limit: 1 }).then((data) => {
      if (data?.default_labor_rate != null) setDefaultLaborRate(Number(data.default_labor_rate) || DEFAULT_LABOR_RATE);
    }).catch(() => {});

    if (document.tax_rate == null || document.tax_rate === "") {
      loadAccountTaxRate(api).then((rate) => {
        setForm((f) => (f.tax_rate === "" ? { ...f, tax_rate: String(rate) } : f));
      });
    }
  }, [open, document]);

  const totals = useMemo(() => estimateTotals(lines.map(serializeEstimateLine), form.tax_rate), [lines, form.tax_rate]);

  if (!document) return null;

  const readOnly = isEstimateReadOnly(document);

  const setLine = (index, patch) => {
    if (readOnly) return;
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const setHours = (index, hoursValue) => {
    if (readOnly) return;
    setLines((rows) => rows.map((row, i) => {
      if (i !== index) return row;
      const rate = row.labor_rate || defaultLaborRate;
      const suggested = laborAmountFromHours(hoursValue, rate, defaultLaborRate);
      return {
        ...row,
        labor_hours: hoursValue,
        labor_rate: row.labor_rate || String(defaultLaborRate),
        line_amount: suggested === "" ? row.line_amount : suggested,
      };
    }));
  };

  const addLine = () => { if (!readOnly) setLines((rows) => [...rows, emptyEstimateLine()]); };
  const removeLine = (index) => {
    if (readOnly) return;
    setLines((rows) => (rows.length <= 1 ? [emptyEstimateLine()] : rows.filter((_, i) => i !== index)));
  };

  const onCatalogPick = (index, item) => {
    if (readOnly) return;
    setLine(index, catalogItemToFormLine(item, defaultLaborRate));
  };

  const captureJobPhoto = async (files) => {
    if (!files?.length || !jobId) return;
    setPhotoBusy(true);
    try {
      for (const file of files) {
        const { file_url } = await api.uploadFile({ file });
        await api.entities.TimelineEntry.create({
          job_id: jobId,
          type: "photo",
          text: file.name || "Job photo from estimate",
          photo_url: file_url,
          category: "before",
        });
      }
      onSaved?.();
    } catch (e) {
      console.error(e);
      alert("Photo upload failed. Try again.");
    } finally {
      setPhotoBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const save = async ({ markSent = false } = {}) => {
    if (readOnly) return;
    setSaving(true);
    try {
      const nextStatus = markSent ? "sent" : form.status;
      const serialized = lines.map(serializeEstimateLine).filter((line) =>
        line.description || line.labor_amount
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
    if (readOnly) return;
    setSignBusy(true);
    setSignResult(null);
    try {
      const serialized = lines.map(serializeEstimateLine).filter((line) =>
        line.description || line.labor_amount
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
        <td>${escapeHtml(line.category || "")}</td>
        <td>${escapeHtml(line.description || "")}</td>
        <td class="num">${line.labor_hours != null ? escapeHtml(String(line.labor_hours)) : "—"}</td>
        <td class="num">${fmt(estimateLineAmount(line))}</td>
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
        ${form.date ? ` · ${escapeHtml(form.date)}` : ""}${form.valid_till ? ` · Valid until ${escapeHtml(form.valid_till)}` : ""}</div>
      <table><thead><tr><th>Category</th><th>Description</th><th class="num">Hrs</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=4>No lines</td></tr>"}</tbody></table>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2 pr-8">
            <DialogTitle>Estimate{form.number ? ` · ${form.number}` : ""}</DialogTitle>
            {jobId && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={photoBusy}
                  title="Add photo to job gallery"
                  onClick={() => cameraRef.current?.click()}
                >
                  {photoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  <span className="ml-1.5 hidden sm:inline">Photo</span>
                </Button>
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => captureJobPhoto(Array.from(e.target.files || []))}
                />
              </>
            )}
          </div>
        </DialogHeader>

        {(document.status === "accepted" || (document.accepted_snapshot && document.status !== "void")) && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {document.signer_name ? (
              <>
                Signed by <strong>{document.signer_name}</strong>
                {document.signed_at ? ` on ${shortDate(document.signed_at)}` : ""}.{" "}
              </>
            ) : (
              <>Accepted. </>
            )}
            This estimate is <strong>print / view only</strong> — content cannot be edited.
            Snapshot total {money(document.accepted_snapshot?.total ?? document.total)} carries to the Work Order.
          </div>
        )}

        <div className="grid sm:grid-cols-4 gap-3">
          <div>
            <Label>Number</Label>
            <Input value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} readOnly={readOnly} className={readOnly ? "bg-slate-50" : undefined} />
          </div>
          <div>
            <Label>Status</Label>
            {readOnly ? (
              <Input value={form.status} readOnly className="bg-slate-50 capitalize" />
            ) : (
              <StatusSelect
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                statuses={DOCUMENT_STATUSES.Estimate}
                entity="Estimate"
              />
            )}
          </div>
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={form.date}
              readOnly={readOnly}
              className={readOnly ? "bg-slate-50" : undefined}
              onChange={(e) => {
                if (readOnly) return;
                const date = e.target.value;
                setForm((f) => ({
                  ...f,
                  date,
                  // Keep auto +10 when user had not customized beyond the previous auto default
                  valid_till: !f.valid_till || f.valid_till === addDaysIso(f.date, ESTIMATE_VALID_DAYS)
                    ? addDaysIso(date, ESTIMATE_VALID_DAYS)
                    : f.valid_till,
                }));
              }}
            />
          </div>
          <div>
            <Label>Valid until</Label>
            <Input type="date" value={form.valid_till} onChange={(e) => setForm((f) => ({ ...f, valid_till: e.target.value }))} readOnly={readOnly} className={readOnly ? "bg-slate-50" : undefined} />
            {!readOnly && (
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                Defaults to {ESTIMATE_VALID_DAYS} days from the estimate date — how long the customer has to decide. You can still edit.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Line items</div>
          </div>
          {!readOnly && (
            <p className="text-xs text-slate-500 mb-2">
              Type in Description to pick from the catalog. Each line is one whole-line amount (materials included). Hrs × rate can suggest the amount.
            </p>
          )}

          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={index} className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(7rem,9rem)_1fr_4.5rem_auto] gap-2 items-end">
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Input
                      className={readOnly ? "bg-slate-50" : "bg-white"}
                      list={readOnly ? undefined : `est-cat-${index}`}
                      value={line.category}
                      onChange={(e) => setLine(index, { category: e.target.value })}
                      placeholder="e.g. Plumbing"
                      readOnly={readOnly}
                    />
                    {!readOnly && (
                      <datalist id={`est-cat-${index}`}>
                        {WORK_CATEGORIES.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    {readOnly ? (
                      <Input className="bg-slate-50" value={line.description} readOnly />
                    ) : (
                      <CatalogTypeahead
                        value={line.description}
                        onChange={(description) => setLine(index, { description, catalog_id: "" })}
                        onPick={(item) => onCatalogPick(index, item)}
                      />
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Hrs.</Label>
                    <Input
                      type="number"
                      className={readOnly ? "bg-slate-50" : "bg-white"}
                      value={line.labor_hours}
                      onChange={(e) => setHours(index, e.target.value)}
                      placeholder="—"
                      readOnly={readOnly}
                    />
                  </div>
                  {!readOnly && (
                    <Button type="button" variant="outline" size="icon" className="shrink-0 text-red-600 mb-0.5" onClick={() => removeLine(index)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Input className={readOnly ? "bg-slate-50" : "bg-white"} value={line.notes} onChange={(e) => setLine(index, { notes: e.target.value })} readOnly={readOnly} />
                  </div>
                  <div>
                    <Label className="text-xs">Line amount $</Label>
                    <Input
                      type="number"
                      className={readOnly ? "bg-slate-50" : "bg-white"}
                      value={line.line_amount}
                      onChange={(e) => setLine(index, { line_amount: e.target.value })}
                      placeholder="0"
                      readOnly={readOnly}
                    />
                  </div>
                </div>
                <div className="text-xs text-slate-500 text-right">Row total {money(estimateLineAmount(line))}</div>
              </div>
            ))}
          </div>
          {!readOnly && (
            <div className="mt-2">
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Line
              </Button>
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} readOnly={readOnly} className={readOnly ? "bg-slate-50" : undefined} />
          </div>
          <div className="space-y-2">
            <div>
              <Label>Tax %</Label>
              <Input type="number" value={form.tax_rate} onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value }))} placeholder="Account default" readOnly={readOnly} className={readOnly ? "bg-slate-50" : undefined} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{money(totals.tax_amount)}</span></div>
              <div className="flex justify-between font-semibold text-slate-900 border-t border-slate-100 pt-1"><span>Total</span><span>{money(totals.total)}</span></div>
            </div>
          </div>
        </div>

        {!readOnly && form.status !== "void" && (
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
            allowRevise={false}
            onSaved={() => { onSaved?.(); onOpenChange(false); }}
            onRevised={(created) => { onOpenChange(false); onRevised?.(created); }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button variant="outline" onClick={printEstimate} disabled={saving}>
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
            {!readOnly && form.status !== "sent" && form.status !== "accepted" && form.status !== "void" && (
              <Button variant="outline" onClick={() => save({ markSent: true })} disabled={saving}>Mark sent</Button>
            )}
            {!readOnly && (
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => save()} disabled={saving || form.status === "void"}>
                {saving ? "Saving…" : "Save estimate"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
