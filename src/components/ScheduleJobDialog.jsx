import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { userCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * Assign crew / date / duration / equipment for a Ready-to-Schedule (or dated) job.
 * Surfaces overlap warnings from the schedule API.
 */
export default function ScheduleJobDialog({
  open,
  onOpenChange,
  job,
  onScheduled,
  mode = "schedule", // schedule | reschedule
}) {
  const { user } = useAuth();
  const canAssignCrew = userCan(user, "assign_crew");
  const [crews, setCrews] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [form, setForm] = useState({
    start_date: "",
    end_date: "",
    crew_id: "",
    equipment_ids: [],
    estimated_duration_hours: "",
    prereq_approval: true,
    prereq_deposit: false,
    prereq_access: false,
    customer_notified: false,
    reason: "weather",
    note: "",
  });

  useEffect(() => {
    if (!open || !job) return;
    setWarnings([]);
    setForm({
      start_date: job.start_date || "",
      end_date: job.end_date || job.start_date || "",
      crew_id: job.crew_id || "",
      equipment_ids: Array.isArray(job.equipment_ids) ? [...job.equipment_ids] : [],
      estimated_duration_hours: job.estimated_duration_hours ?? "",
      prereq_approval: job.prereq_approval !== false,
      prereq_deposit: Boolean(job.prereq_deposit),
      prereq_access: Boolean(job.prereq_access),
      customer_notified: false,
      reason: "weather",
      note: "",
    });
    Promise.all([
      canAssignCrew ? api.entities.Crew.list("-created_date", 100) : Promise.resolve([]),
      api.entities.Equipment.list("-created_date", 100).catch(() => []),
    ]).then(([crewRows, equipRows]) => {
      setCrews(crewRows || []);
      setEquipment((equipRows || []).filter((e) => e.active !== false));
    });
  }, [open, job, canAssignCrew]);

  // Live conflict preview while editing dates/resources.
  useEffect(() => {
    if (!open || !form.start_date) {
      setWarnings([]);
      return undefined;
    }
    const handle = setTimeout(() => {
      api.schedule.conflicts({
        start_date: form.start_date,
        end_date: form.end_date || form.start_date,
        crew_id: form.crew_id || undefined,
        equipment_ids: form.equipment_ids,
        exclude_job_id: job?.id,
      }).then((result) => {
        setWarnings(result?.warnings || []);
      }).catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [open, form.start_date, form.end_date, form.crew_id, form.equipment_ids, job?.id]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const toggleEquipment = (id) => {
    setForm((f) => ({
      ...f,
      equipment_ids: f.equipment_ids.includes(id)
        ? f.equipment_ids.filter((x) => x !== id)
        : [...f.equipment_ids, id],
    }));
  };

  const prereqSummary = useMemo(() => ([
    { key: "approval", label: "Approval", ok: form.prereq_approval },
    { key: "deposit", label: "Deposit", ok: form.prereq_deposit },
    { key: "access", label: "Access", ok: form.prereq_access },
  ]), [form.prereq_approval, form.prereq_deposit, form.prereq_access]);

  const submit = async () => {
    if (!job?.id || !form.start_date) {
      toast({ title: "Start date is required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      let result;
      if (mode === "reschedule") {
        result = await api.schedule.reschedule(job.id, {
          start_date: form.start_date,
          end_date: form.end_date || form.start_date,
          reason: form.reason || "weather",
          note: form.note || undefined,
          customer_notified: form.customer_notified,
          crew_id: canAssignCrew ? (form.crew_id || undefined) : undefined,
        });
      } else {
        result = await api.schedule.assign(job.id, {
          start_date: form.start_date,
          end_date: form.end_date || form.start_date,
          crew_id: canAssignCrew ? (form.crew_id || undefined) : undefined,
          equipment_ids: form.equipment_ids,
          estimated_duration_hours: form.estimated_duration_hours === ""
            ? undefined
            : Number(form.estimated_duration_hours),
          prereq_approval: form.prereq_approval,
          prereq_deposit: form.prereq_deposit,
          prereq_access: form.prereq_access,
          customer_notified: form.customer_notified,
          note: form.note || undefined,
        });
      }
      const warn = result?.schedule_warnings || [];
      setWarnings(warn);
      if (warn.length) {
        toast({
          title: "Scheduled with double-book warning",
          description: warn[0],
          variant: "destructive",
        });
      } else {
        toast({
          title: mode === "reschedule" ? "Job rescheduled" : "Job scheduled",
          description: job.title || "Reservation saved",
        });
      }
      onScheduled?.(result);
      onOpenChange(false);
    } catch (err) {
      toast({ title: err.message || "Could not schedule", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="schedule-job-dialog">
        <DialogHeader>
          <DialogTitle>
            {mode === "reschedule" ? "Reschedule" : "Schedule"} · {job.title || "Job"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-2">
            {prereqSummary.map((p) => (
              <span
                key={p.key}
                className={cn(
                  "text-[11px] uppercase tracking-wide rounded px-1.5 py-0.5 border",
                  p.ok
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-amber-50 text-amber-800 border-amber-200",
                )}
                data-testid={`prereq-${p.key}`}
              >
                {p.label}{p.ok ? "" : " missing"}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                data-testid="schedule-start-date"
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)}
                data-testid="schedule-end-date"
              />
            </div>
          </div>

          {canAssignCrew ? (
            <div>
              <Label>Crew</Label>
              <Select value={form.crew_id || "__none__"} onValueChange={(v) => set("crew_id", v === "__none__" ? "" : v)}>
                <SelectTrigger data-testid="schedule-crew">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {crews.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div>
            <Label>Est. duration (hrs)</Label>
            <Input
              type="number"
              value={form.estimated_duration_hours}
              onChange={(e) => set("estimated_duration_hours", e.target.value)}
              data-testid="schedule-duration"
            />
          </div>

          {mode === "schedule" ? (
            <div>
              <Label className="mb-2 block">Equipment / machines</Label>
              {equipment.length === 0 ? (
                <p className="text-xs text-muted-foreground">No equipment yet — add machines on Team.</p>
              ) : (
                <ul className="space-y-1.5 max-h-36 overflow-y-auto border rounded-md p-2">
                  {equipment.map((eq) => (
                    <li key={eq.id}>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.equipment_ids.includes(eq.id)}
                          onChange={() => toggleEquipment(eq.id)}
                          data-testid={`schedule-equip-${eq.id}`}
                        />
                        <span>{eq.name}</span>
                        <span className="text-xs text-muted-foreground">({eq.kind})</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {mode === "schedule" ? (
            <div className="grid grid-cols-3 gap-2 text-sm">
              {[
                ["prereq_approval", "Approval"],
                ["prereq_deposit", "Deposit"],
                ["prereq_access", "Access"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form[key])}
                    onChange={(e) => set(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Reason</Label>
                <Select value={form.reason} onValueChange={(v) => set("reason", v)}>
                  <SelectTrigger data-testid="reschedule-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weather">Weather</SelectItem>
                    <SelectItem value="customer_request">Customer request</SelectItem>
                    <SelectItem value="crew_availability">Crew availability</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Note</Label>
                <Textarea
                  value={form.note}
                  onChange={(e) => set("note", e.target.value)}
                  rows={2}
                  placeholder="High winds, customer notified…"
                  data-testid="reschedule-note"
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.customer_notified}
                  onChange={(e) => set("customer_notified", e.target.checked)}
                  data-testid="reschedule-notified"
                />
                Customer notified
              </label>
            </div>
          )}

          {warnings.length > 0 ? (
            <div
              className="rounded-md border border-amber-300 bg-amber-50 text-amber-950 text-sm p-3 space-y-1"
              role="alert"
              data-testid="schedule-warnings"
            >
              <div className="font-semibold">Double-book warning</div>
              {warnings.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={busy} data-testid="schedule-submit">
            {busy ? "Saving…" : mode === "reschedule" ? "Reschedule" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
