import { decode, getRecord, saveRecord } from './domain.js';
import { applyJobArchiveFields } from './jobArchive.js';
import { applyJobStatusFields, JOB_PHASES, normalizeJobRecord } from './jobStatus.js';

/** Lead pipeline on a contact. Same list as a lead job — not a second status set. */
export const CLIENT_LEAD_STATUSES = JOB_PHASES.lead.statuses;

const ARCHIVE_CLIENT_STATUS = 'Declined';

export function isArchivedClient(client) {
  if (!client) return false;
  if (client.status === ARCHIVE_CLIENT_STATUS) return true;
  return Boolean(client.archived_at);
}

/**
 * Apply contact lead status. Declined archives the contact.
 * Other field patches leave status and archived_at alone.
 * @param {Record<string, unknown> | null | undefined} body
 * @param {Record<string, unknown> | null | undefined} previous
 */
export function applyClientPipelineFields(body, previous) {
  if (!body || typeof body !== 'object') return body;
  const next = { ...body };
  const creating = previous == null;
  const setsStatus = Object.prototype.hasOwnProperty.call(next, 'status');
  if (!creating && !setsStatus) return next;

  const status = setsStatus ? next.status : CLIENT_LEAD_STATUSES[0];
  if (!CLIENT_LEAD_STATUSES.includes(status)) return next;

  next.status = status;
  if (status === ARCHIVE_CLIENT_STATUS) {
    next.archived_at = previous?.status === ARCHIVE_CLIENT_STATUS && previous.archived_at
      ? previous.archived_at
      : new Date().toISOString().slice(0, 10);
  } else {
    next.archived_at = undefined;
  }
  return next;
}

/** True when this request actually changes the stored lead status. */
export function clientPipelineStatusChanged(requestBody, previous, saved) {
  if (!requestBody || typeof requestBody !== 'object') return false;
  if (!Object.prototype.hasOwnProperty.call(requestBody, 'status')) return false;
  return saved?.status !== previous?.status;
}

/** Lead value stored on a job, or the phase status when that status is still a lead status. */
export function effectiveJobLead(job) {
  if (!job) return undefined;
  if (CLIENT_LEAD_STATUSES.includes(job.lead_status)) return job.lead_status;
  if (CLIENT_LEAD_STATUSES.includes(job.status)) return job.status;
  return undefined;
}

/**
 * Keep lead_status aligned when the job's phase status is a lead status.
 * Working/payment patches leave an existing lead_status alone.
 */
export function applyJobLeadField(body, previous) {
  if (!body || typeof body !== 'object') return body;
  const next = { ...body };
  const setsStatus = Object.prototype.hasOwnProperty.call(next, 'status');
  const status = setsStatus ? next.status : previous?.status;
  if (setsStatus && CLIENT_LEAD_STATUSES.includes(status)) {
    next.lead_status = status;
    return next;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'lead_status')) return next;
  if (CLIENT_LEAD_STATUSES.includes(status)) next.lead_status = status;
  return next;
}

export function jobLeadChanged(previous, saved) {
  const after = effectiveJobLead(saved);
  if (!after) return false;
  return after !== effectiveJobLead(previous);
}

/**
 * A new lead job left on the default Contact adopts the contact's lead status
 * so creating the job does not pull the contact back to Contact.
 */
export async function adoptClientLeadOnNewJob(db, ownerId, body) {
  if (!body?.client_id) return body;
  let client;
  try {
    client = await getRecord(db, ownerId, 'Client', body.client_id);
  } catch {
    return body;
  }
  const clientLead = CLIENT_LEAD_STATUSES.includes(client.status) ? client.status : null;
  if (!clientLead) return body;
  const next = { ...body };
  const statusIsLead = CLIENT_LEAD_STATUSES.includes(next.status);
  if (statusIsLead && next.status === CLIENT_LEAD_STATUSES[0] && clientLead !== CLIENT_LEAD_STATUSES[0]) {
    next.status = clientLead;
    next.phase = next.phase || 'lead';
    next.lead_status = clientLead;
    return applyJobArchiveFields(applyJobStatusFields(next), null);
  }
  if (!next.lead_status) next.lead_status = statusIsLead ? next.status : clientLead;
  return next;
}

/** Keep lead-phase jobs on this contact aligned with the contact's lead status. */
export async function syncClientLeadJobs(db, ownerId, clientId, status, { skipJobId } = {}) {
  if (!CLIENT_LEAD_STATUSES.includes(status)) return;
  const rows = await db.all(
    'SELECT * FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
    [ownerId, 'Job', clientId],
  );
  for (const row of rows) {
    const job = normalizeJobRecord(decode(row));
    if (skipJobId && job.id === skipJobId) continue;
    const leadMatches = effectiveJobLead(job) === status;
    const phaseMatches = job.phase !== 'lead' || job.status === status;
    if (leadMatches && phaseMatches) continue;

    const patch = { lead_status: status };
    if (job.phase === 'lead' && job.status !== status) {
      const fields = applyJobArchiveFields(
        applyJobStatusFields({ phase: 'lead', status }, job),
        job,
      );
      patch.phase = fields.phase;
      patch.status = fields.status;
      patch.archived_at = fields.archived_at;
    }
    await saveRecord(db, ownerId, 'Job', patch, job.id);
    if (patch.status && patch.status !== job.status) {
      await saveRecord(db, ownerId, 'TimelineEntry', {
        job_id: job.id,
        type: 'status_change',
        text: `Status changed to Lead · ${patch.status}`,
        category: 'note',
      });
    }
  }
}

/** Job lead change updates the contact, then the contact's other jobs. */
export async function syncContactFromJobLead(db, ownerId, job) {
  const lead = effectiveJobLead(job);
  if (!lead || !job?.client_id) return;
  const client = await getRecord(db, ownerId, 'Client', job.client_id);
  const needsClient = client.status !== lead
    || (lead === ARCHIVE_CLIENT_STATUS && !client.archived_at)
    || (lead !== ARCHIVE_CLIENT_STATUS && client.archived_at);
  if (needsClient) {
    const fields = applyClientPipelineFields({ status: lead }, client);
    await saveRecord(db, ownerId, 'Client', {
      status: fields.status,
      archived_at: fields.archived_at,
    }, client.id);
  }
  await syncClientLeadJobs(db, ownerId, job.client_id, lead, { skipJobId: job.id });
}
