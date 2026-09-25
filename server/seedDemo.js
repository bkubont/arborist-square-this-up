/**
 * Account-scoped demo wipe + seed for local SQLite and production MySQL.
 * Keeps the login and CompanyProfile (sales tax / branding); wipes business data only.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileIdsOf, saveRecord, decode } from './domain.js';
import { createWorkItemsForLines } from './workItems.js';
import { attachDefaultJobTasks } from './defaultJobTasks.js';
import { attachDefaultPunchList } from './defaultPunchList.js';
import { applyJobArchiveFields, isArchivedJob } from './jobArchive.js';
import { applyJobStatusFields, JOB_PHASE_ORDER } from './jobStatus.js';
import { emailSchema } from './security.js';

/** Business entities wiped before reseeding (CompanyProfile is preserved). */
export const WIPE_ENTITIES = [
  'Client',
  'Job',
  'TimelineEntry',
  'Expense',
  'Estimate',
  'MaterialOrder',
  'ChangeOrder',
  'Invoice',
  'PunchList',
  'Payment',
  'WorkItem',
];

const CLIENT_NAMES = [
  'Rivera Residence',
  'Oak Street Condos',
  'Patel Family',
  'Harbor View Inn',
  'Nguyen Household',
  'Cedar Lane LLC',
  'Brooks Property Mgmt',
  'Summit Church',
  'Garcia Duplex',
  'Maple Grove HOA',
  'Ellis Bakery',
  'Thompson Rental',
  'Lakeside Dental',
  'Kim Studio',
  'West End Storage',
];

/** 8 clients with jobs: 4×1 + 2×2 + 2×3 = 14 jobs; remaining 7 clients have none. */
const JOBS_PER_CLIENT = [1, 1, 1, 1, 2, 2, 3, 3, 0, 0, 0, 0, 0, 0, 0];

/**
 * Demo job blueprints — statuses use real Job enum values; docs respect one-doc rules.
 * Index order maps onto the 14 job slots in client order.
 */
