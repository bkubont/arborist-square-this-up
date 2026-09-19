/**
 * Document create buttons by job stage (Brittany UX).
 * New job → Estimate + Material Order only.
 * After estimate accept → Work Order, Change Order unlock; Invoice after WO complete.
 * One Estimate, one Work Order, one Invoice per job (open existing; no duplicates).
 */

/** Entities limited to one non-void document per job. */
export const SINGLE_DOC_ENTITIES = new Set(["Estimate", "WorkOrder", "Invoice"]);

/** @param {Array<{entity?: string, status?: string, accepted_snapshot?: unknown}>} documents */
export function hasAcceptedEstimate(documents = []) {
  return documents.some(
    (d) => d.entity === "Estimate" && (d.status === "accepted" || d.accepted_snapshot),
  );
}

/** Active (non-void) document of this entity for the job, if any. */
export function findActiveDocument(entity, documents = []) {
  return documents.find((d) => d.entity === entity && d.status !== "void") || null;
}

/** Work Order is complete when status is `complete` (document enum). */
export function hasCompleteWorkOrder(documents = []) {
  return documents.some((d) => d.entity === "WorkOrder" && d.status === "complete");
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
      if (entity === "Invoice" && !hasCompleteWorkOrder(documents)) {
        return {
          available: false,
          reason: "Complete the Work Order before opening the invoice.",
          existing,
        };
      }
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
      WorkOrder: "Accept the estimate first — then create a Work Order from it.",
      ChangeOrder: "Change Orders unlock after the customer accepts the estimate.",
      Invoice: "Invoices unlock after the customer accepts the estimate.",
    };
    return {
      available: false,
      reason: labels[entity] || "Available after the estimate is accepted.",
    };
  }

  if (entity === "Invoice" && !hasCompleteWorkOrder(documents)) {
    return {
      available: false,
      reason: "Complete the Work Order before creating an invoice.",
    };
  }

  return { available: true };
}

/** Accepted estimate is print/view only — no content edits. */
export function isEstimateReadOnly(document) {
  if (!document) return false;
  return document.status === "accepted" || !!document.accepted_snapshot;
}
