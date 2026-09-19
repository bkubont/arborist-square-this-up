/**
 * Document create buttons by job stage (Brittany UX).
 * New job → Estimate + Material Order only.
 * After estimate accept → Work Order, Change Order, Invoice unlock.
 */

/** @param {Array<{entity?: string, status?: string, accepted_snapshot?: unknown}>} documents */
export function hasAcceptedEstimate(documents = []) {
  return documents.some(
    (d) => d.entity === "Estimate" && (d.status === "accepted" || d.accepted_snapshot),
  );
}

/**
 * @param {string} entity
 * @param {Array} documents
 * @returns {{ available: boolean, reason?: string }}
 */
export function documentCreateAvailability(entity, documents = []) {
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
  return { available: true };
}
