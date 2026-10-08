import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FieldLabel from "@/components/FieldLabel";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import JobPhaseStatusSelect from "@/components/JobPhaseStatusSelect";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { userCan } from "@/lib/permissions";

export default function JobFormDialog({
  open,
  onOpenChange,
  onSave,
  job = null,
  clients,
  defaultClientId = "",
  properties = null,
  leadIntake = false,
}) {
  const { user } = useAuth();
  const canAssignCrew = userCan(user, "assign_crew");
  const [crews, setCrews] = useState([]);
  const [clientProperties, setClientProperties] = useState([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    phase: "working",
    status: "Estimate sent",
    client_id: "",
    property_id: "",
    start_date: "",
    end_date: "",
    notes: "",
    crew_id: "",
    requested_work: "",
    next_action: "",
    site_visit_date: "",
    referral_source: "",
    contact_attempts: "",
    declined_reason: "",
    urgency: "normal",
    estimated_duration_hours: "",
    service_area: "",
  });

  useEffect(() => {
    if (open) {
      const defaultStatus = leadIntake && !job ? "New inquiry" : (job?.status || "Estimate sent");
      setForm(
        job
          ? {
              title: job.title || "",
              description: job.description || "",
              phase: job.phase || "working",
              status: job.status || "Estimate sent",
              client_id: job.client_id || "",
              property_id: job.property_id || "",
              start_date: job.start_date || "",
              end_date: job.end_date || "",
              notes: job.notes || "",
              crew_id: job.crew_id || "",
              requested_work: job.requested_work || "",
              next_action: job.next_action || "",
              site_visit_date: job.site_visit_date || "",
              referral_source: job.referral_source || "",
              contact_attempts: job.contact_attempts || "",
              declined_reason: job.declined_reason || "",
              urgency: job.urgency || "normal",
              estimated_duration_hours: job.estimated_duration_hours ?? "",
              service_area: job.service_area || "",
            }
          : {
              title: "",
              description: "",
              phase: "working",
              status: defaultStatus,
              client_id: defaultClientId || "",
              property_id: "",
              start_date: "",
              end_date: "",
              notes: "",
              crew_id: "",
              requested_work: "",
              next_action: leadIntake ? "Schedule site visit" : "",
              site_visit_date: "",
              referral_source: "",
              contact_attempts: "",
              declined_reason: "",
              urgency: "normal",
              estimated_duration_hours: "",
              service_area: "",
            }
      );
      if (canAssignCrew) {
        api.entities.Crew.list("-created_date", 100)
          .then(setCrews)
          .catch(() => setCrews([]));
      } else {
        setCrews([]);
      }
    }
  }, [open, job, defaultClientId, canAssignCrew, leadIntake]);

  useEffect(() => {
    if (!open) return;
    if (Array.isArray(properties)) {
      setClientProperties(properties.filter((p) => !form.client_id || p.client_id === form.client_id));
      return;
    }
    if (!form.client_id) {
      setClientProperties([]);
      return;
    }
    api.entities.Property.filter({ client_id: form.client_id }, "-created_date", 100)
      .then(setClientProperties)
      .catch(() => setClientProperties([]));
  }, [open, form.client_id, properties]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.client_id) return;
    const payload = {
      ...form,
      title: form.title?.trim() || undefined,
      property_id: form.property_id || null,
      requested_work: form.requested_work?.trim() || undefined,
      next_action: form.next_action?.trim() || undefined,
      site_visit_date: form.site_visit_date || undefined,
      referral_source: form.referral_source?.trim() || undefined,
      contact_attempts: form.contact_attempts?.trim() || undefined,
      declined_reason: form.declined_reason?.trim() || undefined,
      urgency: form.urgency || "normal",
      estimated_duration_hours: form.estimated_duration_hours === "" || form.estimated_duration_hours == null
        ? undefined
        : Number(form.estimated_duration_hours),
      service_area: form.service_area?.trim() || undefined,
    };
    if (canAssignCrew) {
      payload.crew_id = form.crew_id || null;
    } else {
      delete payload.crew_id;
    }
    onSave(payload);
  };

  const showLeadFields = leadIntake || ["New inquiry", "Site visit"].includes(form.status)
    || Boolean(form.requested_work || form.next_action || form.site_visit_date);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {job ? "Edit Job" : leadIntake ? "New lead" : "New Job"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel>Title (optional)</FieldLabel>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Front oak removal + stump" />
          </div>
          <div>
            <FieldLabel required>Client</FieldLabel>
            <Select
              value={form.client_id}
              onValueChange={(v) => setForm((f) => ({ ...f, client_id: v, property_id: "" }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.client_id && (
            <div>
              <Label>Property</Label>
              <Select value={form.property_id || "__none__"} onValueChange={(v) => set("property_id", v === "__none__" ? "" : v)}>
                <SelectTrigger data-testid="job-property-select">
                  <SelectValue placeholder="No property linked" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No property linked</SelectItem>
                  {clientProperties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Link a saved property so access and hazard notes carry into this job.
              </p>
            </div>
          )}
          {canAssignCrew ? (
            <div>
              <Label>Crew</Label>
              <Select value={form.crew_id || "__none__"} onValueChange={(v) => set("crew_id", v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {crews.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Crew leaders and members only see jobs assigned to their crew.
              </p>
            </div>
          ) : null}
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Phase & status</Label>
            <JobPhaseStatusSelect
              phase={form.phase}
              status={form.status}
              onChange={({ phase, status }) => setForm((f) => ({ ...f, phase, status }))}
            />
          </div>
          {showLeadFields && (
            <div className="space-y-3 rounded-lg border border-border/70 p-3 bg-muted/20">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lead / site visit</div>
              <div>
                <Label>Requested work</Label>
                <Textarea
                  value={form.requested_work}
                  onChange={(e) => set("requested_work", e.target.value)}
                  rows={2}
                  placeholder="What did they ask for?"
                />
              </div>
              <div>
                <Label>Next action</Label>
                <Input
                  value={form.next_action}
                  onChange={(e) => set("next_action", e.target.value)}
                  placeholder="Call back, schedule visit, send estimate…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Site visit date</Label>
                  <Input type="date" value={form.site_visit_date} onChange={(e) => set("site_visit_date", e.target.value)} />
                </div>
                <div>
                  <Label>Referral (this lead)</Label>
                  <Input value={form.referral_source} onChange={(e) => set("referral_source", e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <div>
                <Label>Contact attempts</Label>
                <Textarea
                  value={form.contact_attempts}
                  onChange={(e) => set("contact_attempts", e.target.value)}
                  rows={2}
                  placeholder="Left voicemail Tue; emailed Wed…"
                />
              </div>
              {form.status === "Completed" || form.declined_reason ? (
                <div>
                  <Label>Declined reason</Label>
                  <Input value={form.declined_reason} onChange={(e) => set("declined_reason", e.target.value)} />
                </div>
              ) : null}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Urgency</Label>
              <Select value={form.urgency || "normal"} onValueChange={(v) => set("urgency", v)}>
                <SelectTrigger data-testid="job-urgency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Est. duration (hrs)</Label>
              <Input
                type="number"
                value={form.estimated_duration_hours}
                onChange={(e) => set("estimated_duration_hours", e.target.value)}
                placeholder="—"
                data-testid="job-duration-hours"
              />
            </div>
          </div>
          <div>
            <Label>Service area</Label>
            <Input
              value={form.service_area}
              onChange={(e) => set("service_area", e.target.value)}
              placeholder="City, zip, or zone for dispatch filters"
              data-testid="job-service-area"
            />
          </div>
          <p className="text-xs text-slate-500">
            Money figures live on the Financials panel (from estimate, invoices, materials, and logged payments).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
