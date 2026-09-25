/**
 * Attach the built-in Final walkthrough punch list document to a job. Idempotent.
 */
import { saveRecord } from './domain.js';
import { listJobDocuments } from './documentRules.js';
import { defaultPunchListSections, PUNCH_LIST_TITLE } from '../shared/punchListTemplates.js';

/** @returns {Promise<object|null>} created or existing punch list */
export async function attachDefaultPunchList(tx, ownerId, jobId) {
  const existing = await listJobDocuments(tx, ownerId, 'PunchList', jobId);
  const live = existing.find((doc) => doc.status !== 'void');
  if (live) return null;
  return saveRecord(tx, ownerId, 'PunchList', {
    job_id: jobId,
    title: PUNCH_LIST_TITLE,
    status: 'in_progress',
    sections: defaultPunchListSections(),
  });
}
