/** Brittany's three-phase job status model (Lead → Working → Payment). Port of src/lib/jobStatus.js */

export const JOB_PHASE_ORDER = ['lead', 'working', 'payment'] as const;
export type JobPhase = (typeof JOB_PHASE_ORDER)[number];

export const INVOICE_GATE_STATUS = 'Invoiced';
export const PAYMENT_ENTRY_STATUS = 'Waiting on payment';

export const JOB_PHASES: Record<JobPhase, { label: string; statuses: string[] }> = {
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
      'Waiting on materials',
      'Prep',
      'In progress',
      'Blocked',
      'Completed',
      'Cancelled',
    ],
  },
  payment: {
    label: 'Payment',
    statuses: [INVOICE_GATE_STATUS, PAYMENT_ENTRY_STATUS, 'Partial', 'Late', 'Paid'],
  },
};

export const STORED_JOB_STATUSES = JOB_PHASE_ORDER.flatMap(phase => JOB_PHASES[phase].statuses);

export const ARCHIVE_JOB_STATUSES = new Set(['Paid', 'Declined', 'Cancelled']);

export const ACTIVE_JOB_STATUSES = STORED_JOB_STATUSES.filter(s => !ARCHIVE_JOB_STATUSES.has(s));

export const LEGACY_JOB_STATUS_MAP: Record<string, { phase: JobPhase; status: string }> = {
  Estimate: { phase: 'lead', status: 'Plan / draft estimate' },
  Scheduled: { phase: 'working', status: 'Prep' },
  'In Progress': { phase: 'working', status: 'In progress' },
  'Waiting on Materials': { phase: 'working', status: 'Waiting on materials' },
  'On Hold': { phase: 'working', status: 'Blocked' },
  Completed: { phase: 'working', status: 'Completed' },
  Paid: { phase: 'payment', status: 'Paid' },
};

export function phaseForStatus(status: string | null | undefined): JobPhase | null {
  if (!status) return null;
  for (const phase of JOB_PHASE_ORDER) {
    if (JOB_PHASES[phase].statuses.includes(status)) return phase;
  }
  const legacy = LEGACY_JOB_STATUS_MAP[status];
  return legacy?.phase ?? null;
}

export function defaultStatusForPhase(phase: JobPhase | string): string {
  return JOB_PHASES[phase as JobPhase]?.statuses[0] || 'Contact';
}

export function statusesForPhase(phase: JobPhase | string): string[] {
  return JOB_PHASES[phase as JobPhase]?.statuses ? [...JOB_PHASES[phase as JobPhase].statuses] : [];
}

/** Invoiced is Payment. Keep the status; put the job on the Payment board. */
export function applyInvoicedGate(fields: { phase: string; status: string }) {
  if (!fields || fields.status !== INVOICE_GATE_STATUS) return fields;
  return { ...fields, phase: 'payment' as const, status: INVOICE_GATE_STATUS };
}

export function formatJobStatus(job: { phase?: string; status?: string } | null | undefined): string {
  if (!job) return '';
  const phaseLabel = JOB_PHASES[job.phase as JobPhase]?.label;
  if (phaseLabel) return `${phaseLabel} · ${job.status || ''}`;
  return job.status || '';
}

export function isArchivedJob(
  job: { status?: string; archived_at?: string } | null | undefined,
): boolean {
  if (job?.status === 'Completed') return false;
  if (job?.archived_at) return true;
  return ARCHIVE_JOB_STATUSES.has(job?.status || '');
}

export function isWorkingJob(job: { status?: string; archived_at?: string } | null | undefined): boolean {
  return !isArchivedJob(job);
}

/** Declined contacts leave the active customers list. */
export function isArchivedClient(
  client: { status?: string; archived_at?: string } | null | undefined,
): boolean {
  if (!client) return false;
  if (client.status === 'Declined') return true;
  return Boolean(client.archived_at);
}

/** Resolve phase + status for forms, mapping legacy values when needed. */
export function resolvePhaseStatus(
  phase?: string | null,
  status?: string | null,
): { phase: JobPhase; status: string } {
  const legacy = status ? LEGACY_JOB_STATUS_MAP[status] : undefined;
  const resolvedPhase =
    (JOB_PHASE_ORDER.includes(phase as JobPhase) ? (phase as JobPhase) : null) ||
    phaseForStatus(status) ||
    legacy?.phase ||
    'lead';
  const candidate = status || legacy?.status || defaultStatusForPhase(resolvedPhase);
  const resolvedStatus = statusesForPhase(resolvedPhase).includes(candidate)
    ? candidate
    : legacy?.status && statusesForPhase(resolvedPhase).includes(legacy.status)
      ? legacy.status
      : defaultStatusForPhase(resolvedPhase);
  return { phase: resolvedPhase, status: resolvedStatus };
}
