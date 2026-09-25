/** Brittany's three-phase job status model (Lead → Working → Payment). */

export const JOB_PHASE_ORDER = ['lead', 'working', 'payment'];

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

export const STORED_JOB_STATUSES = JOB_PHASE_ORDER.flatMap((phase) =>
  JOB_PHASES[phase].statuses.filter((s) => s !== INVOICE_GATE_STATUS),
);

export const ALL_JOB_STATUSES = [...STORED_JOB_STATUSES, INVOICE_GATE_STATUS];

export const LEGACY_JOB_STATUS_MAP = {
  Estimate: { phase: 'lead', status: 'Plan / draft estimate' },
  Scheduled: { phase: 'working', status: 'Prep' },
  'In Progress': { phase: 'working', status: 'In progress' },
  'Waiting on Materials': { phase: 'working', status: 'In progress' },
  'Waiting on materials': { phase: 'working', status: 'In progress' },
  Completed: { phase: 'working', status: 'Completed' },
  Paid: { phase: 'payment', status: 'Paid' },
};

export const ARCHIVE_JOB_STATUSES = new Set([
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

export function applyInvoicedGate(fields) {
  if (!fields || fields.status !== INVOICE_GATE_STATUS) return fields;
  return { ...fields, phase: 'payment', status: PAYMENT_ENTRY_STATUS };
}

export function formatJobStatus(job) {
  if (!job) return '';
  const phaseLabel = JOB_PHASES[job.phase]?.label;
  if (phaseLabel) return `${phaseLabel} · ${job.status || ''}`;
  return job.status || '';
}

/** Kanban columns for a phase — every status renders as a droppable column (incl. Blocked on Working). */
export function statusesForPhase(phase) {
  return JOB_PHASES[phase]?.statuses ? [...JOB_PHASES[phase].statuses] : [];
}

/** Declined contacts leave the active customers list. */
export function isArchivedClient(client) {
  if (!client) return false;
  if (client.status === 'Declined') return true;
  return Boolean(client.archived_at);
}

/**
 * Lead status shown on a contact profile.
 * Stored contact status wins; otherwise a tied lead job's status; otherwise Contact.
 */
export function contactLeadStatus(client, jobs = []) {
  const leadStatuses = JOB_PHASES.lead.statuses;
  if (leadStatuses.includes(client?.status)) return client.status;
  const leadJobs = jobs.filter((job) => (job?.phase || phaseForStatus(job?.status)) === 'lead');
  const shared = [...new Set(leadJobs.map((job) => job.status).filter((status) => leadStatuses.includes(status)))];
  if (shared.length === 1) return shared[0];
  if (leadJobs.length > 1) {
    const newest = [...leadJobs].sort((a, b) => String(b.updated_date || '').localeCompare(String(a.updated_date || '')))[0];
    if (leadStatuses.includes(newest?.status)) return newest.status;
  }
  return defaultStatusForPhase('lead');
}
