import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAuthorizedTotal,
  changeOrderNet,
  buildInvoiceAutofill,
  invoiceTotals,
  authorizedBillingCeiling,
  isOverAuthorized,
  deriveInvoiceStatus,
  sumActiveInvoiceTotals,
  materialLinesFromEstimate,
  materialLinesFromChangeOrder,
  collectJobMaterialLines,
  mergeMaterialOrderLines,
  materialOrderTotals,
  selectChangeOrdersForMaterials,
  filterIncomingNotClaimedElsewhere,
  pickAcceptedEstimate,
} from './mapping.js';

test('authorized total uses approved COs only', () => {
  assert.equal(changeOrderNet({ added_cost: 100, credit: 25 }), 75);
  const total = computeAuthorizedTotal(1000, [
    { status: 'approved', net_change: 200 },
    { status: 'sent', net_change: 500 },
    { status: 'draft', added_cost: 999 },
    { status: 'approved', added_cost: 50, credit: 10 },
  ]);
  assert.equal(total, 1240);
});

test('tax on approved CO nets does not false-trigger over-authorized', () => {
  const cos = [{ status: 'approved', net_change: 100 }];
  assert.equal(computeAuthorizedTotal(1000, cos), 1100);
  assert.equal(authorizedBillingCeiling(1000, cos, 10), 1110);
  assert.equal(isOverAuthorized(1110, 1000, cos, 10), false);
  assert.equal(isOverAuthorized(1110.02, 1000, cos, 10), true);

  const { over_authorized, billing_ceiling, authorized_total } = buildInvoiceAutofill({
    job: { id: 'j', title: 'Job' },
    estimate: {
      id: 'e',
      accepted_snapshot: {
        total: 1000,
        tax_rate: 10,
        lines: [{ description: 'Labor', labor_amount: 909.09, labor_hours: 1, labor_rate: 909.09 }],
      },
    },
    approvedChangeOrders: [{ id: 'co', number: 'CO-1', status: 'approved', net_change: 100 }],
    number: 'INV-TAX',
  });
  assert.equal(authorized_total, 1100);
  assert.ok(billing_ceiling >= 1109.9 && billing_ceiling <= 1110.1);
  assert.equal(over_authorized, false);
});

test('invoice autofill maps estimate + approved COs with balance due', () => {
  const { invoice, authorized_total, over_authorized } = buildInvoiceAutofill({
    job: { id: 'job-1', title: 'Bathroom refresh', deposit_amount: 100 },
    estimate: {
      id: 'est-1',
      number: 'EST-1',
      status: 'accepted',
      accepted_snapshot: {
        number: 'EST-1',
        tax_rate: 0,
        total: 1000,
        lines: [{
          description: 'Tile work',
          material_amount: 400,
          labor_amount: 500,
          labor_hours: 10,
          labor_rate: 50,
          equipment_amount: 100,
        }],
      },
    },
    approvedChangeOrders: [
      { id: 'co-1', number: 'CO-1', status: 'approved', net_change: 200, description: 'Extra vanity' },
      { id: 'co-draft', number: 'CO-X', status: 'draft', net_change: 999 },
    ],
    company: { default_payment_terms: 'Net 30', default_tax_rate: 0 },
    deposits_applied: 100,
    payments_applied: 50,
    number: 'INV-001',
  });

  assert.equal(invoice.number, 'INV-001');
  assert.equal(invoice.related_estimate_id, 'est-1');
  assert.equal(invoice.estimate_ref, 'EST-1');
  assert.equal(invoice.project_name, 'Bathroom refresh');
  assert.equal(invoice.payment_terms, 'Net 30');
  assert.equal(invoice.material_lines.length, 1);
  assert.equal(invoice.material_lines[0].unit_price, 400);
  assert.equal(invoice.labor_lines[0].hours, 10);
  assert.ok(invoice.misc_lines.some(l => /equipment/i.test(l.description)));
  assert.ok(invoice.misc_lines.some(l => /CO-1/.test(l.description) && l.amount === 200));
  assert.deepEqual(invoice.billed_change_order_ids, ['co-1']);
  assert.equal(invoice.change_order_refs, 'CO-1');
  assert.equal(authorized_total, 1200);
  assert.equal(invoice.total, 1200);
  assert.equal(over_authorized, false);
  assert.equal(invoice.balance_due, 1050);
});

test('invoice over-authorized flag when total exceeds authorized', () => {
  const { invoice, authorized_total, over_authorized } = buildInvoiceAutofill({
    job: { id: 'j', title: 'Job' },
    estimate: {
      id: 'e',
      accepted_snapshot: {
        total: 100,
        tax_rate: 0,
        lines: [{ description: 'Labor', labor_amount: 100, labor_hours: 1, labor_rate: 100 }],
      },
    },
    approvedChangeOrders: [],
    number: 'INV-X',
  });
  assert.equal(authorized_total, 100);
  assert.equal(invoice.total, 100);
  assert.equal(over_authorized, false);

  const bumped = invoiceTotals({
    labor_lines: [{ description: 'Labor', hours: 1, rate: 200 }],
    tax_rate: 0,
  });
  assert.equal(bumped.total, 200);
  assert.ok(bumped.total > authorized_total);
});

