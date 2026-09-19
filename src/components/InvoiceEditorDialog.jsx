import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Printer, AlertTriangle } from "lucide-react";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DOCUMENT_STATUSES } from "@/lib/documents";
import { money } from "@/lib/format";
import { invoiceTotals, deriveInvoiceStatus } from "@/lib/documentMapping";
import DocumentLifecycleActions from "@/components/DocumentLifecycleActions";
import StatusSelect from "@/components/StatusSelect";

function emptyMaterial() {
  return { description: "", qty: "", unit_price: "" };
}
function emptyLabor() {
  return { description: "", hours: "", rate: "" };
}
function emptyMisc() {
  return { description: "", amount: "" };
}

function num(v) {
  return v === "" || v == null ? undefined : Number(v);
}

function serializeMaterial(line) {
  return { description: line.description || "", qty: num(line.qty), unit_price: num(line.unit_price) };
}
function serializeLabor(line) {
  return { description: line.description || "", hours: num(line.hours), rate: num(line.rate) };
}
function serializeMisc(line) {
  return { description: line.description || "", amount: num(line.amount) };
}

function lineHasContent(line, kind) {
  if (kind === "material") return line.description || line.qty != null || line.unit_price != null;
  if (kind === "labor") return line.description || line.hours != null || line.rate != null;
  return line.description || line.amount != null;
}

/**
 * Invoice editor ≈ invoice_1147: two-column materials | labor+misc, payment terms, totals + balance due.
 * No client e-sign (Decision #8).
 */
