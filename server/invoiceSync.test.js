import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeInvoicePayments,
  sumTimelinePayments,
} from './invoiceSync.js';

describe('invoice payment sync', () => {
  const job = { id: 'j1', deposit_amount: 100 };
  const timeline = [
    { type: 'deposit_received', amount: 50 },
    { type: 'payment_received', amount: 200 },
  ];

  it('marks paid by zeroing balance and covering total minus deposits', () => {
    const result = normalizeInvoicePayments(
      { status: 'sent', total: 1000, material_lines: [], labor_lines: [], misc_lines: [] },
      { job, timeline, requestedStatus: 'paid' },
    );
    assert.equal(result.status, 'paid');
    assert.equal(result.balance_due, 0);
    assert.equal(result.deposits_applied, 150);
    assert.equal(result.payments_applied, 850);
  });

  it('syncs payments from timeline when not marking paid', () => {
    const result = normalizeInvoicePayments(
      { status: 'sent', total: 1000, material_lines: [], labor_lines: [], misc_lines: [] },
      { job, timeline },
    );
    assert.equal(result.payments_applied, 200);
    assert.equal(result.deposits_applied, 150);
    assert.equal(result.balance_due, 650);
    assert.equal(result.status, 'partial');
  });

  it('does not promote draft to paid without explicit mark-paid', () => {
    const result = normalizeInvoicePayments(
      { status: 'draft', total: 0, balance_due: 0, deposits_applied: 500 },
      { job, timeline: [] },
    );
    assert.equal(result.status, 'draft');
  });

  it('sums timeline payments', () => {
    assert.equal(sumTimelinePayments(timeline), 200);
  });
});
