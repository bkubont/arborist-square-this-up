/**
 * Dual-model mapping: Estimate lines ↔ Work Order lines (Decision #2).
 * Assistive only — all values remain editable after carryover.
 */

import { resolveSalesTaxRate } from './salesTax.js';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
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
 * Baseline is typically the accepted estimate total (tax-inclusive).
 */
export function computeAuthorizedTotal(acceptedEstimateTotal, changeOrders = []) {
  const baseline = Number(acceptedEstimateTotal) || 0;
  const approvedNet = changeOrders
    .filter(co => co.status === 'approved')
    .reduce((sum, co) => sum + changeOrderNet(co), 0);
  return Math.round((baseline + approvedNet) * 100) / 100;
}

/** Sum of approved change-order nets (pre-tax dollars). */
export function approvedChangeOrderNet(changeOrders = []) {
  return round2(
    changeOrders
      .filter(co => co.status === 'approved')
      .reduce((sum, co) => sum + changeOrderNet(co), 0),
  );
}

/**
 * Billing ceiling for soft-warn: authorized total plus tax on positive CO nets.
 * Estimate baseline is already tax-inclusive; CO nets are pre-tax and get taxed
 * when folded into invoice misc — without this, a correct full-bill can false-warn.
 */
export function authorizedBillingCeiling(acceptedEstimateTotal, changeOrders = [], taxRate = 0) {
  const baseline = Number(acceptedEstimateTotal) || 0;
  const approvedNet = approvedChangeOrderNet(changeOrders);
  const coTax = approvedNet > 0
    ? round2(approvedNet * ((Number(taxRate) || 0) / 100))
    : 0;
  return round2(baseline + approvedNet + coTax);
}

/** Soft over-authorized check using the tax-aware billing ceiling. */
export function isOverAuthorized(invoiceTotal, acceptedEstimateTotal, changeOrders = [], taxRate = 0) {
  const ceiling = authorizedBillingCeiling(acceptedEstimateTotal, changeOrders, taxRate);
  return Number(invoiceTotal) > ceiling + 0.009;
}

/** Derive invoice lifecycle status from balance / payments (progress billing). */
export function deriveInvoiceStatus({ balance_due, payments_applied, deposits_applied, status } = /** @type {{balance_due?: number|string, payments_applied?: number|string, deposits_applied?: number|string, status?: string}} */ ({})) {
  if (status === 'void') return 'void';
  const balance = Number(balance_due);
  const applied = (Number(payments_applied) || 0) + (Number(deposits_applied) || 0);
  if (Number.isFinite(balance) && balance <= 0.009 && (status === 'sent' || status === 'partial' || status === 'paid' || applied > 0)) {
    return 'paid';
  }
  if (status === 'paid') return 'paid';
  if ((status === 'sent' || status === 'partial') && applied > 0 && Number.isFinite(balance) && balance > 0.009) {
    return 'partial';
  }
  return status || 'draft';
}

/** Sum totals of non-void invoices (for progress / cumulative billing checks). */
export function sumActiveInvoiceTotals(invoices = []) {
  return round2(
    invoices
      .filter(inv => inv && inv.status !== 'void')
      .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0),
  );
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
 * @param {object[]} [args.existingInvoices] non-void prior invoices for progress billing
 * @returns {{ invoice: object, authorized_total: number, billing_ceiling: number, prior_invoiced: number, over_authorized: boolean }}
 */
