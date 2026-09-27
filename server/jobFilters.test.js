import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countByPhase,
  invoiceBalanceDue,
  jobBalance,
  jobReceived,
  moneyGroups,
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

  it("moneySummary includes outstanding invoices on archived jobs", () => {
    const workingJobs = [{ id: "j1", invoice_amount: 0 }];
    const invoices = [{
      job_id: "j-archived",
      status: "sent",
      total: 800,
      deposits_applied: 0,
      payments_applied: 0,
      balance_due: 800,
    }];
    const summary = moneySummary(workingJobs, [], [], invoices, []);
    assert.equal(summary.outstanding, 800);
    assert.equal(summary.invoiced, 800);
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

describe("board phase counts", () => {
  it("subtotals add to the jobs passed in and follow stored phase", () => {
    const counts = countByPhase([
      { id: "a", phase: "lead", status: "Contact" },
      { id: "b", phase: "working", status: "In progress" },
      { id: "c", phase: "working", status: "Prep" },
      { id: "d", phase: "payment", status: "Waiting on payment" },
      { id: "e", status: "Assessment" },
    ]);
    assert.equal(counts.lead, 2);
    assert.equal(counts.working, 2);
    assert.equal(counts.payment, 1);
    assert.equal(counts.lead + counts.working + counts.payment, 5);
  });
});

describe("labeled money groups", () => {
  it("keeps issued invoices, uninvoiced deposits, and unbilled work in separate scopes", () => {
    const jobs = [
      { id: "billed", title: "Kitchen", invoice_amount: 1000, deposit_amount: 100 },
      { id: "deposit-only", title: "Deck", deposit_amount: 250, estimate_amount: 800 },
      { id: "quote", title: "Bath", estimate_amount: 400 },
    ];
    const estimates = [
      { id: "e1", job_id: "quote", status: "accepted", total: 450, accepted_snapshot: { total: 450 } },
    ];
    const invoices = [{
      id: "i1",
      job_id: "billed",
      number: "INV-1",
      status: "partial",
      total: 1000,
      deposits_applied: 100,
      payments_applied: 200,
      balance_due: 700,
    }];
    const timeline = [
      { type: "deposit_received", job_id: "deposit-only", amount: 50 },
      { type: "payment_received", job_id: "billed", amount: 999 },
    ];
    const groups = moneyGroups({ jobs, estimates, invoices, timeline });

    assert.equal(groups.issued.billed, 1000);
    assert.equal(groups.issued.applied, 300);
    assert.equal(groups.issued.remaining, 700);
    assert.equal(groups.issued.records.length, 1);
    assert.equal(groups.issued.records[0].to, "/jobs/billed");

    assert.equal(groups.deposits.total, 300);
    assert.deepEqual(groups.deposits.records.map((r) => r.id), ["deposit-deposit-only"]);

    assert.equal(groups.unbilled.total, 450 + 800);
    assert.ok(groups.unbilled.records.every((r) => r.id !== "unbilled-billed"));

    const mixed = groups.issued.billed - groups.issued.applied - groups.deposits.total;
    assert.notEqual(mixed, groups.issued.remaining);
  });

  it("counts a deposit that an issued invoice did not apply", () => {
    const groups = moneyGroups({
      jobs: [{ id: "j1", title: "Porch", deposit_amount: 80 }],
      estimates: [],
      invoices: [{
        id: "i1",
        job_id: "j1",
        status: "sent",
        total: 500,
        deposits_applied: 0,
        payments_applied: 0,
        balance_due: 500,
      }],
      timeline: [],
    });
    assert.equal(groups.issued.remaining, 500);
    assert.equal(groups.deposits.total, 80);
    assert.equal(groups.unbilled.total, 0);
  });
});
