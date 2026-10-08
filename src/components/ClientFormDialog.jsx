import React, { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AddressFields from "@/components/AddressFields";
import FieldLabel from "@/components/FieldLabel";
import { CLIENT_CONTACT_ROLES, CLIENT_CONTACT_METHODS } from "../../shared/arboristServicePresets.js";

const empty = {
  name: "",
  address: "",
  address_line2: "",
  city: "",
  state: "",
  zip: "",
  phone: "",
  email: "",
  notes: "",
  preferred_contact_method: "",
  referral_source: "",
  contacts: [],
};

function blankContact() {
  return { role: "other", name: "", phone: "", email: "", notes: "" };
}

function roleLabel(role) {
  return String(role || "other").replace(/_/g, " ");
}

function methodLabel(method) {
  if (method === "any") return "Any";
  return String(method || "").replace(/_/g, " ");
}

export default function ClientFormDialog({ open, onOpenChange, onSave, client }) {
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setError("");
      setForm({
        ...empty,
        ...client,
        preferred_contact_method: client?.preferred_contact_method || "",
        referral_source: client?.referral_source || "",
        contacts: Array.isArray(client?.contacts)
          ? client.contacts.map((c) => ({
              id: c.id,
              role: c.role || "other",
              name: c.name || "",
              phone: c.phone || "",
              email: c.email || "",
              notes: c.notes || "",
            }))
          : [],
      });
    }
  }, [open, client]);

  const setContact = (index, patch) => {
    setForm((f) => ({
      ...f,
      contacts: f.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  };

  const submit = () => {
    if (!form.name?.trim()) {
      setError("Enter a client name.");
      return;
    }
    if (!form.address?.trim() || !form.city?.trim() || !form.state?.trim() || !form.zip?.trim()) {
      setError("Enter street address, city, state, and ZIP.");
      return;
    }
    const contacts = (form.contacts || [])
      .map((c) => ({
        ...(c.id ? { id: c.id } : {}),
        role: c.role || "other",
        name: String(c.name || "").trim(),
        phone: String(c.phone || "").trim() || undefined,
        email: String(c.email || "").trim() || undefined,
        notes: String(c.notes || "").trim() || undefined,
      }))
      .filter((c) => c.name);
    for (const c of form.contacts || []) {
      if ((c.phone || c.email || c.notes) && !String(c.name || "").trim()) {
        setError("Each extra contact needs a name.");
        return;
      }
    }
    setError("");
    onSave({
      name: form.name.trim(),
      address: form.address.trim(),
      address_line2: form.address_line2?.trim() || "",
      city: form.city.trim(),
      state: form.state.trim(),
      zip: form.zip.trim(),
      phone: form.phone?.trim() || "",
      email: form.email?.trim() || "",
      notes: form.notes?.trim() || "",
      preferred_contact_method: form.preferred_contact_method || undefined,
      referral_source: form.referral_source?.trim() || "",
      contacts,
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Preferred contact</FieldLabel>
              <Select
                value={form.preferred_contact_method || "__none__"}
                onValueChange={(v) => setForm((f) => ({ ...f, preferred_contact_method: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger aria-label="Preferred contact method">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any</SelectItem>
                  {CLIENT_CONTACT_METHODS.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">{methodLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="client-referral">Referral source</FieldLabel>
              <Input
                id="client-referral"
                value={form.referral_source}
                onChange={(e) => setForm((f) => ({ ...f, referral_source: e.target.value }))}
                placeholder="Neighbor, Google, repeat, …"
              />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="client-notes">Notes</FieldLabel>
            <Textarea id="client-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-foreground">Extra contacts</div>
                <p className="text-xs text-muted-foreground">Owner, tenant, site, or billing — keep it light.</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setForm((f) => ({ ...f, contacts: [...(f.contacts || []), blankContact()] }))}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add
              </Button>
            </div>
            {(form.contacts || []).map((c, i) => (
              <div key={c.id || `contact-${i}`} className="rounded-lg border border-border/70 p-2 space-y-2 bg-muted/20">
                <div className="grid grid-cols-[7rem_minmax(0,1fr)_auto] gap-2 items-center">
                  <Select value={c.role || "other"} onValueChange={(v) => setContact(i, { role: v })}>
                    <SelectTrigger className="h-8 text-xs capitalize" aria-label="Contact role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLIENT_CONTACT_ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize text-xs">{roleLabel(r)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={c.name}
                    onChange={(e) => setContact(i, { name: e.target.value })}
                    placeholder="Name"
                    className="h-8 text-sm"
                    aria-label="Contact name"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setForm((f) => ({ ...f, contacts: f.contacts.filter((_, j) => j !== i) }))}
                    aria-label="Remove contact"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={c.phone || ""}
                    onChange={(e) => setContact(i, { phone: e.target.value })}
                    placeholder="Phone"
                    className="h-8 text-sm"
                    aria-label="Contact phone"
                  />
                  <Input
                    value={c.email || ""}
                    onChange={(e) => setContact(i, { email: e.target.value })}
                    placeholder="Email"
                    className="h-8 text-sm"
                    aria-label="Contact email"
                  />
                </div>
              </div>
            ))}
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
