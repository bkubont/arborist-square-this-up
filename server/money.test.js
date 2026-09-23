import test from 'node:test';
import assert from 'node:assert/strict';
import { roundCents, toCents, fromCents, computeInvoice, ledger, paymentStatus } from '../shared/money.js';

test('cents conversion rounds half away from zero and ignores float noise', () => {
  assert.equal(toCents(1.005), 101, '1.005 * 100 is 100.49999999999999 in floating point');
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(19.99 * 3), 5997);
  assert.equal(toCents(-2.505), -251);
  assert.equal(toCents('12.34'), 1234);
  assert.equal(toCents(''), 0);
  assert.equal(toCents(undefined), 0);
  assert.equal(toCents(NaN), 0);
  assert.equal(roundCents(0.5), 1);
  assert.equal(roundCents(-0.5), -1);
  assert.equal(fromCents(1234), 12.34);
  assert.equal(fromCents(undefined), 0);
});

test('computeInvoice totals lines per line, taxes the positive subtotal, never goes negative', () => {
  const invoice = computeInvoice({
    material_lines: [{ description: 'Tile', qty: 3, unit_price: 19.99 }, { qty: '', unit_price: '' }],
    labor_lines: [{ description: 'Install', hours: 2.5, rate: 55 }],
    misc_lines: [{ description: 'Dump fee', amount: 40 }, { description: 'Credit', amount: -10 }],
    tax_rate: 8.25,
  });
  assert.deepEqual(invoice, {
    materials_cents: 5997,
    labor_cents: 13750,
    misc_cents: 3000,
    subtotal_cents: 22747,
    tax_cents: 1877, // 22747 * 8.25% = 1876.63...
    total_cents: 24624,
  });

  const credit = computeInvoice({ misc_lines: [{ description: 'Less previously invoiced', amount: -500 }], tax_rate: 10 });
  assert.equal(credit.subtotal_cents, -50000);
  assert.equal(credit.tax_cents, 0);
  assert.equal(credit.total_cents, 0);

  assert.deepEqual(computeInvoice(), { materials_cents: 0, labor_cents: 0, misc_cents: 0, subtotal_cents: 0, tax_cents: 0, total_cents: 0 });
});

test('ledger applies deposits to the oldest invoice first and reports credit', () => {
  const invoices = [
    { id: 'b', status: 'sent', total_cents: 5000, created_date: '2026-02-01' },
    { id: 'a', status: 'sent', total_cents: 10000, created_date: '2026-01-01' },
    { id: 'v', status: 'void', total_cents: 99999, created_date: '2025-12-01' },
  ];
  const result = ledger(invoices, [{ amount_cents: 12000 }]);
  const byId = Object.fromEntries(result.invoices.map(row => [row.id, row]));
  assert.equal(byId.a.paid_cents, 10000);
  assert.equal(byId.a.payment_status, 'paid');
  assert.equal(byId.b.paid_cents, 2000);
  assert.equal(byId.b.balance_cents, 3000);
  assert.equal(byId.b.payment_status, 'partial');
  assert.equal(byId.v, undefined, 'void invoices are excluded');
  assert.equal(result.invoiced_cents, 15000);
  assert.equal(result.paid_cents, 12000);
  assert.equal(result.balance_cents, 3000);
  assert.equal(result.credit_cents, 0);

  const overpaid = ledger(invoices, [{ amount_cents: 20000 }]);
  assert.equal(overpaid.balance_cents, 0);
  assert.equal(overpaid.credit_cents, 5000);
});

test('ledger: a payment tied to an invoice goes there first and only its excess spills over', () => {
  const invoices = [
    { id: 'a', status: 'sent', total_cents: 10000, created_date: '2026-01-01' },
    { id: 'b', status: 'sent', total_cents: 5000, created_date: '2026-02-01' },
  ];
  const result = ledger(invoices, [{ invoice_id: 'b', amount_cents: 7000 }]);
  const byId = Object.fromEntries(result.invoices.map(row => [row.id, row]));
  assert.equal(byId.b.paid_cents, 5000);
  assert.equal(byId.a.paid_cents, 2000, 'the 2000 beyond invoice b spills to the oldest open invoice');
  assert.equal(result.balance_cents, 8000);
  assert.equal(result.credit_cents, 0);

  // A payment tied to a void or missing invoice is just money received.
  const stray = ledger([{ id: 'a', status: 'sent', total_cents: 1000, created_date: '2026-01-01' }], [{ invoice_id: 'gone', amount_cents: 400 }]);
  assert.equal(stray.invoices[0].paid_cents, 400);
});

test('ledger ignores non-positive payments, is order independent, and never double counts', () => {
  const invoices = [
    { id: 'a', status: 'sent', total_cents: 10000, created_date: '2026-01-01' },
    { id: 'b', status: 'draft', total_cents: 10000, created_date: '2026-01-02' },
  ];
  const payments = [{ amount_cents: 2500 }, { amount_cents: 0 }, { amount_cents: -100 }, { amount_cents: 3000 }];
  const forward = ledger(invoices, payments);
  const backward = ledger([...invoices].reverse(), [...payments].reverse());
  assert.deepEqual(forward, backward);
  assert.equal(forward.paid_cents, 5500);
  assert.equal(forward.balance_cents, 20000 - 5500);
  // Every payment cent lands on an invoice or in credit exactly once.
  assert.equal(forward.invoices.reduce((sum, row) => sum + row.paid_cents, 0) + forward.credit_cents, forward.paid_cents);
});

test('paymentStatus', () => {
  assert.equal(paymentStatus(1000, 0), 'unpaid');
  assert.equal(paymentStatus(1000, 1), 'partial');
  assert.equal(paymentStatus(1000, 1000), 'paid');
  assert.equal(paymentStatus(0, 0), 'paid', 'a $0 invoice needs nothing');
});
