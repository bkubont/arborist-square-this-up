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

/** Internal task breakdown under a line — never sent to the customer (see sign.js's public line shape). */
const lineStep = z.object({
  /** Assigned server-side when missing (see saveRecord), so clients never have to mint ids. */
  id: z.string().max(64).optional(),
  text,
  done: z.boolean().default(false),
});

/** Nested line shapes (Decision #2). Totals are assistive; editors stay free. */
const estimateLine = z.object({
  /** Stable id, assigned server-side on first save (see saveRecord). Links a signed line to its WorkItem. */
  id: z.string().max(64).optional(),
  description: text.default(''),
  material_amount: money.optional(),
  labor_amount: money.optional(),
  equipment_amount: money.optional(),
  /** Copied onto the line's task at signing, so the crew can see how long it should take. */
  labor_hours: money.optional(),
  labor_rate: money.optional(),
  category: text.optional(),
  notes: text.optional(),
  tools: text.optional(),
  catalog_id: z.string().max(200).optional(),
  /** Internal task breakdown; customer never sees this. */
  steps: z.array(lineStep).max(200).optional(),
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

/**
 * Change order lines have the same shape as estimate lines (material / labor / equipment, hours,
 * category, notes). `amount` is the single figure change order lines had before; a line with
 * none of the priced fields still counts it (see changeOrderLineAmount).
 */
const changeOrderLine = estimateLine.extend({
  amount: signedMoney.optional(),
});

const signMeta = {
  signed_at: z.string().max(40).optional(),
  /** Accepted / approved by the owner's status override, not a customer signature. */
  accepted_manually: z.boolean().optional(),
  signer_name: text.optional(),
  signature_file_url: z.string().max(200).optional(),
};

/** Job task statuses, in board-column order. */
export const TASK_STATUSES = [
  'plan',
  'prep',
  'permits',
  'in_progress',
  'waiting_materials',
  'waiting_on_approval',
  'blocked',
  'on_hold',
  'cancelled',
  'done',
];

/** Job-linked document entities (parent_id = job_id). */
export const JOB_DOCUMENT_ENTITIES = ['Estimate', 'MaterialOrder', 'ChangeOrder', 'Invoice'];
/** Estimate/ChangeOrder statuses that mean "the customer decided" or "withdrawn" — the document is frozen. */
export const SCOPE_TERMINAL_STATUSES = { Estimate: ['accepted', 'declined', 'void'], ChangeOrder: ['approved', 'rejected', 'void'] };
/** The one status each reaches only through a real customer signature (see server/sign.js). */
export const SCOPE_SIGNED_STATUS = { Estimate: 'accepted', ChangeOrder: 'approved' };

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
    status: z.enum(['Estimate','Scheduled','In Progress','Waiting on Materials','On Hold','Completed','Paid']).default('Estimate'),
    start_date: date.optional(), end_date: date.optional(),
    /** Set when a job is Completed/Paid — hides it from working lists; view under Archive. */
    archived_at: date.optional(),
    estimate_amount: money.optional(), invoice_amount: money.optional(),
    deposit_amount: money.optional(), materials_cost: money.optional(), notes: text.optional(),
    // Pre-checklist free-text tasks; only read by carryOverChecklists (server/workItems.js), which
    // moves them into WorkItems and clears this.
    checklist: z.array(z.object({ text, done: z.boolean() })).max(1000).optional() }),
  // 'checklist' and 'work_order_created' stay so timeline rows from before the WorkItem checklist
  // still decode; nothing writes them any more.
  TimelineEntry: z.object({ job_id: id, type: z.enum(['note','photo','receipt','document','estimate_sent','estimate_signed','deposit_received','invoice_sent','payment_received','status_change','checklist','work_order_created','change_order_sent','change_order_signed','document_created','document_voided','document_declined']),
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
  /** Money received for a job. Amounts are integer cents; balances are derived (see shared/money.js). */
  Payment: z.object({
    job_id: id,
    amount_cents: z.number().int().min(1).max(1e14),
    kind: z.enum(['payment', 'deposit']).default('payment'),
    date: date.optional(),
    method: z.string().trim().max(40).optional(),
    note: text.optional(),
    /** Optional: apply to one invoice. Unassigned payments apply to the oldest open invoice. */
    invoice_id: id.optional(),
  }),
  /**
   * A job task: one per signed Estimate/ChangeOrder line (source_type set), created at signing,
   * plus free-standing tasks the owner adds. Internal only — never shown to the customer.
   */
  WorkItem: z.object({
    job_id: id,
    /** Built-in Prep / Final walkthrough rows; set only by attachDefaultJobTasks. */
    template_key: z.enum(['prep', 'final_walkthrough']).optional(),
    source_type: z.enum(['Estimate', 'ChangeOrder']).optional(),
    source_id: id.optional(),
    line_id: z.string().max(64).optional(),
    /** Snapshotted once at signing; the source line can never change after (Decision: signed = immutable). */
    amount_cents: z.number().int().min(0).max(1e14).optional(),
    description: text.default(''),
    category: text.optional(),
    tools: text.optional(),
    notes: text.optional(),
    steps: z.array(lineStep).max(200).optional(),
    /** Where this task stands; each task moves independently (see TASK_STATUSES). */
    status: z.enum(TASK_STATUSES).default('prep'),
    /** Derived from status ('done') by saveRecord, kept for billing "completed work". */
    done: z.boolean().default(false),
    done_at: z.string().max(40).optional(),
    /** Expected labor, from the signed line's labor_hours; editable as a planning figure. */
    labor_hours: money.optional(),
    /**
     * Notes shown on the task card, oldest first — e.g. why it went on hold. Each keeps the status
     * the task had when it was written (stamped with the time by saveRecord), so the card shows
     * what happened when.
     */
    status_notes: z.array(z.object({
      id: z.string().max(64).optional(),
      text: z.string().trim().min(1).max(500),
      status: z.enum(TASK_STATUSES).optional(),
      created_at: z.string().max(40).optional(),
    })).max(200).optional(),
    /** The single card note tasks had before status_notes; carryOverChecklists moves it over. */
    status_note: z.string().max(500).optional(),
    /** Position within its status column / the list; lower first. */
    sort_order: z.number().finite().min(-1e9).max(1e9).optional(),
    measurements: z.array(z.object({ id: z.string().max(64).optional(), label: text.default(''), value: text.default('') })).max(200).optional(),
    /** Parts for this task. Items not yet on hand feed the job's draft Material Order (materialOrderSync.js). */
    materials: z.array(z.object({
      id: z.string().max(64).optional(),
      description: text.default(''),
      qty: money.optional(),
      unit: z.string().max(40).optional(),
      /** Price per unit; carried onto the Material Order line. */
      unit_price: money.optional(),
      have: z.boolean().default(false),
      notes: text.optional(),
    })).max(500).optional(),
    /** Set once billed via "Bill completed work", so it cannot be billed twice. */
    billed_invoice_id: id.optional(),
  }).refine(
    data => [data.source_type, data.source_id, data.line_id].every(v => v === undefined)
      || [data.source_type, data.source_id, data.line_id].every(v => v !== undefined),
    { message: 'source_type, source_id and line_id must be set together, or not at all' },
  ),
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
      /** Free-form line reference the owner can set (kept from the Work Order era). */
      wo_line_number: z.number().int().min(0).max(10000).optional(),
      category: text.optional(),
      on_hand: z.boolean().optional(),
      /** Optional procurement difficulty. */
      line_status: z.enum(['pricing', 'backorder', 'unavailable', 'canceled', 'rebuild']).optional(),
      // 'WorkOrder' stays accepted so rows written before the checklist replaced it still decode.
      source_entity: z.enum(['Estimate', 'WorkOrder', 'ChangeOrder', 'WorkItem']).optional(),
      source_id: id.optional(),
      source_line_index: z.number().int().min(0).max(10000).optional(),
      /** Stable id of the source row (task materials), so reordering a list doesn't re-key it. */
      source_line_id: z.string().max(64).optional(),
    })).max(2000).default([]),
    subtotal: money.optional(),
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
  if (entity === 'TimelineEntry' || entity === 'Payment' || entity === 'WorkItem' || JOB_DOCUMENT_ENTITIES.includes(entity)) return { parentId: data.job_id, parentEntity: 'Job' };
  if (entity === 'Expense' && data.job_id) return { parentId: data.job_id, parentEntity: 'Job' };
  return { parentId: null, parentEntity: null };
}

