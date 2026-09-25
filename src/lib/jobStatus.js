/** Brittany's three-phase job status model (Lead → Working → Payment). */

export const JOB_PHASE_ORDER = ['lead', 'working', 'payment'];

/** Invoiced is a Payment status. It is not a Working column. */
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
    ],
  },
  payment: {
    label: 'Payment',
    statuses: [
      INVOICE_GATE_STATUS,
      PAYMENT_ENTRY_STATUS,
      'Partial',
      'Paid',
      'Late',
    ],
  },
};

export const STORED_JOB_STATUSES = JOB_PHASE_ORDER.flatMap((phase) => JOB_PHASES[phase].statuses);

export const ALL_JOB_STATUSES = STORED_JOB_STATUSES;

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
  for (const phase of JOB_PHASE_ORDER) {
    if (JOB_PHASES[phase].statuses.includes(status)) return phase;
  }
  return null;
}

export function defaultStatusForPhase(phase) {
  return JOB_PHASES[phase]?.statuses[0] || 'Contact';
}

/** Invoiced is Payment. Keep the status; put the job on the Payment board. */
export function applyInvoicedGate(fields) {
  if (!fields || fields.status !== INVOICE_GATE_STATUS) return fields;
  return { ...fields, phase: 'payment', status: INVOICE_GATE_STATUS };
}

/**
 * Header tracks coexist. The board column (phase + status) wins for that track
 * so a contact-profile lead sync (which writes job.status while phase is lead) stays visible.
 * @param {object} job
 * @param {object} [client]
 */
export function headerTracks(job, client) {
  const leadList = JOB_PHASES.lead.statuses;
  const workingList = JOB_PHASES.working.statuses;
  const paymentList = JOB_PHASES.payment.statuses;
  const pick = (list, stored, fromBoard) => {
    if (fromBoard && list.includes(fromBoard)) return fromBoard;
    if (stored && list.includes(stored)) return stored;
    return "";
  };
  const lead = pick(
    leadList,
    job?.lead_status,
    job?.phase === "lead" ? job?.status : "",
  ) || (leadList.includes(client?.status) ? client.status : "") || "Contact";
  return {
    lead,
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
