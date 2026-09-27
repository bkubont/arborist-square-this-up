import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyBlockForPhase, overviewFigures, quoteFromDocuments } from '../shared/overviewMoney.js';

test('quote is the whole-line estimate plus approved change orders', () => {
  const job = { estimate_amount: 10 };
  const documents = [
    { entity: 'Estimate', status: 'accepted', total: 100, accepted_snapshot: { total: 848 } },
    { entity: 'Estimate', status: 'void', total: 9999 },
    { entity: 'ChangeOrder', status: 'approved', net_change: 220 },
    { entity: 'ChangeOrder', status: 'sent', net_change: 180 },
    { entity: 'Invoice', status: 'sent', total: 5000 },
  ];
  assert.equal(quoteFromDocuments(job, documents), 1068);
});

test('draft estimate is the quote when nothing is accepted', () => {
  const documents = [{ entity: 'Estimate', status: 'draft', total: 255 }];
  assert.equal(quoteFromDocuments({ estimate_amount: 999 }, documents), 255);
});

test('job estimate_amount is the quote only when no live estimate exists', () => {
  assert.equal(quoteFromDocuments({ estimate_amount: 400 }, []), 400);
  assert.equal(quoteFromDocuments({ estimate_amount: 400 }, [{ entity: 'Estimate', status: 'void', total: 90 }]), 400);
});

test('collected is deposits plus payments; remaining is quote minus collected', () => {
  const figures = overviewFigures({
    job: { deposit_amount: 50, estimate_amount: 1000 },
    documents: [],
    timeline: [
      { type: 'deposit_received', amount: 100 },
      { type: 'payment_received', amount: 25 },
      { type: 'payment_received', amount: 25 },
      { type: 'note', amount: 999 },
    ],
  });
  assert.equal(figures.quote, 1000);
  assert.equal(figures.deposit, 150);
  assert.equal(figures.payments, 50);
  assert.equal(figures.collected, 200);
  assert.equal(figures.remaining, 800);
});

test('remaining can go negative; it is not clamped into a status', () => {
  const figures = overviewFigures({
    job: { estimate_amount: 100 },
    timeline: [{ type: 'payment_received', amount: 140 }],
  });
  assert.equal(figures.remaining, -40);
});

test('estimate stage shows quote only', () => {
  const figures = overviewFigures({ job: { estimate_amount: 500, deposit_amount: 80 } });
  const block = moneyBlockForPhase('working', figures, 'Estimate');
  assert.deepEqual(block.slots.map((s) => s.label), ['Quote']);
  assert.equal(block.jobCost, false);
  assert.equal(block.logPayment, false);
  assert.equal(moneyBlockForPhase(undefined, figures).phase, 'estimate');
  assert.equal(moneyBlockForPhase('working', figures, 'Waiting on approval').phase, 'estimate');
  assert.equal(moneyBlockForPhase('working', figures, 'Approved').phase, 'estimate');
});

test('working shows quote, a deposit when one exists, and job cost', () => {
  const withDeposit = overviewFigures({
    job: { estimate_amount: 500, deposit_amount: 80 },
  });
  const block = moneyBlockForPhase('working', withDeposit);
  assert.deepEqual(block.slots.map((s) => s.label), ['Quote', 'Deposit']);
  assert.equal(block.slots[1].value, 80);
  assert.equal(block.jobCost, true);
  assert.equal(block.logPayment, false);

  const bare = moneyBlockForPhase('working', overviewFigures({ job: { estimate_amount: 500 } }));
  assert.deepEqual(bare.slots.map((s) => s.label), ['Quote']);
});

test('a payment on a working job shows collected instead of a separate deposit', () => {
  const figures = overviewFigures({
    job: { estimate_amount: 500, deposit_amount: 80 },
    timeline: [{ type: 'payment_received', amount: 20 }],
  });
  const block = moneyBlockForPhase('working', figures);
  assert.deepEqual(block.slots.map((s) => s.label), ['Quote', 'Collected']);
  assert.equal(block.slots[1].value, 100);
  assert.equal(block.logPayment, false);
});

test('payment phase is the bill, collected, and remaining', () => {
  const figures = overviewFigures({
    job: { estimate_amount: 500, deposit_amount: 80 },
    timeline: [{ type: 'payment_received', amount: 20 }],
  });
  const block = moneyBlockForPhase('payment', figures);
  assert.deepEqual(block.slots.map((s) => [s.label, s.value]), [
    ['Bill', 500],
    ['Collected', 100],
    ['Remaining', 400],
  ]);
  assert.equal(block.jobCost, true);
  assert.equal(block.logPayment, true);
});
