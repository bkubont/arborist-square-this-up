/**
 * Shared void / revise actions for job documents (Phase 6).
 * Estimate / Work Order / Invoice are singular per job — revise is disabled (void, then create).
 */
import React, { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";

const NO_REVISE = new Set(["Estimate", "Invoice"]);

export default function DocumentLifecycleActions({
  entity,
  document,
  onSaved,
  onRevised,
  disabled,
  allowRevise = undefined,
}) {
  const [busy, setBusy] = useState(false);
  if (!document?.id) return null;
  const isVoid = document.status === "void";
  const isPaid = document.status === "paid";
  const canRevise = allowRevise !== false && !NO_REVISE.has(entity);

  const voidDoc = async () => {
    if (isVoid || isPaid) return;
    const tip = canRevise
      ? "It will be excluded from financial rollups. You can still create a revision."
      : "It will be excluded from financial rollups. Create a new document afterward if needed.";
    if (!confirm(`Void this ${entity}? ${tip}`)) return;
    setBusy(true);
    try {
      await api.documents.void(entity, document.id);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  const revise = async () => {
    setBusy(true);
    try {
      const created = await api.documents.revise(entity, document.id);
      onRevised?.(created) ?? onSaved?.();
    } catch (e) {
      alert(e?.message || "Could not revise document.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {!isVoid && !isPaid && (
        <Button type="button" variant="outline" size="sm" className="text-red-700 border-red-200 hover:bg-red-50" onClick={voidDoc} disabled={disabled || busy}>
          Void
        </Button>
      )}
      {canRevise && (
        <Button type="button" variant="outline" size="sm" onClick={revise} disabled={disabled || busy} title="Create a new draft from this document (clears signature / accept snapshot)">
          {busy ? "Working…" : "Revise"}
        </Button>
      )}
    </div>
  );
}
