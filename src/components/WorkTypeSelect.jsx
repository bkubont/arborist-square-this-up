import React, { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkTypes } from "@/hooks/useWorkTypes";
import { normalizeWorkType, UNASSIGNED_WORK_TYPE, workTypeLabel } from "@/lib/workTypes";
import { cn } from "@/lib/utils";

/**
 * Trade picker (plumbing, electrical, drywall, …) from the handyman catalog.
 *
 * @param {{ value?: string, onValueChange: (value: string) => void, className?: string, triggerClassName?: string, allowEmpty?: boolean, disabled?: boolean, placeholder?: string }} props
 */
export default function WorkTypeSelect({
  value = "",
  onValueChange,
  className = undefined,
  triggerClassName = undefined,
  allowEmpty = true,
  disabled = false,
  placeholder = "Select trade…",
}) {
  const { types, loading } = useWorkTypes();
  const selected = normalizeWorkType(value);
  const options = useMemo(() => {
    const list = [...types];
    const trimmed = String(value || "").trim();
    if (trimmed && !list.includes(trimmed)) list.unshift(trimmed);
    return list;
  }, [types, value]);

  const pick = (next) => onValueChange(next === UNASSIGNED_WORK_TYPE ? "" : next);

  return (
    <Select
      value={selected}
      onValueChange={pick}
      disabled={disabled || loading}
    >
      <SelectTrigger className={cn("w-full font-normal", triggerClassName, className)}>
        <SelectValue placeholder={placeholder}>
          {selected === UNASSIGNED_WORK_TYPE ? placeholder : workTypeLabel(selected)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {allowEmpty && <SelectItem value={UNASSIGNED_WORK_TYPE}>Unassigned</SelectItem>}
        {options.map((type) => (
          <SelectItem key={type} value={type}>{type}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
