/**
 * Global status → color system (Square This Up).
 *
 * ONE source of truth for jobs, documents, and any surface that shows a status.
 * Shared lifecycle words resolve to the same semantic color:
 *   sent ≈ waiting  ·  accepted ≈ approved  ·  declined ≈ rejected
 *   complete ≈ Completed  ·  paid ≈ Paid  ·  void ≈ declined (terminal cancel)
 *
 * Gold (`attention`) = waiting / blocked / needs action only.
 * Do not invent ad-hoc status colors elsewhere — import from here.
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
 * Keys are matched case-insensitively after trim.
 * Job statuses keep their Title Case labels; document statuses are lowercase.
 */
export const STATUS_SEMANTIC_MAP = {
  // —— Jobs ——
  Estimate: "brand",
  Scheduled: "sky",
  "In Progress": "blue",
  "Waiting on Materials": "attention",
  Completed: "success",
  Paid: "closed",

  // —— Shared document lifecycle ——
  draft: "neutral",
  sent: "attention", // awaiting client / approval
  accepted: "success",
  approved: "success", // same as accepted
  declined: "danger",
  rejected: "danger", // same as declined
  void: "danger",
  partial: "sky", // progress billing in flight
  paid: "closed", // same as job Paid
  issued: "sky", // WO released (aligned with Scheduled)
  complete: "success", // WO done (aligned with Completed)
};

/** @deprecated Prefer STATUS_SEMANTIC_MAP + statusColors(); kept for callers expecting a flat map. */
export const STATUS_COLORS = Object.fromEntries(
  Object.entries(STATUS_SEMANTIC_MAP).map(([status, semantic]) => [status, STATUS_SEMANTICS[semantic]])
);

const FALLBACK = STATUS_SEMANTICS.neutral;

/** Normalize lookup key (trim; try exact then lowercase). */
export function normalizeStatusKey(status) {
  if (status == null || status === "") return "";
  const raw = String(status).trim();
  if (STATUS_SEMANTIC_MAP[raw]) return raw;
  const lower = raw.toLowerCase();
  const found = Object.keys(STATUS_SEMANTIC_MAP).find((k) => k.toLowerCase() === lower);
  return found || raw;
}

export function statusSemantic(status) {
  const key = normalizeStatusKey(status);
  return STATUS_SEMANTIC_MAP[key] || "neutral";
}

export function statusColors(status) {
  return STATUS_SEMANTICS[statusSemantic(status)] || FALLBACK;
}

/** Card/container frame: left accent + matching border. */
export function statusCardClass(status) {
  const c = statusColors(status);
  return `border-l-4 ${c.border}`;
}

/** Whether this status is treated as high-attention (gold). */
export function isAttentionStatus(status) {
  return statusSemantic(status) === "attention";
}
