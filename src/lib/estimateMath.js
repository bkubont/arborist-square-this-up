/** Estimate line totals — whole-line amount per row (materials included). */

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
 * Whole-line amount for one estimate row (materials included).
 * Legacy rows may still store material + labor separately; those are summed on read.
 */
export function estimateLineAmount(line = {}) {
  if (line.line_amount !== "" && line.line_amount != null) {
    return Number(line.line_amount) || 0;
  }
  return Number(line.material_amount || 0) + Number(line.labor_amount || 0) + Number(line.equipment_amount || 0);
}

/** @deprecated alias — use estimateLineAmount */
export function lineTotal(line = {}) {
  return estimateLineAmount(line);
}

/**
 * Suggested line amount from hrs × rate (catalog / default). Hours kept for WO mapping.
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

/** @param {Array<{material_amount?: number, labor_amount?: number, equipment_amount?: number, line_amount?: number}>} lines
 *  @param {string|number} [taxRate] */
export function estimateTotals(lines = [], taxRate = 0) {
  const subtotal = lines.reduce((sum, line) => sum + estimateLineAmount(line), 0);
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
    line_amount: "",
    labor_hours: "",
    labor_rate: "",
    category: "",
    notes: "",
    tools: "",
    catalog_id: "",
  };
}

/** True when a stored row is a legacy materials-only line (no longer shown separately). */
export function isLegacyMaterialOnlyLine(line = {}) {
  const desc = String(line.description || "").trim();
  const labor = Number(line.labor_amount) || 0;
  const material = Number(line.material_amount) || 0;
  const hours = Number(line.labor_hours) || 0;
  if (/^materials?$/i.test(desc)) return true;
  return material > 0 && labor === 0 && hours === 0;
}

/**
 * Load estimate lines for the editor: whole-line rows, merging legacy materials-only lines
 * into the previous scope line.
 */
export function normalizeEstimateLinesForEditor(lines = []) {
  const out = [];
  for (const raw of lines) {
    if (isLegacyMaterialOnlyLine(raw) && out.length) {
      const prev = out[out.length - 1];
      const add = estimateLineAmount(raw);
      const current = Number(prev.line_amount) || 0;
      prev.line_amount = add > 0 ? String(roundMoney(current + add)) : prev.line_amount;
      continue;
    }
    out.push(fromApiEstimateLine(raw));
  }
  return out.length ? out : [emptyEstimateLine()];
}

/** Map stored estimate line → editor form row (merged whole-line amount). */
export function fromApiEstimateLine(line = {}) {
  const amount = estimateLineAmount(line);
  return {
    description: line.description || "",
    line_amount: amount > 0 ? String(roundMoney(amount)) : "",
    labor_hours: line.labor_hours ?? "",
    labor_rate: line.labor_rate ?? "",
    category: line.category || "",
    notes: line.notes || "",
    tools: line.tools || "",
    catalog_id: line.catalog_id || "",
  };
}

/** Normalize form line strings → API numbers (whole line stored in labor_amount). */
export function serializeEstimateLine(line) {
  const num = (v) => (v === "" || v == null ? undefined : Number(v));
  const amount = num(line.line_amount);
  return {
    description: line.description || "",
    material_amount: undefined,
    labor_amount: amount,
    equipment_amount: undefined,
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
  const labor = item.est_labor_cost ?? (hours != null ? hours * rate : 0);
  const materials = Number(item.est_materials_cost) || 0;
  const wholeLine = roundMoney(Number(labor || 0) + materials);
  const noteParts = [
    item.notes,
    item.materials_note,
    item.materials_flag ? `Materials: ${item.materials_flag}` : "",
    item.tools ? `Tools: ${item.tools}` : "",
  ].filter(Boolean);
  return {
    description: item.task || "",
    line_amount: wholeLine > 0 ? String(wholeLine) : "",
    labor_hours: hours != null ? String(hours) : "",
    labor_rate: rate != null ? String(rate) : "",
    category: item.category || "",
    notes: noteParts.join(" · "),
    tools: item.tools || "",
    catalog_id: item.id || "",
  };
}