const JOB_BLUEPRINTS = [
  {
    title: 'Guest bath vanity swap',
    phase: 'lead',
    status: 'Plan / draft estimate',
    description: 'Replace vanity, faucet, and mirror.',
    estimate: { status: 'draft', labor: 480, material: 320 },
  },
  {
    title: 'Kitchen faucet + shutoffs',
    phase: 'lead',
    status: 'Waiting on approval',
    description: 'Quote sent; waiting on client approval.',
    estimate: { status: 'sent', labor: 220, material: 95 },
  },
  {
    title: 'Front porch railing repair',
    phase: 'working',
    status: 'Prep',
    description: 'Accepted; crew scheduled next week.',
    estimate: { status: 'accepted', labor: 640, material: 210 },
    tasks: 'plan',
    materialOrder: { status: 'purchased' },
    deposit: 200,
  },
  {
    title: 'Basement egress window trim',
    phase: 'working',
    status: 'Prep',
    description: 'Materials staged; start date set.',
    estimate: { status: 'accepted', labor: 900, material: 450 },
    tasks: 'plan',
    materialOrder: { status: 'quote' },
    deposit: 300,
  },
  {
    title: 'Laundry room flooring',
    phase: 'working',
    status: 'Blocked',
    description: 'Inspector rescheduled — cannot close wall until pass.',
    estimate: { status: 'accepted', labor: 1100, material: 780 },
    tasks: 'plan',
    materialOrder: { status: 'received' },
    deposit: 400,
  },
  {
    title: 'Attic insulation top-off',
    phase: 'working',
    status: 'In progress',
    description: 'Blown-in in progress; access from garage.',
    estimate: { status: 'accepted', labor: 750, material: 520 },
    tasks: 'plan',
    changeOrder: { status: 'sent', amount: 180 },
    deposit: 250,
  },
  {
    title: 'Master shower valve rebuild',
    phase: 'working',
    status: 'In progress',
    description: 'Valve on backorder from supplier.',
    jobMaterials: [{ description: 'Shower valve cartridge', qty: 1, unit_price: 85, have: false }],
    estimate: { status: 'accepted', labor: 380, material: 160 },
    tasks: 'plan',
    materialOrder: { status: 'partial', lineStatus: 'backorder' },
    deposit: 150,
  },
  {
    title: 'Fence gate hardware refresh',
    phase: 'working',
    status: 'In progress',
    description: 'Custom hinges ordered.',
    jobMaterials: [{ description: 'Gate hinges', qty: 2, unit_price: 42, have: false }],
    estimate: { status: 'accepted', labor: 260, material: 140 },
    tasks: 'plan',
    materialOrder: { status: 'quote' },
  },
  {
    title: 'Office paint + trim',
    phase: 'payment',
    status: 'Waiting on payment',
    description: 'Punch list done; invoice ready to send.',
    estimate: { status: 'accepted', labor: 1400, material: 380 },
    tasks: 'completed',
    materialOrder: { status: 'received' },
    invoice: { status: 'draft' },
    deposit: 500,
  },
  {
    title: 'Garage door opener install',
    phase: 'payment',
    status: 'Waiting on payment',
    description: 'Work finished; invoice out for payment.',
    estimate: { status: 'accepted', labor: 320, material: 410 },
    tasks: 'completed',
    invoice: { status: 'sent' },
    deposit: 100,
  },
  {
    title: 'Deck power-wash + seal',
    phase: 'payment',
    status: 'Paid',
    description: 'Fully paid and closed.',
    estimate: { status: 'accepted', labor: 680, material: 240 },
    tasks: 'completed',
    invoice: { status: 'paid' },
    deposit: 200,
    payment: 720,
  },
  {
    title: 'Ceiling fan replacements (3)',
    phase: 'payment',
    status: 'Paid',
    description: 'Paid in full after partial deposit.',
    estimate: { status: 'accepted', labor: 540, material: 360 },
    tasks: 'completed',
    invoice: { status: 'paid' },
    deposit: 150,
    payment: 750,
  },
  {
    title: 'Half-bath exhaust fan',
    phase: 'lead',
    status: 'Plan / draft estimate',
    description: 'New lead; draft estimate only.',
    estimate: { status: 'draft', labor: 180, material: 75 },
  },
  {
    title: 'Kitchen backsplash repair',
    phase: 'working',
    status: 'In progress',
    description: 'Tile set curing; CO approved for extra outlet.',
    estimate: { status: 'accepted', labor: 820, material: 390 },
    tasks: 'plan',
    materialOrder: { status: 'purchased' },
    changeOrder: { status: 'approved', amount: 220 },
    deposit: 300,
  },
];

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

function estimateTotals(labor, material, taxRate = 6) {
  const subtotal = money(labor + material);
  const tax_amount = money(subtotal * (taxRate / 100));
  const total = money(subtotal + tax_amount);
  return { subtotal, tax_amount, total, tax_rate: taxRate };
}

function estimateLines(labor, material) {
  return [
    {
      description: 'Scope of work',
      labor_amount: money(labor + material),
      material_amount: 0,
      labor_hours: money(labor / 65),
      labor_rate: 65,
      category: 'General',
    },
  ];
}

function addressFor(index) {
  const streets = [
    '12 Maple Ave', '88 Oak St', '415 River Rd', '9 Harbor Ln', '220 Cedar Ct',
    '67 Pine Dr', '1501 Summit Blvd', '33 Church Way', '902 Elm St', '18 Grove Cir',
    '4 Baker Pl', '771 Rental Row', '250 Lakeside Dr', '61 Studio Ave', '1200 West End Rd',
  ];
  return {
    address: streets[index],
    city: 'Springfield',
    state: 'IL',
    zip: String(62701 + (index % 20)).padStart(5, '0'),
    phone: `217-555-${String(1000 + index).slice(-4)}`,
    email: `client${index + 1}@example.com`,
  };
}

/**
 * Wipe business data for one account. Preserves users row, sessions, and CompanyProfile
 * (including logo file if referenced). Removes other records, orphaned files, and sign links.
 */