export function buildInvoiceAutofill({
  job,
  estimate,
  approvedChangeOrders = [],
  company,
  deposits_applied = 0,
  payments_applied = 0,
  number,
  existingInvoices = [],
} = {}) {
  const source = estimate?.accepted_snapshot || estimate || {};
  const tables = estimateLinesToInvoiceTables(source.lines || []);
  const co = approvedChangeOrdersToInvoiceMisc(approvedChangeOrders);
  const material_lines = tables.material_lines;
  const labor_lines = tables.labor_lines;
  const misc_lines = [...tables.misc_lines, ...co.misc_lines];
  const tax_rate = source.tax_rate ?? estimate?.tax_rate ?? resolveSalesTaxRate(company);
  const totals = invoiceTotals({
    material_lines, labor_lines, misc_lines, tax_rate,
    deposits_applied, payments_applied,
  });
  const baseline = Number(source.total ?? estimate?.total) || 0;
  const authorized_total = computeAuthorizedTotal(baseline, approvedChangeOrders);
  const billing_ceiling = authorizedBillingCeiling(baseline, approvedChangeOrders, tax_rate);
  const prior_invoiced = sumActiveInvoiceTotals(existingInvoices);
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
    billing_ceiling,
    prior_invoiced,
    // Cumulative check: prior active invoices + this draft vs tax-aware ceiling
    over_authorized: prior_invoiced + totals.total > billing_ceiling + 0.009,
  };
}

/** Stable key for MO lines synced from Estimate / WO / CO. */
export function materialOrderSourceKey(line = {}) {
  if (!line.source_entity || line.source_id == null || line.source_line_index == null) return null;
  return `${line.source_entity}:${line.source_id}:${line.source_line_index}`;
}

/** Estimate material $ → MO lines (qty 1 × unit_price). Does not invent prices. */
export function materialLinesFromEstimate(estimate) {
  if (!estimate?.id) return [];
  const source = estimate.accepted_snapshot || estimate;
  const lines = source.lines || [];
  return lines.flatMap((line, index) => {
    const material = num(line.material_amount);
    if (material == null || material <= 0) return [];
    return [{
      description: line.description || 'Materials',
      qty: 1,
      unit_price: material,
      category: line.category || undefined,
      notes: line.notes || undefined,
      source_entity: 'Estimate',
      source_id: estimate.id,
      source_line_index: index,
      on_hand: false,
    }];
  });
}

/** WO material lines → MO lines; Line# = 1-based WO line index. */
export function materialLinesFromWorkOrder(workOrder) {
  if (!workOrder?.id) return [];
  return (workOrder.lines || []).flatMap((line, index) => {
    if (line.kind !== 'material') return [];
    const qty = num(line.qty);
    const unit_price = num(line.unit_price);
    if (!line.description && qty == null && unit_price == null) return [];
    return [{
      description: line.description || 'Materials',
      qty,
      unit_price,
      category: line.work_category || undefined,
      notes: line.notes || undefined,
      wo_line_number: index + 1,
      source_entity: 'WorkOrder',
      source_id: workOrder.id,
      source_line_index: index,
      on_hand: false,
    }];
  });
}

/** Change Order amount lines → MO materials (credits skipped). */
export function materialLinesFromChangeOrder(changeOrder) {
  if (!changeOrder?.id) return [];
  return (changeOrder.lines || []).flatMap((line, index) => {
    const amount = num(line.amount);
    if (amount != null && amount < 0) return [];
    if (!line.description && (amount == null || amount === 0)) return [];
    return [{
      description: line.description || 'Change order materials',
      qty: 1,
      unit_price: amount != null && amount > 0 ? amount : undefined,
      source_entity: 'ChangeOrder',
      source_id: changeOrder.id,
      source_line_index: index,
      on_hand: false,
    }];
  });
}

/**
 * Collect job materials for MO autofill.
 * Prefer active WO materials when present; otherwise estimate materials.
 * Change orders: latest revision per number stem only (avoids original + revise draft dupes).
 * @param {{ estimate?: object|null, workOrder?: object|null, changeOrders?: object[] }} [args]
 */
export function collectJobMaterialLines({ estimate = null, workOrder = null, changeOrders = [] } = {}) {
  const out = [];
  const woActive = workOrder && workOrder.status !== 'void';
  const woMaterials = woActive ? materialLinesFromWorkOrder(workOrder) : [];
  if (woMaterials.length) {
    out.push(...woMaterials);
  } else if (estimate && estimate.status !== 'void') {
    out.push(...materialLinesFromEstimate(estimate));
  }
  for (const co of selectChangeOrdersForMaterials(changeOrders)) {
    out.push(...materialLinesFromChangeOrder(co));
  }
  return out;
}

