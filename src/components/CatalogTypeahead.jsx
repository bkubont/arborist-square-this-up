import React, { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Inline catalog typeahead — type in description; click a suggestion to fill the line.
 * No separate search button.
 * @param {{ value: string, onChange: (v: string) => void, onPick: (item: object) => void, placeholder?: string, className?: string, inputClassName?: string }} props
 */
export default function CatalogTypeahead({
  value,
  onChange,
  onPick,
  placeholder = "Description — start typing to search catalog…",
  className,
  inputClassName,
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const q = String(value || "").trim();

  useEffect(() => {
    if (q.length < 2) {
      setItems([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await api.catalog.search({ q, limit: 8 });
        if (!cancelled) setItems(data.items || []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const showList = open && q.length >= 2 && (loading || items.length > 0);

  return (
    <div ref={wrapRef} className={cn("relative flex-1 min-w-0", className)}>
      <Input
        className={cn("bg-white", inputClassName)}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange?.(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {showList && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
          {loading && items.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">Searching catalog…</div>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick?.(item);
                setOpen(false);
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{item.task}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {item.category}
                    {item.avg_time ? ` · ${item.avg_time}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold text-slate-700">{money(item.est_labor_cost)}</div>
                  {item.est_materials_cost != null && (
                    <div className="text-[10px] text-slate-500">
                      +{money(item.est_materials_cost)} mat
                      {item.materials_flag ? " *" : ""}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
