/**
 * Punch list document lifecycle — completion posts a photo to the job Photos tab.
 */
import { fail, getRecord, saveRecord } from './domain.js';

/** Block marking complete without the dedicated endpoint (photo required). */
export function preparePunchListUpdate(previous, input) {
  const body = input && typeof input === 'object' ? { ...input } : {};
  if (previous?.status === 'completed') {
    const keys = Object.keys(body).filter((k) => k !== 'id');
    if (keys.length) throw fail(400, 'Completed punch lists cannot be edited.');
  }
  if (body.status === 'completed') {
    throw fail(400, 'Complete the punch list with a photo via POST /api/punch-list/:id/complete');
  }
  delete body.completed_photo_url;
  delete body.completed_at;
  return body;
}

/**
 * Mark the punch list complete and post the filled-out form photo to job photos.
 * @param {object} tx
 * @param {string} ownerId
 * @param {string} punchListId
 * @param {{ photo_url: string }} opts
 */
export async function completePunchList(tx, ownerId, punchListId, { photo_url }) {
  const record = await getRecord(tx, ownerId, 'PunchList', punchListId);
  if (record.status === 'completed') throw fail(400, 'Punch list is already completed');
  if (!photo_url || !String(photo_url).trim()) {
    throw fail(400, 'A photo of the filled-out punch list is required');
  }
  const now = new Date().toISOString();
  const updated = await saveRecord(tx, ownerId, 'PunchList', {
    status: 'completed',
    completed_photo_url: photo_url,
    completed_at: now,
  }, punchListId);
  await saveRecord(tx, ownerId, 'TimelineEntry', {
    job_id: record.job_id,
    type: 'photo',
    text: 'Final walkthrough punch list',
    photo_url,
    category: 'after',
  });
  await saveRecord(tx, ownerId, 'TimelineEntry', {
    job_id: record.job_id,
    type: 'document',
    text: 'Final walkthrough punch list completed',
    category: 'document',
  });
  return updated;
}
