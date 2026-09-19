import React from "react";
import { cn } from "@/lib/utils";
import { statusColors } from "@/lib/statusColors";

export default function StatusBadge({ status, entity = undefined, className = "" }) {
  const colors = statusColors(status, entity ? { entity } : {});
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap",
        colors.badge,
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", colors.swatch)} aria-hidden="true" />
      {status}
    </span>
  );
}
