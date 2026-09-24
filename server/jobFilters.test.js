import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  invoiceBalanceDue,
  jobBalance,
  jobReceived,
  moneySummary,
  paymentsByJobId,
} from "../src/lib/jobFilters.js";

describe("payment-aware money helpers", () => {
  it("aggregates payment_received timeline entries by job", () => {
    const map = paymentsByJobId([
      { type: "payment_received", job_id: "j1", amount: 100 },
      { type: "payment_received", job_id: "j1", amount: 50 },
      { type: "note", job_id: "j1", amount: 999 },
      { type: "payment_received", job_id: "j2", amount: 25 },
    ]);
    assert.equal(map.j1, 150);
    assert.equal(map.j2, 25);
  });

  it("counts deposit + logged payments as received", () => {
    const job = { id: "j1", invoice_amount: 1000, deposit_amount: 200 };
    assert.equal(jobReceived(job, 150), 350);
    assert.equal(jobBalance(job, 150), 650);
    assert.equal(jobBalance(job, 0), 800);
  });

  it("keeps legacy deposit when timeline deposits are also logged", () => {
    const job = { id: "j1", invoice_amount: 1000, deposit_amount: 200 };
    assert.equal(jobReceived(job, 50, 100), 350);
    assert.equal(jobBalance(job, 50, 100), 650);
  });

  it("moneySummary includes timeline payments in received/outstanding", () => {
    const jobs = [{ id: "j1", invoice_amount: 1000, deposit_amount: 100 }];
    const timeline = [{ type: "payment_received", job_id: "j1", amount: 300 }];
    const summary = moneySummary(jobs, [], [], [], timeline);
    assert.equal(summary.invoiced, 1000);
    assert.equal(summary.received, 400);
    assert.equal(summary.outstanding, 600);
  });

  it("moneySummary prefers active invoice payment fields over timeline drift", () => {
    const jobs = [{ id: "j1", invoice_amount: 1000, deposit_amount: 0 }];
    const invoices = [{
      job_id: "j1",
      status: "partial",
      total: 1000,
      deposits_applied: 0,
      payments_applied: 400,
      balance_due: 600,
    }];
    const timeline = [{ type: "payment_received", job_id: "j1", amount: 100 }];
    const summary = moneySummary(jobs, [], [], invoices, timeline);
    assert.equal(summary.received, 400);
    assert.equal(summary.outstanding, 600);
  });

  it("waitingPayment prefers balance_due with total fallback", () => {
    assert.equal(invoiceBalanceDue({ total: 1000, balance_due: 600 }), 600);
    assert.equal(
      invoiceBalanceDue({ total: 1000, deposits_applied: 200, payments_applied: 100 }),
      700
    );
    const summary = moneySummary(
      [],
      [],
      [],
      [
        { status: "partial", total: 1000, balance_due: 400 },
        { status: "sent", total: 500, balance_due: 500 },
        { status: "paid", total: 200, balance_due: 0 },
      ]
    );
    assert.equal(summary.waitingPayment, 900);
    assert.equal(summary.waitingPaymentCount, 2);
  });
});
