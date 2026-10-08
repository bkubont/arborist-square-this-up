/** Working + Payment job boards. Lead lives on the customer profile only. */

export const JOB_PHASE_ORDER = ['working', 'payment'];

/** Invoiced is a Payment status. It is not a Working column. */
export const INVOICE_GATE_STATUS = 'Invoiced';
export const PAYMENT_ENTRY_STATUS = 'Waiting on payment';

export const JOB_PHASES = {
  working: {
    label: 'Working',
    statuses: [
      'New inquiry',
      'Site visit',
      'Estimate sent',
      'Approved',
      'Ready to Schedule',
      'Prep',
      'In progress',
      'Waiting on',
      'Blocked',
      'Completed',
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

/** Lead + estimate pipeline on Working — cards open Overview; money is quote-only. */
export const ESTIMATE_STAGE_STATUSES = ['New inquiry', 'Site visit', 'Estimate sent', 'Approved'];

/** Approved work waiting for crew/date — dedicated dispatch queue (Phase 3). */
export const READY_TO_SCHEDULE_STATUS = 'Ready to Schedule';

/** Statuses that may appear on stored jobs. Invoiced is a real Payment status. */
export const STORED_JOB_STATUSES = JOB_PHASE_ORDER.flatMap((phase) => JOB_PHASES[phase].statuses);

export const ALL_JOB_STATUSES = STORED_JOB_STATUSES;

/** Pre–working-board and retired column labels → phase + status. */
export const LEGACY_JOB_STATUS_MAP = {
  Contact: { phase: 'working', status: 'Estimate sent' },
  Assessment: { phase: 'working', status: 'Estimate sent' },
  'Plan / draft estimate': { phase: 'working', status: 'Estimate sent' },
  Estimate: { phase: 'working', status: 'Estimate sent' },
  'Waiting on approval': { phase: 'working', status: 'Estimate sent' },
  Declined: { phase: 'working', status: 'Completed' },
  Cancelled: { phase: 'working', status: 'Completed' },
  Scheduled: { phase: 'working', status: 'Prep' },
  'In Progress': { phase: 'working', status: 'In progress' },
  'Waiting on Materials': { phase: 'working', status: 'Waiting on' },
  'Waiting on materials': { phase: 'working', status: 'Waiting on' },
  'Waiting on access': { phase: 'working', status: 'Waiting on' },
  'Waiting on weather': { phase: 'working', status: 'Waiting on' },
  'Waiting on utility': { phase: 'working', status: 'Waiting on' },
  'On Hold': { phase: 'working', status: 'Blocked' },
};

/** Terminal statuses — job leaves working lists and lands in archive. */
export const ARCHIVE_JOB_STATUSES = new Set([
  'Paid',
  'Declined',
]);

export const ACTIVE_JOB_STATUSES = STORED_JOB_STATUSES.filter((s) => !ARCHIVE_JOB_STATUSES.has(s));

export function isEstimateStageStatus(status) {
  return ESTIMATE_STAGE_STATUSES.includes(status)
    || status === 'Estimate'
    || status === 'Waiting on approval';
}

export function phaseForStatus(status) {
  if (!status) return null;
  for (const phase of JOB_PHASE_ORDER) {
    if (JOB_PHASES[phase].statuses.includes(status)) return phase;
  }
  return LEGACY_JOB_STATUS_MAP[status]?.phase || null;
}

/**
 * Default board column when creating/moving to a phase.
 * Working stays Estimate sent so existing create flows are unchanged;
 * New inquiry / Site visit are opt-in lead columns (Phase 2).
 */
export function defaultStatusForPhase(phase) {
  if (phase === 'working') return 'Estimate sent';
  return JOB_PHASES[phase]?.statuses[0] || 'Estimate sent';
}

export function isLegacyJobStatus(status) {
  return Boolean(status && LEGACY_JOB_STATUS_MAP[status]);
}

/** Map legacy status string to phase + status (no-op for new statuses). */
export function migrateLegacyStatus(status) {
  return LEGACY_JOB_STATUS_MAP[status] || null;
}

/** Canonical column label for a stored or legacy job status string. */
export function canonicalJobStatus(status) {
  if (!status) return status;
  if (STORED_JOB_STATUSES.includes(status)) return status;
  return LEGACY_JOB_STATUS_MAP[status]?.status || status;
}

/** Invoiced is Payment. Keep the status; put the job on the Payment board. */
export function applyInvoicedGate(fields) {
  if (!fields || fields.status !== INVOICE_GATE_STATUS) return fields;
  return { ...fields, phase: 'payment', status: INVOICE_GATE_STATUS };
}

function migrateWorkingStatus(workingStatus) {
  if (!workingStatus) return workingStatus;
  const next = canonicalJobStatus(workingStatus);
  return JOB_PHASES.working.statuses.includes(next) ? next : workingStatus;
}

function migrateStatusNotes(notes, fallbackStatus) {
  if (!Array.isArray(notes)) return notes;
  let changed = false;
  const next = notes.map((note) => {
    if (!note || typeof note !== 'object') return note;
    const stamped = note.status || fallbackStatus;
    const migrated = canonicalJobStatus(stamped);
    if (migrated === note.status) return note;
    changed = true;
    return { ...note, status: migrated };
  });
  return changed ? next : notes;
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

  const working_status = migrateWorkingStatus(job.working_status);
  const status_notes = migrateStatusNotes(job.status_notes, status);

  const changed = phase !== job.phase
    || status !== job.status
    || working_status !== job.working_status
    || status_notes !== job.status_notes
    || !job.phase;
  if (!changed) return job;
  const next = { ...job, phase, status };
  if (working_status !== job.working_status) next.working_status = working_status;
  if (status_notes !== job.status_notes) next.status_notes = status_notes;
  return next;
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

/** Persist retired column labels onto the current board statuses. */
export async function backfillJobStatuses(db) {
  const rows = await db.all("SELECT id, owner_id, data FROM records WHERE entity = 'Job'");
  let updated = 0;
  for (const row of rows) {
    const data = JSON.parse(row.data);
    const next = normalizeJobRecord(data);
    if (
      next.phase === data.phase
      && next.status === data.status
      && next.working_status === data.working_status
      && next.status_notes === data.status_notes
    ) continue;
    await db.run(
      'UPDATE records SET data = ? WHERE id = ? AND owner_id = ?',
      [JSON.stringify({
        ...data,
        phase: next.phase,
        status: next.status,
        ...(next.working_status !== data.working_status ? { working_status: next.working_status } : {}),
        ...(next.status_notes !== data.status_notes ? { status_notes: next.status_notes } : {}),
      }), row.id, row.owner_id],
    );
    updated += 1;
  }
  return updated;
}
