import React, { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DocumentLifecycleActions from "@/components/DocumentLifecycleActions";
import ScopeLinesEditor from "@/components/ScopeLinesEditor";
import StatusOverrideSelect from "@/components/StatusOverrideSelect";
import { money, shortDate } from "@/lib/format";
import { changeOrderNet } from "@/lib/documentMapping";
import { isChangeOrderReadOnly } from "@/lib/documentAvailability";
import { loadAccountTaxRate } from "@/lib/salesTax";
import { DEFAULT_LABOR_RATE, emptyEstimateLine, isPricedScopeLine, scopeLineToForm, scopeLineTotal, serializeChangeOrderLine } from "@/lib/estimateMath";

/**
 * Scope add-on (Change Order) editor + client e-sign. Lines work exactly like estimate lines (shared
 * ScopeLinesEditor); the change order keeps its own reason, description, credit and added days.
 * Added cost is the lines' total and net = added − credit (the server enforces the same).
 */
export default function ChangeOrderEditorDialog({ open, onOpenChange, document, jobId, onSaved, onRevised }) {
  const [form, setForm] = useState({
    number: "", status: "draft", reason: "", description: "", notes: "",
    added_cost: "", credit: "", added_days: "", revised_contract_total: "",
    tax_rate: "",
  });
  const [lines, setLines] = useState([emptyEstimateLine()]);
  const [defaultLaborRate, setDefaultLaborRate] = useState(DEFAULT_LABOR_RATE);
  const [authorized, setAuthorized] = useState(null);
  const [saving, setSaving] = useState(false);
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
      reason: document.reason || "",
      description: document.description || "",
      notes: document.notes || "",
      added_cost: document.added_cost ?? "",
      credit: document.credit ?? "",
      added_days: document.added_days ?? "",
      revised_contract_total: document.revised_contract_total ?? "",
      tax_rate: document.tax_rate ?? "",
    });
    setLines(Array.isArray(document.lines) && document.lines.length
      ? document.lines.map(scopeLineToForm)
      : [emptyEstimateLine()]);
    api.catalog.search({ limit: 1 }).then((data) => {
      if (data?.default_labor_rate != null) setDefaultLaborRate(Number(data.default_labor_rate) || DEFAULT_LABOR_RATE);
    }).catch(() => {});
    api.jobs.authorizedTotal(jobId).then(setAuthorized).catch(() => setAuthorized(null));
    if (document.tax_rate == null || document.tax_rate === "") {
      loadAccountTaxRate(api).then((rate) => {
        setForm((f) => (f.tax_rate === "" ? { ...f, tax_rate: String(rate) } : f));
      });
    }
  }, [open, document, jobId]);

  // Priced lines set the added cost (like an estimate's total); without them it stays a typed figure.
  const pricedLines = lines.some(isPricedScopeLine);
  const linesTotal = useMemo(
    () => Math.round(lines.reduce((sum, line) => sum + Math.max(0, scopeLineTotal(line)), 0) * 100) / 100,
    [lines],
  );
  const addedCost = pricedLines ? linesTotal : form.added_cost;
  const computedNet = useMemo(
    () => changeOrderNet({ added_cost: addedCost, credit: form.credit }),
    [addedCost, form.credit],
  );

  const previewRevised = useMemo(() => {
    if (!authorized) return null;
    // Treat this CO as approved for preview when editing net
    const othersNet = (authorized.approved_net || 0) - (document?.status === "approved" ? changeOrderNet(document) : 0);
    return Math.round((authorized.baseline + othersNet + computedNet) * 100) / 100;
  }, [authorized, computedNet, document]);

  if (!document) return null;

  const readOnly = isChangeOrderReadOnly(document);

  // Status changes through its own actions (Send sign link, the status override, Void) —
  // server/lifecycle.js rejects a status field in a plain edit, so this never sends one.
  const persist = async () => {
    if (readOnly) return;
    const serializedLines = lines
      .map(serializeChangeOrderLine)
      .filter((l) => l.description || isPricedScopeLine(l) || l.amount != null);
    await api.entities.ChangeOrder.update(document.id, {
      number: form.number || undefined,
      reason: form.reason,
      description: form.description,
      notes: form.notes,
      added_cost: addedCost === "" ? undefined : Number(addedCost),
      credit: form.credit === "" ? undefined : Number(form.credit),
      net_change: computedNet,
      added_days: form.added_days === "" ? undefined : Number(form.added_days),
      revised_contract_total: previewRevised ?? (form.revised_contract_total === "" ? undefined : Number(form.revised_contract_total)),
      tax_rate: form.tax_rate === "" ? undefined : Number(form.tax_rate),
      lines: serializedLines,
    });
  };

  const save = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await persist();
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
      const serializedLines = lines
        .map(serializeChangeOrderLine)
        .filter((l) => l.description || isPricedScopeLine(l) || l.amount != null);
      await api.entities.ChangeOrder.update(document.id, {
        number: form.number || undefined,
        reason: form.reason,
        description: form.description,
        notes: form.notes,
        added_cost: addedCost === "" ? undefined : Number(addedCost),
        credit: form.credit === "" ? undefined : Number(form.credit),
        net_change: computedNet,
        added_days: form.added_days === "" ? undefined : Number(form.added_days),
        revised_contract_total: previewRevised ?? undefined,
        tax_rate: form.tax_rate === "" ? undefined : Number(form.tax_rate),
        lines: serializedLines,
      });
      const result = await api.changeOrders.sendSign(document.id, {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scope add-on{form.number ? ` · ${form.number}` : ""}</DialogTitle>
        </DialogHeader>

        {document.status === "approved" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Approved by <strong>{document.signer_name || "client"}</strong>
            {document.signed_at ? ` on ${shortDate(document.signed_at)}` : ""}.
            This change order is <strong>print / view only</strong> — content cannot be edited.
            Snapshot net {money(document.accepted_snapshot?.net_change ?? document.net_change)} · revised {money(document.accepted_snapshot?.revised_contract_total ?? document.revised_contract_total)}.
          </div>
        )}

        {authorized && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-0.5">
            <div>Accepted estimate baseline: <strong>{money(authorized.baseline)}</strong></div>
            <div>Approved CO net (current): <strong>{money(authorized.approved_net)}</strong></div>
            <div>Authorized total: <strong>{money(authorized.authorized_total)}</strong> (draft/sent COs excluded)</div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Number</Label>
            <Input value={form.number} readOnly={readOnly} className={readOnly ? "bg-slate-50" : undefined} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} />
          </div>
          <div>
            <Label>Status</Label>
            {/* Its own action, never part of a content edit; unsaved edits are saved first. */}
            <StatusOverrideSelect
              entity="ChangeOrder"
              document={document}
              beforeChange={persist}
              onChanged={() => { onSaved?.(); onOpenChange(false); }}
            />
          </div>
        </div>

        <div>
          <Label>Reason</Label>
          <Input value={form.reason} readOnly={readOnly} className={readOnly ? "bg-slate-50" : undefined} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        </div>
        <div>
          <Label>Description of change</Label>
          <Textarea rows={2} value={form.description} readOnly={readOnly} className={readOnly ? "bg-slate-50" : undefined} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label>Added cost</Label>
            {pricedLines ? (
              <Input value={linesTotal} readOnly className="bg-slate-50" title="Total of the lines below" />
            ) : (
              <Input type="number" value={form.added_cost} readOnly={readOnly} className={readOnly ? "bg-slate-50" : undefined} onChange={(e) => setForm((f) => ({ ...f, added_cost: e.target.value }))} />
            )}
          </div>
          <div>
            <Label>Credit</Label>
            <Input type="number" value={form.credit} readOnly={readOnly} className={readOnly ? "bg-slate-50" : undefined} onChange={(e) => setForm((f) => ({ ...f, credit: e.target.value }))} />
          </div>
          <div>
            <Label>Net change</Label>
            <Input value={computedNet} readOnly className="bg-slate-50" title="Added cost − credit" />
          </div>
          <div>
            <Label>Added days</Label>
            <Input type="number" value={form.added_days} readOnly={readOnly} className={readOnly ? "bg-slate-50" : undefined} onChange={(e) => setForm((f) => ({ ...f, added_days: e.target.value }))} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Sales tax %</Label>
            <Input
              type="number"
              value={form.tax_rate}
              readOnly={readOnly}
              className={readOnly ? "bg-slate-50" : undefined}
              onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value }))}
              placeholder="Account default"
            />
            <p className="text-xs text-slate-500 mt-1">Informational — CO nets stay pre-tax; invoices apply tax using estimate/account rate.</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3 text-sm flex justify-between">
          <span className="text-slate-500">Revised contract total (preview)</span>
          <span className="font-semibold">{previewRevised != null ? money(previewRevised) : "—"}</span>
        </div>

        <div>
          <div className="mb-2">
            <Label>Lines</Label>
            {!readOnly && <p className="text-xs text-slate-500">Priced like estimate lines — the lines total becomes the added cost. Use Credit for work taken out.</p>}
          </div>
          <ScopeLinesEditor lines={lines} setLines={setLines} readOnly={readOnly} defaultLaborRate={defaultLaborRate} idPrefix="co" />
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} readOnly={readOnly} className={readOnly ? "bg-slate-50" : undefined} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>

        {!readOnly && form.status !== "void" && (
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
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
                <Input className="sm:col-span-2" value={signRecipient} onChange={(e) => setSignRecipient(e.target.value)} placeholder={signChannel === "email" ? "client@example.com" : "Phone"} />
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={sendSignLink} disabled={signBusy}>
              {signBusy ? "Creating…" : "Create / send sign link"}
            </Button>
            {signResult && (
              <div className={`text-xs rounded-md px-2 py-1.5 ${signResult.delivery === "error" ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-700"}`}>
                <div>{signResult.message}</div>
                {signResult.sign_url && <a href={signResult.sign_url} target="_blank" rel="noreferrer" className="underline break-all">{signResult.sign_url}</a>}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
          <DocumentLifecycleActions
            entity="ChangeOrder"
            document={document}
            disabled={saving}
            onSaved={() => { onSaved?.(); onOpenChange(false); }}
            onRevised={(created) => { onOpenChange(false); onRevised?.(created); }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            {!readOnly && (
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save change order"}</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
