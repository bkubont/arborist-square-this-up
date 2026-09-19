import React, { useEffect, useMemo, useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DocumentLifecycleActions from "@/components/DocumentLifecycleActions";
import StatusSelect from "@/components/StatusSelect";
import { DOCUMENT_STATUSES } from "@/lib/documents";
import { money, shortDate } from "@/lib/format";
import { changeOrderNet } from "@/lib/documentMapping";

/** Change Order editor + client e-sign (Phase 4). */
export default function ChangeOrderEditorDialog({ open, onOpenChange, document, jobId, onSaved, onRevised }) {
  const [form, setForm] = useState({
    number: "", status: "draft", reason: "", description: "", notes: "",
    added_cost: "", credit: "", net_change: "", added_days: "", revised_contract_total: "",
  });
  const [lines, setLines] = useState([{ description: "", amount: "" }]);
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
      net_change: document.net_change ?? "",
      added_days: document.added_days ?? "",
      revised_contract_total: document.revised_contract_total ?? "",
    });
    setLines(Array.isArray(document.lines) && document.lines.length
      ? document.lines.map((l) => ({ description: l.description || "", amount: l.amount ?? "" }))
      : [{ description: "", amount: "" }]);
    api.jobs.authorizedTotal(jobId).then(setAuthorized).catch(() => setAuthorized(null));
  }, [open, document, jobId]);

  const computedNet = useMemo(
    () => changeOrderNet({ added_cost: form.added_cost, credit: form.credit, net_change: form.net_change === "" ? undefined : form.net_change }),
    [form.added_cost, form.credit, form.net_change],
  );

  const previewRevised = useMemo(() => {
    if (!authorized) return null;
    // Treat this CO as approved for preview when editing net
    const othersNet = (authorized.approved_net || 0) - (document?.status === "approved" ? changeOrderNet(document) : 0);
    return Math.round((authorized.baseline + othersNet + computedNet) * 100) / 100;
  }, [authorized, computedNet, document]);

  if (!document) return null;

  const save = async () => {
    setSaving(true);
    try {
      const serializedLines = lines
        .map((l) => ({ description: l.description || "", amount: l.amount === "" ? undefined : Number(l.amount) }))
        .filter((l) => l.description || l.amount != null);
      await api.entities.ChangeOrder.update(document.id, {
        number: form.number || undefined,
        status: form.status,
        reason: form.reason,
        description: form.description,
        notes: form.notes,
        added_cost: form.added_cost === "" ? undefined : Number(form.added_cost),
        credit: form.credit === "" ? undefined : Number(form.credit),
        net_change: computedNet,
        added_days: form.added_days === "" ? undefined : Number(form.added_days),
        revised_contract_total: previewRevised ?? (form.revised_contract_total === "" ? undefined : Number(form.revised_contract_total)),
        lines: serializedLines,
      });
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
      const serializedLines = lines
        .map((l) => ({ description: l.description || "", amount: l.amount === "" ? undefined : Number(l.amount) }))
        .filter((l) => l.description || l.amount != null);
      await api.entities.ChangeOrder.update(document.id, {
        number: form.number || undefined,
        reason: form.reason,
        description: form.description,
        notes: form.notes,
        added_cost: form.added_cost === "" ? undefined : Number(form.added_cost),
        credit: form.credit === "" ? undefined : Number(form.credit),
        net_change: computedNet,
        added_days: form.added_days === "" ? undefined : Number(form.added_days),
        revised_contract_total: previewRevised ?? undefined,
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
          <DialogTitle>Change Order{form.number ? ` · ${form.number}` : ""}</DialogTitle>
        </DialogHeader>

        {document.status === "approved" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Approved by <strong>{document.signer_name || "client"}</strong>
            {document.signed_at ? ` on ${shortDate(document.signed_at)}` : ""}.
            Fields stay editable. Snapshot net {money(document.accepted_snapshot?.net_change ?? document.net_change)} · revised {money(document.accepted_snapshot?.revised_contract_total ?? document.revised_contract_total)}.
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
            <Input value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} />
          </div>
          <div>
            <Label>Status</Label>
            <StatusSelect
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              statuses={DOCUMENT_STATUSES.ChangeOrder}
              entity="ChangeOrder"
            />
          </div>
        </div>

        <div>
          <Label>Reason</Label>
          <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        </div>
        <div>
          <Label>Description of change</Label>
          <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label>Added cost</Label>
            <Input type="number" value={form.added_cost} onChange={(e) => setForm((f) => ({ ...f, added_cost: e.target.value, net_change: "" }))} />
          </div>
          <div>
            <Label>Credit</Label>
            <Input type="number" value={form.credit} onChange={(e) => setForm((f) => ({ ...f, credit: e.target.value, net_change: "" }))} />
          </div>
          <div>
            <Label>Net change</Label>
            <Input type="number" value={form.net_change === "" ? computedNet : form.net_change} onChange={(e) => setForm((f) => ({ ...f, net_change: e.target.value }))} />
          </div>
          <div>
            <Label>Added days</Label>
            <Input type="number" value={form.added_days} onChange={(e) => setForm((f) => ({ ...f, added_days: e.target.value }))} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3 text-sm flex justify-between">
          <span className="text-slate-500">Revised contract total (preview)</span>
          <span className="font-semibold">{previewRevised != null ? money(previewRevised) : "—"}</span>
        </div>

        <div>
          <div className="mb-2">
            <Label>Optional line breakdown</Label>
          </div>
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="flex gap-2">
                <Input className="flex-1" placeholder="Description" value={line.description} onChange={(e) => setLines((rows) => rows.map((r, i) => i === index ? { ...r, description: e.target.value } : r))} />
                <Input className="w-28" type="number" placeholder="Amount" value={line.amount} onChange={(e) => setLines((rows) => rows.map((r, i) => i === index ? { ...r, amount: e.target.value } : r))} />
                <Button type="button" variant="outline" size="icon" className="text-red-600" onClick={() => setLines((rows) => rows.length <= 1 ? [{ description: "", amount: "" }] : rows.filter((_, i) => i !== index))}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((r) => [...r, { description: "", amount: "" }])}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Line
            </Button>
          </div>
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>

        {form.status !== "void" && form.status !== "rejected" && (
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
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={save} disabled={saving || form.status === "void"}>{saving ? "Saving…" : "Save change order"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
