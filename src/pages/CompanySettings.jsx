import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { userCan } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/PageHeader";
import { DEFAULT_SALES_TAX_RATE } from "@/lib/salesTax";
import { assignAppPath } from "@/lib/desktopSession";
import { SUPPORT_EMAIL, PRODUCT_EDITION } from "@/lib/brand";
import { DEFAULT_ARBORIST_SERVICE_PRESETS } from "../../shared/arboristServicePresets.js";
import { defaultReviewGateRules } from "../../shared/completionChecklist.js";

/** Account-level company identity for customer-facing forms (Phase 0). */
export default function CompanySettings() {
  const { logout, user } = useAuth();
  const isOwner = userCan(user, "delete_account");
  const canExport = userCan(user, "export_backup");
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
  const [reviewGate, setReviewGate] = useState(() => {
    const d = defaultReviewGateRules();
    return {
      enabled: d.enabled,
      min_price: String(d.min_price),
      job_types: d.job_types.join(", "),
      require_on_problem: d.require_on_problem,
    };
  });
  const [presets, setPresets] = useState(DEFAULT_ARBORIST_SERVICE_PRESETS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
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
      setPresets(
        Array.isArray(existing.service_presets) && existing.service_presets.length
          ? existing.service_presets
          : DEFAULT_ARBORIST_SERVICE_PRESETS.map((p) => ({ ...p })),
      );
      const gate = existing.review_gate || defaultReviewGateRules();
      setReviewGate({
        enabled: gate.enabled !== false,
        min_price: String(gate.min_price ?? 5000),
        job_types: Array.isArray(gate.job_types) ? gate.job_types.join(", ") : "commercial, municipal, storm",
        require_on_problem: gate.require_on_problem !== false,
      });
    } else {
      setForm((f) => ({ ...f, default_tax_rate: String(DEFAULT_SALES_TAX_RATE) }));
      setPresets(DEFAULT_ARBORIST_SERVICE_PRESETS.map((p) => ({ ...p })));
      const d = defaultReviewGateRules();
      setReviewGate({
        enabled: d.enabled,
        min_price: String(d.min_price),
        job_types: d.job_types.join(", "),
        require_on_problem: d.require_on_problem,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const setPreset = (index, patch) => {
    setPresets((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

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
        review_gate: {
          enabled: Boolean(reviewGate.enabled),
          min_price: Number(reviewGate.min_price) || 0,
          job_types: String(reviewGate.job_types || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          require_on_problem: Boolean(reviewGate.require_on_problem),
        },
        service_presets: presets.map((p) => {
          const numOrUndef = (v) => {
            if (v === "" || v == null) return undefined;
            const n = Number(v);
            return Number.isFinite(n) ? n : undefined;
          };
          return {
            id: p.id,
            name: p.name,
            description: p.description || "",
            category: p.category || "",
            labor_amount: numOrUndef(/** @type {unknown} */ (p.labor_amount)),
            material_amount: numOrUndef(/** @type {unknown} */ (p.material_amount)),
            equipment_amount: numOrUndef(/** @type {unknown} */ (p.equipment_amount)),
            labor_hours: numOrUndef(/** @type {unknown} */ (p.labor_hours)),
            labor_rate: numOrUndef(/** @type {unknown} */ (p.labor_rate)),
          };
        }),
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
        assignAppPath("/login");
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
        description={`Company profile and arborist rate-card presets (${PRODUCT_EDITION})`}
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
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your tree service" />
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
            <p className="text-xs text-slate-500 mt-1">Autofills new estimates, invoices, and change orders.</p>
          </div>
          <div>
            <Label>Default payment terms</Label>
            <Input value={form.default_payment_terms} onChange={(e) => set("default_payment_terms", e.target.value)} placeholder="Due upon receipt" />
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5 space-y-3" data-testid="service-presets">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Service estimate presets</h2>
          <p className="text-sm text-slate-600 mt-1">
            Rate-card templates for pruning, removal, stump grind, haul, crane, cabling, PHC, and storm call-outs. Edit rates; estimate editor can add these lines quickly.
          </p>
        </div>
        <div className="space-y-2">
          {presets.map((p, i) => (
            <div key={p.id || i} className="grid grid-cols-1 sm:grid-cols-[1fr_5rem_5rem_5rem] gap-2 items-center rounded-lg border border-slate-100 p-2">
              <div>
                <div className="text-sm font-medium text-slate-800">{p.name}</div>
                <div className="text-xs text-slate-500">{p.category}{p.description ? ` · ${p.description}` : ""}</div>
              </div>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="h-8 text-sm"
                value={p.labor_amount ?? ""}
                onChange={(e) => setPreset(i, { labor_amount: e.target.value })}
                aria-label={`${p.name} labor`}
                placeholder="Labor $"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                className="h-8 text-sm"
                value={p.material_amount ?? ""}
                onChange={(e) => setPreset(i, { material_amount: e.target.value })}
                aria-label={`${p.name} materials`}
                placeholder="Mats $"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                className="h-8 text-sm"
                value={p.equipment_amount ?? ""}
                onChange={(e) => setPreset(i, { equipment_amount: e.target.value })}
                aria-label={`${p.name} equipment`}
                placeholder="Equip $"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 bg-white rounded-xl border border-slate-200 p-5 space-y-2">
        <h2 className="text-base font-semibold text-slate-900">Legal &amp; support</h2>
        <p className="text-sm text-slate-600">
          Public pages for App Store / Play listing and account questions.
        </p>
        <ul className="text-sm space-y-1">
          <li>
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link to="/support" className="text-primary hover:underline">
              Support
            </Link>
          </li>
          <li>
            <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          </li>
        </ul>
      </div>

      <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5 space-y-3" data-testid="review-gate">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Completion review gate</h2>
          <p className="text-sm text-slate-600 mt-1">
            Routine jobs can invoice after a complete checklist. Large, typed, or problem jobs need office approval first.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(reviewGate.enabled)}
            onChange={(e) => setReviewGate((g) => ({ ...g, enabled: e.target.checked }))}
          />
          Enable review gate
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Min price requiring review ($)</Label>
            <Input
              type="number"
              min={0}
              step="1"
              value={reviewGate.min_price}
              onChange={(e) => setReviewGate((g) => ({ ...g, min_price: e.target.value }))}
            />
          </div>
          <div>
            <Label>Job types (comma-separated)</Label>
            <Input
              value={reviewGate.job_types}
              onChange={(e) => setReviewGate((g) => ({ ...g, job_types: e.target.value }))}
              placeholder="commercial, municipal, storm"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(reviewGate.require_on_problem)}
            onChange={(e) => setReviewGate((g) => ({ ...g, require_on_problem: e.target.checked }))}
          />
          Require review when a field problem is reported
        </label>
      </div>

      <div className="mt-8 bg-white rounded-xl border border-slate-200 p-5 space-y-2">
        <h2 className="text-base font-semibold text-slate-900">Team</h2>
        <p className="text-sm text-slate-600">
          Invite members and manage crews under{" "}
          <Link to="/team" className="text-primary hover:underline">Team</Link>.
        </p>
      </div>

      {canExport ? (
        <div className="mt-8 bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Export / backup</h2>
          <p className="text-sm text-slate-600">
            Download a JSON backup of this company&apos;s records and photos. Opens independently of the app.
          </p>
          {exportMsg ? <p className="text-sm text-emerald-700">{exportMsg}</p> : null}
          <Button
            type="button"
            variant="outline"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              setExportMsg("");
              try {
                const data = await api.exportBackup();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `arborist-backup-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                setExportMsg(`Exported ${data.records?.length || 0} records.`);
              } catch (err) {
                setExportMsg(err?.message || "Export failed");
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? "Exporting…" : "Download backup JSON"}
          </Button>
        </div>
      ) : null}

      <div className="mt-8 bg-white rounded-xl border border-destructive/30 p-5 space-y-3">
        <h2 className="text-base font-semibold text-destructive">
          {isOwner ? "Delete company account" : "Leave / delete login"}
        </h2>
        <p className="text-sm text-slate-600">
          {isOwner
            ? "Permanently removes this company, all members, jobs, customers, documents, and photos. Invitation-only registration is unchanged."
            : "Removes your login from this company. Company data stays with the owner."}
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
