import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AddressFields from "@/components/AddressFields";
import FieldLabel from "@/components/FieldLabel";

const empty = {
  name: "",
  address: "",
  address_line2: "",
  city: "",
  state: "",
  zip: "",
  access_notes: "",
  hazard_notes: "",
  parking_notes: "",
  pets_notes: "",
  special_instructions: "",
  notes: "",
};

/**
 * Create / edit a Property under a customer. Access and hazard notes live here
 * so jobs and estimates reuse them without retyping.
 */
export default function PropertyFormDialog({ open, onOpenChange, onSave, property = null, defaultName = "" }) {
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setError("");
      setForm({
        ...empty,
        ...property,
        name: property?.name || defaultName || "",
      });
    }
  }, [open, property, defaultName]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    if (!form.name?.trim()) {
      setError("Enter a property name or label.");
      return;
    }
    setError("");
    onSave({
      name: form.name.trim(),
      address: form.address?.trim() || "",
      address_line2: form.address_line2?.trim() || "",
      city: form.city?.trim() || "",
      state: form.state?.trim() || "",
      zip: form.zip?.trim() || "",
      access_notes: form.access_notes?.trim() || "",
      hazard_notes: form.hazard_notes?.trim() || "",
      parking_notes: form.parking_notes?.trim() || "",
      pets_notes: form.pets_notes?.trim() || "",
      special_instructions: form.special_instructions?.trim() || "",
      notes: form.notes?.trim() || "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle>{property ? "Edit property" : "New property"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabel htmlFor="property-name" required>Name / label</FieldLabel>
            <Input
              id="property-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Main house, Rental on Oak, …"
            />
          </div>
          <AddressFields value={form} onChange={set} optional />
          <div>
            <FieldLabel htmlFor="property-access">Access</FieldLabel>
            <Textarea
              id="property-access"
              value={form.access_notes}
              onChange={(e) => set({ access_notes: e.target.value })}
              rows={2}
              placeholder="Gate code, locked yard, access window, …"
            />
          </div>
          <div>
            <FieldLabel htmlFor="property-hazards">Hazards / site conditions</FieldLabel>
            <Textarea
              id="property-hazards"
              value={form.hazard_notes}
              onChange={(e) => set({ hazard_notes: e.target.value })}
              rows={2}
              placeholder="Septic, slopes, fences, overhead lines, …"
            />
          </div>
          <div>
            <FieldLabel htmlFor="property-parking">Parking / equipment access</FieldLabel>
            <Textarea
              id="property-parking"
              value={form.parking_notes}
              onChange={(e) => set({ parking_notes: e.target.value })}
              rows={2}
              placeholder="Parking, traffic, neighbors, staging, …"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="property-pets">Pets</FieldLabel>
              <Textarea
                id="property-pets"
                value={form.pets_notes}
                onChange={(e) => set({ pets_notes: e.target.value })}
                rows={2}
                placeholder="Dogs in yard, …"
              />
            </div>
            <div>
              <FieldLabel htmlFor="property-special">Special instructions</FieldLabel>
              <Textarea
                id="property-special"
                value={form.special_instructions}
                onChange={(e) => set({ special_instructions: e.target.value })}
                rows={2}
                placeholder="Call before arrival, …"
              />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="property-notes">Other notes</FieldLabel>
            <Textarea
              id="property-notes"
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={2}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} className="bg-primary text-primary-foreground hover:bg-primary/90">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