test('progress billing: prior invoices feed cumulative over-authorized', () => {
  const built = buildInvoiceAutofill({
    job: { id: 'j', title: 'Job' },
    estimate: {
      id: 'e',
      accepted_snapshot: {
        total: 1000,
        tax_rate: 0,
        lines: [{ description: 'Labor', labor_amount: 1000, labor_hours: 10, labor_rate: 100 }],
      },
    },
    approvedChangeOrders: [],
    existingInvoices: [{ status: 'sent', total: 600 }],
    number: 'INV-2',
  });
  assert.equal(built.prior_invoiced, 600);
  assert.equal(built.over_authorized, true);
  assert.equal(sumActiveInvoiceTotals([{ status: 'void', total: 999 }, { status: 'sent', total: 100 }]), 100);
});

test('deriveInvoiceStatus supports partial and paid without promoting drafts', () => {
  assert.equal(deriveInvoiceStatus({ status: 'draft', balance_due: 0, deposits_applied: 500 }), 'draft');
  assert.equal(deriveInvoiceStatus({ status: 'sent', balance_due: 100, payments_applied: 50, deposits_applied: 0 }), 'partial');
  assert.equal(deriveInvoiceStatus({ status: 'sent', balance_due: 0, payments_applied: 100 }), 'paid');
  assert.equal(deriveInvoiceStatus({ status: 'void', balance_due: 0 }), 'void');
});

test('material order lines from estimate / CO', () => {
  const est = materialLinesFromEstimate({
    id: 'est-1',
    status: 'draft',
    lines: [
      { description: 'Faucet', category: 'Plumbing', material_amount: 45, notes: 'chrome' },
      { description: 'Labor only', labor_amount: 100 },
    ],
  });
  assert.equal(est.length, 1);
  assert.equal(est[0].unit_price, 45);
  assert.equal(est[0].qty, 1);
  assert.equal(est[0].source_entity, 'Estimate');
  assert.equal(est[0].source_line_index, 0);
  assert.equal(est[0].wo_line_number, undefined);
  assert.equal(est[0].line_status, undefined);

  const co = materialLinesFromChangeOrder({
    id: 'co-1',
    status: 'draft',
    lines: [
      { description: 'Extra tile', amount: 80 },
      { description: 'Credit', amount: -20 },
    ],
  });
  assert.equal(co.length, 1);
  assert.equal(co[0].unit_price, 80);
});

test('collectJobMaterialLines takes estimate materials; merge preserves user fields', () => {
  const estimate = {
    id: 'est-1', status: 'accepted',
    lines: [{ description: 'From est', material_amount: 22 }],
  };
  const collected = collectJobMaterialLines({ estimate, changeOrders: [] });
  assert.equal(collected.length, 1);
  assert.equal(collected[0].description, 'From est');
  assert.equal(collected[0].source_entity, 'Estimate');
  assert.equal(collectJobMaterialLines({ estimate: { ...estimate, status: 'void' } }).length, 0);

  const merged = mergeMaterialOrderLines(
    [{ ...collected[0], supplier: 'Home Depot', on_hand: true, line_status: 'backorder', notes: 'mine' }],
    [{ ...collected[0], description: 'From est updated', notes: 'from source' }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].description, 'From est updated');
  assert.equal(merged[0].supplier, 'Home Depot');
  assert.equal(merged[0].on_hand, true);
  assert.equal(merged[0].line_status, 'backorder');
  assert.equal(merged[0].notes, 'mine');

  const withManual = mergeMaterialOrderLines(
    [{ description: 'Extra bag', qty: 1, unit_price: 5 }],
    collected,
  );
  assert.equal(withManual.length, 2);
  assert.ok(withManual.some((l) => l.description === 'Extra bag'));

  assert.equal(materialOrderTotals([{ qty: 2, unit_price: 10.5 }]).total, 21);
});

