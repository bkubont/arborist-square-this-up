import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CatalogTypeahead from "@/components/CatalogTypeahead";
import { WORK_CATEGORIES } from "@/lib/documentMapping";
import { money } from "@/lib/format";
import { catalogItemToFormLine, emptyEstimateLine, isPricedScopeLine, laborAmountFromHours, scopeLineTotal } from "@/lib/estimateMath";

/**
 * Priced scope lines, shared by the Estimate and Change Order editors so both work the same:
 * category, catalog-typeahead description, hours × rate → labor, material / labor amounts, notes.
 * Lines are form rows (strings); callers serialize them.
 *
 * @param {{ lines: Array<any>, setLines: (updater: (rows: Array<any>) => Array<any>) => void, readOnly?: boolean, defaultLaborRate: number, idPrefix: string }} props
 */
export default function ScopeLinesEditor({ lines, setLines, readOnly = false, defaultLaborRate, idPrefix }) {
  const setLine = (index, patch) => {
    if (readOnly) return;
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const setHours = (index, hoursValue) => {
    if (readOnly) return;
    setLines((rows) => rows.map((row, i) => {
      if (i !== index) return row;
      const rate = row.labor_rate || defaultLaborRate;
      const labor = laborAmountFromHours(hoursValue, rate, defaultLaborRate);
      return {
        ...row,
        labor_hours: hoursValue,
        labor_rate: row.labor_rate || String(defaultLaborRate),
        labor_amount: labor === "" ? row.labor_amount : labor,
      };
    }));
  };

  const addLine = () => { if (!readOnly) setLines((rows) => [...rows, emptyEstimateLine()]); };
  const removeLine = (index) => {
    if (readOnly) return;
    setLines((rows) => (rows.length <= 1 ? [emptyEstimateLine()] : rows.filter((_, i) => i !== index)));
  };
  const onCatalogPick = (index, item) => setLine(index, catalogItemToFormLine(item, defaultLaborRate));

  const field = readOnly ? "bg-slate-50" : "bg-white";

  return (
    <>
      <div className="space-y-3">
        {lines.map((line, index) => (
          <div key={index} className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(7rem,9rem)_1fr_4.5rem_auto] gap-2 items-end">
              <div>
                <Label className="text-xs">Category</Label>
                <Input
                  className={field}
                  list={readOnly ? undefined : `${idPrefix}-cat-${index}`}
                  value={line.category}
                  onChange={(e) => setLine(index, { category: e.target.value })}
                  placeholder="e.g. Plumbing"
                  readOnly={readOnly}
                />
                {!readOnly && (
                  <datalist id={`${idPrefix}-cat-${index}`}>
                    {WORK_CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                )}
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                {readOnly ? (
                  <Input className="bg-slate-50" value={line.description} readOnly />
                ) : (
                  <CatalogTypeahead
                    value={line.description}
                    onChange={(description) => setLine(index, { description, catalog_id: "" })}
                    onPick={(item) => onCatalogPick(index, item)}
                  />
                )}
              </div>
              <div>
                <Label className="text-xs">Hrs.</Label>
                <Input
                  type="number"
                  className={field}
                  value={line.labor_hours}
                  onChange={(e) => setHours(index, e.target.value)}
                  placeholder="—"
                  readOnly={readOnly}
                />
              </div>
              {!readOnly && (
                <Button type="button" variant="outline" size="icon" className="shrink-0 text-red-600 mb-0.5" aria-label="Remove line" onClick={() => removeLine(index)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Notes</Label>
                <Input className={field} value={line.notes} onChange={(e) => setLine(index, { notes: e.target.value })} readOnly={readOnly} />
              </div>
              <div>
                <Label className="text-xs">Est. Material $</Label>
                <Input type="number" className={field} value={line.material_amount} onChange={(e) => setLine(index, { material_amount: e.target.value })} placeholder="0" readOnly={readOnly} />
              </div>
              <div>
                <Label className="text-xs">Est. Labor $</Label>
                <Input type="number" className={field} value={line.labor_amount} onChange={(e) => setLine(index, { labor_amount: e.target.value })} placeholder="0" readOnly={readOnly} />
              </div>
            </div>
            <div className="text-xs text-slate-500 text-right">
              {/* Change order lines written before they had material/labor: their single amount still counts until repriced. */}
              {line.amount !== "" && line.amount != null && !isPricedScopeLine(line) && (
                <span className="mr-2">Earlier amount {money(Number(line.amount))} — enter material / labor to replace it.</span>
              )}
              Row total {money(scopeLineTotal(line))}
            </div>
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="mt-2">
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Line
          </Button>
        </div>
      )}
    </>
  );
}