export async function wipeAccountBusinessData(db, ownerId) {
  const profiles = await db.all(
    'SELECT * FROM records WHERE owner_id = ? AND entity = ?',
    [ownerId, 'CompanyProfile'],
  );
  const keepFileIds = new Set();
  for (const row of profiles) {
    for (const fileId of fileIdsOf(JSON.parse(row.data))) keepFileIds.add(fileId);
  }

  await db.run(
    `DELETE FROM records WHERE owner_id = ? AND entity != ?`,
    [ownerId, 'CompanyProfile'],
  );
  await db.run('DELETE FROM sign_links WHERE owner_id = ?', [ownerId]);

  const files = await db.all('SELECT id FROM files WHERE owner_id = ?', [ownerId]);
  for (const file of files) {
    if (keepFileIds.has(file.id)) continue;
    await db.run('DELETE FROM files WHERE id = ? AND owner_id = ?', [file.id, ownerId]);
  }

  return {
    profilesKept: profiles.length,
    filesKept: keepFileIds.size,
  };
}

function prepareDemoJobFields(blueprint, client, { start_date, end_date }) {
  return applyJobArchiveFields(applyJobStatusFields({
    title: blueprint.title,
    client_id: client.id,
    client_name: client.name,
    description: blueprint.description,
    phase: blueprint.phase,
    status: blueprint.status,
    start_date,
    end_date,
    notes: 'Demo seed job',
    // Prefer timeline deposit_received for demo money (matches UI logDeposit).
    // Do not also set deposit_amount — FinancialPanel / sumDepositsApplied add both.
    deposit_amount: 0,
    materials: blueprint.jobMaterials || undefined,
  }));
}

/** Where seeded jobs land in the UI (Board hides archived terminal statuses). */
export function summarizeDemoJobVisibility(jobs) {
  const archived = jobs.filter((job) => isArchivedJob(job));
  const board = jobs.filter((job) => !isArchivedJob(job));
  const boardByPhase = Object.fromEntries(
    JOB_PHASE_ORDER.map((phase) => [
      phase,
      board.filter((job) => (job.phase || 'lead') === phase).length,
    ]),
  );
  return {
    allJobs: jobs.length,
    boardJobs: board.length,
    archivedJobs: archived.length,
    archivedStatuses: [...new Set(archived.map((job) => job.status))],
    boardByPhase,
  };
}

