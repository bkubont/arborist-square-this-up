import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/PageHeader";
import { DEFAULT_SALES_TAX_RATE } from "@/lib/salesTax";

/** Account-level company identity for customer-facing forms (Phase 0). */
export default function CompanySettings() {
  const { logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    default_tax_rate: String(DEFAULT_SALES_TAX_RATE),
    default_payment_terms: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

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
        default_tax_rate: existing.default_tax_rate ?? String(DEFAULT_SALES_TAX_RATE),
        default_payment_terms: existing.default_payment_terms || "",
      });
    } else {
      setForm((f) => ({ ...f, default_tax_rate: String(DEFAULT_SALES_TAX_RATE) }));
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
        default_tax_rate: form.default_tax_rate === "" ? DEFAULT_SALES_TAX_RATE : Number(form.default_tax_rate),
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

  const deleteAccount = async () => {
    setDeleteError("");
    if (!deletePassword) {
      setDeleteError("Enter your password to confirm.");
      return;
    }
    if (
      !window.confirm(
        "Permanently delete this account and all jobs, customers, and photos? This cannot be undone."
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await api.auth.deleteAccount(deletePassword);
      // Session already revoked; logout clears client cache and sends the user to login.
      try {
        await logout();
      } catch {
        window.location.assign("/login");
      }
    } catch (err) {
      setDeleteError(err.message || "Could not delete account");
      setDeleting(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <PageHeader
        title="Settings"
        description="Company profile for estimates, work orders, change orders, and invoices"
        primaryAction={
          <div className="flex items-center gap-3">
            {saved && <span className="text-sm text-emerald-600">Saved</span>}
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        }
      />
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
            <Label>Sales tax %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.default_tax_rate}
              onChange={(e) => set("default_tax_rate", e.target.value)}
              placeholder={String(DEFAULT_SALES_TAX_RATE)}
            />
            <p className="text-xs text-slate-500 mt-1">Autofills new estimates, invoices, work orders, and change orders.</p>
          </div>
          <div>
            <Label>Default payment terms</Label>
            <Input value={form.default_payment_terms} onChange={(e) => set("default_payment_terms", e.target.value)} placeholder="Due upon receipt" />
          </div>
        </div>
      </div>

      <div className="mt-8 bg-white rounded-xl border border-destructive/30 p-5 space-y-3">
        <h2 className="text-base font-semibold text-destructive">Delete account</h2>
        <p className="text-sm text-slate-600">
          Permanently removes this login and all owned jobs, customers, documents, and photos. Invitation-only
          registration is unchanged — a new invite is required to create another account.
        </p>
        <div>
          <Label htmlFor="delete-password">Confirm with password</Label>
          <Input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            placeholder="Your password"
          />
        </div>
        {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
        <Button
          type="button"
          variant="destructive"
          disabled={deleting || !deletePassword}
          onClick={deleteAccount}
        >
          {deleting ? "Deleting…" : "Delete account forever"}
        </Button>
      </div>
    </div>
  );
}
