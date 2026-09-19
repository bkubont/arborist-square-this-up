import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateLineToWorkOrderLines, mapEstimateToWorkOrderLines, computeAuthorizedTotal, changeOrderNet } from './mapping.js';

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
