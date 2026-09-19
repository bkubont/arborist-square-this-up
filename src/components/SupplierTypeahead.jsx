import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { filterSupplierSuggestions } from "@/lib/suppliers";
import { cn } from "@/lib/utils";

/**
 * Supplier typeahead from curated seed / catalog labels only.
 * Free text always allowed — no organic history learning.
 */
export default function SupplierTypeahead({
  value,
  onChange,
  placeholder = "Supplier",
  className,
  inputClassName,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const suggestions = filterSupplierSuggestions(value, { limit: 8 });
  const showList = open && !disabled && suggestions.length > 0;

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className={cn("relative min-w-0", className)}>
      <Input
        className={cn("bg-white", inputClassName)}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        onChange={(e) => {
          onChange?.(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {showList && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange?.(name);
                setOpen(false);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
