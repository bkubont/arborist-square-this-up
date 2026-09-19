import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import BusinessProfileFields from "@/components/BusinessProfileFields";
import { Button } from "@/components/ui/button";
import { emptyProfile, profileIsComplete, profilePayload } from "@/lib/profile";

export default function Settings() {
  const { user, setUser } = useAuth();
  const [params] = useSearchParams();
  const setup = params.get("setup") === "1" || !profileIsComplete(user?.profile);
  const [form, setForm] = useState(() => ({ ...emptyProfile(), ...user?.profile, labor_rate: user?.profile?.labor_rate ?? "", email: user?.profile?.email || user?.email || "" }));
  const [logoFile, setLogoFile] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({ ...emptyProfile(), ...user?.profile, labor_rate: user?.profile?.labor_rate ?? "", email: user?.profile?.email || user?.email || "" });
  }, [user]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError(""); setSaved(false);
    try {
      let logo_url = form.logo_url;
      if (logoFile) logo_url = (await api.uploadFile({ file: logoFile })).file_url;
      const updated = await api.auth.updateProfile(profilePayload({ ...form, logo_url }));
      setUser(updated);
      setLogoFile(null);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="p-4 lg:p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900">{setup ? "Complete your profile" : "Business profile"}</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        {setup ? "Add the details that appear on estimates, work orders, and invoices." : "These details fill in automatically on new documents."}
      </p>
      <form className="bg-white rounded-xl border border-slate-200 p-5 space-y-4" onSubmit={submit}>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-emerald-600">Profile saved.</p>}
        <BusinessProfileFields form={form} setForm={setForm} logoFile={logoFile} onLogoFile={setLogoFile} disabled={busy} />
        <Button className="bg-slate-900 hover:bg-slate-800" disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
      </form>
    </div>
  );
}
