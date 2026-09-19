import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ClientFormDialog({ open, onOpenChange, onSave, client }) {
  const [form, setForm] = useState({ name: "", address: "", address_line2: "", phone: "", email: "", notes: "" });

  useEffect(() => {
    if (open) setForm({ name: "", address: "", address_line2: "", phone: "", email: "", notes: "", ...client });
  }, [open, client]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name?.trim()) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client ? "Edit Client" : "New Client"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="John Smith" />
          </div>
          <div>
            <Label htmlFor="client-address">Address line 1</Label>
            <Input id="client-address" autoComplete="address-line1" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Oak St" />
          </div>
          <div>
            <Label htmlFor="client-address-line2">Address line 2 (optional)</Label>
            <Input id="client-address-line2" autoComplete="address-line2" value={form.address_line2} onChange={(e) => set("address_line2", e.target.value)} placeholder="Apt / suite, city, state, ZIP" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="555-1234" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="john@email.com" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
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
