/**
 * One buy list per job. A line may be tagged to a task (`task_id`) or left untagged.
 * The task T-chart filters this same list. Header status is derived — never a second dropdown.
 */

import { isMaterialOnHand, normalizeMaterialStatus } from './materialStatus.js';

/** @typedef {{ description?: string, qty?: number, unit?: string, unit_price?: number, have?: boolean, status?: string, notes?: string, id?: string, task_id?: string }} MaterialItem */

/** Needed, ordered, or waiting — not on hand yet. */
export function materialLineOpen(material = {}) {
  const status = normalizeMaterialStatus(material);
  return status === 'needed' || status === 'ordered' || status === 'waiting';
}

/** Lines with a description. This is the only materials store. */
export function jobMaterialLines(job) {
  return (job?.materials || []).filter((material) => String(material?.description || '').trim());
}

/** Same records as the job list, filtered to one task. */
export function materialsForTask(job, taskId) {
  if (!taskId) return [];
  return jobMaterialLines(job).filter((material) => material.task_id === taskId);
}

/** Job board "Waiting on materials": any line is still needed, ordered, or waiting. */
export function jobHasOpenMaterials(job) {
  return jobMaterialLines(job).some(materialLineOpen);
}

/** Task board "Waiting on materials": any line tagged to this task is still open. */
export function taskHasOpenMaterials(job, taskId) {
  return materialsForTask(job, taskId).some(materialLineOpen);
}

/**
 * Replace one task's tagged lines inside the job list. Other lines stay put.
 * @param {MaterialItem[]} materials
 * @param {string} taskId
 * @param {MaterialItem[]} nextLines
 */
export function replaceTaskMaterialLines(materials = [], taskId, nextLines = []) {
  const incoming = (nextLines || [])
    .filter((material) => String(material?.description || '').trim())
    .map((material) => ({ ...material, task_id: taskId }));
  const kept = [];
  let inserted = false;
  for (const row of materials || []) {
    if (row?.task_id === taskId) {
      if (!inserted) {
        kept.push(...incoming);
        inserted = true;
      }
      continue;
    }
    kept.push(row);
  }
  if (!inserted) kept.push(...incoming);
  return kept;
}

/**
 * The job buy list. `workItems` only supplies task names for tagged lines.
 * @param {{ materials?: MaterialItem[] }} [job]
 * @param {Array<{ id?: string, status?: string, description?: string }>} [workItems]
 */
export function collectJobMaterialItems(job, workItems = []) {
  const tasks = new Map((workItems || []).filter((task) => task?.id).map((task) => [task.id, task]));
  return jobMaterialLines(job).map((material) => {
    const task = material.task_id ? tasks.get(material.task_id) : null;
    return {
      ...material,
      source: material.task_id ? 'task' : 'job',
      ...(task?.description ? { taskDescription: task.description } : {}),
    };
  });
}

/**
 * Derive a read-only materials status from the job list + material orders.
 * @param {{ job?: object, workItems?: object[], materialOrders?: object[] }} input
 * @returns {{ key: string, label: string, neededCount: number, totalCount: number }}
 */
export function deriveMaterialsStatus({ job, workItems = [], materialOrders = [] } = {}) {
  const items = collectJobMaterialItems(job, workItems);
  const totalCount = items.length;
  const statuses = items.map((m) => normalizeMaterialStatus(m));
  const neededCount = statuses.filter((s) => !isMaterialOnHand({ status: s })).length;

  if (totalCount === 0) {
    return { key: 'none', label: 'No materials listed', neededCount: 0, totalCount: 0 };
  }
  if (neededCount === 0) {
    return { key: 'on_hand', label: 'All on hand', neededCount: 0, totalCount };
  }

  const counts = { needed: 0, ordered: 0, waiting: 0, on_hand: 0 };
  for (const status of statuses) counts[status] += 1;

  const activeOrders = (materialOrders || []).filter((mo) => mo?.status && mo.status !== 'void');
  const lines = activeOrders.flatMap((mo) => mo.lines || []);
  if (lines.some((line) => line.line_status === 'unavailable')) {
    return { key: 'unavailable', label: 'Unavailable', neededCount, totalCount };
  }
  if (lines.some((line) => line.line_status === 'backorder')) {
    return { key: 'backorder', label: 'Backordered', neededCount, totalCount };
  }
  if (counts.waiting > 0) {
    const label = counts.waiting === 1 ? 'Waiting' : `Waiting (${counts.waiting})`;
    return { key: 'waiting', label, neededCount, totalCount };
  }
  if (counts.needed > 0) {
    const label = counts.needed === 1 ? 'Needed' : `Needed (${counts.needed})`;
    return { key: 'needed', label, neededCount, totalCount };
  }
  if (counts.ordered > 0 || activeOrders.some((mo) => mo.status === 'purchased' || mo.status === 'ordered')) {
    return { key: 'ordered', label: 'Ordered', neededCount, totalCount };
  }
  if (lines.some((line) => line.line_status === 'pricing')) {
    return { key: 'pricing', label: 'Pricing', neededCount, totalCount };
  }

  const noun = neededCount === 1 ? 'item' : 'items';
  return {
    key: 'needed',
    label: `Needed (${neededCount} ${noun})`,
    neededCount,
    totalCount,
  };
}
