import { ARCHIVE_JOB_STATUSES } from './jobStatus.js';

export { ARCHIVE_JOB_STATUSES };

export function isArchivedJob(record) {
  if (record?.archived_at) return true;
  return ARCHIVE_JOB_STATUSES.has(record?.status);
}

/** Apply archived_at when a job reaches a terminal status; clear when reopened. */
export function applyJobArchiveFields(body, previous) {
  if (!body || typeof body !== 'object') return body;
  const next = { ...body };
  const status = next.status ?? previous?.status;

  if (status && ARCHIVE_JOB_STATUSES.has(status)) {
    if (!next.archived_at && previous?.archived_at) {
      next.archived_at = previous.archived_at;
    } else if (!next.archived_at) {
      next.archived_at = new Date().toISOString().slice(0, 10);
    }
  } else if (status && !ARCHIVE_JOB_STATUSES.has(status)) {
    next.archived_at = undefined;
  }

  if (next.archived_at === null || next.archived_at === '') {
    next.archived_at = undefined;
  }
  return next;
}

/** One-time backfill: terminal jobs imported/seeded before archived_at existed. */
export async function backfillJobArchive(db) {
  const rows = await db.all("SELECT id, owner_id, data, updated_date FROM records WHERE entity = 'Job'");
  const today = new Date().toISOString().slice(0, 10);
  for (const row of rows) {
    const data = JSON.parse(row.data);
    if (!ARCHIVE_JOB_STATUSES.has(data.status) || data.archived_at) continue;
    data.archived_at = String(row.updated_date || '').slice(0, 10) || today;
    await db.run(
      'UPDATE records SET data = ? WHERE id = ? AND owner_id = ?',
      [JSON.stringify(data), row.id, row.owner_id],
    );
  }
}