test('merge adopts legacy unkeyed lines; CO revise keeps latest stem only; claimed filter skips purchased', () => {
  const incoming = [{
    description: 'Pipe', qty: 1, unit_price: 30,
    source_entity: 'Estimate', source_id: 'est-1', source_line_index: 0,
  }];
  const merged = mergeMaterialOrderLines(
    [{ description: 'Pipe', qty: 1, unit_price: 30, supplier: 'Home Depot' }],
    incoming,
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source_entity, 'Estimate');
  assert.equal(merged[0].supplier, 'Home Depot');

  // Description-only match with different qty/price must not overwrite manual
  const keepManual = mergeMaterialOrderLines(
    [{ description: 'Pipe', qty: 5, unit_price: 12 }],
    incoming,
  );
  assert.equal(keepManual.length, 1);
  assert.equal(keepManual[0].qty, 5);
  assert.equal(keepManual[0].unit_price, 12);
  assert.equal(keepManual[0].source_entity, undefined);

  const cos = selectChangeOrdersForMaterials([
    { id: 'co1', number: 'CO-001', status: 'sent', lines: [{ description: 'Tile', amount: 50 }] },
    { id: 'co2', number: 'CO-001-R2', status: 'draft', lines: [{ description: 'Tile', amount: 50 }] },
    { id: 'co3', number: 'CO-002', status: 'approved', lines: [{ description: 'Paint', amount: 20 }] },
  ]);
  assert.equal(cos.length, 2);
  assert.ok(cos.some((c) => c.id === 'co2'));
  assert.ok(cos.some((c) => c.id === 'co3'));
  assert.ok(!cos.some((c) => c.id === 'co1'));

  const collected = collectJobMaterialLines({
    estimate: null,
    changeOrders: [
      { id: 'co1', number: 'CO-001', status: 'sent', lines: [{ description: 'Tile', amount: 50 }] },
      { id: 'co2', number: 'CO-001-R2', status: 'draft', lines: [{ description: 'Tile', amount: 55 }] },
    ],
  });
  assert.equal(collected.length, 1);
  assert.equal(collected[0].source_id, 'co2');
  assert.equal(collected[0].unit_price, 55);

  const filtered = filterIncomingNotClaimedElsewhere(incoming, [
    { status: 'purchased', lines: [{ description: 'Pipe', qty: 1, unit_price: 30 }] },
  ]);
  assert.equal(filtered.length, 0);

  // Same sourced line with edited qty/price still claims (source key, ignore qty/price)
  const editedSameSource = filterIncomingNotClaimedElsewhere(
    [{
      description: 'Pipe', qty: 2, unit_price: 99,
      source_entity: 'Estimate', source_id: 'est-1', source_line_index: 0,
    }],
    [{
      status: 'purchased',
      lines: [{
        description: 'Pipe', qty: 1, unit_price: 30,
        source_entity: 'Estimate', source_id: 'est-1', source_line_index: 0,
      }],
    }],
  );
  assert.equal(editedSameSource.length, 0);

  // Purchased Est-keyed line claims a legacy WO-keyed line by description (no double draft)
  const woAfterPurchase = filterIncomingNotClaimedElsewhere(
    [{
      description: 'Pipe (materials)', qty: 2, unit_price: 40, wo_line_number: 1,
      source_entity: 'WorkOrder', source_id: 'wo-1', source_line_index: 0,
    }],
    [{
      status: 'purchased',
      lines: [{
        description: 'Pipe', qty: 1, unit_price: 30,
        source_entity: 'Estimate', source_id: 'est-1', source_line_index: 0,
      }],
    }],
  );
  assert.equal(woAfterPurchase.length, 0);

  // Draft MO does not description-claim keyed lines — distinct CO source can autofill
  const draftDoesNotClaimDesc = filterIncomingNotClaimedElsewhere(
    [{
      description: 'Pipe', qty: 1, unit_price: 50,
      source_entity: 'ChangeOrder', source_id: 'co-1', source_line_index: 0,
    }],
    [{
      status: 'draft',
      lines: [{
        description: 'Pipe', qty: 1, unit_price: 30,
        source_entity: 'Estimate', source_id: 'est-1', source_line_index: 0,
      }],
    }],
  );
  assert.equal(draftDoesNotClaimDesc.length, 1);

  const filteredKeyed = filterIncomingNotClaimedElsewhere(incoming, [
    { status: 'quote', lines: [{ ...incoming[0] }] },
  ]);
  assert.equal(filteredKeyed.length, 0);
});

test('pickAcceptedEstimate: most recently signed wins; void and unsigned excluded', () => {
  assert.equal(pickAcceptedEstimate([]), null);
  assert.equal(pickAcceptedEstimate([{ id: 'e1', status: 'draft' }]), null);
  assert.equal(pickAcceptedEstimate([{ id: 'e1', status: 'void', accepted_snapshot: {} }]), null);

  const [single] = [pickAcceptedEstimate([
    { id: 'e1', status: 'draft' },
    { id: 'e2', status: 'accepted', signed_at: '2026-01-01T00:00:00Z' },
    { id: 'e3', status: 'void', accepted_snapshot: { total: 1 } },
  ])];
  assert.equal(single.id, 'e2');

  // Older signed_at loses to newer, regardless of array order.
  const newer = pickAcceptedEstimate([
    { id: 'later', status: 'accepted', signed_at: '2026-03-01T00:00:00Z' },
    { id: 'earlier', status: 'accepted', accepted_snapshot: {}, signed_at: '2026-01-01T00:00:00Z' },
  ]);
  assert.equal(newer.id, 'later');

  // accepted_snapshot without a live 'accepted' status still counts (e.g. edited after accept).
  const snapshotOnly = pickAcceptedEstimate([{ id: 'e4', status: 'sent', accepted_snapshot: { total: 5 } }]);
  assert.equal(snapshotOnly.id, 'e4');
});
