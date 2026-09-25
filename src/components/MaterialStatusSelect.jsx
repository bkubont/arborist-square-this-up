import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MATERIAL_STATUSES, materialStatusLabel, normalizeMaterialStatus } from "@/lib/materialStatus";
import { cn } from "@/lib/utils";

/**
 * Per-line materials status (needed / ordered / waiting / on hand).
 *
 * @param {{ value?: string, have?: boolean, onValueChange: (status: string) => void, className?: string, triggerClassName?: string, disabled?: boolean }} props
 */
export default function MaterialStatusSelect({
  value = undefined,
  have = false,
  onValueChange,
  className = undefined,
  triggerClassName = undefined,
  disabled = false,
}) {
  const selected = normalizeMaterialStatus({ status: value, have });
  return (
    <Select value={selected} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={cn("h-8 text-xs font-normal min-w-[6.5rem]", triggerClassName, className)}>
        <SelectValue>{materialStatusLabel(selected)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {MATERIAL_STATUSES.map((status) => (
          <SelectItem key={status} value={status} className="text-xs">
            {materialStatusLabel(status)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
