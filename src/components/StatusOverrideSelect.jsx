import React, { useState } from "react";
import { api } from "@/api/client";
import { Input } from "@/components/ui/input";
import StatusSelect from "@/components/StatusSelect";

/** Mirrors OVERRIDE_STATUSES in server/statusOverride.js. Void stays its own action. */
const OVERRIDE_STATUSES = {
  Estimate: ["draft", "sent", "accepted", "declined"],
  ChangeOrder: ["draft", "sent", "approved", "rejected"],
};
const SIGNED = { Estimate: "accepted", ChangeOrder: "approved" };

/**
 * Status dropdown for an Estimate / Change Order that lets the owner set the status without a
 * customer signature (accepted on paper, declined by phone…). Accepting this way does everything a
 * signature does; reopening a signed one is refused by the server while an invoice or change order
 * is built on it. `beforeChange` saves any unsaved edits first.
 *
 * @param {{ entity: "Estimate" | "ChangeOrder", document: any, beforeChange?: () => Promise<void>, onChanged: (updated: any) => void }} props
 */
export default function StatusOverrideSelect({ entity, document, beforeChange = undefined, onChanged }) {
  const [busy, setBusy] = useState(false);
  const noun = entity === "ChangeOrder" ? "change order" : "estimate";
  const signed = SIGNED[entity];

  if (document.status === "void") {
    return <Input value="Void" readOnly className="bg-slate-50" />;
  }

  const change = async (status) => {
    if (status === document.status || busy) return;
    const reopening = document.status === signed;
    const message = status === signed
      ? `Mark this ${noun} ${signed} without a signature?\n\nIt locks the ${noun} as it is now and creates its tasks, just like a customer signature.`
      : reopening
        ? `Reopen this ${signed} ${noun} as "${status}"?\n\nIt becomes editable again. Tasks from it that haven't been started are removed. Not allowed while an invoice${entity === "Estimate" ? " or change order" : ""} is built on it.`
        : null;
    if (message && !window.confirm(message)) return;
    setBusy(true);
    try {
      if (!reopening) await beforeChange?.();
      const updated = await api.documents.setStatus(entity, document.id, status);
      onChanged(updated);
    } catch (e) {
      alert(e?.message || "Could not change the status.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <StatusSelect value={document.status} onValueChange={change} statuses={OVERRIDE_STATUSES[entity]} entity={entity} />
      {document.accepted_manually && (
        <p className="text-[11px] text-slate-500 mt-1">Marked {signed} without a signature.</p>
      )}
    </div>
  );
}
