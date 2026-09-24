import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { DEFAULT_SALES_TAX_RATE } from './salesTax.js';

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
export const JOB_DOCUMENT_ENTITIES = ['Estimate', 'MaterialOrder', 'WorkOrder', 'ChangeOrder', 'Invoice'];

/** Every field that can hold an uploaded file's URL, across all entities. */
export const FILE_URL_FIELDS = ['photo_url', 'signature_file_url', 'logo_url'];

/** File ids a record references, e.g. a signed Estimate's signature_file_url. */
export function fileIdsOf(data) {
  const ids = [];
  for (const field of FILE_URL_FIELDS) {
    const match = /^\/api\/files\/([a-f0-9-]{36})$/.exec(data?.[field] || '');
    if (match) ids.push(match[1]);
  }
  return ids;
}

export const schemas = {
  Client: z.object({
    name: z.string().trim().min(1).max(250),
    address: text.optional(),
    address_line2: text.optional(),
    city: text.optional(),
    state: text.optional(),
    zip: text.optional(),
    phone: text.optional(),
    email: text.optional(),
    notes: text.optional(),
  }),
  Job: z.object({ title: z.string().trim().min(1).max(250), client_id: id, client_name: text.optional(), description: text.optional(),
    status: z.enum(['Estimate','Scheduled','In Progress','Waiting on Materials','Completed','Paid']).default('Estimate'),
    start_date: date.optional(), end_date: date.optional(),
    /** Set when a job is Completed/Paid — hides it from working lists; view under Archive. */
    archived_at: date.optional(),
    estimate_amount: money.optional(), invoice_amount: money.optional(),
    deposit_amount: money.optional(), materials_cost: money.optional(), notes: text.optional(),
    checklist: z.array(z.object({ text, done: z.boolean() })).max(1000).optional() }),
  TimelineEntry: z.object({ job_id: id, type: z.enum(['note','photo','receipt','document','estimate_sent','estimate_signed','deposit_received','invoice_sent','payment_received','status_change','checklist','work_order_created','change_order_sent','change_order_signed','document_created','document_voided']),
    text: text.optional(), photo_url: z.string().max(200).optional(),
    category: z.enum(['before','after','work','receipt','document','note','financial','addition','gallery']).default('note'),
    amount: money.optional(),
    /** When set, ties a receipt/photo to a specific Material Order (same job). */
    related_material_order_id: id.optional(),
  }),
  /** Account-owned spend — optional job link and receipt photo (unassigned inbox OK). */
  Expense: z.object({
    amount: money.default(0),
    date: date.optional(),
    category: text.optional(),
    vendor: text.optional(),
    note: text.optional(),
    job_id: z.preprocess((v) => (v === '' || v == null ? undefined : v), id.optional()),
    photo_url: z.string().max(200).optional(),
  }),
  CompanyProfile: z.object({
    name: z.string().trim().max(250).default(''),
    address: text.optional(),
    phone: text.optional(),
    email: text.optional(),
    website: text.optional(),
    logo_url: z.string().max(200).optional(),
    /** Percent, e.g. 6 for 6%. New accounts default to 6%. */
    default_tax_rate: rate.default(DEFAULT_SALES_TAX_RATE),
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
    /** Frozen copy at client accept time; live fields become print/view only. */
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
  MaterialOrder: z.object({
    job_id: id,
    number: docNumber,
    date: date.optional(),
    notes: text.optional(),
    related_estimate_id: id.optional(),
    related_work_order_id: id.optional(),
    /** Legacy `ordered` maps to `purchased` on parse. */
    status: z.preprocess(
      (v) => (v === 'ordered' ? 'purchased' : v),
      z.enum(['draft', 'quote', 'purchased', 'partial', 'received', 'void']).default('draft'),
    ),
    lines: z.array(z.object({
      description: text.default(''),
      qty: money.optional(),
      unit_price: money.optional(),
      supplier: text.optional(),
      notes: text.optional(),
      /** Work Order line number (1-based) when synced from a WO line. */
      wo_line_number: z.number().int().min(0).max(10000).optional(),
      category: text.optional(),
      on_hand: z.boolean().optional(),
      /** Optional procurement difficulty. */
      line_status: z.enum(['pricing', 'backorder', 'unavailable', 'canceled', 'rebuild']).optional(),
      source_entity: z.enum(['Estimate', 'WorkOrder', 'ChangeOrder']).optional(),
      source_id: id.optional(),
      source_line_index: z.number().int().min(0).max(10000).optional(),
    })).max(2000).default([]),
    subtotal: money.optional(),
    total: money.optional(),
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
    /** Sales tax % for this CO (autofilled from account; nets stay pre-tax). */
    tax_rate: rate.optional(),
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
      tax_rate: rate.optional(),
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

const CLIENT_ADDRESS_KEYS = ['address', 'address_line2', 'city', 'state', 'zip'];

/** Brittany: street + city + state + ZIP required; line 2 (apt/suite) optional. */
export function assertClientAddressComplete(data = {}) {
  const missing = [];
  if (!String(data.address || '').trim()) missing.push('address');
  if (!String(data.city || '').trim()) missing.push('city');
  if (!String(data.state || '').trim()) missing.push('state');
  if (!String(data.zip || '').trim()) missing.push('ZIP');
  if (missing.length) throw fail(400, `Client requires ${missing.join(', ')}`);
}

function parentFor(entity, data) {
  if (entity === 'Job') return { parentId: data.client_id, parentEntity: 'Client' };
  if (entity === 'TimelineEntry' || JOB_DOCUMENT_ENTITIES.includes(entity)) return { parentId: data.job_id, parentEntity: 'Job' };
  if (entity === 'Expense' && data.job_id) return { parentId: data.job_id, parentEntity: 'Job' };
  return { parentId: null, parentEntity: null };
}

export async function getRecord(db, owner, entity, recordId) {
  const [row] = await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? AND id = ?', [owner, entity, recordId]);
  if (!row) throw fail(404, 'Record not found');
  return decode(row);
}

export async function saveRecord(db, owner, entity, input, recordId, opts = {}) {
  if (!schemas[entity]) throw fail(404, 'Unknown record type');
  const previous = recordId ? await getRecord(db, owner, entity, recordId) : {};
  const data = schemas[entity].parse({ ...previous, ...input });
  if (entity === 'Client' && !opts.skipClientAddressCheck) {
    const touchingAddress = !recordId || CLIENT_ADDRESS_KEYS.some((key) => Object.prototype.hasOwnProperty.call(input || {}, key));
    if (touchingAddress) assertClientAddressComplete(data);
  }
  const { parentId, parentEntity } = parentFor(entity, data);
  if (parentId) await getRecord(db, owner, parentEntity, parentId);
  if (data.related_estimate_id) await getRecord(db, owner, 'Estimate', data.related_estimate_id);
  if (data.related_work_order_id) await getRecord(db, owner, 'WorkOrder', data.related_work_order_id);
  if (data.related_material_order_id) {
    const mo = await getRecord(db, owner, 'MaterialOrder', data.related_material_order_id);
    if (entity === 'TimelineEntry' && data.job_id && mo.job_id !== data.job_id) {
      throw fail(400, 'Material Order receipt must belong to the same job');
    }
  }
  if (Array.isArray(data.billed_change_order_ids)) {
    for (const changeOrderId of data.billed_change_order_ids) await getRecord(db, owner, 'ChangeOrder', changeOrderId);
  }
  for (const field of FILE_URL_FIELDS) {
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