async function seedJob(db, ownerId, client, blueprint, jobIndex, taxRate) {
  const startOffset = -20 + (jobIndex % 10) * 2;
  const start_date = isoDate(startOffset);
  const end_date = isoDate(startOffset + 5);
  const labor = blueprint.estimate.labor;
  const material = blueprint.estimate.material;
  const totals = estimateTotals(labor, material, taxRate);
  const lines = estimateLines(labor, material);

  const job = await saveRecord(db, ownerId, 'Job', prepareDemoJobFields(blueprint, client, { start_date, end_date }));
  await attachDefaultJobTasks(db, ownerId, job.id);
  await attachDefaultPunchList(db, ownerId, job.id);

  const estimatePayload = {
    job_id: job.id,
    number: `EST-${1001 + jobIndex}`,
    date: isoDate(startOffset - 3),
    valid_till: isoDate(startOffset + 7),
    status: blueprint.estimate.status,
    lines,
    notes: 'Demo estimate',
    ...totals,
  };
  if (blueprint.estimate.status === 'accepted') {
    estimatePayload.accepted_snapshot = {
      number: estimatePayload.number,
      notes: estimatePayload.notes,
      tax_rate: totals.tax_rate,
      lines,
      subtotal: totals.subtotal,
      tax_amount: totals.tax_amount,
      total: totals.total,
    };
    estimatePayload.signed_at = new Date(Date.now() - (10 - (jobIndex % 5)) * 86400000).toISOString();
    estimatePayload.signer_name = client.name;
  }
  const estimate = await saveRecord(db, ownerId, 'Estimate', estimatePayload);

  // Tasks: built-in Prep + Materials (attachDefaultJobTasks), one per signed estimate line, at the job's stage.
  const setTaskStatuses = async (sourceId, status) => {
    const rows = await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [ownerId, 'WorkItem', job.id]);
    for (const item of rows.map(decode)) {
      if (item.source_id === sourceId) await saveRecord(db, ownerId, 'WorkItem', { status }, item.id);
    }
  };
  if (blueprint.estimate.status === 'accepted') {
    await createWorkItemsForLines(db, ownerId, { jobId: job.id, sourceType: 'Estimate', sourceId: estimate.id, lines: estimate.accepted_snapshot.lines });
    await setTaskStatuses(estimate.id, blueprint.tasks || 'plan');
  }
  if (['Completed', 'Paid'].includes(blueprint.status)) {
    const punchRows = await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?', [ownerId, 'PunchList', job.id]);
    for (const punch of punchRows.map(decode)) {
      if (punch.status !== 'completed') {
        await saveRecord(db, ownerId, 'PunchList', { status: 'completed', completed_at: new Date().toISOString() }, punch.id);
      }
    }
  }

  if (blueprint.materialOrder) {
    await saveRecord(db, ownerId, 'MaterialOrder', {
      job_id: job.id,
      number: `MO-${1001 + jobIndex}`,
      date: start_date,
      related_estimate_id: estimate.id,
      status: blueprint.materialOrder.status,
      lines: [
        {
          description: 'Primary materials',
          qty: 1,
          unit_price: money(material),
          supplier: jobIndex % 2 === 0 ? 'Home Depot' : 'Menards',
          category: 'Materials',
          line_status: blueprint.materialOrder.lineStatus,
        },
      ],
      subtotal: money(material),
      total: money(material),
    });
  }

  let changeOrder;
  if (blueprint.changeOrder) {
    const amount = money(blueprint.changeOrder.amount);
    changeOrder = await saveRecord(db, ownerId, 'ChangeOrder', {
      job_id: job.id,
      number: `CO-${1001 + jobIndex}`,
      related_estimate_id: estimate.id,
      reason: 'Scope addition',
      description: 'Extra work requested on site',
      added_cost: amount,
      credit: 0,
      net_change: amount,
      tax_rate: taxRate,
      status: blueprint.changeOrder.status,
      lines: [{ description: 'Additional work', labor_amount: amount, category: 'General' }],
      ...(blueprint.changeOrder.status === 'approved'
        ? {
            accepted_snapshot: {
              reason: 'Scope addition',
              description: 'Extra work requested on site',
              added_cost: amount,
              credit: 0,
              net_change: amount,
              tax_rate: taxRate,
              lines: [{ description: 'Additional work', labor_amount: amount, category: 'General' }],
            },
            signed_at: new Date().toISOString(),
            signer_name: client.name,
          }
        : {}),
    });
  }

  if (changeOrder?.status === 'approved') {
    await createWorkItemsForLines(db, ownerId, { jobId: job.id, sourceType: 'ChangeOrder', sourceId: changeOrder.id, lines: changeOrder.accepted_snapshot.lines });
    await setTaskStatuses(changeOrder.id, blueprint.tasks || 'plan');
  }

  let invoice;
  let paymentAmount = money(blueprint.payment || 0);
  if (blueprint.invoice && blueprint.estimate.status === 'accepted') {
    const coNet = changeOrder && changeOrder.status === 'approved' ? Number(changeOrder.net_change) || 0 : 0;
    const invoiceSub = money(totals.subtotal + coNet);
    const invoiceTax = money(invoiceSub * (taxRate / 100));
    const invoiceTotal = money(invoiceSub + invoiceTax);
    const deposits = money(blueprint.deposit || 0);
    // Paid invoices must clear in full (deposit + payment cover tax-inclusive total).
    if (blueprint.invoice.status === 'paid') {
      paymentAmount = money(Math.max(0, invoiceTotal - deposits));
    } else {
      paymentAmount = money(blueprint.payment || 0);
    }
    const payments = paymentAmount;
    const balance = money(Math.max(0, invoiceTotal - deposits - payments));
    invoice = await saveRecord(db, ownerId, 'Invoice', {
      job_id: job.id,
      number: `INV-${1001 + jobIndex}`,
      date: isoDate(startOffset + 6),
      related_estimate_id: estimate.id,
      billed_change_order_ids: changeOrder && changeOrder.status === 'approved' ? [changeOrder.id] : [],
      status: blueprint.invoice.status,
      payment_terms: 'Due upon receipt',
      tax_rate: taxRate,
      project_name: blueprint.title,
      estimate_ref: estimate.number,
      material_lines: [{ description: 'Materials', qty: 1, unit_price: money(material) }],
      labor_lines: [{ description: 'Labor', hours: money(labor / 65), rate: 65 }],
      misc_lines: coNet ? [{ description: 'Approved change order', amount: coNet }] : [],
      materials_total: money(material),
      labor_total: money(labor),
      misc_total: money(coNet),
      subtotal: invoiceSub,
      tax_amount: invoiceTax,
      total: invoiceTotal,
      deposits_applied: deposits,
      payments_applied: payments,
      balance_due: balance,
    });
  }

  // Timeline: status + key document / money events so Dashboard / Activity look alive.
  const events = [
    { type: 'status_change', category: 'note', text: `Status set to ${blueprint.status}` },
    { type: 'document_created', category: 'document', text: `Estimate ${estimate.number} created` },
  ];
  if (blueprint.estimate.status === 'sent' || blueprint.estimate.status === 'accepted') {
    events.push({ type: 'estimate_sent', category: 'financial', text: `Estimate ${estimate.number} sent` });
  }
  if (blueprint.estimate.status === 'accepted') {
    events.push({ type: 'estimate_signed', category: 'document', text: `Estimate ${estimate.number} accepted` });
  }
  if (changeOrder?.status === 'sent') {
    events.push({ type: 'change_order_sent', category: 'financial', text: `Change Order ${changeOrder.number} sent` });
  }
  if (changeOrder?.status === 'approved') {
    events.push({ type: 'change_order_signed', category: 'document', text: `Change Order ${changeOrder.number} approved` });
  }
  if (blueprint.deposit) {
    events.push({
      type: 'deposit_received',
      category: 'financial',
      text: `Deposit received`,
      amount: money(blueprint.deposit),
    });
  }
  if (invoice && invoice.status !== 'draft') {
    events.push({ type: 'invoice_sent', category: 'financial', text: `Invoice ${invoice.number} ${invoice.status}` });
  }
  if (paymentAmount > 0) {
    events.push({
      type: 'payment_received',
      category: 'financial',
      text: 'Payment received',
      amount: paymentAmount,
    });
  }
  events.push({ type: 'note', category: 'note', text: blueprint.description });

  for (const event of events) {
    await saveRecord(db, ownerId, 'TimelineEntry', { job_id: job.id, ...event });
  }

  // Roll up job money fields from documents (mirrors refreshJobDocumentRollups).
  const estimateAmount = blueprint.estimate.status === 'accepted' ? totals.total : 0;
  const materialsCost = blueprint.materialOrder ? money(material) : 0;
  const invoiceAmount = invoice && invoice.status !== 'void' ? invoice.total : 0;
  await saveRecord(db, ownerId, 'Job', {
    estimate_amount: estimateAmount,
    materials_cost: materialsCost,
    invoice_amount: invoiceAmount || 0,
  }, job.id);

  return job;
}

