import React, { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import EstimateEditorDialog from "@/components/EstimateEditorDialog";
import MaterialOrderEditorDialog from "@/components/MaterialOrderEditorDialog";
import ChangeOrderEditorDialog from "@/components/ChangeOrderEditorDialog";
import InvoiceEditorDialog from "@/components/InvoiceEditorDialog";
import {
  documentCreateAvailability,
  findActiveDocument,
  findLiveAcceptedEstimate,
  hasAcceptedEstimate,
  SINGLE_DOC_ENTITIES,
} from "@/lib/documentAvailability";
import { DOCUMENT_TYPES, defaultDocumentNumber, documentTypeLabel } from "@/lib/documents";
import { addDaysIso, ESTIMATE_VALID_DAYS, todayIso } from "@/lib/estimateMath";
import { logDocumentCreated } from "@/lib/jobActivity";
import { money, shortDate } from "@/lib/format";
import { loadAccountTaxRate } from "@/lib/salesTax";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

export default function JobDocuments({
  jobId,
  jobTitle,
  client,
  documents,
  onChanged,
  /** Limit to these entity types (default: all document types). */
  entities = null,
  /**
   * Also list (and open) documents outside `entities` that match this test, without a create
   * button for their type — e.g. the signed estimate beside the change orders it is the base of.
   * @type {null | ((doc: any) => boolean)}
   */
  alsoShow = null,
  title = "Documents",
  emptyHint = null,
  className = "",
}) {
  const [openDoc, setOpenDoc] = useState(null);
  const [creating, setCreating] = useState(null);

  const allowedTypes = entities
    ? DOCUMENT_TYPES.filter((t) => entities.includes(t.entity))
    : DOCUMENT_TYPES;
  const allowedSet = new Set(allowedTypes.map((t) => t.entity));

  const openRevised = async (entity, created) => {
    await onChanged?.();
    setOpenDoc({ entity, document: { ...created, entity } });
  };

  const createDraft = async (entity) => {
    const gate = documentCreateAvailability(entity, documents);
    if (!gate.available) {
      alert(gate.reason || "Not available yet.");
      return;
    }

    if (gate.openExisting && gate.existing) {
      setOpenDoc({ entity, document: { ...gate.existing, entity } });
      return;
    }

    setCreating(entity);
    try {
      const existing = documents.filter((d) => d.entity === entity);
      const today = todayIso();
      const base = {
        job_id: jobId,
        number: defaultDocumentNumber(entity, existing.length),
        status: "draft",
        notes: "",
      };

      if (entity === "Estimate") {
        const tax_rate = await loadAccountTaxRate(api);
        Object.assign(base, {
          date: today,
          valid_till: addDaysIso(today, ESTIMATE_VALID_DAYS),
          lines: [],
          tax_rate,
        });
      }

      if (entity === "MaterialOrder") {
        const accepted = findLiveAcceptedEstimate(documents);
        Object.assign(base, {
          date: today,
          lines: [],
          related_estimate_id: accepted?.id,
        });
      }

      if (entity === "ChangeOrder") {
        const accepted = findLiveAcceptedEstimate(documents);
        const tax_rate = accepted?.accepted_snapshot?.tax_rate
          ?? accepted?.tax_rate
          ?? await loadAccountTaxRate(api);
        Object.assign(base, {
          lines: [],
          related_estimate_id: accepted?.id,
          added_cost: 0,
          credit: 0,
          net_change: 0,
          tax_rate,
        });
      }

      if (entity === "Invoice") {
        const existingInv = findActiveDocument("Invoice", documents);
        if (existingInv) {
          setOpenDoc({ entity: "Invoice", document: { ...existingInv, entity: "Invoice" } });
          return;
        }
        const created = await api.invoices.fromJob(jobId);
        await onChanged?.();
        setOpenDoc({ entity: "Invoice", document: created });
        return;
      }

      const created = await api.entities[entity].create(base);
      await logDocumentCreated(api, { jobId, entity, number: created.number || base.number });
      await onChanged?.();
      setOpenDoc({ entity, document: created });
    } catch (e) {
      alert(e?.message || "Could not create document.");
    } finally {
      setCreating(null);
    }
  };

  const filtered = documents.filter((d) => allowedSet.has(d.entity) || alsoShow?.(d));
  // The estimate is the base the rest build on, so it leads; everything else newest first.
  const sorted = [...filtered].sort((a, b) =>
    Number(b.entity === "Estimate") - Number(a.entity === "Estimate")
    || (b.created_date || "").localeCompare(a.created_date || ""));
  const openable = new Set([...allowedSet, ...filtered.map((d) => d.entity)]);
  const displayMoney = (doc) => {
    if (doc.entity === "ChangeOrder") return doc.revised_contract_total ?? doc.net_change;
    return doc.total;
  };
  const accepted = hasAcceptedEstimate(documents);
  const showStageHints = !entities || entities.includes("Estimate") || entities.includes("Invoice");

  const defaultEmpty =
    allowedSet.has("Estimate") && sorted.length === 0
      ? "Every job needs an estimate. Create a draft Estimate to start quoting — type in the description to fill from the catalog."
      : "No documents in this section yet.";

  return (
    <div className={cn("bg-white rounded-xl border border-slate-200 p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{title}</div>
        <div className="flex flex-wrap gap-1.5">
          {allowedTypes.map((t) => {
            const gate = documentCreateAvailability(t.entity, documents);
            const singular = SINGLE_DOC_ENTITIES.has(t.entity);
            const label = t.label;
            return (
              <Button
                key={t.entity}
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={!!creating || !gate.available}
                onClick={() => createDraft(t.entity)}
                title={
                  !gate.available
                    ? gate.reason
                    : gate.openExisting
                      ? `Open existing ${t.label}`
                      : undefined
                }
              >
                {!gate.openExisting && <Plus className="w-3.5 h-3.5 mr-1" />}
                {singular && gate.openExisting ? `Open ${label}` : label}
              </Button>
            );
          })}
        </div>
      </div>

      {showStageHints && !accepted && allowedSet.has("Estimate") && (
        <p className="text-xs text-slate-500 mb-3">
          The quote is the whole line, labor + materials. Once the customer signs, each line becomes a job task
          (see Tasks).
        </p>
      )}

      {sorted.length === 0 ? (
        <div className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">
          {emptyHint || defaultEmpty}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sorted.map((doc) => (
            <li key={`${doc.entity}-${doc.id}`}>
              <button
                type="button"
                onClick={() => setOpenDoc({ entity: doc.entity, document: doc })}
                className={cn(
                  "w-full flex items-center gap-3 py-3 text-left hover:bg-muted/60 rounded-lg px-2 -mx-1 transition-colors border bg-card",
                  statusCardClass(doc.status, { entity: doc.entity })
                )}
              >
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-slate-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{documentTypeLabel(doc.entity)}</span>
                    {doc.number && <span className="text-xs text-slate-500">{doc.number}</span>}
                    <StatusBadge status={doc.status} entity={doc.entity} />
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

      {openable.has("Estimate") && (
        <EstimateEditorDialog
          open={openDoc?.entity === "Estimate"}
          onOpenChange={(next) => { if (!next) setOpenDoc(null); }}
          document={openDoc?.entity === "Estimate" ? openDoc.document : null}
          jobId={jobId}
          jobTitle={jobTitle}
          onSaved={onChanged}
          onRevised={(created) => openRevised("Estimate", created)}
        />
      )}
      {openable.has("MaterialOrder") && (
        <MaterialOrderEditorDialog
          open={openDoc?.entity === "MaterialOrder"}
          onOpenChange={(next) => { if (!next) setOpenDoc(null); }}
          document={openDoc?.entity === "MaterialOrder" ? openDoc.document : null}
          jobId={jobId}
          onSaved={onChanged}
          onRevised={(created) => openRevised("MaterialOrder", created)}
        />
      )}
      {openable.has("ChangeOrder") && (
        <ChangeOrderEditorDialog
          open={openDoc?.entity === "ChangeOrder"}
          onOpenChange={(next) => { if (!next) setOpenDoc(null); }}
          document={openDoc?.entity === "ChangeOrder" ? openDoc.document : null}
          jobId={jobId}
          onSaved={onChanged}
          onRevised={(created) => openRevised("ChangeOrder", created)}
        />
      )}
      {openable.has("Invoice") && (
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
      )}
    </div>
  );
}
