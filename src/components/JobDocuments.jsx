import React, { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import DocumentStubDialog from "@/components/DocumentStubDialog";
import { DOCUMENT_TYPES, defaultDocumentNumber, documentTypeLabel } from "@/lib/documents";
import { money, shortDate } from "@/lib/format";

export default function JobDocuments({ jobId, documents, onChanged }) {
  const [openDoc, setOpenDoc] = useState(null);
  const [creating, setCreating] = useState(null);

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
      if (entity === "Estimate") Object.assign(base, { date: today, lines: [] });
      if (entity === "WorkOrder") Object.assign(base, { lines: [] });
      if (entity === "ChangeOrder") Object.assign(base, { lines: [] });
      if (entity === "Invoice") Object.assign(base, { date: today, material_lines: [], labor_lines: [], misc_lines: [], billed_change_order_ids: [] });

      const created = await api.entities[entity].create(base);
      await onChanged?.();
      setOpenDoc({ entity, document: created });
    } finally {
      setCreating(null);
    }
  };

  const sorted = [...documents].sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));

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
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">
          No documents yet. Create a draft Estimate or Invoice to get started.
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
                    {doc.total != null ? ` · ${money(doc.total)}` : ""}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <DocumentStubDialog
        open={!!openDoc}
        onOpenChange={(next) => { if (!next) setOpenDoc(null); }}
        entity={openDoc?.entity}
        document={openDoc?.document}
        jobId={jobId}
        onSaved={onChanged}
      />
    </div>
  );
}
