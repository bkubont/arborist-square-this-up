/**
 * Job-level materials: list lives on the job (and task rows); header status is derived — never a second dropdown.
 */

import { isMaterialOnHand, normalizeMaterialStatus } from './materialStatus.js';

/** @typedef {{ description?: string, qty?: number, unit?: string, unit_price?: number, have?: boolean, status?: string, notes?: string, id?: string }} MaterialItem */

/**
 * Flatten job.materials plus every task material row (cancelled tasks skipped).
 * @param {{ materials?: MaterialItem[] }} [job]
 * @param {Array<{ id?: string, status?: string, materials?: MaterialItem[], description?: string }>} [workItems]
 */
export function collectJobMaterialItems(job, workItems = []) {
  const items = [];
  for (const material of job?.materials || []) {
    if (!String(material?.description || '').trim()) continue;
    items.push({ ...material, source: 'job' });
  }
  for (const task of workItems || []) {
    if (!task?.id || task.status === 'cancelled') continue;
    for (const material of task.materials || []) {
      if (!String(material?.description || '').trim()) continue;
      items.push({ ...material, source: 'task', taskDescription: task.description });
    }
  }
  return items;
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
