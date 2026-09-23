/**
 * Global status → color system (Square This Up).
 *
 * ONE source of truth for jobs, documents, and any surface that shows a status.
 * Exact brand: Royal Blue #0504AA · Gold #E3AD36 · Black #000000
 *
 * Waiting family (gold base #E3AD36) with subtle shades for scanability —
 * may collapse to identical later:
 *   materials (#E3AD36) · approval (#EBC35A) · payment (#C9961F)
 */

/** Semantic palettes used by chips, frames, columns, selects. */
export const STATUS_SEMANTICS = {
  brand: {
    badge: "bg-brand-muted text-brand-muted-foreground border-brand",
    border: "border-brand",
    ring: "ring-brand/30",
    column: "border-brand/40",
    columnHeader: "bg-brand-muted/60 border-brand/30",
    swatch: "bg-primary",
    select: "text-brand-muted-foreground",
  },
  sky: {
    badge: "bg-sky-100 text-sky-900 border-sky-300",
    border: "border-sky-400",
    ring: "ring-sky-300/50",
    column: "border-sky-300/50",
    columnHeader: "bg-sky-50 border-sky-200",
    swatch: "bg-sky-500",
    select: "text-sky-800",
  },
  blue: {
    badge: "bg-blue-100 text-blue-950 border-blue-400",
    border: "border-blue-500",
    ring: "ring-blue-400/40",
    column: "border-blue-400/50",
    columnHeader: "bg-blue-50 border-blue-200",
    swatch: "bg-blue-600",
    select: "text-blue-900",
  },
  /** Base gold — Waiting on Materials */
  "attention-materials": {
    badge: "bg-attention-materials-muted text-attention-materials-foreground border-attention-materials-border",
    border: "border-attention-materials-border",
    ring: "ring-attention-materials/40",
    column: "border-attention-materials-border/60",
    columnHeader: "bg-attention-materials-muted border-attention-materials-border",
    swatch: "bg-attention-materials",
    select: "text-attention-materials-foreground",
  },
  /** Lighter gold — estimate/CO awaiting client approval */
  "attention-approval": {
    badge: "bg-attention-approval-muted text-attention-approval-foreground border-attention-approval-border",
    border: "border-attention-approval-border",
    ring: "ring-attention-approval/40",
    column: "border-attention-approval-border/60",
    columnHeader: "bg-attention-approval-muted border-attention-approval-border",
    swatch: "bg-attention-approval",
    select: "text-attention-approval-foreground",
  },
  /** Deeper gold — invoice awaiting payment */
  "attention-payment": {
    badge: "bg-attention-payment-muted text-attention-payment-foreground border-attention-payment-border",
    border: "border-attention-payment-border",
    ring: "ring-attention-payment/40",
    column: "border-attention-payment-border/60",
    columnHeader: "bg-attention-payment-muted border-attention-payment-border",
    swatch: "bg-attention-payment",
    select: "text-attention-payment-foreground",
  },
  /** Generic attention alias → materials (base gold) */
  attention: {
    badge: "bg-attention-muted text-attention-muted-foreground border-attention",
    border: "border-attention",
    ring: "ring-attention/40",
    column: "border-attention/50",
    columnHeader: "bg-attention-muted border-attention/40",
    swatch: "bg-attention",
    select: "text-attention",
  },
  success: {
    badge: "bg-emerald-100 text-emerald-950 border-emerald-300",
    border: "border-emerald-400",
    ring: "ring-emerald-300/40",
    column: "border-emerald-300/50",
    columnHeader: "bg-emerald-50 border-emerald-200",
    swatch: "bg-emerald-500",
    select: "text-emerald-900",
  },
  closed: {
    badge: "bg-secondary text-secondary-foreground border-border",
    border: "border-slate-400",
    ring: "ring-slate-300/40",
    column: "border-border",
    columnHeader: "bg-secondary border-border",
    swatch: "bg-slate-500",
    select: "text-muted-foreground",
  },
  neutral: {
    badge: "bg-muted text-muted-foreground border-border",
    border: "border-border",
    ring: "ring-border",
    column: "border-border",
    columnHeader: "bg-muted border-border",
    swatch: "bg-muted-foreground",
    select: "text-muted-foreground",
  },
  danger: {
    badge: "bg-red-50 text-red-900 border-red-300",
    border: "border-red-400",
    ring: "ring-red-300/40",
    column: "border-red-300/50",
    columnHeader: "bg-red-50 border-red-200",
    swatch: "bg-red-500",
    select: "text-red-800",
  },
};

/**
 * Canonical status string → semantic key.
 * Invoice `sent`/`partial` → payment shade; Estimate/CO `sent` → approval shade.
 * Use statusColors(status, { entity }) when entity is known.
 */
export const STATUS_SEMANTIC_MAP = {
  Estimate: "brand",
  Scheduled: "sky",
  "In Progress": "blue",
  "Waiting on Materials": "attention-materials",
  Completed: "success",
  Paid: "closed",

  draft: "neutral",
  sent: "attention-approval", // default: awaiting client (Estimate/CO)
  accepted: "success",
  approved: "success",
  declined: "danger",
  rejected: "danger",
  void: "danger",
  partial: "attention-payment", // invoice progress / unpaid
  paid: "closed",
  issued: "sky",
  complete: "success",
  ordered: "attention-materials", // legacy Material Order → treat like purchased
  quote: "attention-approval",
  purchased: "attention-materials",
  received: "success",

  // Job tasks (src/lib/tasks.js)
  prep: "neutral",
  in_progress: "blue",
  waiting_materials: "attention-materials",
  on_hold: "attention-approval",
  cancelled: "danger",
  done: "success",
};

/** @deprecated Prefer statusColors(); kept for flat-map callers. */
export const STATUS_COLORS = Object.fromEntries(
  Object.entries(STATUS_SEMANTIC_MAP).map(([status, semantic]) => [status, STATUS_SEMANTICS[semantic]])
);

const FALLBACK = STATUS_SEMANTICS.neutral;

export function normalizeStatusKey(status) {
  if (status == null || status === "") return "";
  const raw = String(status).trim();
  if (STATUS_SEMANTIC_MAP[raw]) return raw;
  const lower = raw.toLowerCase();
  const found = Object.keys(STATUS_SEMANTIC_MAP).find((k) => k.toLowerCase() === lower);
  return found || raw;
}

/**
 * @param {string} status
 * @param {{ entity?: string }} [opts] when entity is Invoice, `sent` maps to payment gold
 */
export function statusSemantic(status, opts = {}) {
  const key = normalizeStatusKey(status);
  const entity = opts.entity;
  if (entity === "Invoice" && (key === "sent" || key === "partial")) {
    return "attention-payment";
  }
  if ((entity === "Estimate" || entity === "ChangeOrder") && key === "sent") {
    return "attention-approval";
  }
  return STATUS_SEMANTIC_MAP[key] || "neutral";
}

export function statusColors(status, opts = {}) {
  return STATUS_SEMANTICS[statusSemantic(status, opts)] || FALLBACK;
}

export function statusCardClass(status, opts = {}) {
  const c = statusColors(status, opts);
  return `border-l-4 ${c.border}`;
}

export function isAttentionStatus(status, opts = {}) {
  return String(statusSemantic(status, opts)).startsWith("attention");
}
