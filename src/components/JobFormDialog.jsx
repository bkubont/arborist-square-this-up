import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FieldLabel from "@/components/FieldLabel";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusSelect from "@/components/StatusSelect";

export default function JobFormDialog({ open, onOpenChange, onSave, job = null, clients, defaultClientId = "" }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "Estimate",
    client_id: "",
    start_date: "",
    end_date: "",
    notes: "",
  });

  useEffect(() => {
    if (open) {
      setForm(
        job
          ? {
              title: job.title || "",
              description: job.description || "",
              status: job.status || "Estimate",
              client_id: job.client_id || "",
              start_date: job.start_date || "",
              end_date: job.end_date || "",
              notes: job.notes || "",
            }
          : {
              title: "",
              description: "",
              status: "Estimate",
              client_id: defaultClientId || "",
              start_date: "",
              end_date: "",
              notes: "",
            }
      );
    }
  }, [open, job, defaultClientId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.title?.trim() || !form.client_id) return;
    onSave({ ...form });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{job ? "Edit Job" : "New Job"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Title</FieldLabel>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Kitchen faucet replacement" />
          </div>
          <div>
            <FieldLabel required>Client</FieldLabel>
            <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
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
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Status</Label>
            <StatusSelect value={form.status} onValueChange={(v) => set("status", v)} />
          </div>
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