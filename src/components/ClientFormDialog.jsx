import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AddressFields from "@/components/AddressFields";
import FieldLabel from "@/components/FieldLabel";

const empty = { name: "", address: "", address_line2: "", city: "", state: "", zip: "", phone: "", email: "", notes: "" };

export default function ClientFormDialog({ open, onOpenChange, onSave, client }) {
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setError("");
      setForm({ ...empty, ...client });
    }
  }, [open, client]);

  const submit = () => {
    if (!form.name?.trim()) {
      setError("Enter a client name.");
      return;
    }
    if (!form.address?.trim() || !form.city?.trim() || !form.state?.trim() || !form.zip?.trim()) {
      setError("Enter street address, city, state, and ZIP.");
      return;
    }
    setError("");
    onSave({
      ...form,
      name: form.name.trim(),
      address: form.address.trim(),
      address_line2: form.address_line2?.trim() || "",
      city: form.city.trim(),
      state: form.state.trim(),
      zip: form.zip.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client ? "Edit Client" : "New Client"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel htmlFor="client-name" required>Name</FieldLabel>
            <Input id="client-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="John Smith" autoComplete="name" />
          </div>
          <AddressFields value={form} onChange={(next) => setForm((f) => ({ ...f, ...next }))} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="client-phone">Phone</FieldLabel>
              <Input id="client-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="555-1234" autoComplete="tel" />
            </div>
            <div>
              <FieldLabel htmlFor="client-email">Email</FieldLabel>
              <Input id="client-email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="john@email.com" autoComplete="email" />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="client-notes">Notes</FieldLabel>
            <Textarea id="client-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
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
