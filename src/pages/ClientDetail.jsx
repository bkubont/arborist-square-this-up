import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { ArrowLeft, Phone, Mail, Plus, Pencil, StickyNote, ChevronRight, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import ClientFormDialog from "@/components/ClientFormDialog";
import JobFormDialog from "@/components/JobFormDialog";
import PropertyFormDialog from "@/components/PropertyFormDialog";
import ClientAddress from "@/components/ClientAddress";
import StatusSelect from "@/components/StatusSelect";
import { money, shortDate } from "@/lib/format";
import { depositsByJobId, invoicesByJobId, jobBalance, paymentsByJobId } from "@/lib/jobFilters";
import { CLIENT_LEAD_STATUSES, contactLeadStatus, isArchivedClient } from "@/lib/jobStatus";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

function roleLabel(role) {
  return String(role || "other").replace(/_/g, " ");
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [properties, setProperties] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editClient, setEditClient] = useState(false);
  const [jobDialog, setJobDialog] = useState(false);
  const [leadDialog, setLeadDialog] = useState(false);
  const [propertyDialog, setPropertyDialog] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const load = async () => {
    try {
      const [c, allJobs, tl, inv, props] = await Promise.all([
        api.entities.Client.get(id),
        api.entities.Job.list("-created_date", 200),
        api.entities.TimelineEntry.list("-created_date", 1000),
        api.entities.Invoice.list("-updated_date", 500),
        api.entities.Property.filter({ client_id: id }, "-created_date", 100),
      ]);
      setClient(c);
      setJobs(allJobs.filter((j) => j.client_id === id));
      setTimeline(tl);
      setInvoices(inv);
      setProperties(props);
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
    setLeadDialog(false);
    load();
  };

  const saveProperty = async (form) => {
    if (editingProperty?.id) {
      await api.entities.Property.update(editingProperty.id, { ...form, client_id: id });
    } else {
      await api.entities.Property.create({ ...form, client_id: id });
    }
    setPropertyDialog(false);
    setEditingProperty(null);
    load();
  };

  const removeProperty = async (property) => {
    if (!window.confirm(`Delete property “${property.name}”? Jobs will keep their history without this property link.`)) return;
    await api.entities.Property.delete(property.id);
    load();
  };

  const pipelineStatus = contactLeadStatus(client);
  const archived = isArchivedClient(client);
  const contacts = Array.isArray(client?.contacts) ? client.contacts : [];

  const changePipelineStatus = async (status) => {
    if (!client || status === pipelineStatus || savingStatus) return;
    const snapshot = client;
    setSavingStatus(true);
    setClient({ ...client, status });
    try {
      await api.entities.Client.update(id, { status });
      await load();
    } catch {
      setClient(snapshot);
    } finally {
      setSavingStatus(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;
  if (!client) return <div className="p-8 text-slate-400">Client not found.</div>;

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <button onClick={() => navigate("/clients")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> Clients
      </button>

      <div className={cn("bg-white rounded-xl border border-slate-200 p-5 mb-6", statusCardClass(pipelineStatus))}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
            {archived && (
              <p className="text-sm text-slate-500 mt-1">
                Archived{client.archived_at ? ` ${shortDate(client.archived_at)}` : ""}
              </p>
            )}
          </div>
          <div className="flex items-end gap-2 w-full sm:w-auto">
            <div className="flex-1 sm:w-64 sm:flex-none">
              <label htmlFor="client-lead-status" className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                Lead status
              </label>
              <StatusSelect
                id="client-lead-status"
                ariaLabel="Lead status"
                value={pipelineStatus}
                onValueChange={changePipelineStatus}
                statuses={CLIENT_LEAD_STATUSES}
                disabled={savingStatus}
                triggerClassName="w-full"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditClient(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-sm text-slate-600">
          <ClientAddress client={client} />
          {client.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /> {client.phone}</div>}
          {client.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" /> {client.email}</div>}
          {client.preferred_contact_method && (
            <div className="text-xs text-slate-500 capitalize">
              Prefer {client.preferred_contact_method === "any" ? "any method" : client.preferred_contact_method}
            </div>
          )}
          {client.referral_source && (
            <div className="text-xs text-slate-500">Referral: {client.referral_source}</div>
          )}
          {client.notes && <div className="flex items-start gap-2 mt-2 pt-2 border-t border-slate-100"><StickyNote className="w-4 h-4 text-slate-400 mt-0.5" /> <span>{client.notes}</span></div>}
          {contacts.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Contacts</div>
              {contacts.map((c) => (
                <div key={c.id || `${c.role}-${c.name}`} className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                  <span className="font-medium text-slate-800 capitalize">{roleLabel(c.role)}</span>
                  <span>{c.name}</span>
                  {c.phone && <span className="text-slate-500">{c.phone}</span>}
                  {c.email && <span className="text-slate-500">{c.email}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-slate-900">Properties</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setEditingProperty(null); setPropertyDialog(true); }}
          data-testid="add-property"
        >
          <Plus className="w-4 h-4 mr-1" /> Add property
        </Button>
      </div>

      {properties.length === 0 ? (
        <div className="text-center py-8 text-slate-400 bg-white rounded-xl border border-slate-200 mb-6">
          <p>No saved properties yet. Add sites so access and hazard notes reuse across jobs.</p>
        </div>
      ) : (
        <div className="space-y-2 mb-6" data-testid="property-list">
          {properties.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                    {p.name}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    <ClientAddress client={p} />
                  </div>
                  {(p.access_notes || p.hazard_notes || p.parking_notes || p.pets_notes) && (
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                      {[p.access_notes, p.hazard_notes, p.parking_notes, p.pets_notes].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setEditingProperty(p); setPropertyDialog(true); }}
                    aria-label={`Edit ${p.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeProperty(p)}
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-slate-900">Jobs</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLeadDialog(true)}
            data-testid="new-lead"
          >
            <Plus className="w-4 h-4 mr-1" /> New lead
          </Button>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setJobDialog(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Job
          </Button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200">
          <p>No jobs for this client yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => {
            const balance = jobBalance(j, paymentsMap[j.id] || 0, depositsMap[j.id] || 0, invoiceMap[j.id]);
            const prop = properties.find((p) => p.id === j.property_id);
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
                  <div className="font-semibold text-slate-900 truncate">{j.title || "Untitled job"}</div>
                  {prop && <div className="text-xs text-slate-500 truncate">{prop.name}</div>}
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
      <JobFormDialog
        open={jobDialog}
        onOpenChange={setJobDialog}
        onSave={saveJob}
        clients={[client]}
        defaultClientId={id}
        properties={properties}
      />
      <JobFormDialog
        open={leadDialog}
        onOpenChange={setLeadDialog}
        onSave={saveJob}
        clients={[client]}
        defaultClientId={id}
        properties={properties}
        leadIntake
      />
      <PropertyFormDialog
        open={propertyDialog}
        onOpenChange={(open) => {
          setPropertyDialog(open);
          if (!open) setEditingProperty(null);
        }}
        onSave={saveProperty}
        property={editingProperty}
      />
    </div>
  );
}
