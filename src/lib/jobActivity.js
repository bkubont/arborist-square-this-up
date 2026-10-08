import { documentTypeLabel } from "@/lib/documents";

/**
 * Complete job activity feed: timeline entries + backfilled document milestones
 * (create / sign / void) using real record timestamps when logged events are missing.
 *
 * @param {{ entries?: object[], documents?: object[] }} args
 * @returns {Array<{ id: string, at: string, type: string, text?: string, amount?: number, photo_url?: string, category?: string, visibility?: string, payment_method?: string, job_status?: string }>}
 */
export function composeJobActivity({ entries = [], documents = [] } = {}) {
  /** @type {Array<{ id: string, at: string, type: string, text?: string, amount?: number, photo_url?: string, category?: string, visibility?: string, payment_method?: string, job_status?: string }>} */
  const items = (entries || []).map((e) => ({
    id: e.id,
    at: e.created_date || e.updated_date || "",
    type: e.type || "note",
    text: e.text,
    amount: e.amount,
    photo_url: e.photo_url,
    category: e.category,
    payment_method: e.payment_method,
    job_status: e.job_status,
    visibility: e.visibility,
  }));

  const textHas = (item, needle) => {
    if (!needle) return false;
    return String(item.text || "").includes(String(needle));
  };

  for (const doc of documents || []) {
    const label = documentTypeLabel(doc.entity);
    const num = doc.number || "";
    // work_order_created: timeline rows from before the checklist replaced the Work Order.
    const createTypes = new Set(["document_created", "work_order_created"]);

    const hasCreate = items.some(
      (i) => createTypes.has(i.type) && (num ? textHas(i, num) : textHas(i, label)),
    );
    if (!hasCreate && doc.created_date) {
      items.push({
        id: `synth-create-${doc.entity}-${doc.id}`,
        at: doc.created_date,
        type: "document_created",
        text: `${label}${num ? ` ${num}` : ""} created`.trim(),
        category: "document",
      });
    }

    if (doc.signed_at) {
      const signType = doc.entity === "Estimate"
        ? "estimate_signed"
        : doc.entity === "ChangeOrder"
          ? "change_order_signed"
          : null;
      if (signType) {
        const hasSign = items.some((i) => i.type === signType && (num ? textHas(i, num) : true));
        if (!hasSign) {
          items.push({
            id: `synth-sign-${doc.id}`,
            at: doc.signed_at,
            type: signType,
            text: `${label}${num ? ` ${num}` : ""} signed${doc.signer_name ? ` by ${doc.signer_name}` : ""}`.trim(),
            category: "document",
            photo_url: doc.signature_file_url,
          });
        }
      }
    }

    if (doc.status === "void") {
      const hasVoid = items.some((i) => i.type === "document_voided" && (num ? textHas(i, num) : textHas(i, label)));
      if (!hasVoid) {
        items.push({
          id: `synth-void-${doc.id}`,
          at: doc.updated_date || doc.created_date || "",
          type: "document_voided",
          text: `${label}${num ? ` ${num}` : ""} voided`.trim(),
          category: "financial",
        });
      }
    }

    if (doc.status === "sent" && (doc.entity === "Estimate" || doc.entity === "ChangeOrder" || doc.entity === "Invoice")) {
      const sentType = doc.entity === "Invoice"
        ? "invoice_sent"
        : doc.entity === "ChangeOrder"
          ? "change_order_sent"
          : "estimate_sent";
      const hasSent = items.some((i) => i.type === sentType && (num ? textHas(i, num) : true));
      if (!hasSent) {
        // Prefer updated_date when status is sent (approx send time) over created_date
        items.push({
          id: `synth-sent-${doc.id}`,
          at: doc.updated_date || doc.created_date || "",
          type: sentType,
          text: `${label}${num ? ` ${num}` : ""} sent`.trim(),
          category: "financial",
        });
      }
    }
  }

  return items
    .filter((i) => i.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Client helper: log a document-created timeline row (non-blocking on failure). */
export async function logDocumentCreated(api, { jobId, entity, number, extra = "" }) {
  const label = documentTypeLabel(entity);
  try {
    await api.entities.TimelineEntry.create({
      job_id: jobId,
      type: "document_created",
      text: `${label}${number ? ` ${number}` : ""} created${extra ? ` — ${extra}` : ""}`.trim(),
      category: "document",
    });
  } catch {
    /* non-blocking */
  }
}
