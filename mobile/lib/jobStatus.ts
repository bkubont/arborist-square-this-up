/** Working + Payment job boards. Lead lives on the customer profile only. Port of src/lib/jobStatus.js */

export const JOB_PHASE_ORDER = ['working', 'payment'] as const;
export type JobPhase = (typeof JOB_PHASE_ORDER)[number];

export const INVOICE_GATE_STATUS = 'Invoiced';
export const PAYMENT_ENTRY_STATUS = 'Waiting on payment';

export const CLIENT_LEAD_STATUSES = [
  'Prospect',
  'Contacted',
  'Assessment',
  'Follow-up',
  'Active',
  'Declined',
] as const;

export const JOB_PHASES: Record<JobPhase, { label: string; statuses: string[] }> = {
  working: {
    label: 'Working',
    statuses: [
      'New inquiry',
      'Site visit',
      'Estimate sent',
      'Approved',
      'Ready to Schedule',
      'Scheduled',
      'Prep',
      'In progress',
      'Waiting on',
      'Blocked',
      'Completed',
    ],
  },
  payment: {
    label: 'Payment',
    statuses: [INVOICE_GATE_STATUS, PAYMENT_ENTRY_STATUS, 'Partial', 'Late', 'Paid'],
  },
};

export const ESTIMATE_STAGE_STATUSES = ['New inquiry', 'Site visit', 'Estimate sent', 'Approved'] as const;

export const READY_TO_SCHEDULE_STATUS = 'Ready to Schedule';

export const SCHEDULED_STATUS = 'Scheduled';

export const STORED_JOB_STATUSES = JOB_PHASE_ORDER.flatMap(phase => JOB_PHASES[phase].statuses);

export const ARCHIVE_JOB_STATUSES = new Set(['Paid', 'Declined']);

export const ACTIVE_JOB_STATUSES = STORED_JOB_STATUSES.filter(s => !ARCHIVE_JOB_STATUSES.has(s));

export const LEGACY_JOB_STATUS_MAP: Record<string, { phase: JobPhase; status: string }> = {
  Contact: { phase: 'working', status: 'Estimate sent' },
  Assessment: { phase: 'working', status: 'Estimate sent' },
  'Plan / draft estimate': { phase: 'working', status: 'Estimate sent' },
  Estimate: { phase: 'working', status: 'Estimate sent' },
  'Waiting on approval': { phase: 'working', status: 'Estimate sent' },
  Declined: { phase: 'working', status: 'Completed' },
  Cancelled: { phase: 'working', status: 'Completed' },
  // 'Scheduled' is a live board status (Phase 4).
  'In Progress': { phase: 'working', status: 'In progress' },
  'Waiting on Materials': { phase: 'working', status: 'Waiting on' },
  'Waiting on materials': { phase: 'working', status: 'Waiting on' },
  'Waiting on access': { phase: 'working', status: 'Waiting on' },
  'Waiting on weather': { phase: 'working', status: 'Waiting on' },
  'Waiting on utility': { phase: 'working', status: 'Waiting on' },
  'On Hold': { phase: 'working', status: 'Blocked' },
};

export function isEstimateStageStatus(status: string | null | undefined): boolean {
  return (ESTIMATE_STAGE_STATUSES as readonly string[]).includes(status || '')
    || status === 'Estimate'
    || status === 'Waiting on approval';
}

export function phaseForStatus(status: string | null | undefined): JobPhase | null {
  if (!status) return null;
  for (const phase of JOB_PHASE_ORDER) {
    if (JOB_PHASES[phase].statuses.includes(status)) return phase;
  }
  const legacy = LEGACY_JOB_STATUS_MAP[status];
  return legacy?.phase ?? null;
}

export function defaultStatusForPhase(phase: JobPhase | string): string {
  return JOB_PHASES[phase as JobPhase]?.statuses[0] || 'Estimate sent';
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
    'working';
  const candidate = legacy?.status || status || defaultStatusForPhase(resolvedPhase);
  const resolvedStatus = statusesForPhase(resolvedPhase).includes(candidate)
    ? candidate
    : defaultStatusForPhase(resolvedPhase);
  return { phase: resolvedPhase, status: resolvedStatus };
}
