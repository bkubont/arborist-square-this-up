/**
 * One materials list, stored on the job. Task writes are tagged onto that list and then cleared.
 * API reads fill WorkItem.materials from the same rows so older clients still see them.
 */
import { decode, getRecord, saveRecord } from './domain.js';
import { replaceTaskMaterialLines } from '../shared/jobMaterials.js';

/**
 * Copy this task's material rows onto the job (tagged with the task) and clear the task copy.
 * @param {Array<object>} lines rows to store for this task; pass [] to clear them
 */
export async function absorbWorkItemMaterials(db, ownerId, workItem, lines) {
  const job = await getRecord(db, ownerId, 'Job', workItem.job_id);
  const next = replaceTaskMaterialLines(job.materials || [], workItem.id, lines || []);
  await saveRecord(db, ownerId, 'Job', { materials: next }, job.id);
  return saveRecord(db, ownerId, 'WorkItem', { materials: [] }, workItem.id);
}

/** Drop lines tagged to a task that is going away. Untagged lines stay on the job. */
export async function dropMaterialsForTask(db, ownerId, jobId, taskId) {
  const job = await getRecord(db, ownerId, 'Job', jobId);
  const materials = (job.materials || []).filter((row) => row.task_id !== taskId);
  if (materials.length === (job.materials || []).length) return job;
  return saveRecord(db, ownerId, 'Job', { materials }, job.id);
}

/**
 * Fill each task's materials from the job list. If the job has no tagged rows yet, keep whatever
 * is still stored on the task (startup fold has not run).
 */
export async function attachSharedMaterials(db, ownerId, workItems = []) {
  if (!workItems.length) return workItems;
  const jobIds = [...new Set(workItems.map((item) => item.job_id).filter(Boolean))];
  const byJob = new Map();
  if (jobIds.length) {
    const rows = await db.all(
      `SELECT id, data FROM records WHERE owner_id = ? AND entity = 'Job' AND id IN (${jobIds.map(() => '?').join(',')})`,
      [ownerId, ...jobIds],
    );
    for (const row of rows) {
      const data = JSON.parse(row.data);
      byJob.set(row.id, data.materials || []);
    }
  }
  return workItems.map((item) => {
    const shared = (byJob.get(item.job_id) || []).filter((row) => row.task_id === item.id);
    if (!shared.length && (item.materials || []).length) return item;
    return { ...item, materials: shared };
  });
}

/**
 * Move materials still stored on tasks onto the job list, then clear the task copies.
 * Safe to run on every startup.
 * @returns {Promise<number>} rows moved
 */
export async function foldStoredTaskMaterials(db, ownerId) {
  const jobs = (await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'Job'])).map(decode);
  const items = (await db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ?', [ownerId, 'WorkItem'])).map(decode);
  let moved = 0;
  for (const job of jobs) {
    const tasks = items.filter((item) => item.job_id === job.id && (item.materials || []).some((row) => String(row?.description || '').trim()));
    if (!tasks.length) continue;
    const materials = [...(job.materials || [])];
    const ids = new Set(materials.map((row) => row.id).filter(Boolean));
    for (const task of tasks) {
      const taskId = task.template_key === 'materials' ? undefined : task.id;
      for (const material of task.materials || []) {
        if (!String(material?.description || '').trim()) continue;
        if (material.id && ids.has(material.id)) continue;
        const row = taskId ? { ...material, task_id: taskId } : { ...material };
        if (!taskId) delete row.task_id;
        materials.push(row);
        if (row.id) ids.add(row.id);
        moved += 1;
      }
      await saveRecord(db, ownerId, 'WorkItem', { materials: [] }, task.id);
    }
    await saveRecord(db, ownerId, 'Job', { materials }, job.id);
  }
  return moved;
}
