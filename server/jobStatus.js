/** Working + Payment job boards. Lead lives on the customer profile only. */

export const JOB_PHASE_ORDER = ['working', 'payment'];

/** Invoiced is a Payment status. It is not a Working column. */
export const INVOICE_GATE_STATUS = 'Invoiced';
export const PAYMENT_ENTRY_STATUS = 'Waiting on payment';

export const JOB_PHASES = {
  working: {
    label: 'Working',
    statuses: [
      'Estimate',
      'Waiting on approval',
      'Approved',
      'Prep',
      'In progress',
      'Waiting on materials',
      'Blocked',
      'Completed',
      'Cancelled',
    ],
  },
  payment: {
    label: 'Payment',
    statuses: [
      INVOICE_GATE_STATUS,
      PAYMENT_ENTRY_STATUS,
      'Partial',
      'Late',
      'Paid',
    ],
  },
};

/** Estimate pipeline on Working — cards open Overview; money is quote-only. */
export const ESTIMATE_STAGE_STATUSES = ['Estimate', 'Waiting on approval', 'Approved'];

/** Statuses that may appear on stored jobs. Invoiced is a real Payment status. */
export const STORED_JOB_STATUSES = JOB_PHASE_ORDER.flatMap((phase) => JOB_PHASES[phase].statuses);

export const ALL_JOB_STATUSES = STORED_JOB_STATUSES;

/** Pre–working-board job.status values → phase + status. */
export const LEGACY_JOB_STATUS_MAP = {
  Contact: { phase: 'working', status: 'Estimate' },
  Assessment: { phase: 'working', status: 'Estimate' },
  'Plan / draft estimate': { phase: 'working', status: 'Estimate' },
  Declined: { phase: 'working', status: 'Cancelled' },
  Scheduled: { phase: 'working', status: 'Prep' },
  'In Progress': { phase: 'working', status: 'In progress' },
  'Waiting on Materials': { phase: 'working', status: 'Waiting on materials' },
  'On Hold': { phase: 'working', status: 'Blocked' },
};

/** Terminal statuses — job leaves working lists and lands in archive. */
export const ARCHIVE_JOB_STATUSES = new Set([
  'Paid',
  'Declined',
  'Cancelled',
]);

export const ACTIVE_JOB_STATUSES = STORED_JOB_STATUSES.filter((s) => !ARCHIVE_JOB_STATUSES.has(s));

export function isEstimateStageStatus(status) {
  return ESTIMATE_STAGE_STATUSES.includes(status);
}

export function phaseForStatus(status) {
  if (!status) return null;
  for (const phase of JOB_PHASE_ORDER) {
    if (JOB_PHASES[phase].statuses.includes(status)) return phase;
  }
  return LEGACY_JOB_STATUS_MAP[status]?.phase || null;
}

export function defaultStatusForPhase(phase) {
  return JOB_PHASES[phase]?.statuses[0] || 'Estimate';
}

export function isLegacyJobStatus(status) {
  return Boolean(status && LEGACY_JOB_STATUS_MAP[status]);
}

/** Map legacy status string to phase + status (no-op for new statuses). */
export function migrateLegacyStatus(status) {
  return LEGACY_JOB_STATUS_MAP[status] || null;
}

/** Invoiced is Payment. Keep the status; put the job on the Payment board. */
export function applyInvoicedGate(fields) {
  if (!fields || fields.status !== INVOICE_GATE_STATUS) return fields;
  return { ...fields, phase: 'payment', status: INVOICE_GATE_STATUS };
}

/** Ensure job.phase and job.status are valid and aligned; migrate legacy status on read. */
export function normalizeJobRecord(job) {
  if (!job || typeof job !== 'object') return job;

  let phase = job.phase;
  let status = job.status;

  const legacy = migrateLegacyStatus(status);
  if (legacy) {
    phase = legacy.phase;
    status = legacy.status;
  }

  if (status === INVOICE_GATE_STATUS) {
    phase = 'payment';
  }

  if (!phase || !JOB_PHASES[phase]) {
    phase = phaseForStatus(status) || 'working';
  }

  const allowed = JOB_PHASES[phase].statuses;
  if (!status || !allowed.includes(status)) {
    status = defaultStatusForPhase(phase);
  }

  const changed = phase !== job.phase || status !== job.status || !job.phase;
  return changed ? { ...job, phase, status } : job;
}

/** Apply phase/status on create or patch; keeps phase and status consistent. */
export function applyJobStatusFields(body, previous) {
  if (!body || typeof body !== 'object') return body;

  const prior = previous ? normalizeJobRecord(previous) : null;
  let next = { ...body };

  if (next.phase && !next.status) {
    next.status =
      prior?.phase === next.phase && prior?.status
        ? prior.status
        : defaultStatusForPhase(next.phase);
  }

  if (next.status && !next.phase) {
    next.phase = phaseForStatus(next.status) || migrateLegacyStatus(next.status)?.phase;
  }

  next = applyInvoicedGate(next);

  const merged = normalizeJobRecord({ ...prior, ...next });
  const movesBoard = Object.prototype.hasOwnProperty.call(body, 'status')
    || Object.prototype.hasOwnProperty.call(body, 'phase');
  const track = movesBoard
    ? (merged.phase === 'working'
      ? { working_status: merged.status }
      : merged.phase === 'payment'
        ? { payment_status: merged.status }
        : {})
    : {};
  return { ...next, ...track, phase: merged.phase, status: merged.status };
}

/** Persist Contact / Assessment / Plan-draft-estimate jobs onto Estimate so they stay on Working. */
export async function backfillJobStatuses(db) {
  const rows = await db.all("SELECT id, owner_id, data FROM records WHERE entity = 'Job'");
  let updated = 0;
  for (const row of rows) {
    const data = JSON.parse(row.data);
    const next = normalizeJobRecord(data);
    if (next.phase === data.phase && next.status === data.status) continue;
    await db.run(
      'UPDATE records SET data = ? WHERE id = ? AND owner_id = ?',
      [JSON.stringify({ ...data, phase: next.phase, status: next.status }), row.id, row.owner_id],
    );
    updated += 1;
  }
  return updated;
}
