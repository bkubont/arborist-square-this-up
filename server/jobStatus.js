/** Brittany's three-phase job status model (Lead → Working → Payment). */

export const JOB_PHASE_ORDER = ['lead', 'working', 'payment'];

/** Dragging/marking Invoiced ends Working and lands the job on Payment (Waiting on payment). */
export const INVOICE_GATE_STATUS = 'Invoiced';
export const PAYMENT_ENTRY_STATUS = 'Waiting on payment';

export const JOB_PHASES = {
  lead: {
    label: 'Lead',
    statuses: [
      'Contact',
      'Assessment',
      'Plan / draft estimate',
      'Waiting on approval',
      'Approved',
      'Declined',
    ],
  },
  working: {
    label: 'Working',
    statuses: [
      'Prep',
      'In progress',
      'Waiting on materials',
      'Blocked',
      'Cancelled',
      'Completed',
      INVOICE_GATE_STATUS,
    ],
  },
  payment: {
    label: 'Payment',
    statuses: [
      PAYMENT_ENTRY_STATUS,
      'Partial',
      'Late',
      'Paid',
    ],
  },
};

/** Statuses that may appear on stored jobs (Invoiced is a gate input only). */
export const STORED_JOB_STATUSES = JOB_PHASE_ORDER.flatMap((phase) =>
  JOB_PHASES[phase].statuses.filter((s) => s !== INVOICE_GATE_STATUS),
);

export const ALL_JOB_STATUSES = [...STORED_JOB_STATUSES, INVOICE_GATE_STATUS];

/** Pre–three-phase job.status values → phase + status. */
export const LEGACY_JOB_STATUS_MAP = {
  Estimate: { phase: 'lead', status: 'Plan / draft estimate' },
  Scheduled: { phase: 'working', status: 'Prep' },
  'In Progress': { phase: 'working', status: 'In progress' },
  'Waiting on Materials': { phase: 'working', status: 'Waiting on materials' },
  Completed: { phase: 'working', status: 'Completed' },
  Paid: { phase: 'payment', status: 'Paid' },
};

/** Terminal statuses — job leaves working lists and lands in archive. */
export const ARCHIVE_JOB_STATUSES = new Set([
  'Completed',
  'Paid',
  'Declined',
  'Cancelled',
]);

export const ACTIVE_JOB_STATUSES = STORED_JOB_STATUSES.filter((s) => !ARCHIVE_JOB_STATUSES.has(s));

export function phaseForStatus(status) {
  if (!status) return null;
  if (status === INVOICE_GATE_STATUS) return 'working';
  for (const phase of JOB_PHASE_ORDER) {
    if (JOB_PHASES[phase].statuses.includes(status)) return phase;
  }
  return null;
}

export function defaultStatusForPhase(phase) {
  return JOB_PHASES[phase]?.statuses[0] || 'Contact';
}

export function isLegacyJobStatus(status) {
  return Boolean(status && LEGACY_JOB_STATUS_MAP[status]);
}

/** Map legacy status string to phase + status (no-op for new statuses). */
export function migrateLegacyStatus(status) {
  return LEGACY_JOB_STATUS_MAP[status] || null;
}

/** Invoiced ends Working — persist on Payment as Waiting on payment. */
export function applyInvoicedGate(fields) {
  if (!fields || fields.status !== INVOICE_GATE_STATUS) return fields;
  return { ...fields, phase: 'payment', status: PAYMENT_ENTRY_STATUS };
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
    status = PAYMENT_ENTRY_STATUS;
  }

  if (!phase || !JOB_PHASES[phase]) {
    phase = phaseForStatus(status) || 'lead';
  }

  const allowed = JOB_PHASES[phase].statuses.filter((s) => s !== INVOICE_GATE_STATUS);
  if (!status || !allowed.includes(status)) {
    status = defaultStatusForPhase(phase);
    if (status === INVOICE_GATE_STATUS) status = PAYMENT_ENTRY_STATUS;
  }

  if (phase !== job.phase || status !== job.status) {
    return { ...job, phase, status };
  }
  if (!job.phase) {
    return { ...job, phase };
  }
  return job;
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
  return { ...next, phase: merged.phase, status: merged.status };
}
