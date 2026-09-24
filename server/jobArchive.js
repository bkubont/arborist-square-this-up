import { ARCHIVE_JOB_STATUSES } from './jobStatus.js';

export { ARCHIVE_JOB_STATUSES };

export function isArchivedJob(record) {
  return Boolean(record?.archived_at);
}

/** Apply archived_at when a job reaches a terminal status. */
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
  }
  if (next.archived_at === null || next.archived_at === '') {
    next.archived_at = undefined;
  }
  return next;
}
