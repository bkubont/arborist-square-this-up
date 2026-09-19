import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Account-level company identity for customer-facing forms (Phase 0). */
export default function CompanySettings() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    default_tax_rate: "",
    default_payment_terms: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const rows = await api.entities.CompanyProfile.list("-created_date", 5);
    const existing = rows[0] || null;
    setProfile(existing);
    if (existing) {
      setForm({
        name: existing.name || "",
        address: existing.address || "",
        phone: existing.phone || "",
        email: existing.email || "",
        website: existing.website || "",
        default_tax_rate: existing.default_tax_rate ?? "",
        default_payment_terms: existing.default_payment_terms || "",
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const payload = {
        name: form.name,
        address: form.address,
        phone: form.phone,
        email: form.email,
        website: form.website,
        default_payment_terms: form.default_payment_terms,
        default_tax_rate: form.default_tax_rate === "" ? undefined : Number(form.default_tax_rate),
      };
      if (profile) await api.entities.CompanyProfile.update(profile.id, payload);
      else {
        const created = await api.entities.CompanyProfile.create(payload);
        setProfile(created);
      }
      setSaved(true);
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Company profile</h1>
      <p className="text-sm text-slate-500 mb-6">
        Used on estimates, work orders, change orders, and invoices. One profile per account.
      </p>
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div>
          <Label>Company name</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your company" />
        </div>
        <div>
          <Label>Address</Label>
          <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Website</Label>
          <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Default tax %</Label>
            <Input type="number" value={form.default_tax_rate} onChange={(e) => set("default_tax_rate", e.target.value)} placeholder="e.g. 10" />
          </div>
          <div>
            <Label>Default payment terms</Label>
            <Input value={form.default_payment_terms} onChange={(e) => set("default_payment_terms", e.target.value)} placeholder="Due upon receipt" />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? "Saving…" : "Save profile"}
          </Button>
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
        </div>
      </div>
    </div>
  );
}
