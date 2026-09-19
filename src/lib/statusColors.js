/**
 * Canonical job status → color tokens (Square This Up).
 * Gold (`attention`) only for high-attention / blocked states.
 * Royal blue family for in-play work; emerald for done; muted for paid.
 */
export const STATUS_COLORS = {
  Estimate: {
    badge: "bg-brand-muted text-brand-muted-foreground border-brand",
    border: "border-brand",
    ring: "ring-brand/30",
    column: "border-brand/40",
    columnHeader: "bg-brand-muted/60 border-brand/30",
    swatch: "bg-primary",
    select: "text-brand-muted-foreground",
  },
  Scheduled: {
    badge: "bg-sky-100 text-sky-900 border-sky-300",
    border: "border-sky-400",
    ring: "ring-sky-300/50",
    column: "border-sky-300/50",
    columnHeader: "bg-sky-50 border-sky-200",
    swatch: "bg-sky-500",
    select: "text-sky-800",
  },
  "In Progress": {
    badge: "bg-blue-100 text-blue-950 border-blue-400",
    border: "border-blue-500",
    ring: "ring-blue-400/40",
    column: "border-blue-400/50",
    columnHeader: "bg-blue-50 border-blue-200",
    swatch: "bg-blue-600",
    select: "text-blue-900",
  },
  "Waiting on Materials": {
    badge: "bg-attention-muted text-attention-muted-foreground border-attention",
    border: "border-attention",
    ring: "ring-attention/40",
    column: "border-attention/50",
    columnHeader: "bg-attention-muted border-attention/40",
    swatch: "bg-attention",
    select: "text-attention",
  },
  Completed: {
    badge: "bg-emerald-100 text-emerald-950 border-emerald-300",
    border: "border-emerald-400",
    ring: "ring-emerald-300/40",
    column: "border-emerald-300/50",
    columnHeader: "bg-emerald-50 border-emerald-200",
    swatch: "bg-emerald-500",
    select: "text-emerald-900",
  },
  Paid: {
    badge: "bg-secondary text-secondary-foreground border-border",
    border: "border-slate-400",
    ring: "ring-slate-300/40",
    column: "border-border",
    columnHeader: "bg-secondary border-border",
    swatch: "bg-slate-500",
    select: "text-muted-foreground",
  },
};

const FALLBACK = {
  badge: "bg-muted text-muted-foreground border-border",
  border: "border-border",
  ring: "ring-border",
  column: "border-border",
  columnHeader: "bg-muted border-border",
  swatch: "bg-muted-foreground",
  select: "text-foreground",
};

export function statusColors(status) {
  return STATUS_COLORS[status] || FALLBACK;
}

/** Card/container frame: left accent + matching border. */
export function statusCardClass(status) {
  const c = statusColors(status);
  return `border-l-4 ${c.border} ${c.ring}`;
}
