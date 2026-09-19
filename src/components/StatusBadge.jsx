import React from "react";
import { cn } from "@/lib/utils";

/** Status colors stay in the royal-blue family; gold only for materials wait (blocker). */
const STYLES = {
  Estimate: "bg-brand-muted text-brand-muted-foreground border-brand",
  Scheduled: "bg-sky-100 text-sky-900 border-sky-200",
  "In Progress": "bg-blue-100 text-blue-900 border-blue-200",
  "Waiting on Materials": "bg-attention-muted text-attention-muted-foreground border-attention",
  Completed: "bg-emerald-100 text-emerald-900 border-emerald-200",
  Paid: "bg-secondary text-secondary-foreground border-border",
};

export default function StatusBadge({ status, className = "" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap",
        STYLES[status] || "bg-muted text-muted-foreground border-border",
        className
      )}
    >
      {status}
    </span>
  );
}
