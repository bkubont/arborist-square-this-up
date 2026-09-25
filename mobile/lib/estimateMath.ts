/** Estimate / change-order line math — mirrors src/lib/estimateMath.js (field essentials). */

export const ESTIMATE_VALID_DAYS = 10;
export const DEFAULT_LABOR_RATE = 55;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(isoDate: string, days = ESTIMATE_VALID_DAYS): string {
  const base = String(isoDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return '';
  const d = new Date(`${base}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

export function roundMoney(n: number | string | null | undefined): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export type ScopeLineForm = {
  id?: string;
  steps?: unknown;
  description: string;
  line_amount: string;
  labor_hours: string;
  labor_rate: string;
  category: string;
  notes: string;
  tools: string;
  catalog_id: string;
  amount?: string;
};

export function emptyEstimateLine(): ScopeLineForm {
  return {
    description: '',
    line_amount: '',
    labor_hours: '',
    labor_rate: '',
    category: '',
    notes: '',
    tools: '',
    catalog_id: '',
  };
}

export function estimateLineAmount(line: {
  line_amount?: number | string | null;
  material_amount?: number | string | null;
  labor_amount?: number | string | null;
  equipment_amount?: number | string | null;
} = {}): number {
  if (line.line_amount !== '' && line.line_amount != null) {
    return Number(line.line_amount) || 0;
  }
  return (
    Number(line.material_amount || 0) +
    Number(line.labor_amount || 0) +
    Number(line.equipment_amount || 0)
  );
}

export function estimateTotals(
  lines: Array<Record<string, unknown>> = [],
  taxRate: number | string = 0,
) {
  const subtotal = lines.reduce((sum, line) => sum + estimateLineAmount(line as Parameters<typeof estimateLineAmount>[0]), 0);
  const rate = Number(taxRate) || 0;
  const tax_amount = Math.round(subtotal * (rate / 100) * 100) / 100;
  const total = Math.round((subtotal + tax_amount) * 100) / 100;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax_amount,
    total,
  };
}

export function fromApiEstimateLine(line: Record<string, unknown> = {}): ScopeLineForm {
  const amount = estimateLineAmount(line as Parameters<typeof estimateLineAmount>[0]);
  return {
    id: typeof line.id === 'string' ? line.id : undefined,
    steps: line.steps,
    description: String(line.description || ''),
    line_amount: amount > 0 ? String(roundMoney(amount)) : '',
    labor_hours: line.labor_hours != null ? String(line.labor_hours) : '',
    labor_rate: line.labor_rate != null ? String(line.labor_rate) : '',
    category: String(line.category || ''),
    notes: String(line.notes || ''),
    tools: String(line.tools || ''),
    catalog_id: String(line.catalog_id || ''),
  };
}

/** Whole-line amount stored in labor_amount; preserves id/steps for round-trip. */
export function serializeEstimateLine(line: ScopeLineForm) {
  const num = (v: string | number | undefined | null) =>
    (v === '' || v == null ? undefined : Number(v));
  const amount = num(line.line_amount);
  return {
    id: line.id || undefined,
    steps: line.steps,
    description: line.description || '',
    material_amount: undefined as number | undefined,
    labor_amount: amount,
    equipment_amount: undefined as number | undefined,
    labor_hours: num(line.labor_hours),
    labor_rate: num(line.labor_rate),
    category: line.category || undefined,
    notes: line.notes || undefined,
    tools: line.tools || undefined,
    catalog_id: line.catalog_id || undefined,
  };
}

export function serializeChangeOrderLine(line: ScopeLineForm) {
  const out = serializeEstimateLine(line);
  if (
    out.material_amount != null ||
    out.labor_amount != null ||
    out.equipment_amount != null ||
    line.amount === '' ||
    line.amount == null
  ) {
    return out;
  }
  return { ...out, amount: Number(line.amount) };
}

export function changeOrderNet({
  added_cost,
  credit,
  net_change,
}: {
  added_cost?: number | string | null;
  credit?: number | string | null;
  net_change?: number | string | null;
} = {}): number {
  if (net_change != null && net_change !== '') return Number(net_change);
  return Math.round(((Number(added_cost) || 0) - (Number(credit) || 0)) * 100) / 100;
}

export function materialOrderLineAmount(line: {
  qty?: number | string | null;
  unit_price?: number | string | null;
} = {}): number {
  return roundMoney((Number(line.qty) || 0) * (Number(line.unit_price) || 0));
}

export function invoiceLineMaterialsTotal(
  lines: Array<{ qty?: number | null; unit_price?: number | null }> = [],
): number {
  return roundMoney(lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unit_price) || 0), 0));
}

export function invoiceLineLaborTotal(
  lines: Array<{ hours?: number | null; rate?: number | null }> = [],
): number {
  return roundMoney(lines.reduce((sum, line) => sum + (Number(line.hours) || 0) * (Number(line.rate) || 0), 0));
}

export function invoiceLineMiscTotal(lines: Array<{ amount?: number | null }> = []): number {
  return roundMoney(lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0));
}

export function invoiceTotals({
  material_lines = [],
  labor_lines = [],
  misc_lines = [],
  tax_rate = 0,
  deposits_applied = 0,
  payments_applied = 0,
}: {
  material_lines?: Array<{ qty?: number | null; unit_price?: number | null }>;
  labor_lines?: Array<{ hours?: number | null; rate?: number | null }>;
  misc_lines?: Array<{ amount?: number | null }>;
  tax_rate?: number | string;
  deposits_applied?: number | string;
  payments_applied?: number | string;
} = {}) {
  const materials_total = invoiceLineMaterialsTotal(material_lines);
  const labor_total = invoiceLineLaborTotal(labor_lines);
  const misc_total = invoiceLineMiscTotal(misc_lines);
  const subtotal = roundMoney(materials_total + labor_total + misc_total);
  const tax_amount = roundMoney(Math.max(0, subtotal) * ((Number(tax_rate) || 0) / 100));
  const total = roundMoney(Math.max(0, subtotal) + tax_amount);
  const balance_due = roundMoney(
    Math.max(0, total - (Number(deposits_applied) || 0) - (Number(payments_applied) || 0)),
  );
  return { materials_total, labor_total, misc_total, subtotal, tax_amount, total, balance_due };
}

export type CatalogLike = {
  id?: string;
  task?: string;
  category?: string;
  notes?: string;
  tools?: string;
  materials_note?: string;
  materials_flag?: string;
  hours_mid?: number;
  labor_rate?: number;
  est_labor_cost?: number;
  est_materials_cost?: number;
};

/** Map catalog row → estimate/CO form line (whole-line amount). */
export function catalogItemToFormLine(
  item: CatalogLike,
  fallbackRate = DEFAULT_LABOR_RATE,
): ScopeLineForm {
  const hours = item.hours_mid;
  const rate = item.labor_rate ?? fallbackRate;
  const labor = item.est_labor_cost ?? (hours != null ? hours * rate : 0);
  const materials = Number(item.est_materials_cost) || 0;
  const wholeLine = roundMoney(Number(labor || 0) + materials);
  const noteParts = [
    item.notes,
    item.materials_note,
    item.materials_flag ? `Materials: ${item.materials_flag}` : '',
    item.tools ? `Tools: ${item.tools}` : '',
  ].filter(Boolean);
  return {
    description: item.task || '',
    line_amount: wholeLine > 0 ? String(wholeLine) : '',
    labor_hours: hours != null ? String(hours) : '',
    labor_rate: rate != null ? String(rate) : '',
    category: item.category || '',
    notes: noteParts.join(' · '),
    tools: item.tools || '',
    catalog_id: item.id || '',
  };
}

/** Map catalog row → material-order / invoice material line essentials. */
export function catalogItemToMaterialLine(item: CatalogLike) {
  const unit = Number(item.est_materials_cost) || 0;
  return {
    description: item.task || '',
    qty: 1,
    unit_price: unit > 0 ? unit : undefined,
    notes: [item.materials_note, item.notes].filter(Boolean).join(' · ') || undefined,
    category: item.category || undefined,
  };
}

/** Map catalog row → invoice labor line essentials. */
export function catalogItemToLaborLine(item: CatalogLike, fallbackRate = DEFAULT_LABOR_RATE) {
  const hours = item.hours_mid;
  const rate = item.labor_rate ?? fallbackRate;
  return {
    description: item.task || '',
    hours: hours != null ? hours : undefined,
    rate: rate != null ? rate : undefined,
  };
}