/**
 * Seed demo clients/jobs/docs for one account. Caller should wipe first if re-seeding.
 * @returns {{ clients: number, jobs: number, expenses: number }}
 */
export async function seedDemoData(db, ownerId) {
  const profileRows = await db.all(
    'SELECT * FROM records WHERE owner_id = ? AND entity = ? ORDER BY created_date DESC LIMIT 1',
    [ownerId, 'CompanyProfile'],
  );
  const taxRate = profileRows.length
    ? Number(decode(profileRows[0]).default_tax_rate) || 6
    : 6;

  const clients = [];
  for (let i = 0; i < CLIENT_NAMES.length; i += 1) {
    const client = await saveRecord(db, ownerId, 'Client', {
      name: CLIENT_NAMES[i],
      notes: i < 8 ? 'Has demo jobs' : 'Prospect / no jobs yet',
      ...addressFor(i),
    });
    clients.push(client);
  }

  let jobIndex = 0;
  for (let i = 0; i < clients.length; i += 1) {
    const count = JOBS_PER_CLIENT[i];
    for (let j = 0; j < count; j += 1) {
      await seedJob(db, ownerId, clients[i], JOB_BLUEPRINTS[jobIndex], jobIndex, taxRate);
      jobIndex += 1;
    }
  }

  // A few expenses (some job-linked, some inbox) for Receipts / Reports.
  const jobs = await db.all(
    'SELECT id FROM records WHERE owner_id = ? AND entity = ? ORDER BY created_date ASC',
    [ownerId, 'Job'],
  );
  const expenseSpecs = [
    { amount: 48.2, category: 'Fuel', vendor: 'Shell', note: 'Truck fill-up', job_id: undefined },
    { amount: 126.5, category: 'Materials', vendor: 'Home Depot', note: 'Unassigned receipt', job_id: undefined },
    { amount: 89.99, category: 'Tools', vendor: 'Harbor Freight', note: 'Blade set', job_id: jobs[0]?.id },
    { amount: 34.0, category: 'Supplies', vendor: 'Menards', note: 'Tape & caulk', job_id: jobs[4]?.id },
  ];
  for (const spec of expenseSpecs) {
    await saveRecord(db, ownerId, 'Expense', {
      amount: spec.amount,
      date: isoDate(-2),
      category: spec.category,
      vendor: spec.vendor,
      note: spec.note,
      ...(spec.job_id ? { job_id: spec.job_id } : {}),
    });
  }

  const jobRows = await db.all(
    'SELECT data FROM records WHERE owner_id = ? AND entity = ?',
    [ownerId, 'Job'],
  );
  const jobRecords = jobRows.map((row) => JSON.parse(row.data));

  return {
    clients: clients.length,
    jobs: jobIndex,
    expenses: expenseSpecs.length,
    clientsWithJobs: JOBS_PER_CLIENT.filter((n) => n > 0).length,
    clientsWithoutJobs: JOBS_PER_CLIENT.filter((n) => n === 0).length,
    visibility: summarizeDemoJobVisibility(jobRecords),
  };
}

