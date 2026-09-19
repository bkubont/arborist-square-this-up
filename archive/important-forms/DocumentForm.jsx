import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Printer, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addressLines } from "@/lib/address";
import { blankLine, documentMeta, documentSubtotal, documentTotal, lineAmount, longDate, nextDocumentNumber, toDocumentPayload, todayIso } from "@/lib/documents";
import { businessLines } from "@/lib/profile";
import { money } from "@/lib/format";

const emptyForm = (type) => ({
  type: type || "estimate",
  job_id: "",
  title: "",
  number: "",
  date: todayIso(),
  due_date: "",
  line_items: [blankLine()],
  discount_label: "",
  discount_amount: "",
  notes: "",
});

export default function DocumentForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState(() => emptyForm(params.get("type")));
  const [jobs, setJobs] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const meta = documentMeta(form.type);
  const profile = user?.profile;
  const job = jobs.find((item) => item.id === form.job_id);
  const client = clients.find((item) => item.id === (job?.client_id || params.get("client_id")));
  const subtotal = documentSubtotal(form.line_items);
  const total = documentTotal(form);

  useEffect(() => {
    Promise.all([
      api.entities.Job.list("-created_date", 200),
      api.entities.Client.list("-created_date", 200),
      api.entities.Document.list("-created_date", 500),
      id ? api.entities.Document.get(id) : Promise.resolve(null),
    ]).then(([jobRows, clientRows, documents, existing]) => {
      setJobs(jobRows);
      setClients(clientRows);
      if (existing) {
        setForm({
          ...emptyForm(existing.type),
          ...existing,
          line_items: existing.line_items?.length ? existing.line_items.map((item) => ({ ...blankLine(), ...item, quantity: item.quantity ?? "", price: item.price ?? "" })) : [blankLine()],
          discount_label: existing.discount_label || "",
          discount_amount: existing.discount_amount ?? "",
          due_date: existing.due_date || "",
          notes: existing.notes || "",
        });
      } else {
        const type = params.get("type") || "estimate";
        const clientId = params.get("client_id");
        const requestedJob = params.get("job_id") || jobRows.find((item) => !clientId || item.client_id === clientId)?.id || "";
        const selected = jobRows.find((item) => item.id === requestedJob);
        setForm({
          ...emptyForm(type),
          job_id: requestedJob,
          title: selected?.title || "",
          number: nextDocumentNumber(documents),
          due_date: type === "invoice" ? todayIso() : "",
        });
      }
    }).finally(() => setLoading(false));
  }, [id, params]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setLine = (lineId, patch) => setForm((current) => ({ ...current, line_items: current.line_items.map((item) => item.id === lineId ? { ...item, ...patch } : item) }));
  const chooseJob = (jobId) => {
    const selected = jobs.find((item) => item.id === jobId);
    setForm((current) => ({ ...current, job_id: jobId, title: current.title && current.title !== job?.title ? current.title : selected?.title || "" }));
  };

  const save = async () => {
    if (!form.job_id || !form.title.trim()) return setError("Choose a job and add a title.");
    setBusy(true); setError("");
    try {
      const payload = toDocumentPayload(form);
      const saved = id ? await api.entities.Document.update(id, payload) : await api.entities.Document.create(payload);
      const rollup = documentTotal(saved);
      if (saved.type === "estimate") await api.entities.Job.update(saved.job_id, { estimate_amount: rollup });
      if (saved.type === "invoice") await api.entities.Job.update(saved.job_id, { invoice_amount: rollup });
      if (!id) navigate(`/documents/${saved.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  const clientAddress = useMemo(() => (client ? addressLines(client) : []), [client]);
  const fromLines = useMemo(() => businessLines(profile), [profile]);
  const visibleJobs = jobs.filter((item) => !params.get("client_id") || item.client_id === params.get("client_id") || item.id === form.job_id);

  if (loading) return <div className="p-8 text-slate-400">Loading document...</div>;

  return (
    <div className="invoice-page min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="invoice-toolbar mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden px-4">
        <Link to={form.job_id ? `/jobs/${form.job_id}` : "/estimates"} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Back</Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print / Save PDF</Button>
          <Button className="bg-slate-900 hover:bg-slate-800" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
      {error && <p role="alert" className="mx-auto mb-4 max-w-4xl px-4 text-sm text-red-600 print:hidden">{error}</p>}
      <div className="invoice-toolbar mx-auto mb-4 grid max-w-4xl gap-3 px-4 sm:grid-cols-2 print:hidden">
        <Select value={form.type} onValueChange={(value) => set("type", value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["estimate", "work_order", "change_order", "material_order", "invoice"].map((type) => (
              <SelectItem key={type} value={type}>{documentMeta(type).label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={form.job_id} onValueChange={chooseJob}>
          <SelectTrigger><SelectValue placeholder="Select a job" /></SelectTrigger>
          <SelectContent>
            {visibleJobs.map((item) => <SelectItem key={item.id} value={item.id}>{item.title} - {item.client_name || "No client"}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <main className="invoice-paper mx-auto max-w-4xl bg-white px-8 py-10 shadow-sm print:max-w-none print:px-10 print:py-8 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b border-slate-200 pb-8">
          <div className="min-w-0">
            {profile?.logo_url && <img src={profile.logo_url} alt="" className="mb-4 h-16 w-auto max-w-[10rem] object-contain" />}
            <h1 className="text-4xl font-light tracking-wide text-slate-900">{meta.heading}</h1>
            <Input className="mt-2 h-auto border-0 px-0 text-sm text-slate-500 shadow-none focus-visible:ring-0" value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Job or property name" />
            <div className="mt-3 space-y-0.5 text-sm text-slate-600">
              {fromLines.map((line) => <div key={line}>{line}</div>)}
            </div>
          </div>
          <div className="w-56 shrink-0 text-right text-sm text-slate-600">
            <div className="font-semibold text-slate-900">{meta.label} Number: {form.number}</div>
            <label className="mt-2 block print:hidden">Date
              <Input type="date" className="mt-1 h-8 text-right" value={form.date} onChange={(event) => set("date", event.target.value)} />
            </label>
            <div className="mt-2 hidden print:block">Date: {longDate(form.date)}</div>
            {(form.type === "invoice" || form.due_date) && <>
              <label className="mt-2 block print:hidden">Payment Due
                <Input type="date" className="mt-1 h-8 text-right" value={form.due_date} onChange={(event) => set("due_date", event.target.value)} />
              </label>
              {form.due_date && <div className="mt-2 hidden print:block">Payment Due: {longDate(form.due_date)}</div>}
            </>}
            <div className="mt-3 font-semibold text-slate-900">{meta.totalLabel}: {money(total)}</div>
          </div>
        </header>
        <section className="grid gap-8 border-b border-slate-200 py-7 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Bill To</div>
            <div className="font-semibold text-slate-900">{client?.name || job?.client_name || "Select a job"}</div>
            {clientAddress.map((line) => <div key={line} className="text-sm text-slate-600">{line}</div>)}
            {client?.phone && <div className="mt-3 text-sm text-slate-600">{client.phone}</div>}
            {client?.email && <div className="text-sm text-slate-600">{client.email}</div>}
          </div>
          <div className="sm:text-right">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Job</div>
            <div className="text-sm text-slate-600">{job?.title || form.title}</div>
            {job?.description && <div className="mt-2 whitespace-pre-wrap text-sm text-slate-500">{job.description}</div>}
          </div>
        </section>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-900 text-left">
              <th className="w-10 py-4 pr-2 font-semibold">#</th>
              <th className="py-4 pr-4 font-semibold">Materials / Services</th>
              <th className="w-20 py-4 text-right font-semibold">Qty</th>
              <th className="w-28 py-4 text-right font-semibold">Price</th>
              <th className="w-32 py-4 text-right font-semibold">Amount</th>
              <th className="w-8 print:hidden" />
            </tr>
          </thead>
          <tbody>
            {form.line_items.map((item, index) => (
              <tr key={item.id} className="border-b border-slate-100 align-top">
                <td className="py-3 pr-2 text-slate-500">{index + 1}</td>
                <td className="py-3 pr-4">
                  <Input className="h-8 border-0 px-0 font-semibold shadow-none focus-visible:ring-0" value={item.name} onChange={(event) => setLine(item.id, { name: event.target.value })} placeholder="Line item" />
                  <Textarea className="mt-1 min-h-[2.5rem] border-0 px-0 text-slate-600 shadow-none focus-visible:ring-0" rows={2} value={item.description} onChange={(event) => setLine(item.id, { description: event.target.value })} placeholder="Description" />
                </td>
                <td className="py-3"><Input className="h-8 text-right" type="number" min="0" step="any" value={item.quantity} onChange={(event) => setLine(item.id, { quantity: event.target.value })} /></td>
                <td className="py-3"><Input className="h-8 text-right" type="number" min="0" step="0.01" value={item.price} onChange={(event) => setLine(item.id, { price: event.target.value })} placeholder={profile?.labor_rate ? String(profile.labor_rate) : "0"} /></td>
                <td className="py-3 text-right font-medium text-slate-900">{money(lineAmount(item))}</td>
                <td className="py-3 print:hidden">
                  {form.line_items.length > 1 && <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => set("line_items", form.line_items.filter((row) => row.id !== item.id))}><Trash2 className="h-4 w-4" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 print:hidden">
          <Button variant="outline" size="sm" onClick={() => set("line_items", [...form.line_items, blankLine()])}><Plus className="mr-1 h-4 w-4" /> Add line</Button>
        </div>
        <section className="ml-auto mt-8 max-w-sm space-y-3 border-t border-slate-200 pt-5 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="flex items-center justify-between gap-3 print:hidden">
            <Input className="h-8" value={form.discount_label} onChange={(event) => set("discount_label", event.target.value)} placeholder="Discount label" />
            <Input className="h-8 w-28 text-right" type="number" min="0" step="0.01" value={form.discount_amount} onChange={(event) => set("discount_amount", event.target.value)} placeholder="0" />
          </div>
          {Number(form.discount_amount || 0) > 0 && <div className="hidden justify-between print:flex"><span className="text-slate-600">{form.discount_label || "Discount"}</span><span>-{money(form.discount_amount)}</span></div>}
          <div className="flex justify-between border-t border-slate-900 pt-3 text-base font-bold"><span>{meta.totalLabel}</span><span>{money(total)}</span></div>
        </section>
        <Textarea className="mt-10 print:hidden" rows={3} value={form.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Notes" />
        {form.notes && <footer className="mt-10 hidden whitespace-pre-wrap border-t border-slate-200 pt-5 text-sm text-slate-600 print:block">{form.notes}</footer>}
        <footer className="mt-16 border-t border-slate-200 pt-5 text-xs text-slate-400">Thank you for your business.</footer>
      </main>
    </div>
  );
}
