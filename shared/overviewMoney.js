/**
 * Overview money: three numbers, not a ledger.
 * Quote is the whole-line estimate (what you told the customer), plus approved change orders.
 * Collected is deposits + payments. Remaining is quote minus collected — derived, never a status.
 */

function dollars(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function changeOrderNet(co) {
  if (co?.net_change != null && co.net_change !== '') return Number(co.net_change) || 0;
  return (Number(co?.added_cost) || 0) - (Number(co?.credit) || 0);
}

function sumTimeline(timeline, type) {
  let sum = 0;
  for (const entry of timeline || []) {
    if (entry?.type !== type || entry.amount == null) continue;
    const n = Number(entry.amount);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

/** Whole-line quote. Void estimates and unapproved change orders stay out. */
export function quoteFromDocuments(job, documents = []) {
  const estimates = documents.filter((d) => d?.entity === 'Estimate' && d.status !== 'void');
  const accepted = estimates.find((e) => e.status === 'accepted')
    || estimates.find((e) => e.accepted_snapshot);
  const chosen = accepted || estimates[0] || null;
  let base = 0;
  if (chosen) {
    const snap = chosen.accepted_snapshot;
    const raw = snap && snap.total != null && snap.total !== '' ? snap.total : chosen.total;
    base = Number(raw) || 0;
  } else {
    base = Number(job?.estimate_amount) || 0;
  }
  const coNet = documents
    .filter((d) => d?.entity === 'ChangeOrder' && d.status === 'approved')
    .reduce((sum, co) => sum + changeOrderNet(co), 0);
  return dollars(base + coNet);
}

/**
 * @param {{ job?: object, documents?: object[], timeline?: object[] }} input
 */
export function overviewFigures({ job, documents = [], timeline = [] } = {}) {
  const quote = quoteFromDocuments(job, documents);
  const legacyDeposit = Number(job?.deposit_amount) || 0;
  const timelineDeposits = sumTimeline(timeline, 'deposit_received');
  const payments = sumTimeline(timeline, 'payment_received');
  const deposit = dollars(legacyDeposit + timelineDeposits);
  const collected = dollars(legacyDeposit + timelineDeposits + payments);
  return {
    quote,
    deposit,
    payments: dollars(payments),
    collected,
    remaining: dollars(quote - collected),
  };
}

/**
 * Which Overview money slots to show. Lead is quote only.
 * Working shows the quote and a deposit (or collected, once a payment exists) plus job cost.
 * Payment is the bill, collected, and remaining.
 * @param {string | undefined} phase
 * @param {ReturnType<typeof overviewFigures>} figures
 */
export function moneyBlockForPhase(phase, figures) {
  const resolved = phase === 'working' || phase === 'payment' ? phase : 'lead';
  if (resolved === 'lead') {
    return {
      phase: 'lead',
      slots: [{ key: 'quote', label: 'Quote', value: figures.quote }],
      jobCost: false,
      logPayment: false,
    };
  }
  if (resolved === 'working') {
    const slots = [{ key: 'quote', label: 'Quote', value: figures.quote }];
    if (figures.payments > 0) {
      slots.push({ key: 'collected', label: 'Collected', value: figures.collected });
    } else if (figures.deposit > 0) {
      slots.push({ key: 'deposit', label: 'Deposit', value: figures.deposit });
    }
    return { phase: 'working', slots, jobCost: true, logPayment: false };
  }
  return {
    phase: 'payment',
    slots: [
      { key: 'bill', label: 'Bill', value: figures.quote },
      { key: 'collected', label: 'Collected', value: figures.collected },
      { key: 'remaining', label: 'Remaining', value: figures.remaining },
    ],
    jobCost: true,
    logPayment: true,
  };
}
