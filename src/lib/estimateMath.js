/** Estimate line totals (dual model: material + labor + equipment per row). */

export function lineTotal(line = {}) {
  return Number(line.material_amount || 0) + Number(line.labor_amount || 0) + Number(line.equipment_amount || 0);
}

/** @param {Array<{material_amount?: number, labor_amount?: number, equipment_amount?: number}>} lines
 *  @param {string|number} [taxRate] */
export function estimateTotals(lines = [], taxRate = 0) {
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const rate = Number(taxRate) || 0;
  const tax_amount = Math.round(subtotal * (rate / 100) * 100) / 100;
  const total = Math.round((subtotal + tax_amount) * 100) / 100;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax_amount,
    total,
  };
}

export function emptyEstimateLine() {
  return {
    description: "",
    material_amount: "",
    labor_amount: "",
    equipment_amount: "",
    labor_hours: "",
    labor_rate: "",
    category: "",
    notes: "",
    tools: "",
    catalog_id: "",
  };
}

/** Normalize form line strings → API numbers. */
export function serializeEstimateLine(line) {
  const num = (v) => (v === "" || v == null ? undefined : Number(v));
  return {
    description: line.description || "",
    material_amount: num(line.material_amount),
    labor_amount: num(line.labor_amount),
    equipment_amount: num(line.equipment_amount),
    labor_hours: num(line.labor_hours),
    labor_rate: num(line.labor_rate),
    category: line.category || undefined,
    notes: line.notes || undefined,
    tools: line.tools || undefined,
    catalog_id: line.catalog_id || undefined,
  };
}

export function catalogItemToFormLine(item) {
  const hours = item.hours_mid;
  const rate = item.labor_rate ?? 55;
  const labor = item.est_labor_cost ?? (hours != null ? hours * rate : "");
  const noteParts = [item.notes, item.tools ? `Tools: ${item.tools}` : ""].filter(Boolean);
  return {
    description: item.task || "",
    material_amount: "",
    labor_amount: labor === "" ? "" : String(Math.round(Number(labor) * 100) / 100),
    equipment_amount: "",
    labor_hours: hours != null ? String(hours) : "",
    labor_rate: rate != null ? String(rate) : "",
    category: item.category || "",
    notes: noteParts.join(" · "),
    tools: item.tools || "",
    catalog_id: item.id || "",
  };
}
