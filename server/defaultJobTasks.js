/**
 * Attach built-in Prep and Materials tasks to a job. Idempotent: skips templates already present
 * (by template_key, or by legacy description for older rows). Final walkthrough is a punch list document.
 */
import { saveRecord } from './domain.js';
import { listJobDocuments } from './documentRules.js';
import { DEFAULT_JOB_TASK_TEMPLATES } from '../shared/taskTemplates.js';
import { defaultStatusForTemplate } from './taskStatus.js';

const LEGACY_DESCRIPTION = {
  prep: 'prep',
  materials: 'materials',
};

function matchesLegacy(task, template) {
  if (task.source_type || task.template_key) return false;
  return String(task.description || '').trim().toLowerCase() === LEGACY_DESCRIPTION[template.template_key];
}

/** @returns {Promise<number>} tasks created or adopted */
export async function attachDefaultJobTasks(tx, ownerId, jobId) {
  const existing = await listJobDocuments(tx, ownerId, 'WorkItem', jobId);
  let attached = 0;
  for (const template of DEFAULT_JOB_TASK_TEMPLATES) {
    const keyed = existing.find((task) => task.template_key === template.template_key);
    if (keyed) continue;
    const legacy = existing.find((task) => matchesLegacy(task, template));
    if (legacy) {
      await saveRecord(tx, ownerId, 'WorkItem', {
        template_key: template.template_key,
        sort_order: legacy.sort_order ?? template.sort_order,
        steps: legacy.steps?.length ? legacy.steps : template.steps,
      }, legacy.id);
      attached += 1;
      continue;
    }
    await saveRecord(tx, ownerId, 'WorkItem', {
      job_id: jobId,
      description: template.description,
      template_key: template.template_key,
      sort_order: template.sort_order,
      steps: template.steps,
      status: defaultStatusForTemplate(template.template_key),
    });
    attached += 1;
  }
  return attached;
}
