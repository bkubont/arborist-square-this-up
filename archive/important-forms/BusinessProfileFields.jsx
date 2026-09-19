import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function BusinessProfileFields({ form, setForm, logoFile, onLogoFile, disabled }) {
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const [preview, setPreview] = useState(form.logo_url);
  useEffect(() => {
    if (!logoFile) { setPreview(form.logo_url); return undefined; }
    const url = URL.createObjectURL(logoFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile, form.logo_url]);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="logo">Logo</Label>
        <Input id="logo" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={(event) => onLogoFile(event.target.files?.[0] || null)} />
        {preview && <img src={preview} alt="Business logo" className="mt-2 h-16 w-auto max-w-[12rem] object-contain" />}
      </div>
      <div>
        <Label htmlFor="business_name">Business name</Label>
        <Input id="business_name" value={form.business_name} disabled={disabled} onChange={(event) => set("business_name", event.target.value)} placeholder="F&G Home Maintenance" />
      </div>
      <div>
        <Label htmlFor="labor_rate">Labor hour rate</Label>
        <Input id="labor_rate" type="number" min="0" step="0.01" value={form.labor_rate} disabled={disabled} onChange={(event) => set("labor_rate", event.target.value)} placeholder="0.00" />
      </div>
      <div>
        <Label htmlFor="owner_name">Name *</Label>
        <Input id="owner_name" required value={form.name} disabled={disabled} onChange={(event) => set("name", event.target.value)} autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="address">Street address</Label>
        <Input id="address" value={form.address} disabled={disabled} onChange={(event) => set("address", event.target.value)} autoComplete="address-line1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <Label htmlFor="city">City *</Label>
          <Input id="city" required value={form.city} disabled={disabled} onChange={(event) => set("city", event.target.value)} autoComplete="address-level2" />
        </div>
        <div>
          <Label htmlFor="state">State *</Label>
          <Input id="state" required value={form.state} disabled={disabled} onChange={(event) => set("state", event.target.value)} autoComplete="address-level1" />
        </div>
        <div>
          <Label htmlFor="zip">ZIP *</Label>
          <Input id="zip" required value={form.zip} disabled={disabled} onChange={(event) => set("zip", event.target.value)} autoComplete="postal-code" />
        </div>
      </div>
      <div>
        <Label htmlFor="phone">Phone number *</Label>
        <Input id="phone" required value={form.phone} disabled={disabled} onChange={(event) => set("phone", event.target.value)} autoComplete="tel" />
      </div>
      <div>
        <Label htmlFor="profile_email">Email</Label>
        <Input id="profile_email" type="email" value={form.email} disabled={disabled} onChange={(event) => set("email", event.target.value)} autoComplete="email" />
      </div>
      <div>
        <Label htmlFor="website">Website</Label>
        <Input id="website" value={form.website} disabled={disabled} onChange={(event) => set("website", event.target.value)} placeholder="https://" autoComplete="url" />
      </div>
    </div>
  );
}
