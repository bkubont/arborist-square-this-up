/**
 * Dual-model mapping: Estimate lines ↔ Work Order lines (Decision #2).
 * Assistive only — all values remain editable after carryover.
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Map one estimate line into zero or more WO lines (labor / material / equipment). */
export function estimateLineToWorkOrderLines(line = {}) {
  const out = [];
  const description = line.description || '';
  const work_category = line.category || '';
  const notes = [line.notes, line.tools ? `Tools: ${line.tools}` : ''].filter(Boolean).join(' · ') || undefined;
  const base = { description, work_category, notes, catalog_id: line.catalog_id };

  const hours = num(line.labor_hours);
  const rate = num(line.labor_rate);
  const laborAmount = num(line.labor_amount);
  if (hours != null || rate != null || laborAmount != null) {
    let h = hours;
    let r = rate;
    if (h == null && laborAmount != null && r != null && r > 0) h = Math.round((laborAmount / r) * 100) / 100;
    if (r == null && laborAmount != null && h != null && h > 0) r = Math.round((laborAmount / h) * 100) / 100;
    if (h == null && laborAmount != null) {
      // Amount-only labor row: 1 hour at the labor amount as rate fallback
      h = 1;
      r = laborAmount;
    }
    out.push({
      kind: 'labor',
      description,
      hours: h,
      rate: r,
      work_category,
      notes,
      catalog_id: line.catalog_id,
    });
  }

  const material = num(line.material_amount);
  if (material != null && material > 0) {
    out.push({
      kind: 'material',
      description: description ? `${description} (materials)` : 'Materials',
      qty: 1,
      unit_price: material,
      work_category,
      notes,
    });
  }

  const equipment = num(line.equipment_amount);
  if (equipment != null && equipment > 0) {
    out.push({
      kind: 'material',
      description: description ? `${description} (equipment)` : 'Equipment',
      qty: 1,
      unit_price: equipment,
      work_category,
      notes: [notes, 'Mapped from estimate equipment'].filter(Boolean).join(' · '),
    });
  }

  // Description-only estimate rows still carry over as labor stubs
  if (!out.length && description) {
    out.push({ kind: 'labor', description, hours: undefined, rate: undefined, work_category, notes, ...base });
  }
  return out;
}

/** Prefill WO lines from an accepted estimate (snapshot preferred). */
export function mapEstimateToWorkOrderLines(estimate) {
  const source = estimate?.accepted_snapshot || estimate;
  const lines = source?.lines || [];
  return lines.flatMap(estimateLineToWorkOrderLines);
}

export function workOrderLineAmount(line = {}) {
  if (line.kind === 'labor') {
    const hours = num(line.hours) || 0;
    const rate = num(line.rate) || 0;
    return Math.round(hours * rate * 100) / 100;
  }
  const qty = num(line.qty) || 0;
  const price = num(line.unit_price) || 0;
  return Math.round(qty * price * 100) / 100;
}

/** @param {Array} lines @param {string|number} [taxRate] */
export function workOrderTotals(lines = [], taxRate = 0) {
  const subtotal = lines.reduce((sum, line) => sum + workOrderLineAmount(line), 0);
  const rate = Number(taxRate) || 0;
  const tax_amount = Math.round(subtotal * (rate / 100) * 100) / 100;
  const total = Math.round((subtotal + tax_amount) * 100) / 100;
  return { subtotal: Math.round(subtotal * 100) / 100, tax_amount, total };
}

/** Primary work-category options (Decision #1) — free text still allowed in UI. */
export const WORK_CATEGORIES = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'Carpentry',
  'Exterior',
  'Appliances',
  'Flooring',
  'Painting / Finishing',
  'Drywall / Finishing',
  'Garage / Doors',
  'Windows / Glass',
  'Tile',
  'Roofing',
  'Maintenance',
  'General / Punch List',
  'Other',
];

/** @param {{added_cost?: number|string, credit?: number|string, net_change?: number|string}} [fields] */
export function changeOrderNet({ added_cost, credit, net_change } = {}) {
  if (net_change != null && net_change !== '') return Number(net_change);
  return Math.round(((Number(added_cost) || 0) - (Number(credit) || 0)) * 100) / 100;
}

/**
 * Authorized contract total = accepted estimate baseline + sum(approved CO nets).
 * Unapproved COs do not enter the basis.
 */
export function computeAuthorizedTotal(acceptedEstimateTotal, changeOrders = []) {
  const baseline = Number(acceptedEstimateTotal) || 0;
  const approvedNet = changeOrders
    .filter(co => co.status === 'approved')
    .reduce((sum, co) => sum + changeOrderNet(co), 0);
  return Math.round((baseline + approvedNet) * 100) / 100;
}

export function catalogItemToWorkOrderLine(item) {
  return {
    kind: 'labor',
    description: item.task || '',
    hours: item.hours_mid != null ? item.hours_mid : undefined,
    rate: item.labor_rate ?? 55,
    work_category: item.category || '',
    notes: [item.notes, item.tools ? `Tools: ${item.tools}` : ''].filter(Boolean).join(' · '),
    catalog_id: item.id,
  };
}
