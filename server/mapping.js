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

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Map estimate lines into invoice materials / labor / misc tables. */
export function estimateLinesToInvoiceTables(lines = []) {
  const material_lines = [];
  const labor_lines = [];
  const misc_lines = [];
  for (const line of lines) {
    const description = line.description || '';
    const material = num(line.material_amount);
    if (material != null && material > 0) {
      material_lines.push({ description: description || 'Materials', qty: 1, unit_price: material });
    }
    const hours = num(line.labor_hours);
    const rate = num(line.labor_rate);
    const laborAmount = num(line.labor_amount);
    if (hours != null || rate != null || laborAmount != null) {
      let h = hours;
      let r = rate;
      if (h == null && laborAmount != null && r != null && r > 0) h = round2(laborAmount / r);
      if (r == null && laborAmount != null && h != null && h > 0) r = round2(laborAmount / h);
      if (h == null && laborAmount != null) { h = 1; r = laborAmount; }
      labor_lines.push({ description: description || 'Labor', hours: h, rate: r });
    }
    const equipment = num(line.equipment_amount);
    if (equipment != null && equipment > 0) {
      misc_lines.push({ description: description ? `${description} (equipment)` : 'Equipment rental', amount: equipment });
    }
  }
  return { material_lines, labor_lines, misc_lines };
}

/** Fold approved change orders into invoice tables (Decision #6). */
export function approvedChangeOrdersToInvoiceMisc(changeOrders = []) {
  const misc_lines = [];
  const billed_ids = [];
  const refs = [];
  for (const co of changeOrders.filter(c => c.status === 'approved')) {
    billed_ids.push(co.id);
    if (co.number) refs.push(co.number);
    const lines = Array.isArray(co.accepted_snapshot?.lines) ? co.accepted_snapshot.lines
      : Array.isArray(co.lines) ? co.lines : [];
    const detailed = lines.filter(l => l && (l.description || l.amount != null));
    if (detailed.length) {
      for (const line of detailed) {
        misc_lines.push({
          description: line.description || `Change order ${co.number || ''}`.trim(),
          amount: num(line.amount) ?? 0,
        });
      }
    } else {
      const net = changeOrderNet(co);
      if (net !== 0) {
        misc_lines.push({
          description: `Change order ${co.number || ''}${co.description ? `: ${co.description}` : ''}`.trim(),
          amount: net,
        });
      }
    }
  }
  return { misc_lines, billed_change_order_ids: billed_ids, change_order_refs: refs.join(', ') };
}

export function invoiceLineMaterialsTotal(lines = []) {
  return round2(lines.reduce((sum, line) => sum + (num(line.qty) || 0) * (num(line.unit_price) || 0), 0));
}

export function invoiceLineLaborTotal(lines = []) {
  return round2(lines.reduce((sum, line) => sum + (num(line.hours) || 0) * (num(line.rate) || 0), 0));
}

export function invoiceLineMiscTotal(lines = []) {
  return round2(lines.reduce((sum, line) => sum + (num(line.amount) || 0), 0));
}

/** @param {object} opts */
export function invoiceTotals({ material_lines = [], labor_lines = [], misc_lines = [], tax_rate = 0, deposits_applied = 0, payments_applied = 0 } = {}) {
  const materials_total = invoiceLineMaterialsTotal(material_lines);
  const labor_total = invoiceLineLaborTotal(labor_lines);
  const misc_total = invoiceLineMiscTotal(misc_lines);
  const subtotal = round2(materials_total + labor_total + misc_total);
  const tax_amount = round2(Math.max(0, subtotal) * ((Number(tax_rate) || 0) / 100));
  const total = round2(Math.max(0, subtotal) + tax_amount);
  const balance_due = round2(Math.max(0, total - (Number(deposits_applied) || 0) - (Number(payments_applied) || 0)));
  return { materials_total, labor_total, misc_total, subtotal, tax_amount, total, balance_due };
}

/**
 * Build invoice payload from accepted estimate + approved COs.
 * @param {object} [args]
 * @param {object} [args.job]
 * @param {object} [args.estimate]
 * @param {object[]} [args.approvedChangeOrders]
 * @param {object} [args.company]
 * @param {number|string} [args.deposits_applied]
 * @param {number|string} [args.payments_applied]
 * @param {string} [args.number]
 * @returns {{ invoice: object, authorized_total: number, over_authorized: boolean }}
 */
export function buildInvoiceAutofill({
  job,
  estimate,
  approvedChangeOrders = [],
  company,
  deposits_applied = 0,
  payments_applied = 0,
  number,
} = {}) {
  const source = estimate?.accepted_snapshot || estimate || {};
  const tables = estimateLinesToInvoiceTables(source.lines || []);
  const co = approvedChangeOrdersToInvoiceMisc(approvedChangeOrders);
  const material_lines = tables.material_lines;
  const labor_lines = tables.labor_lines;
  const misc_lines = [...tables.misc_lines, ...co.misc_lines];
  const tax_rate = source.tax_rate ?? estimate?.tax_rate ?? company?.default_tax_rate;
  const totals = invoiceTotals({
    material_lines, labor_lines, misc_lines, tax_rate,
    deposits_applied, payments_applied,
  });
  const baseline = Number(source.total ?? estimate?.total) || 0;
  const authorized_total = computeAuthorizedTotal(baseline, approvedChangeOrders);
  const invoice = {
    job_id: job?.id,
    number,
    date: new Date().toISOString().slice(0, 10),
    status: 'draft',
    notes: source.notes || job?.notes || '',
    payment_terms: company?.default_payment_terms || '',
    tax_rate,
    related_estimate_id: estimate?.id,
    billed_change_order_ids: co.billed_change_order_ids,
    project_name: job?.title || '',
    estimate_ref: source.number || estimate?.number || '',
    change_order_refs: co.change_order_refs,
    deposits_applied,
    payments_applied,
    material_lines,
    labor_lines,
    misc_lines,
    ...totals,
  };
  return {
    invoice,
    authorized_total,
    over_authorized: totals.total > authorized_total + 0.009,
  };
}