export async function getRecord(db, owner, entity, recordId) {
  const [row] = await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? AND id = ?', [owner, entity, recordId]);
  if (!row) throw fail(404, 'Record not found');
  return decode(row);
}

const PRICED_FIELDS = ['material_amount', 'labor_amount', 'equipment_amount'];
/** A line priced by material / labor / equipment — every estimate line, and change order lines. */
export const isPricedScopeLine = (line = {}) => PRICED_FIELDS.some(key => line[key] != null);
/** Dollar total of an estimate or change order line (an older single-amount CO line keeps its amount). */
export const scopeLineAmount = (line = {}) => (isPricedScopeLine(line) || line.amount == null
  ? PRICED_FIELDS.reduce((sum, key) => sum + (Number(line[key]) || 0), 0)
  : Number(line.amount) || 0);

const withIds = rows => rows.map(row => (row.id ? row : { ...row, id: randomUUID() }));

export async function saveRecord(db, owner, entity, input, recordId, opts = {}) {
  if (!schemas[entity]) throw fail(404, 'Unknown record type');
  const previous = recordId ? await getRecord(db, owner, entity, recordId) : {};
  const merged = { ...previous, ...input };
  if (entity === 'WorkItem' && merged.status === undefined) merged.status = merged.done ? 'done' : 'prep';
  const data = schemas[entity].parse(merged);
  // Every line gets a stable id the first time it's saved with none, so a signed line can be
  // linked to its WorkItem later. Lines that already carry one (round-tripped by the editor) keep it.
  if ((entity === 'Estimate' || entity === 'ChangeOrder') && Array.isArray(data.lines)) {
    data.lines = data.lines.map(line => ({ ...line, id: line.id || randomUUID(), ...(line.steps && { steps: withIds(line.steps) }) }));
  }
  // A change order priced line by line (like an estimate) adds exactly its lines' total; the net is
  // that less any credit. Computed here so the signed figures can't drift from the lines.
  if (entity === 'ChangeOrder' && !data.accepted_snapshot && Array.isArray(data.lines) && data.lines.some(isPricedScopeLine)) {
    const cents = data.lines.reduce((sum, line) => sum + Math.max(0, Math.round(scopeLineAmount(line) * 100)), 0);
    data.added_cost = cents / 100;
    data.net_change = Math.round(cents - (Number(data.credit) || 0) * 100) / 100;
  }
  if (entity === 'WorkItem') {
    for (const key of ['steps', 'measurements', 'materials']) if (data[key]) data[key] = withIds(data[key]);
    data.done = data.status === 'done';
    // A new card note is stamped with when it was written and the status the task had then.
    if (data.status_notes) {
      const now = new Date().toISOString();
      data.status_notes = data.status_notes.map(note => (note.id ? note : { ...note, id: randomUUID(), status: note.status || data.status, created_at: now }));
    }
  }
  if (entity === 'Client' && !opts.skipClientAddressCheck) {
    const touchingAddress = !recordId || CLIENT_ADDRESS_KEYS.some((key) => Object.prototype.hasOwnProperty.call(input || {}, key));
    if (touchingAddress) assertClientAddressComplete(data);
  }
  const { parentId, parentEntity } = parentFor(entity, data);
  if (parentId) await getRecord(db, owner, parentEntity, parentId);
  if (data.related_estimate_id) await getRecord(db, owner, 'Estimate', data.related_estimate_id);
  if (entity === 'WorkItem') {
    if (data.source_type) {
      const source = await getRecord(db, owner, data.source_type, data.source_id);
      if (source.job_id !== data.job_id) throw fail(400, `That ${data.source_type} belongs to a different job`);
    }
    if (data.billed_invoice_id) {
      const invoice = await getRecord(db, owner, 'Invoice', data.billed_invoice_id);
      if (invoice.job_id !== data.job_id) throw fail(400, 'That invoice belongs to a different job');
    }
  }
  if (data.related_material_order_id) {
    const mo = await getRecord(db, owner, 'MaterialOrder', data.related_material_order_id);
    if (entity === 'TimelineEntry' && data.job_id && mo.job_id !== data.job_id) {
      throw fail(400, 'Material Order receipt must belong to the same job');
    }
  }
  if (Array.isArray(data.billed_change_order_ids)) {
    for (const changeOrderId of data.billed_change_order_ids) await getRecord(db, owner, 'ChangeOrder', changeOrderId);
  }
  if (entity === 'Payment' && data.invoice_id) {
    const invoice = await getRecord(db, owner, 'Invoice', data.invoice_id);
    if (invoice.job_id !== data.job_id) throw fail(400, 'Payment invoice must belong to the same job');
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
