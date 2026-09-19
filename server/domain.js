import { z } from 'zod';
import { randomUUID } from 'node:crypto';

const text = z.string().max(20000);
const id = z.string().min(1).max(36);
const money = z.number().finite().min(0).max(1e12);
const signedMoney = z.number().finite().min(-1e12).max(1e12);
const rate = z.number().finite().min(0).max(100);
const date = z.string().refine(v => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))), 'Invalid date');
const docNumber = z.string().max(100).optional();

/** Nested line shapes (Decision #2). Totals are assistive; editors stay free. */
const estimateLine = z.object({
  description: text.default(''),
  material_amount: money.optional(),
  labor_amount: money.optional(),
  equipment_amount: money.optional(),
  /** Stored for WO mapping after catalog fill (Decision #2 / #5). */
  labor_hours: money.optional(),
  labor_rate: money.optional(),
  category: text.optional(),
  notes: text.optional(),
  tools: text.optional(),
  catalog_id: z.string().max(200).optional(),
});

const workOrderLine = z.object({
  kind: z.enum(['material', 'labor']),
  description: text.default(''),
  qty: money.optional(),
  unit_price: money.optional(),
  hours: money.optional(),
  rate: money.optional(),
  work_category: text.optional(),
  notes: text.optional(),
  catalog_id: z.string().max(200).optional(),
});

const invoiceMaterialLine = z.object({
  description: text.default(''),
  qty: money.optional(),
  unit_price: money.optional(),
});

const invoiceLaborLine = z.object({
  description: text.default(''),
  hours: money.optional(),
  rate: money.optional(),
});

const invoiceMiscLine = z.object({
  description: text.default(''),
  amount: signedMoney.optional(),
});

const changeOrderLine = z.object({
  description: text.default(''),
  amount: signedMoney.optional(),
});

const signMeta = {
  signed_at: z.string().max(40).optional(),
  signer_name: text.optional(),
  signature_file_url: z.string().max(200).optional(),
};

/** Job-linked document entities (parent_id = job_id). */
export const JOB_DOCUMENT_ENTITIES = ['Estimate', 'WorkOrder', 'ChangeOrder', 'Invoice'];

export const schemas = {
  Client: z.object({ name: z.string().trim().min(1).max(250), address: text.optional(), address_line2: text.optional(), phone: text.optional(), email: text.optional(), notes: text.optional() }),
  Job: z.object({ title: z.string().trim().min(1).max(250), client_id: id, client_name: text.optional(), description: text.optional(),
    status: z.enum(['Estimate','Scheduled','In Progress','Waiting on Materials','Completed','Paid']).default('Estimate'),
    start_date: date.optional(), end_date: date.optional(), estimate_amount: money.optional(), invoice_amount: money.optional(),
    deposit_amount: money.optional(), materials_cost: money.optional(), notes: text.optional(),
    checklist: z.array(z.object({ text, done: z.boolean() })).max(1000).optional() }),
  TimelineEntry: z.object({ job_id: id, type: z.enum(['note','photo','receipt','document','estimate_sent','deposit_received','invoice_sent','payment_received','status_change','checklist']),
    text: text.optional(), photo_url: z.string().max(200).optional(),
    category: z.enum(['before','after','work','receipt','document','note','financial']).default('note'), amount: money.optional() }),
  CompanyProfile: z.object({
    name: z.string().trim().max(250).default(''),
    address: text.optional(),
    phone: text.optional(),
    email: text.optional(),
    website: text.optional(),
    logo_url: z.string().max(200).optional(),
    default_tax_rate: rate.optional(),
    default_payment_terms: text.optional(),
  }),
  Estimate: z.object({
    job_id: id,
    number: docNumber,
    date: date.optional(),
    valid_till: date.optional(),
    notes: text.optional(),
    tax_rate: rate.optional(),
    status: z.enum(['draft', 'sent', 'accepted', 'declined', 'void']).default('draft'),
    lines: z.array(estimateLine).max(2000).default([]),
    subtotal: money.optional(),
    tax_amount: money.optional(),
    total: money.optional(),
    /** Frozen copy at client accept time; live fields stay editable (Decision #7). */
    accepted_snapshot: z.object({
      number: docNumber,
      notes: text.optional(),
      tax_rate: rate.optional(),
      lines: z.array(estimateLine).max(2000).default([]),
      subtotal: money.optional(),
      tax_amount: money.optional(),
      total: money.optional(),
    }).optional(),
    ...signMeta,
  }),
  WorkOrder: z.object({
    job_id: id,
    number: docNumber,
    related_estimate_id: id.optional(),
    crew: text.optional(),
    start_date: date.optional(),
    end_date: date.optional(),
    instructions: text.optional(),
    notes: text.optional(),
    tax_rate: rate.optional(),
    status: z.enum(['draft', 'issued', 'complete', 'void']).default('draft'),
    lines: z.array(workOrderLine).max(2000).default([]),
    subtotal: money.optional(),
    tax_amount: money.optional(),
    total: money.optional(),
  }),
  ChangeOrder: z.object({
    job_id: id,
    number: docNumber,
    related_estimate_id: id.optional(),
    reason: text.optional(),
    description: text.optional(),
    added_cost: money.optional(),
    credit: money.optional(),
    net_change: signedMoney.optional(),
    added_days: z.number().finite().min(0).max(3650).optional(),
    revised_contract_total: signedMoney.optional(),
    notes: text.optional(),
    status: z.enum(['draft', 'sent', 'approved', 'rejected', 'void']).default('draft'),
    lines: z.array(changeOrderLine).max(2000).default([]),
    /** Frozen copy at client approval; live fields stay editable (Decision #7). */
    accepted_snapshot: z.object({
      reason: text.optional(),
      description: text.optional(),
      added_cost: money.optional(),
      credit: money.optional(),
      net_change: signedMoney.optional(),
      added_days: z.number().finite().min(0).max(3650).optional(),
      revised_contract_total: signedMoney.optional(),
      lines: z.array(changeOrderLine).max(2000).default([]),
      notes: text.optional(),
    }).optional(),
    ...signMeta,
  }),
  Invoice: z.object({
    job_id: id,
    number: docNumber,
    date: date.optional(),
    notes: text.optional(),
    payment_terms: text.optional(),
    tax_rate: rate.optional(),
    related_estimate_id: id.optional(),
    billed_change_order_ids: z.array(id).max(500).default([]),
    project_name: text.optional(),
    estimate_ref: text.optional(),
    change_order_refs: text.optional(),
    deposits_applied: money.optional(),
    payments_applied: money.optional(),
    status: z.enum(['draft', 'sent', 'partial', 'paid', 'void']).default('draft'),
    material_lines: z.array(invoiceMaterialLine).max(2000).default([]),
    labor_lines: z.array(invoiceLaborLine).max(2000).default([]),
    misc_lines: z.array(invoiceMiscLine).max(2000).default([]),
    materials_total: money.optional(),
    labor_total: money.optional(),
    misc_total: signedMoney.optional(),
    subtotal: signedMoney.optional(),
    tax_amount: money.optional(),
    total: money.optional(),
    balance_due: money.optional(),
  }),
};

