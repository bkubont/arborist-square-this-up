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

export const LEGACY_JOB_STATUS_MAP = {
  Estimate: { phase: 'lead', status: 'Plan / draft estimate' },
  Scheduled: { phase: 'working', status: 'Prep' },
  'In Progress': { phase: 'working', status: 'In progress' },
  'Waiting on Materials': { phase: 'working', status: 'Waiting on materials' },
  Completed: { phase: 'working', status: 'Completed' },
  Paid: { phase: 'payment', status: 'Paid' },
};

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

export function formatJobStatus(job) {
  if (!job) return '';
  const phaseLabel = JOB_PHASES[job.phase]?.label;
  if (phaseLabel) return `${phaseLabel} · ${job.status || ''}`;
  return job.status || '';
}

export function statusesForPhase(phase) {
  return JOB_PHASES[phase]?.statuses || [];
}
