import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { ArrowLeft, Phone, Mail, Plus, Pencil, StickyNote, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import ClientFormDialog from "@/components/ClientFormDialog";
import JobFormDialog from "@/components/JobFormDialog";
import ClientAddress from "@/components/ClientAddress";
import { money } from "@/lib/format";
import { depositsByJobId, invoicesByJobId, jobBalance, paymentsByJobId } from "@/lib/jobFilters";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editClient, setEditClient] = useState(false);
  const [jobDialog, setJobDialog] = useState(false);

  const load = async () => {
    try {
      const [c, allJobs, tl, inv] = await Promise.all([
        api.entities.Client.get(id),
        api.entities.Job.list("-created_date", 200),
        api.entities.TimelineEntry.list("-created_date", 1000),
        api.entities.Invoice.list("-updated_date", 500),
      ]);
      setClient(c);
      setJobs(allJobs.filter((j) => j.client_id === id));
      setTimeline(tl);
      setInvoices(inv);
    } finally {
      setLoading(false);
    }
  };

  const paymentsMap = useMemo(() => paymentsByJobId(timeline), [timeline]);
  const depositsMap = useMemo(() => depositsByJobId(timeline), [timeline]);
  const invoiceMap = useMemo(() => invoicesByJobId(invoices), [invoices]);

  useEffect(() => {
    load();
  }, [id]);

  const saveClient = async (form) => {
    await api.entities.Client.update(id, form);
    setEditClient(false);
    load();
  };

  const saveJob = async (form) => {
    const payload = { ...form, client_id: id, client_name: client?.name };
    await api.entities.Job.create(payload);
    setJobDialog(false);
    load();
  };

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;
  if (!client) return <div className="p-8 text-slate-400">Client not found.</div>;

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <button onClick={() => navigate("/clients")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> Clients
      </button>

      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
          <Button variant="outline" size="sm" onClick={() => setEditClient(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
        </div>
        <div className="mt-3 space-y-1.5 text-sm text-slate-600">
          <ClientAddress client={client} />
          {client.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /> {client.phone}</div>}
          {client.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" /> {client.email}</div>}
          {client.notes && <div className="flex items-start gap-2 mt-2 pt-2 border-t border-slate-100"><StickyNote className="w-4 h-4 text-slate-400 mt-0.5" /> <span>{client.notes}</span></div>}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-slate-900">Jobs</h2>
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setJobDialog(true)}>
          <Plus className="w-4 h-4 mr-1" /> New Job
        </Button>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200">
          <p>No jobs for this client yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => {
            const balance = jobBalance(j, paymentsMap[j.id] || 0, depositsMap[j.id] || 0, invoiceMap[j.id]);
            return (
              <Link
                key={j.id}
                to={`/jobs/${j.id}`}
                className={cn(
                  "flex items-center gap-3 bg-card rounded-xl border p-4 hover:shadow-sm transition-colors",
                  statusCardClass(j.status)
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{j.title}</div>
                  {balance > 0 && <span className="text-xs text-attention font-semibold">{money(balance)} due</span>}
                </div>
                <StatusBadge status={j.status} />
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </Link>
            );
          })}
        </div>
      )}

      <ClientFormDialog open={editClient} onOpenChange={setEditClient} onSave={saveClient} client={client} />
      <JobFormDialog open={jobDialog} onOpenChange={setJobDialog} onSave={saveJob} clients={[client]} defaultClientId={id} />
    </div>
  );
}