/**
 * Wipe business data then seed demo data for the given email.
 * Requires `--yes` or interactive confirmation.
 */
export async function wipeAndSeedAccount(db, email, { yes = false, confirm = defaultConfirm } = {}) {
  const normalized = emailSchema.parse(email);
  const [user] = await db.all('SELECT id, email FROM users WHERE email = ?', [normalized]);
  if (!user) throw new Error(`Account not found: ${normalized}`);

  const existing = await db.all(
    'SELECT entity, COUNT(*) AS n FROM records WHERE owner_id = ? GROUP BY entity',
    [user.id],
  );
  const summary = existing.map((r) => `${r.entity}:${Number(r.n)}`).join(', ') || '(empty)';

  if (!yes) {
    const ok = await confirm(
      `Wipe ALL business data for ${normalized} and reseed demo clients/jobs?\n`
      + `Keeps login + CompanyProfile. Current records: ${summary}\n`
      + 'Type YES to continue: ',
    );
    if (!ok) throw new Error('Aborted (confirmation required). Re-run with --yes to skip the prompt.');
  }

  return db.transaction(async (tx) => {
    await wipeAccountBusinessData(tx, user.id);
    const seeded = await seedDemoData(tx, user.id);
    return { email: normalized, ownerId: user.id, ...seeded };
  });
}

async function defaultConfirm(promptText) {
  if (!input.isTTY) return false;
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(promptText);
    return String(answer).trim() === 'YES';
  } finally {
    rl.close();
  }
}

export const DEMO_SPEC = {
  clients: CLIENT_NAMES.length,
  jobsPerClient: JOBS_PER_CLIENT,
  totalJobs: JOB_BLUEPRINTS.length,
  jobStatuses: JOB_BLUEPRINTS.map((b) => b.status),
  /** Paid demo jobs are intentionally archived — Board/Active show the rest. */
  expectedBoardJobs: JOB_BLUEPRINTS.length - JOB_BLUEPRINTS.filter((b) => b.status === 'Paid').length,
  expectedArchivedJobs: JOB_BLUEPRINTS.filter((b) => b.status === 'Paid').length,
};

/** Human-readable database target for seed-demo CLI output. */
export function describeSeedDatabase(db, env = process.env) {
  if (db.dialect === 'mysql') {
    return {
      label: `mysql://${env.DB_HOST || '?'}/${env.DB_NAME || '?'}`,
      hint: 'Production MySQL — confirm this matches the running app.',
    };
  }
  const path = env.SQLITE_PATH || '.data/job-tracker.sqlite';
  return {
    label: `sqlite:${path}`,
    hint: 'Local SQLite dev database — not Hostinger MySQL. Set DB_HOST/DB_USER/DB_PASSWORD/DB_NAME to seed production.',
  };
}
