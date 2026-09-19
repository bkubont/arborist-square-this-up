import React, { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import EstimateEditorDialog from "@/components/EstimateEditorDialog";
import WorkOrderEditorDialog from "@/components/WorkOrderEditorDialog";
import ChangeOrderEditorDialog from "@/components/ChangeOrderEditorDialog";
import InvoiceEditorDialog from "@/components/InvoiceEditorDialog";
import { DOCUMENT_TYPES, defaultDocumentNumber, documentTypeLabel } from "@/lib/documents";
import { money, shortDate } from "@/lib/format";

export default function JobDocuments({ jobId, jobTitle, client, documents, onChanged }) {
  const [openDoc, setOpenDoc] = useState(null);
  const [creating, setCreating] = useState(null);

  const openRevised = async (entity, created) => {
    await onChanged?.();
    setOpenDoc({ entity, document: { ...created, entity } });
  };

  const createDraft = async (entity) => {
    setCreating(entity);
    try {
      const existing = documents.filter((d) => d.entity === entity);
      const today = new Date().toISOString().slice(0, 10);
      const base = {
        job_id: jobId,
        number: defaultDocumentNumber(entity, existing.length),
        status: "draft",
        notes: "",
      };

      if (entity === "Estimate") {
        let tax_rate;
        try {
          const profiles = await api.entities.CompanyProfile.list("-created_date", 1);
          if (profiles[0]?.default_tax_rate != null) tax_rate = profiles[0].default_tax_rate;
        } catch { /* optional */ }
        Object.assign(base, { date: today, lines: [], ...(tax_rate != null ? { tax_rate } : {}) });
      }

      if (entity === "WorkOrder") {
        const accepted = documents.find((d) => d.entity === "Estimate" && (d.status === "accepted" || d.accepted_snapshot));
        if (accepted) {
          const created = await api.workOrders.fromEstimate(accepted.id);
          await onChanged?.();
          setOpenDoc({ entity: "WorkOrder", document: created });
          return;
        }
        Object.assign(base, { lines: [] });
      }

      if (entity === "ChangeOrder") {
        const accepted = documents.find((d) => d.entity === "Estimate" && (d.status === "accepted" || d.accepted_snapshot));
        Object.assign(base, {
          lines: [],
          related_estimate_id: accepted?.id,
          added_cost: 0,
          credit: 0,
          net_change: 0,
        });
      }

      if (entity === "Invoice") {
        const accepted = documents.find((d) => d.entity === "Estimate" && (d.status === "accepted" || d.accepted_snapshot));
        if (accepted) {
          const created = await api.invoices.fromJob(jobId);
          await onChanged?.();
          setOpenDoc({ entity: "Invoice", document: created });
          return;
        }
        Object.assign(base, {
          date: today,
          material_lines: [],
          labor_lines: [],
          misc_lines: [],
          billed_change_order_ids: [],
          project_name: jobTitle || "",
        });
      }

      const created = await api.entities[entity].create(base);
      await onChanged?.();
      setOpenDoc({ entity, document: created });
    } finally {
      setCreating(null);
    }
  };

  const sorted = [...documents].sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));
  const displayMoney = (doc) => {
    if (doc.entity === "ChangeOrder") return doc.revised_contract_total ?? doc.net_change;
    return doc.total;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Documents</div>
        <div className="flex flex-wrap gap-1.5">
          {DOCUMENT_TYPES.map((t) => (
            <Button
              key={t.entity}
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={!!creating}
              onClick={() => createDraft(t.entity)}
              title={
                t.entity === "WorkOrder" || t.entity === "Invoice"
                  ? "Creates from accepted estimate when available"
                  : undefined
              }
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">
          Every job needs an estimate. Create a draft Estimate to start quoting — use the catalog for small jobs.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sorted.map((doc) => (
            <li key={`${doc.entity}-${doc.id}`}>
              <button
                type="button"
                onClick={() => setOpenDoc({ entity: doc.entity, document: doc })}
                className="w-full flex items-center gap-3 py-3 text-left hover:bg-slate-50 rounded-lg px-1 -mx-1 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-slate-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{documentTypeLabel(doc.entity)}</span>
                    {doc.number && <span className="text-xs text-slate-500">{doc.number}</span>}
                    <StatusBadge status={doc.status} />
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {doc.date || doc.created_date ? shortDate(doc.date || doc.created_date) : "—"}
                    {displayMoney(doc) != null ? ` · ${money(displayMoney(doc))}` : ""}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <EstimateEditorDialog
        open={openDoc?.entity === "Estimate"}
        onOpenChange={(next) => { if (!next) setOpenDoc(null); }}
        document={openDoc?.entity === "Estimate" ? openDoc.document : null}
        jobId={jobId}
        jobTitle={jobTitle}
        onSaved={onChanged}
        onRevised={(created) => openRevised("Estimate", created)}
      />
      <WorkOrderEditorDialog
        open={openDoc?.entity === "WorkOrder"}
        onOpenChange={(next) => { if (!next) setOpenDoc(null); }}
        document={openDoc?.entity === "WorkOrder" ? openDoc.document : null}
        jobId={jobId}
        onSaved={onChanged}
        onRevised={(created) => openRevised("WorkOrder", created)}
      />
      <ChangeOrderEditorDialog
        open={openDoc?.entity === "ChangeOrder"}
        onOpenChange={(next) => { if (!next) setOpenDoc(null); }}
        document={openDoc?.entity === "ChangeOrder" ? openDoc.document : null}
        jobId={jobId}
        onSaved={onChanged}
        onRevised={(created) => openRevised("ChangeOrder", created)}
      />
      <InvoiceEditorDialog
        open={openDoc?.entity === "Invoice"}
        onOpenChange={(next) => { if (!next) setOpenDoc(null); }}
        document={openDoc?.entity === "Invoice" ? openDoc.document : null}
        jobId={jobId}
        jobTitle={jobTitle}
        client={client}
        onSaved={onChanged}
        onRevised={(created) => openRevised("Invoice", created)}
      />
    </div>
  );
}
