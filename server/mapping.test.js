import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateLineToWorkOrderLines,
  mapEstimateToWorkOrderLines,
  computeAuthorizedTotal,
  changeOrderNet,
  buildInvoiceAutofill,
  invoiceTotals,
} from './mapping.js';

test('estimate lines map to WO labor/material/equipment rows', () => {
  const lines = estimateLineToWorkOrderLines({
    description: 'Replace faucet',
    category: 'Plumbing',
    labor_amount: 110,
    labor_hours: 2,
    labor_rate: 55,
    material_amount: 40,
    equipment_amount: 15,
  });
  assert.equal(lines.length, 3);
  assert.equal(lines[0].kind, 'labor');
  assert.equal(lines[0].hours, 2);
  assert.equal(lines[0].rate, 55);
  assert.equal(lines[0].work_category, 'Plumbing');
  assert.equal(lines[1].kind, 'material');
  assert.equal(lines[1].unit_price, 40);
  assert.equal(lines[2].unit_price, 15);

  const mapped = mapEstimateToWorkOrderLines({
    accepted_snapshot: { lines: [{ description: 'Filter', labor_hours: 0.5, labor_rate: 55, labor_amount: 27.5, category: 'HVAC' }] },
  });
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].kind, 'labor');
});

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
