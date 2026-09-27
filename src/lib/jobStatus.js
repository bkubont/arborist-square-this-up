/** Working + Payment job boards. Lead lives on the customer profile only. */

export const JOB_PHASE_ORDER = ['working', 'payment'];

/** Invoiced is a Payment status. It is not a Working column. */
export const INVOICE_GATE_STATUS = 'Invoiced';
export const PAYMENT_ENTRY_STATUS = 'Waiting on payment';

/** CRM on the customer profile — not a job-board phase. */
export const CLIENT_LEAD_STATUSES = [
  'Prospect',
  'Contacted',
  'Assessment',
  'Follow-up',
  'Active',
  'Declined',
];

/** Old contact pipeline labels → CRM list. */
export const LEGACY_CLIENT_STATUS_MAP = {
  Contact: 'Prospect',
  'Plan / draft estimate': 'Assessment',
  'Waiting on approval': 'Follow-up',
  Approved: 'Active',
};

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

export const STORED_JOB_STATUSES = JOB_PHASE_ORDER.flatMap((phase) => JOB_PHASES[phase].statuses);

export const ALL_JOB_STATUSES = STORED_JOB_STATUSES;

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

/** Invoiced is Payment. Keep the status; put the job on the Payment board. */
export function applyInvoicedGate(fields) {
  if (!fields || fields.status !== INVOICE_GATE_STATUS) return fields;
  return { ...fields, phase: 'payment', status: INVOICE_GATE_STATUS };
}

/**
 * Header tracks coexist. Working, derived Materials, and Payment — no Lead on the job.
 * @param {object} job
 */
export function headerTracks(job) {
  const workingList = JOB_PHASES.working.statuses;
  const paymentList = JOB_PHASES.payment.statuses;
  const pick = (list, stored, fromBoard) => {
    if (fromBoard && list.includes(fromBoard)) return fromBoard;
    if (stored && list.includes(stored)) return stored;
    return "";
  };
  return {
    working: pick(workingList, job?.working_status, job?.phase === "working" ? job?.status : ""),
    payment: pick(paymentList, job?.payment_status, job?.phase === "payment" ? job?.status : ""),
  };
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

export function normalizeClientLeadStatus(status) {
  if (CLIENT_LEAD_STATUSES.includes(status)) return status;
  if (status && LEGACY_CLIENT_STATUS_MAP[status]) return LEGACY_CLIENT_STATUS_MAP[status];
  return CLIENT_LEAD_STATUSES[0];
}

/**
 * Lead status shown on a contact profile. Stored contact status only — jobs do not sync.
 */
export function contactLeadStatus(client) {
  return normalizeClientLeadStatus(client?.status);
}
