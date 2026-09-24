/** Brittany's three-phase job status model (Lead → Working → Payment). */

export const JOB_PHASE_ORDER = ['lead', 'working', 'payment'];

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
    ],
  },
  payment: {
    label: 'Payment',
    statuses: [
      'Invoiced',
      'Waiting on payment',
      'Partial',
      'Late',
      'Paid',
    ],
  },
};

export const ALL_JOB_STATUSES = JOB_PHASE_ORDER.flatMap((phase) => JOB_PHASES[phase].statuses);

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

export const ACTIVE_JOB_STATUSES = ALL_JOB_STATUSES.filter((s) => !ARCHIVE_JOB_STATUSES.has(s));

export function phaseForStatus(status) {
  if (!status) return null;
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

  if (!phase || !JOB_PHASES[phase]) {
    phase = phaseForStatus(status) || 'lead';
  }

  if (!status || !JOB_PHASES[phase].statuses.includes(status)) {
    status = defaultStatusForPhase(phase);
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
  const next = { ...body };

  if (next.phase && !next.status) {
    next.status =
      prior?.phase === next.phase && prior?.status
        ? prior.status
        : defaultStatusForPhase(next.phase);
  }

  if (next.status && !next.phase) {
    next.phase = phaseForStatus(next.status) || migrateLegacyStatus(next.status)?.phase;
  }

  const merged = normalizeJobRecord({ ...prior, ...next });
  return { ...next, phase: merged.phase, status: merged.status };
}