export const fail = (status, message) => Object.assign(new Error(message), { status });
export const decode = row => ({ ...JSON.parse(row.data), id: row.id, created_date: row.created_date, updated_date: row.updated_date });

function parentFor(entity, data) {
  if (entity === 'Job') return { parentId: data.client_id, parentEntity: 'Client' };
  if (entity === 'TimelineEntry' || JOB_DOCUMENT_ENTITIES.includes(entity)) return { parentId: data.job_id, parentEntity: 'Job' };
  return { parentId: null, parentEntity: null };
}

export async function getRecord(db, owner, entity, recordId) {
  const [row] = await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? AND id = ?', [owner, entity, recordId]);
  if (!row) throw fail(404, 'Record not found');
  return decode(row);
}

export async function saveRecord(db, owner, entity, input, recordId) {
  if (!schemas[entity]) throw fail(404, 'Unknown record type');
  const previous = recordId ? await getRecord(db, owner, entity, recordId) : {};
  const data = schemas[entity].parse({ ...previous, ...input });
  const { parentId, parentEntity } = parentFor(entity, data);
  if (parentId) await getRecord(db, owner, parentEntity, parentId);
  if (data.related_estimate_id) await getRecord(db, owner, 'Estimate', data.related_estimate_id);
  if (Array.isArray(data.billed_change_order_ids)) {
    for (const changeOrderId of data.billed_change_order_ids) await getRecord(db, owner, 'ChangeOrder', changeOrderId);
  }
  for (const field of ['photo_url', 'signature_file_url', 'logo_url']) {
    if (!data[field]) continue;
    const match = /^\/api\/files\/([a-f0-9-]{36})$/.exec(data[field]);
    if (!match || !(await db.all('SELECT id FROM files WHERE id = ? AND owner_id = ?', [match[1], owner])).length)
      throw fail(400, 'Choose a file uploaded to your account');
  }
  const now = new Date().toISOString();
  const key = recordId || randomUUID();
  if (recordId) await db.run('UPDATE records SET data = ?, parent_id = ?, updated_date = ? WHERE id = ? AND owner_id = ?', [JSON.stringify(data), parentId, now, key, owner]);
  else await db.run('INSERT INTO records (id, owner_id, entity, parent_id, data, created_date, updated_date) VALUES (?, ?, ?, ?, ?, ?, ?)', [key, owner, entity, parentId, JSON.stringify(data), now, now]);
  return { ...data, id: key, created_date: previous.created_date || now, updated_date: now };
}
