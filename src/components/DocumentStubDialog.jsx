import React, { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import StatusSelect from "@/components/StatusSelect";
import { DOCUMENT_STATUSES, documentTypeLabel } from "@/lib/documents";

/**
 * Phase 0 stub editor — open/edit document shell fields.
 * Full line editors arrive in later phases.
 */
export default function DocumentStubDialog({ open, onOpenChange, entity, document, jobId, onSaved }) {
  const emptyForm = {
    number: "",
    status: "draft",
    date: "",
    valid_till: "",
    start_date: "",
    end_date: "",
    notes: "",
    payment_terms: "",
    instructions: "",
    reason: "",
    description: "",
    crew: "",
    tax_rate: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && document) {
      setForm({
        number: document.number || "",
        status: document.status || "draft",
        date: document.date || "",
        valid_till: document.valid_till || "",
        start_date: document.start_date || "",
        end_date: document.end_date || "",
        notes: document.notes || "",
        payment_terms: document.payment_terms || "",
        instructions: document.instructions || "",
        reason: document.reason || "",
        description: document.description || "",
        crew: document.crew || "",
        tax_rate: document.tax_rate ?? "",
      });
    }
  }, [open, document]);

  if (!entity || !document) return null;

  const statuses = DOCUMENT_STATUSES[entity] || ["draft"];
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async ({ markSent = false } = {}) => {
    setSaving(true);
    try {
      const nextStatus = markSent ? "sent" : form.status;
      const payload = {
        number: form.number || undefined,
        status: nextStatus,
        notes: form.notes,
        tax_rate: form.tax_rate === "" ? undefined : Number(form.tax_rate),
      };
      if (entity === "Estimate") {
        payload.date = form.date;
        payload.valid_till = form.valid_till;
      }
      if (entity === "WorkOrder") {
        payload.start_date = form.start_date;
        payload.end_date = form.end_date;
        payload.instructions = form.instructions;
        payload.crew = form.crew;
      }
      if (entity === "ChangeOrder") {
        payload.reason = form.reason;
        payload.description = form.description;
      }
      if (entity === "Invoice") {
        payload.date = form.date;
        payload.payment_terms = form.payment_terms;
      }

      const previousStatus = document.status;
      await api.entities[entity].update(document.id, payload);

      if (nextStatus === "sent" && previousStatus !== "sent") {
        if (entity === "Estimate") {
          await api.entities.TimelineEntry.create({
            job_id: jobId,
            type: "estimate_sent",
            text: `Estimate ${form.number || ""} sent to client`.trim(),
            category: "financial",
          });
        }
        if (entity === "Invoice") {
          await api.entities.TimelineEntry.create({
            job_id: jobId,
            type: "invoice_sent",
            text: `Invoice ${form.number || ""} sent to client`.trim(),
            category: "financial",
          });
        }
      }

      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {documentTypeLabel(entity)}
            {form.number ? ` · ${form.number}` : ""}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 -mt-1">
          Document shell for this job. Line items and print layouts come in later phases.
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Number</Label>
              <Input value={form.number} onChange={(e) => set("number", e.target.value)} placeholder="Secondary label" />
            </div>
            <div>
              <Label>Status</Label>
              <StatusSelect value={form.status} onValueChange={(v) => set("status", v)} statuses={statuses} entity={entity} />
            </div>
          </div>

          {(entity === "Estimate" || entity === "Invoice") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
              </div>
              {entity === "Estimate" && (
                <div>
                  <Label>Valid till</Label>
                  <Input type="date" value={form.valid_till} onChange={(e) => set("valid_till", e.target.value)} />
                </div>
              )}
              {entity === "Invoice" && (
                <div>
                  <Label>Tax %</Label>
                  <Input type="number" value={form.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} placeholder="0" />
                </div>
              )}
            </div>
          )}

          {entity === "Estimate" && (
            <div>
              <Label>Tax %</Label>
              <Input type="number" value={form.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} placeholder="0" />
            </div>
          )}

          {entity === "WorkOrder" && (
            <>
              <div>
                <Label>Crew</Label>
                <Input value={form.crew} onChange={(e) => set("crew", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
                </div>
                <div>
                  <Label>End</Label>
                  <Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Instructions</Label>
                <Textarea value={form.instructions} onChange={(e) => set("instructions", e.target.value)} rows={2} />
              </div>
            </>
          )}

          {entity === "ChangeOrder" && (
            <>
              <div>
                <Label>Reason</Label>
                <Input value={form.reason} onChange={(e) => set("reason", e.target.value)} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
              </div>
            </>
          )}

          {entity === "Invoice" && (
            <div>
              <Label>Payment terms</Label>
              <Input value={form.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} placeholder="Due upon receipt" />
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {(entity === "Estimate" || entity === "Invoice") && form.status !== "sent" && (
            <Button variant="outline" onClick={() => save({ markSent: true })} disabled={saving}>
              Mark sent
            </Button>
          )}
          <Button onClick={() => save()} className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
