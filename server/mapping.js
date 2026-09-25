/**
 * Estimate / change order / invoice / material order mapping (Decision #2).
 * Assistive only — all values remain editable after carryover.
 */

import { isPricedScopeLine, scopeLineAmount } from './domain.js';
import { resolveSalesTaxRate } from './salesTax.js';
import { isMaterialOnHand } from '../shared/materialStatus.js';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** A signed line's dollar value — what "Bill completed work" snapshots onto its WorkItem. */
export function estimateLineAmount(line = {}) {
  return round2((num(line.material_amount) || 0) + (num(line.labor_amount) || 0) + (num(line.equipment_amount) || 0));
}

/** Priced like an estimate line; an older single-amount line keeps its amount. @see estimateLineAmount */
export function changeOrderLineAmount(line = {}) {
  return round2(scopeLineAmount(line));
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

/**
 * The estimate that defines a job's billing baseline: the most recently signed (else most recently
 * created) non-void estimate that is accepted or carries an accepted snapshot. Revisions therefore
 * supersede the estimates they copy.
 * @param {Array<Record<string, any>>} [estimates]
 * @returns {Record<string, any> | null}
 */
export function pickAcceptedEstimate(estimates = []) {
  const stamp = e => String(e.signed_at || e.created_date || '');
  const [latest] = estimates
    .filter(e => e && e.status !== 'void' && (e.status === 'accepted' || e.accepted_snapshot))
    .sort((a, b) => (stamp(a) < stamp(b) ? 1 : stamp(a) > stamp(b) ? -1 : String(a.id) < String(b.id) ? 1 : -1));
  return latest || null;
}

/** Sum of approved change-order nets (pre-tax dollars). */
export function approvedChangeOrderNet(changeOrders = []) {
  return round2(
    changeOrders
      .filter(co => co.status === 'approved')
      .reduce((sum, co) => sum + changeOrderNet(co), 0),
  );
}

/** Derive invoice lifecycle status from balance / payments (progress billing). */
export function deriveInvoiceStatus({ balance_due, payments_applied, deposits_applied, status } = /** @type {{balance_due?: number|string, payments_applied?: number|string, deposits_applied?: number|string, status?: string}} */ ({})) {
  if (status === 'void') return 'void';
  // Draft stays draft until explicitly sent — deposits on a draft do not mark it paid.
  if (!status || status === 'draft') return status || 'draft';
  const balance = Number(balance_due);
  const applied = (Number(payments_applied) || 0) + (Number(deposits_applied) || 0);
  if (Number.isFinite(balance) && balance <= 0.009) return 'paid';
  if ((status === 'sent' || status === 'partial') && applied > 0 && Number.isFinite(balance) && balance > 0.009) {
    return 'partial';
  }
  if (status === 'paid' && Number.isFinite(balance) && balance > 0.009) return 'partial';
  return status;
}

/** Sum totals of non-void invoices (for progress / cumulative billing checks). */
export function sumActiveInvoiceTotals(invoices = []) {
  return round2(
    invoices
      .filter(inv => inv && inv.status !== 'void')
      .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0),
  );
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
export function approvedChangeOrdersToInvoiceLines(changeOrders = []) {
  const material_lines = [];
  const labor_lines = [];
  const misc_lines = [];
  const billed_ids = [];
  const refs = [];
  for (const co of changeOrders.filter(c => c.status === 'approved')) {
    billed_ids.push(co.id);
    if (co.number) refs.push(co.number);
    const source = co.accepted_snapshot || co;
    const lines = Array.isArray(source.lines) ? source.lines : [];
    const priced = lines.filter(isPricedScopeLine);
    if (priced.length) {
      // Priced like estimate lines: material / labor / equipment go to their own invoice tables.
      const label = co.number ? `${co.number}: ` : '';
      const tables = estimateLinesToInvoiceTables(priced.map(line => ({ ...line, description: `${label}${line.description || 'Change order work'}` })));
      material_lines.push(...tables.material_lines);
      labor_lines.push(...tables.labor_lines);
      misc_lines.push(...tables.misc_lines);
      const credit = Number(source.credit) || 0;
      if (credit > 0) misc_lines.push({ description: `${co.number || 'Change order'} credit`, amount: -round2(credit) });
      continue;
    }
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
  return { material_lines, labor_lines, misc_lines, billed_change_order_ids: billed_ids, change_order_refs: refs.join(', ') };
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
 * @returns {{ invoice: object, authorized_total: number, prior_invoiced: number }}
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
  const co = approvedChangeOrdersToInvoiceLines(approvedChangeOrders);
  const material_lines = [...tables.material_lines, ...co.material_lines];
  const labor_lines = [...tables.labor_lines, ...co.labor_lines];
  const misc_lines = [...tables.misc_lines, ...co.misc_lines];
  const tax_rate = source.tax_rate ?? estimate?.tax_rate ?? resolveSalesTaxRate(company);
  const totals = invoiceTotals({
    material_lines, labor_lines, misc_lines, tax_rate,
    deposits_applied, payments_applied,
  });
  const baseline = Number(source.total ?? estimate?.total) || 0;
  const authorized_total = computeAuthorizedTotal(baseline, approvedChangeOrders);
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
    prior_invoiced,
  };
}

/** Stable key for MO lines synced from Estimate / WO / CO. */
export function materialOrderSourceKey(line = {}) {
  if (!line.source_entity || line.source_id == null) return null;
  // Task materials carry a row id, so reordering a task's list keeps the same key.
  if (line.source_line_id) return `${line.source_entity}:${line.source_id}:${line.source_line_id}`;
  if (line.source_line_index == null) return null;
  return `${line.source_entity}:${line.source_id}:${line.source_line_index}`;
}

/** Normalize item text for claim / legacy matching (strips WO "(materials)" suffix). */
export function normalizeMaterialDescription(description = '') {
  return String(description || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\((materials|equipment)\)\s*$/i, '');
}

/**
 * Strong fingerprint for adopting legacy unkeyed rows (description + qty + price).
 * Do not use for cross-MO claim after purchase edits.
 */
export function materialOrderLineFingerprint(line = {}) {
  const desc = normalizeMaterialDescription(line.description);
  if (!desc) return null;
  const qty = num(line.qty);
  const price = num(line.unit_price);
  return `${desc}|${qty ?? ''}|${price ?? ''}`;
}

/**
 * Stable claim identity across MOs (ignores qty/price).
 * Prefer source_entity/source_id/source_line_index; description fallback only for
 * legacy unkeyed rows so distinct same-named materials from different sources still autofill.
 */
export function materialOrderClaimIdentity(line = {}) {
  const key = materialOrderSourceKey(line);
  if (key) return `src:${key}`;
  const desc = normalizeMaterialDescription(line.description);
  if (!desc) return null;
  return `desc:${desc}`;
}

/**
 * Job buy-list lines still not on hand → MO lines.
 * A line tagged to a task keeps a WorkItem source key (so an existing order still claims it).
 * Untagged lines use the job. Cancelled tasks contribute nothing.
 */
export function materialLinesFromJob(job, workItems = []) {
  if (!job?.id) return [];
  const tasks = new Map((workItems || []).filter((item) => item?.id).map((item) => [item.id, item]));
  return (job.materials || []).flatMap((material, index) => {
    if (isMaterialOnHand(material) || !String(material.description || '').trim()) return [];
    const task = material.task_id ? tasks.get(material.task_id) : null;
    if (task?.status === 'cancelled') return [];
    const tagged = !!(material.task_id && task);
    return [{
      description: material.description,
      qty: num(material.qty),
      unit_price: num(material.unit_price),
      category: task?.category || undefined,
      notes: [material.unit, material.notes].filter(Boolean).join(' · ') || undefined,
      source_entity: tagged ? 'WorkItem' : 'Job',
      source_id: tagged ? task.id : job.id,
      source_line_index: index,
      source_line_id: material.id,
      on_hand: false,
    }];
  });
}

export function materialLinesFromWorkItems(workItems = []) {
  return (workItems || []).flatMap((item) => {
    if (!item?.id || item.status === 'cancelled') return [];
    return (item.materials || []).flatMap((material, index) => {
      if (isMaterialOnHand(material) || !String(material.description || '').trim()) return [];
      return [{
        description: material.description,
        qty: num(material.qty),
        unit_price: num(material.unit_price),
        category: item.category || undefined,
        notes: [material.unit, material.notes].filter(Boolean).join(' · ') || undefined,
        source_entity: 'WorkItem',
        source_id: item.id,
        source_line_index: index,
        source_line_id: material.id,
        on_hand: false,
      }];
    });
  });
}

/**
 * Collect the job buy list for MO autofill. Tagged lines live on the job; legacy task rows that
 * have not been folded in yet are still included once. Estimates do not feed Material Orders.
 * @param {{ job?: object, workItems?: object[] }} [args]
 */
export function collectJobMaterialLines({ job, workItems = [] } = {}) {
  const fromJob = materialLinesFromJob(job, workItems);
  const seen = new Set(fromJob.map((line) => line.source_line_id).filter(Boolean));
  const legacy = materialLinesFromWorkItems(workItems).filter((line) => !line.source_line_id || !seen.has(line.source_line_id));
  return [...fromJob, ...legacy];
}

/**
 * Merge incoming source lines into an MO line list.
 * Adopts legacy unkeyed rows only on strong match (description + qty + price).
 * Same description with different qty/price keeps the manual row and skips autofill.
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
      // Same description, different qty/price: keep manual, skip autofill (do not clobber)
      const desc = normalizeMaterialDescription(incoming.description);
      if (desc) {
        const weakIdx = remaining.findIndex(({ line }) => (
          !materialOrderSourceKey(line) && normalizeMaterialDescription(line.description) === desc
        ));
        if (weakIdx >= 0) continue;
      }
      synced.push({ ...incoming, on_hand: incoming.on_hand ?? false });
      continue;
    }

    const [{ line: prev }] = remaining.splice(matchIdx, 1);
    synced.push({
      ...incoming,
      supplier: prev.supplier || incoming.supplier,
      on_hand: prev.on_hand ?? false,
      line_status: prev.line_status || incoming.line_status,
      notes: prev.notes || incoming.notes,
    });
  }

  const manual = remaining
    .filter(({ line }) => !materialOrderSourceKey(line))
    .map(({ line }) => line);
  return [...synced, ...manual];
}

/**
 * Drop incoming autofill rows already present on other non-void Material Orders.
 * - Source keys always claim (qty/price ignored).
 * - Legacy unkeyed rows claim by normalized description.
 * - Past-draft MOs (quote|purchased|partial|received) also claim by normalized
 *   description so Est→WO carryover after purchase does not open a second draft.
 * - Draft MOs do not description-claim keyed lines, so a distinct new source
 *   (e.g. CO) with the same name can still autofill.
 */
export function filterIncomingNotClaimedElsewhere(incomingLines = [], otherOrders = []) {
  const CLAIM_DESC_STATUSES = new Set(['quote', 'purchased', 'partial', 'received']);
  const claimedKeys = new Set();
  const claimedDescs = new Set();
  const claimedLineNos = new Set();

  for (const order of otherOrders) {
    if (!order || order.status === 'void') continue;
    const claimByDesc = CLAIM_DESC_STATUSES.has(order.status);
    for (const line of order.lines || []) {
      const key = materialOrderSourceKey(line);
      if (key) claimedKeys.add(key);
      const desc = normalizeMaterialDescription(line.description);
      const unkeyed = !key;
      if (desc && (unkeyed || claimByDesc)) {
        claimedDescs.add(desc);
        const lineNo = num(line.wo_line_number);
        if (lineNo != null && lineNo > 0) claimedLineNos.add(`${lineNo}|${desc}`);
      }
    }
  }

  return incomingLines.filter((line) => {
    const key = materialOrderSourceKey(line);
    if (key && claimedKeys.has(key)) return false;
    const desc = normalizeMaterialDescription(line.description);
    if (!desc) return true;
    const lineNo = num(line.wo_line_number);
    if (lineNo != null && lineNo > 0 && claimedLineNos.has(`${lineNo}|${desc}`)) return false;
    if (claimedDescs.has(desc)) return false;
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
