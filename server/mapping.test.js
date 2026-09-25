import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAuthorizedTotal,
  changeOrderNet,
  buildInvoiceAutofill,
  deriveInvoiceStatus,
  sumActiveInvoiceTotals,
  materialLinesFromWorkItems,
  collectJobMaterialLines,
  mergeMaterialOrderLines,
  materialOrderTotals,
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

test('invoice autofill has no billing ceiling: an invoice may exceed the authorized total', () => {
  const built = buildInvoiceAutofill({
    job: { id: 'j', title: 'Job' },
    estimate: { id: 'e', accepted_snapshot: { total: 100, tax_rate: 0, lines: [{ description: 'Labor', labor_amount: 100 }] } },
    approvedChangeOrders: [],
    existingInvoices: [{ status: 'sent', total: 600 }],
    number: 'INV-NC',
  });
  assert.equal(built.authorized_total, 100);
  assert.equal('billing_ceiling' in built, false);
  assert.equal('over_authorized' in built, false);
});

test('invoice autofill maps estimate + approved COs with balance due', () => {
  const { invoice, authorized_total } = buildInvoiceAutofill({
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
  assert.equal(invoice.balance_due, 1050);
});

test('progress billing: prior active invoices are totalled', () => {
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
  assert.equal(sumActiveInvoiceTotals([{ status: 'void', total: 999 }, { status: 'sent', total: 100 }]), 100);
});

test('deriveInvoiceStatus supports partial and paid without promoting drafts', () => {
  assert.equal(deriveInvoiceStatus({ status: 'draft', balance_due: 0, deposits_applied: 500 }), 'draft');
  assert.equal(deriveInvoiceStatus({ status: 'sent', balance_due: 100, payments_applied: 50, deposits_applied: 0 }), 'partial');
  assert.equal(deriveInvoiceStatus({ status: 'sent', balance_due: 0, payments_applied: 100 }), 'paid');
  assert.equal(deriveInvoiceStatus({ status: 'void', balance_due: 0 }), 'void');
});

test('material order lines come from task materials not on hand, with their price', () => {
  const lines = materialLinesFromWorkItems([
    { id: 'wi-1', status: 'in_progress', category: 'Plumbing', materials: [
      { id: 'm-1', description: 'Faucet', qty: 1, unit_price: 45, unit: 'ea' },
      { id: 'm-2', description: 'Plumber tape', qty: 1, have: true },
      { id: 'm-3', description: '' },
    ] },
    { id: 'wi-2', status: 'cancelled', materials: [{ id: 'm-4', description: 'Tile', qty: 10 }] },
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].description, 'Faucet');
  assert.equal(lines[0].unit_price, 45);
  assert.equal(lines[0].category, 'Plumbing');
  assert.equal(lines[0].source_entity, 'WorkItem');
  assert.equal(lines[0].source_line_id, 'm-1');
});

test('collectJobMaterialLines takes job and task materials; merge preserves user fields', () => {
  const fromJob = collectJobMaterialLines({
    job: { id: 'j1', materials: [{ id: 'jm-1', description: 'Job caulk', qty: 2, unit_price: 4, have: false }] },
  });
  assert.equal(fromJob.length, 1);
  assert.equal(fromJob[0].source_entity, 'Job');

  const workItems = [{ id: 'wi-1', status: 'prep', materials: [{ id: 'm-1', description: 'From est', qty: 1, unit_price: 22 }] }];
  const collected = collectJobMaterialLines({ workItems });
  assert.equal(collected.length, 1);
  assert.equal(collected[0].description, 'From est');
  assert.equal(collected[0].source_entity, 'WorkItem');
  assert.equal(collectJobMaterialLines({ estimate: { id: 'e', lines: [{ description: 'x', material_amount: 5 }] } }).length, 0, 'estimates are not a source');

  const tagged = collectJobMaterialLines({
    job: { id: 'j1', materials: [{ id: 'm-1', description: 'From est', qty: 1, unit_price: 22, task_id: 'wi-1' }] },
    workItems: [{ id: 'wi-1', status: 'plan', category: 'Plumbing', materials: [{ id: 'm-1', description: 'From est', qty: 1, unit_price: 22 }] }],
  });
  assert.equal(tagged.length, 1, 'a tagged job line and the same task row are one record');
  assert.equal(tagged[0].source_entity, 'WorkItem');
  assert.equal(tagged[0].category, 'Plumbing');

  const cancelled = collectJobMaterialLines({
    job: { id: 'j1', materials: [{ id: 'm-9', description: 'Skip', task_id: 'wi-x' }] },
    workItems: [{ id: 'wi-x', status: 'cancelled' }],
  });
  assert.equal(cancelled.length, 0, 'a line tagged to a cancelled task is not ordered');

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

test('merge adopts legacy unkeyed lines; claimed filter skips purchased', () => {
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