/** Latest non-void / non-rejected CO per number stem (CO-001 vs CO-001-R2 → R2 only). */
export function selectChangeOrdersForMaterials(changeOrders = []) {
  const live = (changeOrders || []).filter((co) => co && co.status !== 'void' && co.status !== 'rejected');
  const byStem = new Map();
  for (const co of live) {
    const number = String(co.number || co.id || '');
    const match = /^(.*?)(?:-R(\d+))?$/.exec(number);
    const stem = match?.[1] || number || co.id;
    const rev = match?.[2] ? Number(match[2]) : 1;
    const prev = byStem.get(stem);
    if (!prev || rev > prev.rev) byStem.set(stem, { co, rev });
  }
  return [...byStem.values()].map((row) => row.co);
}

/** Fingerprint for matching legacy unkeyed MO lines to incoming autofill. */
export function materialOrderLineFingerprint(line = {}) {
  let desc = String(line.description || '').trim().toLowerCase();
  desc = desc.replace(/\s*\((materials|equipment)\)\s*$/i, '');
  if (!desc) return null;
  const qty = num(line.qty);
  const price = num(line.unit_price);
  return `${desc}|${qty ?? ''}|${price ?? ''}`;
}

/**
 * Merge incoming source lines into an MO line list.
 * Adopts matching legacy unkeyed rows instead of appending duplicates.
 */
export function mergeMaterialOrderLines(existingLines = [], incomingLines = []) {
  const remaining = existingLines.map((line, index) => ({ line, index }));
  const synced = [];

  for (const incoming of incomingLines) {
    const key = materialOrderSourceKey(incoming);
    let matchIdx = -1;
    if (key) {
      matchIdx = remaining.findIndex(({ line }) => materialOrderSourceKey(line) === key);
    }
    if (matchIdx < 0) {
      const fp = materialOrderLineFingerprint(incoming);
      if (fp) {
        matchIdx = remaining.findIndex(({ line }) => (
          !materialOrderSourceKey(line) && materialOrderLineFingerprint(line) === fp
        ));
      }
    }
    if (matchIdx < 0) {
      const desc = String(incoming.description || '').trim().toLowerCase();
      if (desc) {
        matchIdx = remaining.findIndex(({ line }) => (
          !materialOrderSourceKey(line)
          && String(line.description || '').trim().toLowerCase() === desc
        ));
      }
    }

    if (matchIdx >= 0) {
      const [{ line: prev }] = remaining.splice(matchIdx, 1);
      synced.push({
        ...incoming,
        supplier: prev.supplier || incoming.supplier,
        on_hand: prev.on_hand ?? false,
        line_status: prev.line_status || incoming.line_status,
        notes: prev.notes || incoming.notes,
      });
    } else {
      synced.push({ ...incoming, on_hand: incoming.on_hand ?? false });
    }
  }

  const manual = remaining
    .filter(({ line }) => !materialOrderSourceKey(line))
    .map(({ line }) => line);
  return [...synced, ...manual];
}

/**
 * Drop incoming autofill rows already present on other non-void Material Orders.
 */
export function filterIncomingNotClaimedElsewhere(incomingLines = [], otherOrders = []) {
  const claimedKeys = new Set();
  const claimedFingerprints = new Set();
  for (const order of otherOrders) {
    if (!order || order.status === 'void') continue;
    for (const line of order.lines || []) {
      const key = materialOrderSourceKey(line);
      if (key) claimedKeys.add(key);
      const fp = materialOrderLineFingerprint(line);
      if (fp) claimedFingerprints.add(fp);
    }
  }
  return incomingLines.filter((line) => {
    const key = materialOrderSourceKey(line);
    if (key && claimedKeys.has(key)) return false;
    const fp = materialOrderLineFingerprint(line);
    if (fp && claimedFingerprints.has(fp)) return false;
    return true;
  });
}

export function materialOrderLineAmount(line = {}) {
  return round2((num(line.qty) || 0) * (num(line.unit_price) || 0));
}

export function materialOrderTotals(lines = []) {
  const subtotal = round2(lines.reduce((sum, line) => sum + materialOrderLineAmount(line), 0));
  return { subtotal, total: subtotal };
}
