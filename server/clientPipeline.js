/** CRM Lead on a contact. Not a job-board phase and not synced with jobs. */
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

const ARCHIVE_CLIENT_STATUS = 'Declined';

export function isArchivedClient(client) {
  if (!client) return false;
  if (client.status === ARCHIVE_CLIENT_STATUS) return true;
  return Boolean(client.archived_at);
}

export function coerceClientLeadStatus(status) {
  if (CLIENT_LEAD_STATUSES.includes(status)) return status;
  if (status && LEGACY_CLIENT_STATUS_MAP[status]) return LEGACY_CLIENT_STATUS_MAP[status];
  return null;
}

export function normalizeClientLeadStatus(status) {
  return coerceClientLeadStatus(status) || CLIENT_LEAD_STATUSES[0];
}

export function normalizeClientRecord(client) {
  if (!client || typeof client !== 'object') return client;
  const status = coerceClientLeadStatus(client.status);
  if (status == null || status === client.status) return client;
  const next = { ...client, status };
  if (status === ARCHIVE_CLIENT_STATUS) {
    next.archived_at = client.archived_at || new Date().toISOString().slice(0, 10);
  }
  return next;
}

/**
 * Apply contact lead status. Declined archives the contact.
 * Other field patches leave status and archived_at alone unless the stored status is a legacy label.
 * @param {Record<string, unknown> | null | undefined} body
 * @param {Record<string, unknown> | null | undefined} previous
 */
export function applyClientPipelineFields(body, previous) {
  if (!body || typeof body !== 'object') return body;
  const next = { ...body };
  const creating = previous == null;
  const setsStatus = Object.prototype.hasOwnProperty.call(next, 'status');
  if (!creating && !setsStatus) {
    const mapped = normalizeClientLeadStatus(previous?.status);
    if (previous?.status && mapped !== previous.status) next.status = mapped;
    return next;
  }

  const raw = setsStatus ? next.status : CLIENT_LEAD_STATUSES[0];
  if (setsStatus && !CLIENT_LEAD_STATUSES.includes(raw) && !LEGACY_CLIENT_STATUS_MAP[raw]) {
    return next;
  }
  const status = normalizeClientLeadStatus(raw);

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

/** Persist old contact statuses onto the CRM list. */
export async function backfillClientLeadStatuses(db) {
  const rows = await db.all("SELECT id, owner_id, data FROM records WHERE entity = 'Client'");
  let updated = 0;
  for (const row of rows) {
    const data = JSON.parse(row.data);
    const next = normalizeClientRecord(data);
    if (next.status === data.status) continue;
    await db.run(
      'UPDATE records SET data = ? WHERE id = ? AND owner_id = ?',
      [JSON.stringify({ ...data, status: next.status, archived_at: next.archived_at }), row.id, row.owner_id],
    );
    updated += 1;
  }
  return updated;
}
