/**
 * Shared void / revise actions for job documents (Phase 6).
 */
import React, { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";

export default function DocumentLifecycleActions({
  entity,
  document,
  onSaved,
  onRevised,
  disabled,
}) {
  const [busy, setBusy] = useState(false);
  if (!document?.id) return null;
  const isVoid = document.status === "void";
  const isPaid = document.status === "paid";

  const voidDoc = async () => {
    if (isVoid || isPaid) return;
    if (!confirm(`Void this ${entity}? It will be excluded from financial rollups. You can still create a revision.`)) return;
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
      <Button type="button" variant="outline" size="sm" onClick={revise} disabled={disabled || busy} title="Create a new draft from this document (clears signature / accept snapshot)">
        {busy ? "Working…" : "Revise"}
      </Button>
    </div>
  );
}
