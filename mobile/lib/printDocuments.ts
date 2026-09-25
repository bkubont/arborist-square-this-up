import { api, type Client, type CompanyProfile, type Estimate, type Invoice, type Job } from '@/api/client';
import { estimateLineAmount, estimateTotals, invoiceTotals } from '@/lib/estimateMath';

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n: number | string | null | undefined): string {
  const value = Number(n) || 0;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtQty(n: number | string | null | undefined): string {
  if (n == null || n === '') return '';
  const value = Number(n);
  if (!Number.isFinite(value)) return '';
  return String(value);
}

/** Printable estimate HTML — mirrors web EstimateEditorDialog.printEstimate (no auto-print). */
export function buildEstimatePrintHtml(estimate: Estimate, jobTitle?: string): string {
  const lines = Array.isArray(estimate.lines) ? estimate.lines : [];
  const t = estimateTotals(lines, estimate.tax_rate);
  const rows = lines
    .map(
      line => `
      <tr>
        <td>${escapeHtml(line.category || '')}</td>
        <td>${escapeHtml(line.description || '')}</td>
        <td class="num">${line.labor_hours != null ? escapeHtml(String(line.labor_hours)) : '—'}</td>
        <td class="num">${fmt(estimateLineAmount(line))}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Estimate ${escapeHtml(estimate.number || '')}</title>
    <style>
      body{font-family:Georgia,serif;padding:32px;color:#111}
      h1{font-size:22px;margin:0 0 4px}
      .meta{color:#555;font-size:13px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border-bottom:1px solid #ddd;padding:8px 6px;text-align:left}
      th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#555}
      .num{text-align:right;white-space:nowrap}
      .totals{margin-top:16px;width:240px;margin-left:auto}
      .totals div{display:flex;justify-content:space-between;padding:4px 0}
      .totals .grand{font-weight:700;border-top:1px solid #111;margin-top:6px;padding-top:8px}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>Construction Estimate</h1>
    <div class="meta">${escapeHtml(jobTitle || 'Job')} · ${escapeHtml(estimate.number || 'Draft')}
      ${estimate.date ? ` · ${escapeHtml(estimate.date)}` : ''}${estimate.valid_till ? ` · Valid until ${escapeHtml(estimate.valid_till)}` : ''}</div>
    <table><thead><tr><th>Category</th><th>Description</th><th class="num">Hrs</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows || '<tr><td colspan=4>No lines</td></tr>'}</tbody></table>
    <div class="totals">
      <div><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>
      <div><span>Tax (${escapeHtml(String(estimate.tax_rate || 0))}%)</span><span>${fmt(t.tax_amount)}</span></div>
      <div class="grand"><span>Total</span><span>${fmt(t.total)}</span></div>
    </div>
    ${estimate.notes ? `<p style="margin-top:24px;font-size:13px;white-space:pre-wrap">${escapeHtml(estimate.notes)}</p>` : ''}
    </body></html>`;
}

/** Printable invoice HTML — mirrors web InvoiceEditorDialog.printInvoice (no auto-print). */
export function buildInvoicePrintHtml(
  invoice: Invoice,
  opts: { job?: Job | null; client?: Client | null; company?: CompanyProfile | null } = {},
): string {
  const materials = invoice.material_lines || [];
  const labor = invoice.labor_lines || [];
  const misc = invoice.misc_lines || [];
  const t = invoiceTotals({
    material_lines: materials,
    labor_lines: labor,
    misc_lines: misc,
    tax_rate: invoice.tax_rate,
    deposits_applied: invoice.deposits_applied,
    payments_applied: invoice.payments_applied,
  });
  const { job, client, company } = opts;

  const matRows = materials
    .map(
      l => `<tr>
        <td class="num">${escapeHtml(fmtQty(l.qty))}</td>
        <td>${escapeHtml(l.description || '')}</td>
        <td class="num">${fmt(l.unit_price)}</td>
        <td class="num">${fmt((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</td>
      </tr>`,
    )
    .join('');
  const labRows = labor
    .map(
      l => `<tr>
        <td>${escapeHtml(l.description || '')}</td>
        <td class="num">${fmtQty(l.hours)}</td>
        <td class="num">${fmt(l.rate)}</td>
        <td class="num">${fmt((Number(l.hours) || 0) * (Number(l.rate) || 0))}</td>
      </tr>`,
    )
    .join('');
  const miscRows = misc
    .map(
      l => `<tr>
        <td>${escapeHtml(l.description || '')}</td>
        <td class="num">${fmt(l.amount)}</td>
      </tr>`,
    )
    .join('');

  const companyBlock = company
    ? `<div class="company-name">${escapeHtml(company.name || '')}</div>
       <div>${escapeHtml(company.address || '')}</div>
       <div>${escapeHtml([company.phone, company.email].filter(Boolean).join(' · '))}</div>
       ${company.website ? `<div>${escapeHtml(company.website)}</div>` : ''}`
    : '';
  const clientBlock = client
    ? `<div class="section-label">Client</div>
       <div class="client-name">${escapeHtml(client.name || '')}</div>
       <div>${escapeHtml(client.address || '')}</div>
       <div>${escapeHtml([client.phone, client.email].filter(Boolean).join(' · '))}</div>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Invoice ${escapeHtml(invoice.number || '')}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:Helvetica,Arial,sans-serif;padding:28px;color:#111;font-size:11px;line-height:1.35}
      h1{font-size:20px;font-weight:800;letter-spacing:.04em;margin:0 0 8px;text-transform:uppercase}
      .company-name,.client-name{font-weight:700;font-size:12px}
      .section-label{font-weight:700;text-transform:uppercase;font-size:10px;margin-top:10px;margin-bottom:2px}
      .grid-top{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:16px}
      .meta-table{width:100%;border-collapse:collapse}
      .meta-table td{padding:3px 0;border-bottom:1px solid #ccc}
      .meta-table td:first-child{font-weight:700;width:42%;text-transform:uppercase;font-size:10px}
      .notes-box{border:1px solid #111;min-height:64px;padding:6px;margin-top:8px;white-space:pre-wrap}
      .grid-body{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
      table.lines{width:100%;border-collapse:collapse;margin-top:4px}
      table.lines th{border-top:2px solid #111;border-bottom:2px solid #111;padding:5px 4px;text-align:left;font-size:10px;text-transform:uppercase}
      table.lines td{border-bottom:1px solid #bbb;padding:4px;vertical-align:top}
      table.lines .num,table.lines th.num{text-align:right;white-space:nowrap}
      .footer-row{display:flex;justify-content:space-between;font-weight:700;border-top:2px solid #111;border-bottom:2px solid #111;padding:5px 4px;margin-top:2px;font-size:10px;text-transform:uppercase}
      .grid-bottom{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}
      .terms{border:1px solid #111;min-height:100px;padding:8px;white-space:pre-wrap}
      .terms-label{font-weight:800;text-transform:uppercase;font-size:11px;margin-bottom:6px}
      .totals{width:100%}
      .totals div{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #ccc}
      .totals .grand{font-weight:800;border:2px solid #111;padding:8px 6px;margin-top:6px}
      @media print{body{padding:12px}}
    </style></head><body>
    <div class="grid-top">
      <div>
        <h1>Construction Invoice</h1>
        ${companyBlock}
        ${clientBlock}
        ${invoice.project_name ? `<div class="section-label">Project</div><div>${escapeHtml(invoice.project_name)}</div>` : ''}
      </div>
      <div>
        <table class="meta-table">
          <tr><td>Date of Invoice</td><td>${escapeHtml(invoice.date || '')}</td></tr>
          <tr><td>Invoice No</td><td>${escapeHtml(invoice.number || '')}</td></tr>
          <tr><td>Job ID</td><td>${escapeHtml(job?.id || invoice.job_id || '')}</td></tr>
          <tr><td>Estimate</td><td>${escapeHtml(invoice.estimate_ref || '')}</td></tr>
          <tr><td>Change Orders</td><td>${escapeHtml(invoice.change_order_refs || '')}</td></tr>
        </table>
        <div class="section-label">Notes</div>
        <div class="notes-box">${escapeHtml(invoice.notes || '')}</div>
      </div>
    </div>
    <div class="grid-body">
      <div>
        <table class="lines">
          <thead><tr><th class="num">Qty</th><th>Material</th><th class="num">Rate</th><th class="num">Total</th></tr></thead>
          <tbody>${matRows || '<tr><td colspan=4>—</td></tr>'}</tbody>
        </table>
        <div class="footer-row"><span>Materials</span><span>${fmt(t.materials_total)}</span></div>
      </div>
      <div>
        <table class="lines">
          <thead><tr><th>Labor</th><th class="num">Hrs</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
          <tbody>${labRows || '<tr><td colspan=4>—</td></tr>'}</tbody>
        </table>
        <div class="footer-row"><span>Labor</span><span>${fmt(t.labor_total)}</span></div>
        <table class="lines" style="margin-top:14px">
          <thead><tr><th>Miscellaneous Charges</th><th class="num">Amount</th></tr></thead>
          <tbody>${miscRows || '<tr><td colspan=2>—</td></tr>'}</tbody>
        </table>
        <div class="footer-row"><span>Miscellaneous</span><span>${fmt(t.misc_total)}</span></div>
      </div>
    </div>
    <div class="grid-bottom">
      <div>
        <div class="terms-label">Payment Terms</div>
        <div class="terms">${escapeHtml(invoice.payment_terms || '')}</div>
      </div>
      <div class="totals">
        <div><span>Materials</span><span>${fmt(t.materials_total)}</span></div>
        <div><span>Labor</span><span>${fmt(t.labor_total)}</span></div>
        <div><span>Miscellaneous</span><span>${fmt(t.misc_total)}</span></div>
        <div><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>
        <div><span>Tax (${escapeHtml(String(invoice.tax_rate || 0))}%)</span><span>${fmt(t.tax_amount)}</span></div>
        <div class="grand"><span>TOTAL</span><span>${fmt(t.total)}</span></div>
        ${(Number(invoice.deposits_applied) || 0) > 0 ? `<div><span>Deposits applied</span><span>−${fmt(invoice.deposits_applied)}</span></div>` : ''}
        ${(Number(invoice.payments_applied) || 0) > 0 ? `<div><span>Payments applied</span><span>−${fmt(invoice.payments_applied)}</span></div>` : ''}
        <div class="grand"><span>Balance Due</span><span>${fmt(t.balance_due)}</span></div>
      </div>
    </div>
    </body></html>`;
}

/** Load company + client context for invoice print headers. */
export async function loadInvoicePrintContext(invoice: Invoice) {
  const [companyRows, job] = await Promise.all([
    api.entities.CompanyProfile.list('-created_date', 1).catch(() => []),
    invoice.job_id ? api.entities.Job.get(invoice.job_id).catch(() => null) : Promise.resolve(null),
  ]);
  const client =
    job?.client_id ? await api.entities.Client.get(job.client_id).catch(() => null) : null;
  return { company: companyRows[0] || null, job, client };
}
