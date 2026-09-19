import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";

/**
 * Catalog search → fill for Estimate / Work Order lines (Decision #5).
 * Materials / equipment stay manual — catalog is labor assist only.
 */
export default function CatalogPickerDialog({ open, onOpenChange, onPick }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [maintenance, setMaintenance] = useState("all");
  const [source, setSource] = useState("all");
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        /** @type {Record<string, string|number>} */
        const filters = { limit: 50 };
        if (q.trim()) filters.q = q.trim();
        if (category !== "all") filters.category = category;
        if (maintenance !== "all") filters.maintenance = maintenance;
        if (source !== "all") filters.source = source;
        const data = await api.catalog.search(filters);
        if (!cancelled) {
          setItems(data.items || []);
          if (data.categories?.length) setCategories(data.categories);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(run, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, q, category, maintenance, source]);

  const categoryOptions = useMemo(() => ["all", ...categories], [categories]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Catalog search</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 -mt-1">
          Search average labor costs. Fills description, labor amount, hours × rate. Materials and equipment stay blank for you to enter.
        </p>
        <div className="space-y-2">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks (e.g. faucet, filter, outlet)…"
          />
          <div className="grid grid-cols-3 gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c === "all" ? "All categories" : c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={maintenance} onValueChange={setMaintenance}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="Maintenance">Maintenance</SelectItem>
                <SelectItem value="One-off">One-off</SelectItem>
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyday + specialty</SelectItem>
                <SelectItem value="everyday">Everyday</SelectItem>
                <SelectItem value="less_frequent">Less frequent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[50vh]">
          {loading && <div className="p-4 text-sm text-slate-400">Searching…</div>}
          {!loading && items.length === 0 && <div className="p-4 text-sm text-slate-400">No matching tasks.</div>}
          {!loading && items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-amber-50 transition-colors"
              onClick={() => {
                onPick?.(item);
                onOpenChange(false);
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{item.task}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {item.category}
                    {item.maintenance ? ` · ${item.maintenance}` : ""}
                    {item.avg_time ? ` · ${item.avg_time}` : ""}
                  </div>
                </div>
                <div className="text-sm font-semibold text-slate-800 shrink-0">{money(item.est_labor_cost)}</div>
              </div>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
