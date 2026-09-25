import { decode, saveRecord } from './domain.js';
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

/** Keep lead-phase jobs on this contact aligned with the contact's lead status. */
export async function syncClientLeadJobs(db, ownerId, clientId, status) {
  if (!CLIENT_LEAD_STATUSES.includes(status)) return;
  const rows = await db.all(
    'SELECT * FROM records WHERE owner_id = ? AND entity = ? AND parent_id = ?',
    [ownerId, 'Job', clientId],
  );
  for (const row of rows) {
    const job = normalizeJobRecord(decode(row));
    if (job.phase !== 'lead' || job.status === status) continue;
    const fields = applyJobArchiveFields(
      applyJobStatusFields({ phase: 'lead', status }, job),
      job,
    );
    await saveRecord(db, ownerId, 'Job', {
      phase: fields.phase,
      status: fields.status,
      archived_at: fields.archived_at,
    }, job.id);
    await saveRecord(db, ownerId, 'TimelineEntry', {
      job_id: job.id,
      type: 'status_change',
      text: `Status changed to Lead · ${fields.status}`,
      category: 'note',
    });
  }
}
