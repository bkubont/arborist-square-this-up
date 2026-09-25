import { addressLines } from "@/lib/address";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Plus, Phone, Mail, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import ClientFormDialog from "@/components/ClientFormDialog";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { shortDate } from "@/lib/format";
import { isArchivedClient } from "@/lib/jobStatus";

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = async () => {
    const [c, j] = await Promise.all([
      api.entities.Client.list("-created_date", 200),
      api.entities.Job.list("-created_date", 200),
    ]);
    setClients(c);
    setJobs(j);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const jobCount = (clientId) => jobs.filter((j) => j.client_id === clientId).length;
  const activeClients = clients.filter((c) => !isArchivedClient(c));
  const archivedClients = clients.filter((c) => isArchivedClient(c));
  const shown = showArchived ? archivedClients : activeClients;

  const save = async (form) => {
    if (editing) {
      await api.entities.Client.update(editing.id, form);
    } else {
      await api.entities.Client.create(form);
    }
    setDialog(false);
    setEditing(null);
    load();
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        title="Customers"
        description={loading ? undefined : `${shown.length} ${showArchived ? "archived" : "active"}`}
        secondary={
          !loading && (archivedClients.length > 0 || showArchived) ? (
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline px-2"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Active" : `Archived (${archivedClients.length})`}
            </button>
          ) : null
        }
        primaryAction={
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              setEditing(null);
              setDialog(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" /> New Customer
          </Button>
        }
      />

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>{showArchived ? "No archived customers." : clients.length === 0 ? "No clients yet. Add your first one." : "No active customers."}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {shown.map((c) => (
            <Link
              key={c.id}
              to={`/clients/${c.id}`}
              className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-600 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="font-semibold text-slate-900">{c.name}</div>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  {jobCount(c.id)} jobs
                </span>
              </div>
              {(c.status || c.archived_at) && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {c.status && <StatusBadge status={c.status} />}
                  {c.archived_at && (
                    <span className="text-xs text-slate-500">Archived {shortDate(c.archived_at)}</span>
                  )}
                </div>
              )}
              <div className="mt-2 space-y-1 text-sm text-slate-500">
                {addressLines(c).length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="break-words">{addressLines(c).join(", ")}</span>
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> {c.phone}
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> {c.email}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <ClientFormDialog open={dialog} onOpenChange={setDialog} onSave={save} client={editing} />
    </div>
  );
}