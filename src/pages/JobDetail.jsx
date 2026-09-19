import ClientAddress from "@/components/ClientAddress";
import React, { useEffect, useState, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { ArrowLeft, Pencil, StickyNote, Send, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusSelect from "@/components/StatusSelect";
import TimelineFeed from "@/components/TimelineFeed";
import PhotoGallery from "@/components/PhotoGallery";
import VoiceRecorder from "@/components/VoiceRecorder";
import Checklist from "@/components/Checklist";
import FinancialPanel from "@/components/FinancialPanel";
import JobFormDialog from "@/components/JobFormDialog";
import JobDocuments from "@/components/JobDocuments";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

const DOC_ENTITIES = ["Estimate", "WorkOrder", "ChangeOrder", "Invoice"];

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [client, setClient] = useState(null);
  const [entries, setEntries] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [editJob, setEditJob] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const [j, e, ...docLists] = await Promise.all([
      api.entities.Job.get(id),
      api.entities.TimelineEntry.filter({ job_id: id }, "-created_date", 200),
      ...DOC_ENTITIES.map((entity) => api.entities[entity].filter({ job_id: id }, "-created_date", 100)),
    ]);
    setJob(j);
    setEntries(e);
    setDocuments(docLists.flatMap((list, i) => list.map((doc) => ({ ...doc, entity: DOC_ENTITIES[i] }))));
    if (j?.client_id) {
      try {
        setClient(await api.entities.Client.get(j.client_id));
      } catch {
        setClient(null);
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const addNote = async () => {
    if (!note.trim()) return;
    await api.entities.TimelineEntry.create({
      job_id: id,
      type: "note",
      text: note.trim(),
      category: "note",
    });
    setNote("");
    load();
  };

  const updateJob = async (patch) => {
    await api.entities.Job.update(id, patch);
    load();
  };

  const changeStatus = async (status) => {
    await api.entities.Job.update(id, { status });
    await api.entities.TimelineEntry.create({
      job_id: id,
      type: "status_change",
      text: `Status changed to ${status}`,
      category: "note",
    });
    load();
  };

  const logPayment = async (amount) => {
    await api.entities.TimelineEntry.create({
      job_id: id,
      type: "payment_received",
      text: "Payment received",
      category: "financial",
      amount,
    });
    load();
  };

  const quickAction = async (type, text) => {
    await api.entities.TimelineEntry.create({ job_id: id, type, text, category: type.includes("estimate") || type.includes("invoice") || type.includes("deposit") ? "financial" : "note" });
    load();
  };

  const saveChecklist = async (checklist) => {
    await api.entities.Job.update(id, { checklist });
    setJob((j) => ({ ...j, checklist }));
  };

  const deleteJob = async () => {
    if (!confirm("Delete this job and all its timeline entries?")) return;
    await api.entities.Job.delete(id);
    navigate("/clients");
  };

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;
  if (!job) return <div className="p-8 text-slate-400">Job not found.</div>;

  const filtered = filter === "all" ? entries : entries.filter((e) => e.category === filter);

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditJob(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={deleteJob}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className={cn("bg-card rounded-xl border p-5 mb-4", statusCardClass(job.status))}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground">{job.title}</h1>
            {client && (
              <div className="mt-1 space-y-1">
                <Link to={`/clients/${client.id}`} className="text-sm text-muted-foreground hover:text-primary">{client.name}</Link>
                <ClientAddress client={client} />
              </div>
            )}
          </div>
          <StatusSelect value={job.status} onValueChange={changeStatus} triggerClassName="w-52" />
        </div>
        {job.description && <p className="text-sm text-muted-foreground mt-3">{job.description}</p>}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: timeline */}
        <div className="lg:col-span-2 space-y-4">
          {/* Quick actions */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick Actions</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <QuickBtn label="Estimate Sent" icon={Send} onClick={() => quickAction("estimate_sent", "Estimate sent to client")} tint="bg-brand-muted text-brand-muted-foreground border-brand" />
              <QuickBtn label="Deposit" icon={CheckCircle2} onClick={() => quickAction("deposit_received", "Deposit received")} tint="bg-emerald-50 text-emerald-700 border-emerald-200" />
              <QuickBtn label="Invoice Sent" icon={Send} onClick={() => quickAction("invoice_sent", "Invoice sent to client")} tint="bg-brand-muted text-brand-muted-foreground border-brand" />
              <QuickBtn label="Mark Paid" icon={CheckCircle2} onClick={() => changeStatus("Paid")} tint="bg-secondary text-secondary-foreground border-border" />
            </div>
          </div>

          <JobDocuments jobId={id} jobTitle={job.title} client={client} documents={documents} onChanged={load} />

          {/* Photos */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Photos</div>
            <PhotoGallery jobId={id} entries={entries} onUploaded={load} onChanged={load} />
          </div>

          {/* Quick note */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick Note</div>
            <div className="flex gap-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Quick note… (e.g. Customer deciding on mirror)"
                rows={2}
                className="text-sm"
              />
              <Button className="self-stretch" onClick={addNote}>
                <StickyNote className="w-4 h-4" />
              </Button>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <VoiceRecorder jobId={id} onTranscribed={load} />
            </div>
          </div>

          {/* Checklist */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Checklist</div>
            <Checklist items={job.checklist || []} onChange={saveChecklist} />
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Timeline</div>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="before">Before</SelectItem>
                  <SelectItem value="after">After</SelectItem>
                  <SelectItem value="receipt">Receipts</SelectItem>
                  <SelectItem value="document">Documents</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="note">Notes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <TimelineFeed entries={filtered} />
          </div>
        </div>

        {/* Right: financials */}
        <div className="space-y-4">
          <div>
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Financials</div>
            <FinancialPanel
              job={job}
              documents={documents}
              timeline={entries}
              onUpdate={updateJob}
              onLogPayment={logPayment}
            />
          </div>
          {job.notes && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Notes</div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}
        </div>
      </div>

      <JobFormDialog open={editJob} onOpenChange={setEditJob} onSave={async (form) => { await updateJob(form); setEditJob(false); }} job={job} clients={client ? [client] : []} />
    </div>
  );
}

function QuickBtn({ label, icon: Icon, onClick, tint }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border py-3 px-2 text-xs font-semibold transition-colors hover:opacity-80 ${tint}`}
    >
      <Icon className="w-5 h-5" />
      {label}
    </button>
  );
}
