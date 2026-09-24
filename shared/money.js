/**
 * Money core shared by the server and the browser. Pure functions only: no Node or DOM APIs,
 * so the same code computes invoice totals and payment balances in both places.
 *
 * Everything derived is integer cents. Inputs typed by people (quantity, rate, hours, misc
 * amounts) stay decimal dollars and are rounded to cents once, per line, half away from zero.
 */

/** Round a fractional cent amount to whole cents, half away from zero, ignoring float noise. */
export function roundCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const magnitude = Math.round(Number(Math.abs(n).toPrecision(15)));
  return n < 0 ? -magnitude : magnitude;
}

/** Decimal dollars → whole cents. */
export function toCents(dollars) {
  const n = Number(dollars);
  return Number.isFinite(n) ? roundCents(n * 100) : 0;
}

/** Whole cents → decimal dollars (for display and for legacy dollar-valued fields). */
export function fromCents(cents) {
  return (Number(cents) || 0) / 100;
}

const amount = value => (value === '' || value == null ? 0 : Number(value)) || 0;

export const materialLineCents = line => toCents(amount(line?.qty) * amount(line?.unit_price));
export const laborLineCents = line => toCents(amount(line?.hours) * amount(line?.rate));
export const miscLineCents = line => toCents(amount(line?.amount));

const sumBy = (lines, cents) => (Array.isArray(lines) ? lines : []).reduce((sum, line) => sum + cents(line), 0);

/**
 * Totals for an invoice from its three line tables. Tax applies to the positive subtotal only, so a
 * net-credit invoice totals $0 rather than going negative.
 * @param {{ material_lines?: object[], labor_lines?: object[], misc_lines?: object[], tax_rate?: number|string }} invoice
 */
export function computeInvoice({ material_lines, labor_lines, misc_lines, tax_rate } = {}) {
  const materials_cents = sumBy(material_lines, materialLineCents);
  const labor_cents = sumBy(labor_lines, laborLineCents);
  const misc_cents = sumBy(misc_lines, miscLineCents);
  const subtotal_cents = materials_cents + labor_cents + misc_cents;
  const taxable = Math.max(0, subtotal_cents);
  const tax_cents = roundCents(taxable * (amount(tax_rate) / 100));
  return { materials_cents, labor_cents, misc_cents, subtotal_cents, tax_cents, total_cents: taxable + tax_cents };
}

const byAge = (a, b) => {
  const left = String(a.created_date || '');
  const right = String(b.created_date || '');
  return left < right ? -1 : left > right ? 1 : String(a.id) < String(b.id) ? -1 : 1;
};

/** @param {number} total @param {number} paid */
export function paymentStatus(total, paid) {
  if (total <= 0 || paid >= total) return 'paid';
  return paid > 0 ? 'partial' : 'unpaid';
}

/**
 * Apply payments to a job's invoices.
 *  - A payment tied to an invoice goes to that invoice first; anything beyond its total spills over.
 *  - Every other payment (deposits, unassigned payments, spill-over) is applied oldest invoice first.
 *  - Whatever is left once every invoice is covered is customer credit.
 * Void invoices never receive payments. Nothing here is stored: it is recomputed from the records.
 *
 * @param {Array<{ id: string, status?: string, total_cents: number, created_date?: string }>} invoices
 * @param {Array<{ invoice_id?: string, amount_cents: number }>} payments
 */
export function ledger(invoices = [], payments = []) {
  const active = invoices.filter(invoice => invoice && invoice.status !== 'void').sort(byAge);
  const entries = new Map(active.map(invoice => [invoice.id, {
    id: invoice.id,
    total_cents: Math.max(0, Math.trunc(invoice.total_cents) || 0),
    paid_cents: 0,
  }]));

  let pool = 0;
  let received = 0;
  for (const payment of payments) {
    const cents = Math.trunc(payment?.amount_cents) || 0;
    if (cents <= 0) continue;
    received += cents;
    const target = payment.invoice_id ? entries.get(payment.invoice_id) : undefined;
    if (!target) { pool += cents; continue; }
    const applied = Math.min(cents, target.total_cents - target.paid_cents);
    target.paid_cents += applied;
    pool += cents - applied;
  }
  for (const entry of entries.values()) {
    const applied = Math.min(pool, entry.total_cents - entry.paid_cents);
    entry.paid_cents += applied;
    pool -= applied;
  }

  const rows = [...entries.values()].map(entry => ({
    ...entry,
    balance_cents: entry.total_cents - entry.paid_cents,
    payment_status: paymentStatus(entry.total_cents, entry.paid_cents),
  }));
  return {
    invoices: rows,
    invoiced_cents: rows.reduce((sum, row) => sum + row.total_cents, 0),
    paid_cents: received,
    balance_cents: rows.reduce((sum, row) => sum + row.balance_cents, 0),
    credit_cents: pool,
  };
}
