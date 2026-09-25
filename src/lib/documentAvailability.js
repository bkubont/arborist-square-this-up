/**
 * Document create buttons by job stage (Brittany UX).
 * New job → Estimate + Material Order only.
 * After estimate accept → Change Order and Invoice unlock. The job's tasks (WorkItem) track the
 * work itself and do not gate billing.
 * One Estimate, one Invoice per job (open existing; no duplicates).
 */

/** Entities limited to one non-void document per job. */
export const SINGLE_DOC_ENTITIES = new Set(["Estimate", "Invoice", "PunchList"]);

/** Live accepted estimate — voided snapshots do not authorize. */
export function isLiveAcceptedEstimate(doc) {
  if (!doc || doc.status === "void") return false;
  if (doc.entity && doc.entity !== "Estimate") return false;
  return doc.status === "accepted" || !!doc.accepted_snapshot;
}

/** @param {Array<{entity?: string, status?: string, accepted_snapshot?: unknown}>} documents */
export function hasAcceptedEstimate(documents = []) {
  return documents.some(
    (d) => d.entity === "Estimate" && d.status !== "void" && (d.status === "accepted" || d.accepted_snapshot),
  );
}

/** Active (non-void) document of this entity for the job, if any. */
export function findActiveDocument(entity, documents = []) {
  return documents.find((d) => d.entity === entity && d.status !== "void") || null;
}

/** @param {Array} documents */
export function findLiveAcceptedEstimate(documents = []) {
  const estimates = documents.filter((d) => d.entity === "Estimate");
  return estimates.find((e) => e.status === "accepted")
    || estimates.find((e) => e.status !== "void" && e.accepted_snapshot)
    || null;
}

/**
 * @param {string} entity
 * @param {Array} documents
 * @returns {{ available: boolean, reason?: string, existing?: object|null, openExisting?: boolean }}
 */
export function documentCreateAvailability(entity, documents = []) {
  if (SINGLE_DOC_ENTITIES.has(entity)) {
    const existing = findActiveDocument(entity, documents);
    if (existing) {
      return {
        available: true,
        openExisting: true,
        existing,
        reason: undefined,
      };
    }
  }

  if (entity === "Estimate" || entity === "MaterialOrder") {
    return { available: true };
  }

  if (!hasAcceptedEstimate(documents)) {
    const labels = {
      ChangeOrder: "Change Orders unlock after the customer accepts the estimate.",
      Invoice: "Invoices unlock after the customer accepts the estimate.",
    };
    return {
      available: false,
      reason: labels[entity] || "Available after the estimate is accepted.",
    };
  }

  return { available: true };
}

/** Signed, declined or void estimate is print/view only — no content edits (server/lifecycle.js). */
export function isEstimateReadOnly(document) {
  if (!document) return false;
  return ["accepted", "declined", "void"].includes(document.status) || !!document.accepted_snapshot;
}

/** Approved, rejected or void change order is print/view only — no content edits (server/lifecycle.js). */
export function isChangeOrderReadOnly(document) {
  if (!document) return false;
  return ["approved", "rejected", "void"].includes(document.status) || !!document.accepted_snapshot;
}
