import React from "react";
import { cn } from "@/lib/utils";

const STYLES = {
  Estimate: "bg-blue-100 text-blue-800 border-blue-200",
  Scheduled: "bg-purple-100 text-purple-800 border-purple-200",
  "In Progress": "bg-amber-100 text-amber-800 border-amber-200",
  "Waiting on Materials": "bg-orange-100 text-orange-800 border-orange-200",
  Completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Paid: "bg-slate-200 text-slate-800 border-slate-300",
};

export default function StatusBadge({ status, className = "" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap",
        STYLES[status] || "bg-slate-100 text-slate-700 border-slate-200",
        className
      )}
    >
      {status}
    </span>
  );
}