export default function InvoiceEditorDialog({
  open,
  onOpenChange,
  document,
  jobId,
  jobTitle,
  client,
  onSaved,
  onRevised,
}) {
  const [form, setForm] = useState({
    number: "",
    status: "draft",
    date: "",
    notes: "",
    payment_terms: "",
    tax_rate: "",
    project_name: "",
    estimate_ref: "",
    change_order_refs: "",
    deposits_applied: "",
    payments_applied: "",
  });
  const [materials, setMaterials] = useState([emptyMaterial()]);
  const [labor, setLabor] = useState([emptyLabor()]);
  const [misc, setMisc] = useState([emptyMisc()]);
  const [company, setCompany] = useState(null);
  const [authorizedTotal, setAuthorizedTotal] = useState(null);
  const [billingCeiling, setBillingCeiling] = useState(null);
  const [priorInvoiced, setPriorInvoiced] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !document) return;
    setForm({
      number: document.number || "",
      status: document.status || "draft",
      date: document.date || "",
      notes: document.notes || "",
      payment_terms: document.payment_terms || "",
      tax_rate: document.tax_rate ?? "",
      project_name: document.project_name || jobTitle || "",
      estimate_ref: document.estimate_ref || "",
      change_order_refs: document.change_order_refs || "",
      deposits_applied: document.deposits_applied ?? "",
      payments_applied: document.payments_applied ?? "",
    });
    setMaterials(
      Array.isArray(document.material_lines) && document.material_lines.length
        ? document.material_lines.map((l) => ({
            description: l.description || "",
            qty: l.qty ?? "",
            unit_price: l.unit_price ?? "",
          }))
        : [emptyMaterial()]
    );
    setLabor(
      Array.isArray(document.labor_lines) && document.labor_lines.length
        ? document.labor_lines.map((l) => ({
            description: l.description || "",
            hours: l.hours ?? "",
            rate: l.rate ?? "",
          }))
        : [emptyLabor()]
    );
    setMisc(
      Array.isArray(document.misc_lines) && document.misc_lines.length
        ? document.misc_lines.map((l) => ({
            description: l.description || "",
            amount: l.amount ?? "",
          }))
        : [emptyMisc()]
    );

    api.entities.CompanyProfile.list("-created_date", 1)
      .then((rows) => setCompany(rows[0] || null))
      .catch(() => setCompany(null));

    setPriorInvoiced(document.prior_invoiced ?? 0);
    setBillingCeiling(document.billing_ceiling ?? null);
    if (document.authorized_total != null) {
      setAuthorizedTotal(document.authorized_total);
    } else if (jobId) {
      api.jobs.authorizedTotal(jobId)
        .then((r) => setAuthorizedTotal(r.authorized_total ?? null))
        .catch(() => setAuthorizedTotal(null));
    }
  }, [open, document, jobId, jobTitle]);

  const totals = useMemo(
    () =>
      invoiceTotals({
        material_lines: materials.map(serializeMaterial),
        labor_lines: labor.map(serializeLabor),
        misc_lines: misc.map(serializeMisc),
        tax_rate: form.tax_rate,
        deposits_applied: form.deposits_applied,
        payments_applied: form.payments_applied,
      }),
    [materials, labor, misc, form.tax_rate, form.deposits_applied, form.payments_applied]
  );

  const ceiling = billingCeiling != null ? Number(billingCeiling) : authorizedTotal != null ? Number(authorizedTotal) : null;
  const cumulative = (Number(priorInvoiced) || 0) + totals.total;
  const overAuthorized = ceiling != null && cumulative > ceiling + 0.009;

  if (!document) return null;

  const patchRow = (setter, index, patch) =>
    setter((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async ({ markSent = false } = {}) => {
    setSaving(true);
    try {
      const material_lines = materials.map(serializeMaterial).filter((l) => lineHasContent(l, "material"));
      const labor_lines = labor.map(serializeLabor).filter((l) => lineHasContent(l, "labor"));
      const misc_lines = misc.map(serializeMisc).filter((l) => lineHasContent(l, "misc"));
      const next = invoiceTotals({
        material_lines,
        labor_lines,
        misc_lines,
        tax_rate: form.tax_rate,
        deposits_applied: form.deposits_applied,
        payments_applied: form.payments_applied,
      });
      let nextStatus = markSent ? "sent" : form.status;
      nextStatus = deriveInvoiceStatus({
        balance_due: next.balance_due,
        payments_applied: form.payments_applied,
        deposits_applied: form.deposits_applied,
        status: nextStatus,
      });
      const previousStatus = document.status;
      await api.entities.Invoice.update(document.id, {
        number: form.number || undefined,
        status: nextStatus,
        date: form.date,
        notes: form.notes,
        payment_terms: form.payment_terms,
        tax_rate: form.tax_rate === "" ? undefined : Number(form.tax_rate),
        project_name: form.project_name,
        estimate_ref: form.estimate_ref,
        change_order_refs: form.change_order_refs,
        deposits_applied: form.deposits_applied === "" ? undefined : Number(form.deposits_applied),
        payments_applied: form.payments_applied === "" ? undefined : Number(form.payments_applied),
        related_estimate_id: document.related_estimate_id,
        billed_change_order_ids: document.billed_change_order_ids || [],
        material_lines,
        labor_lines,
        misc_lines,
        ...next,
      });

      if (nextStatus === "sent" && previousStatus !== "sent" && previousStatus !== "partial" && previousStatus !== "paid") {
        await api.entities.TimelineEntry.create({
          job_id: jobId,
          type: "invoice_sent",
          text: `Invoice ${form.number || ""} sent to client`.trim(),
          category: "financial",
        });
      }
      if (nextStatus === "partial" && previousStatus !== "partial") {
        await api.entities.TimelineEntry.create({
          job_id: jobId,
          type: "note",
          text: `Invoice ${form.number || ""} marked partial (progress billing)`.trim(),
          category: "financial",
        });
      }
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const printInvoice = () => {
    const material_lines = materials.map(serializeMaterial);
    const labor_lines = labor.map(serializeLabor);
    const misc_lines = misc.map(serializeMisc);
    const t = invoiceTotals({
      material_lines,
      labor_lines,
      misc_lines,
      tax_rate: form.tax_rate,
      deposits_applied: form.deposits_applied,
      payments_applied: form.payments_applied,
    });
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
    if (!w) return;

    const matRows = material_lines
      .map(
        (l) => `<tr>
        <td class="num">${escapeHtml(fmtQty(l.qty))}</td>
        <td>${escapeHtml(l.description || "")}</td>
        <td class="num">${fmt(l.unit_price)}</td>
        <td class="num">${fmt((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</td>
      </tr>`
      )
      .join("");
    const labRows = labor_lines
      .map(
        (l) => `<tr>
        <td>${escapeHtml(l.description || "")}</td>
        <td class="num">${fmtQty(l.hours)}</td>
        <td class="num">${fmt(l.rate)}</td>
        <td class="num">${fmt((Number(l.hours) || 0) * (Number(l.rate) || 0))}</td>
      </tr>`
      )
      .join("");
    const miscRows = misc_lines
      .map(
        (l) => `<tr>
        <td>${escapeHtml(l.description || "")}</td>
        <td class="num">${fmt(l.amount)}</td>
      </tr>`
      )
      .join("");

    const companyBlock = company
      ? `<div class="company-name">${escapeHtml(company.name || "")}</div>
         <div>${escapeHtml(company.address || "")}</div>
         <div>${escapeHtml([company.phone, company.email].filter(Boolean).join(" · "))}</div>
         ${company.website ? `<div>${escapeHtml(company.website)}</div>` : ""}`
      : "";
    const clientBlock = client
      ? `<div class="section-label">Client</div>
         <div class="client-name">${escapeHtml(client.name || "")}</div>
         <div>${escapeHtml(client.address || "")}</div>
         <div>${escapeHtml([client.phone, client.email].filter(Boolean).join(" · "))}</div>`
      : "";

    w.document.write(`<!doctype html><html><head><title>Invoice ${escapeHtml(form.number || "")}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Helvetica,Arial,sans-serif;padding:28px;color:#111;font-size:11px;line-height:1.35}
        h1{font-size:20px;font-weight:800;letter-spacing:.04em;margin:0 0 8px;text-transform:uppercase}
        .company-name,.client-name{font-weight:700;font-size:12px}
        .section-label{font-weight:700;text-transform:uppercase;font-size:10px;margin-top:10px;margin-bottom:2px}
        .grid-top{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:16px}
        .meta-table{width:100%;border-collapse:collapse}
        .meta-table td{padding:3px 0;border-bottom:1px solid #ccc}
        .meta-table td:first-child{font-weight:700;width:42%;text-transform:uppercase;font-size:10px}
        .notes-box{border:1px solid #111;min-height:64px;padding:6px;margin-top:8px;white-space:pre-wrap}
        .grid-body{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
        table.lines{width:100%;border-collapse:collapse;margin-top:4px}
        table.lines th{border-top:2px solid #111;border-bottom:2px solid #111;padding:5px 4px;text-align:left;font-size:10px;text-transform:uppercase}
        table.lines td{border-bottom:1px solid #bbb;padding:4px;vertical-align:top}
        table.lines .num,table.lines th.num{text-align:right;white-space:nowrap}
        .footer-row{display:flex;justify-content:space-between;font-weight:700;border-top:2px solid #111;border-bottom:2px solid #111;padding:5px 4px;margin-top:2px;font-size:10px;text-transform:uppercase}
        .grid-bottom{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}
        .terms{border:1px solid #111;min-height:100px;padding:8px;white-space:pre-wrap}
        .terms-label{font-weight:800;text-transform:uppercase;font-size:11px;margin-bottom:6px}
        .totals{width:100%}
        .totals div{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #ccc}
        .totals .grand{font-weight:800;border:2px solid #111;padding:8px 6px;margin-top:6px}
        @media print{body{padding:12px}}
      </style></head><body>
      <div class="grid-top">
        <div>
          <h1>Construction Invoice</h1>
          ${companyBlock}
          ${clientBlock}
          ${form.project_name ? `<div class="section-label">Project</div><div>${escapeHtml(form.project_name)}</div>` : ""}
        </div>
        <div>
          <table class="meta-table">
            <tr><td>Date of Invoice</td><td>${escapeHtml(form.date || "")}</td></tr>
            <tr><td>Invoice No</td><td>${escapeHtml(form.number || "")}</td></tr>
            <tr><td>Job ID</td><td>${escapeHtml(jobId || "")}</td></tr>
            <tr><td>Estimate</td><td>${escapeHtml(form.estimate_ref || "")}</td></tr>
            <tr><td>Change Orders</td><td>${escapeHtml(form.change_order_refs || "")}</td></tr>
          </table>
          <div class="section-label">Notes</div>
          <div class="notes-box">${escapeHtml(form.notes || "")}</div>
        </div>
      </div>
      <div class="grid-body">
        <div>
          <table class="lines">
            <thead><tr><th class="num">Qty</th><th>Material</th><th class="num">Rate</th><th class="num">Total</th></tr></thead>
            <tbody>${matRows || "<tr><td colspan=4>—</td></tr>"}</tbody>
          </table>
          <div class="footer-row"><span>Materials</span><span>${fmt(t.materials_total)}</span></div>
        </div>
        <div>
          <table class="lines">
            <thead><tr><th>Labor</th><th class="num">Hrs</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
            <tbody>${labRows || "<tr><td colspan=4>—</td></tr>"}</tbody>
          </table>
          <div class="footer-row"><span>Labor</span><span>${fmt(t.labor_total)}</span></div>
          <table class="lines" style="margin-top:14px">
            <thead><tr><th>Miscellaneous Charges</th><th class="num">Amount</th></tr></thead>
            <tbody>${miscRows || "<tr><td colspan=2>—</td></tr>"}</tbody>
          </table>
          <div class="footer-row"><span>Miscellaneous</span><span>${fmt(t.misc_total)}</span></div>
        </div>
      </div>
      <div class="grid-bottom">
        <div>
          <div class="terms-label">Payment Terms</div>
          <div class="terms">${escapeHtml(form.payment_terms || "")}</div>
        </div>
        <div class="totals">
          <div><span>Materials</span><span>${fmt(t.materials_total)}</span></div>
          <div><span>Labor</span><span>${fmt(t.labor_total)}</span></div>
          <div><span>Miscellaneous</span><span>${fmt(t.misc_total)}</span></div>
          <div><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>
          <div><span>Tax (${escapeHtml(String(form.tax_rate || 0))}%)</span><span>${fmt(t.tax_amount)}</span></div>
          <div class="grand"><span>TOTAL</span><span>${fmt(t.total)}</span></div>
          ${(Number(form.deposits_applied) || 0) > 0 ? `<div><span>Deposits applied</span><span>−${fmt(form.deposits_applied)}</span></div>` : ""}
          ${(Number(form.payments_applied) || 0) > 0 ? `<div><span>Payments applied</span><span>−${fmt(form.payments_applied)}</span></div>` : ""}
          <div class="grand"><span>Balance Due</span><span>${fmt(t.balance_due)}</span></div>
        </div>
      </div>
      <script>window.onload=()=>{window.print()}</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice{form.number ? ` · ${form.number}` : ""}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 -mt-1">
          Prefill from accepted estimate + approved change orders. Edit lines for progress billing. All fields stay editable. No client e-sign on invoices.
        </p>

        {overAuthorized && (
          <div className="flex items-start gap-2 rounded-lg border border-attention bg-attention-muted px-3 py-2 text-sm text-attention-foreground">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {priorInvoiced > 0 ? (
                <>
                  Cumulative invoiced ({money(cumulative)}) exceeds the billing ceiling ({money(ceiling)}),
                  which includes tax on approved change orders. Adjust progress lines or add an approved CO.
                </>
              ) : (
                <>
                  Invoice total ({money(totals.total)}) exceeds the billing ceiling ({money(ceiling)}),
                  which includes tax on approved change-order nets. Add an approved change order or adjust lines before sending.
                </>
              )}
            </span>
          </div>
        )}
        {priorInvoiced > 0 && !overAuthorized && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Prior active invoices: {money(priorInvoiced)}. Edit this invoice for progress billing; void unused drafts so they stay out of the rollup.
          </div>
        )}

        {/* Top: company/client | meta */}
        <div className="grid md:grid-cols-2 gap-4 mt-2">
          <div className="space-y-2 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company</div>
            {company ? (
              <div className="text-slate-700 leading-snug">
                <div className="font-semibold text-slate-900">{company.name || "—"}</div>
                {company.address && <div className="whitespace-pre-line">{company.address}</div>}
                <div className="text-slate-500">{[company.phone, company.email, company.website].filter(Boolean).join(" · ")}</div>
              </div>
            ) : (
              <div className="text-slate-400 text-xs">Set company profile under Settings for print headers.</div>
            )}
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 pt-2">Client</div>
            {client ? (
              <div className="text-slate-700 leading-snug">
                <div className="font-semibold text-slate-900">{client.name}</div>
                {client.address && <div>{client.address}</div>}
                <div className="text-slate-500">{[client.phone, client.email].filter(Boolean).join(" · ")}</div>
              </div>
            ) : (
              <div className="text-slate-400 text-xs">Client loads from the job.</div>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Invoice No</Label>
              <Input value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <Label>Status</Label>
              <StatusSelect
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                statuses={DOCUMENT_STATUSES.Invoice}
              />
            </div>
            <div>
              <Label>Tax %</Label>
              <Input type="number" value={form.tax_rate} onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Job ID</Label>
              <Input value={jobId || ""} readOnly className="bg-slate-50" />
            </div>
            <div>
              <Label>Project name</Label>
              <Input value={form.project_name} onChange={(e) => setForm((f) => ({ ...f, project_name: e.target.value }))} />
            </div>
            <div>
              <Label>Estimate ref</Label>
              <Input value={form.estimate_ref} onChange={(e) => setForm((f) => ({ ...f, estimate_ref: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Change order refs</Label>
              <Input value={form.change_order_refs} onChange={(e) => setForm((f) => ({ ...f, change_order_refs: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* Body tables */}
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Materials</div>
              <Button type="button" variant="outline" size="sm" onClick={() => setMaterials((r) => [...r, emptyMaterial()])}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Row
              </Button>
            </div>
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-[4rem_1fr_5rem_5rem_2rem] gap-1 text-[10px] uppercase text-slate-400 px-0.5">
                <span>Qty</span><span>Material</span><span className="text-right">Rate</span><span className="text-right">Total</span><span />
              </div>
              {materials.map((row, i) => (
                <div key={i} className="grid grid-cols-[4rem_1fr_5rem_5rem_2rem] gap-1 items-center">
                  <Input type="number" value={row.qty} onChange={(e) => patchRow(setMaterials, i, { qty: e.target.value })} />
                  <Input value={row.description} onChange={(e) => patchRow(setMaterials, i, { description: e.target.value })} placeholder="Description" />
                  <Input type="number" value={row.unit_price} onChange={(e) => patchRow(setMaterials, i, { unit_price: e.target.value })} />
                  <div className="text-xs text-right text-slate-600 tabular-nums">
                    {money((Number(row.qty) || 0) * (Number(row.unit_price) || 0))}
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMaterials((r) => (r.length <= 1 ? [emptyMaterial()] : r.filter((_, j) => j !== i)))}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t-2 border-b-2 border-slate-900 mt-2 py-1.5 text-xs font-bold uppercase">
              <span>Materials</span>
              <span>{money(totals.materials_total)}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Labor</div>
                <Button type="button" variant="outline" size="sm" onClick={() => setLabor((r) => [...r, emptyLabor()])}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Row
                </Button>
              </div>
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-[1fr_4rem_5rem_5rem_2rem] gap-1 text-[10px] uppercase text-slate-400 px-0.5">
                  <span>Labor</span><span className="text-right">Hrs</span><span className="text-right">Rate</span><span className="text-right">Amt</span><span />
                </div>
                {labor.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_4rem_5rem_5rem_2rem] gap-1 items-center">
                    <Input value={row.description} onChange={(e) => patchRow(setLabor, i, { description: e.target.value })} placeholder="Description" />
                    <Input type="number" value={row.hours} onChange={(e) => patchRow(setLabor, i, { hours: e.target.value })} />
                    <Input type="number" value={row.rate} onChange={(e) => patchRow(setLabor, i, { rate: e.target.value })} />
                    <div className="text-xs text-right text-slate-600 tabular-nums">
                      {money((Number(row.hours) || 0) * (Number(row.rate) || 0))}
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLabor((r) => (r.length <= 1 ? [emptyLabor()] : r.filter((_, j) => j !== i)))}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t-2 border-b-2 border-slate-900 mt-2 py-1.5 text-xs font-bold uppercase">
                <span>Labor</span>
                <span>{money(totals.labor_total)}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Miscellaneous</div>
                <Button type="button" variant="outline" size="sm" onClick={() => setMisc((r) => [...r, emptyMisc()])}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Row
                </Button>
              </div>
              <div className="space-y-2">
                {misc.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_6rem_2rem] gap-1 items-center">
                    <Input value={row.description} onChange={(e) => patchRow(setMisc, i, { description: e.target.value })} placeholder="Description" />
                    <Input type="number" value={row.amount} onChange={(e) => patchRow(setMisc, i, { amount: e.target.value })} />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMisc((r) => (r.length <= 1 ? [emptyMisc()] : r.filter((_, j) => j !== i)))}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t-2 border-b-2 border-slate-900 mt-2 py-1.5 text-xs font-bold uppercase">
                <span>Miscellaneous</span>
                <span>{money(totals.misc_total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: terms | totals */}
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div>
            <Label>Payment terms</Label>
            <Textarea
              rows={5}
              value={form.payment_terms}
              onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))}
              placeholder="Net 30, due upon receipt, etc."
            />
          </div>
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Deposits applied</Label>
                <Input type="number" value={form.deposits_applied} onChange={(e) => setForm((f) => ({ ...f, deposits_applied: e.target.value }))} />
              </div>
              <div>
                <Label>Payments applied</Label>
                <Input type="number" value={form.payments_applied} onChange={(e) => setForm((f) => ({ ...f, payments_applied: e.target.value }))} />
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg p-3 space-y-1.5">
              <Row label="Materials" value={totals.materials_total} />
              <Row label="Labor" value={totals.labor_total} />
              <Row label="Miscellaneous" value={totals.misc_total} />
              <Row label="Subtotal" value={totals.subtotal} />
              <Row label={`Tax (${form.tax_rate || 0}%)`} value={totals.tax_amount} />
              <div className="flex justify-between font-bold border-2 border-slate-900 px-2 py-1.5 mt-1">
                <span>TOTAL</span>
                <span>{money(totals.total)}</span>
              </div>
              <div className="flex justify-between font-bold border-2 border-slate-900 px-2 py-1.5">
                <span>Balance Due</span>
                <span>{money(totals.balance_due)}</span>
              </div>
              {authorizedTotal != null && (
                <div className="text-xs text-slate-500 pt-1">Authorized total: {money(authorizedTotal)}</div>
              )}
              {billingCeiling != null && billingCeiling !== authorizedTotal && (
                <div className="text-xs text-slate-500">Billing ceiling (w/ CO tax): {money(billingCeiling)}</div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-2 sm:justify-between">
          <DocumentLifecycleActions
            entity="Invoice"
            document={document}
            disabled={saving}
            onSaved={() => { onSaved?.(); onOpenChange(false); }}
            onRevised={(created) => { onOpenChange(false); onRevised?.(created); }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button variant="outline" onClick={printInvoice} disabled={saving}>
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
            {form.status !== "sent" && form.status !== "partial" && form.status !== "paid" && form.status !== "void" && (
              <Button variant="outline" onClick={() => save({ markSent: true })} disabled={saving}>Mark sent</Button>
            )}
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => save()} disabled={saving || form.status === "void"}>
              {saving ? "Saving…" : "Save invoice"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-slate-700">
      <span>{label}</span>
      <span className="tabular-nums">{money(value)}</span>
    </div>
  );
}

function fmt(n) {
  if (n == null || n === "") return "—";
  return money(n);
}

function fmtQty(n) {
  if (n == null || n === "") return "";
  return String(n);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
