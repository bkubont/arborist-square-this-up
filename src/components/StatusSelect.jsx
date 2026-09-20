import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { JOB_STATUSES } from "@/lib/jobFilters";
import { statusLabel } from "@/lib/documents";
import { statusColors } from "@/lib/statusColors";

/**
 * Status dropdown with the same color coding as badges / cards.
 */
export default function StatusSelect({
  value,
  onValueChange,
  statuses = JOB_STATUSES,
  entity = undefined,
  className = undefined,
  triggerClassName = undefined,
  formatLabel = undefined,
}) {
  const opts = entity ? { entity } : {};
  const current = statusColors(value, opts);
  const labelFor = (s) => (formatLabel ? formatLabel(s) : (entity ? statusLabel(s) : s));
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={cn(
          "border-2 font-medium",
          current.border,
          current.badge,
          triggerClassName,
          className
        )}
      >
        <SelectValue>{labelFor(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {statuses.map((s) => {
          const c = statusColors(s, opts);
          return (
            <SelectItem key={s} value={s} className={cn("font-medium", c.select)}>
              <span className="inline-flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full shrink-0", c.swatch)} aria-hidden="true" />
                {labelFor(s)}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
