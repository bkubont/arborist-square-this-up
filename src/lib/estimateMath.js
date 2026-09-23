/** Estimate line totals (dual model: material + labor + equipment per row). */

/** Catalog / fallback labor rate when company profile has none. */
export const DEFAULT_LABOR_RATE = 55;

/** Valid-until default: creation (or estimate) date + N days. */
export const ESTIMATE_VALID_DAYS = 10;

/** @param {string} isoDate YYYY-MM-DD @param {number} days */
export function addDaysIso(isoDate, days = ESTIMATE_VALID_DAYS) {
  const base = String(isoDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return "";
  const d = new Date(`${base}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Round money to cents. */
export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Est. Labor from hrs × rate (catalog / default). Keeps hours for WO mapping.
 * @param {string|number} hours
 * @param {string|number} [rate]
 * @param {number} [fallbackRate]
 */
export function laborAmountFromHours(hours, rate, fallbackRate = DEFAULT_LABOR_RATE) {
  const h = Number(hours);
  if (!Number.isFinite(h) || hours === "" || hours == null) return "";
  const r = Number(rate);
  const useRate = Number.isFinite(r) && r > 0 ? r : fallbackRate;
  return String(roundMoney(h * useRate));
}

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
    // Round-tripped, not editable here yet (stage 3 checklist UI) — must not be dropped on save,
    // or a signed line's id/steps would silently vanish the next time this estimate is saved.
    id: line.id || undefined,
    steps: line.steps || undefined,
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

export function catalogItemToFormLine(item, fallbackRate = DEFAULT_LABOR_RATE) {
  const hours = item.hours_mid;
  const rate = item.labor_rate ?? fallbackRate;
  const labor = item.est_labor_cost ?? (hours != null ? hours * rate : "");
  const materials = item.est_materials_cost;
  const noteParts = [
    item.notes,
    item.materials_note,
    item.materials_flag ? `Materials: ${item.materials_flag}` : "",
    item.tools ? `Tools: ${item.tools}` : "",
  ].filter(Boolean);
  return {
    description: item.task || "",
    material_amount: materials != null && materials !== "" ? String(roundMoney(materials)) : "",
    labor_amount: labor === "" ? "" : String(roundMoney(labor)),
    equipment_amount: "",
    labor_hours: hours != null ? String(hours) : "",
    labor_rate: rate != null ? String(rate) : "",
    category: item.category || "",
    notes: noteParts.join(" · "),
    tools: item.tools || "",
    catalog_id: item.id || "",
  };
}
