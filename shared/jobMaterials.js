/**
 * Job-level materials: list lives on the job (and task rows); status is derived — never a second dropdown.
 */

/** @typedef {{ description?: string, qty?: number, unit?: string, unit_price?: number, have?: boolean, notes?: string, id?: string }} MaterialItem */

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
  const needed = items.filter((m) => !m.have);
  const totalCount = items.length;
  const neededCount = needed.length;

  if (totalCount === 0) {
    return { key: 'none', label: 'No materials listed', neededCount: 0, totalCount: 0 };
  }
  if (neededCount === 0) {
    return { key: 'on_hand', label: 'All on hand', neededCount: 0, totalCount };
  }

  const activeOrders = (materialOrders || []).filter((mo) => mo?.status && mo.status !== 'void');
  const lines = activeOrders.flatMap((mo) => mo.lines || []);
  if (lines.some((line) => line.line_status === 'unavailable')) {
    return { key: 'unavailable', label: 'Unavailable', neededCount, totalCount };
  }
  if (lines.some((line) => line.line_status === 'backorder')) {
    return { key: 'backorder', label: 'Backordered', neededCount, totalCount };
  }
  if (activeOrders.some((mo) => mo.status === 'purchased' || mo.status === 'ordered')) {
    return { key: 'ordered', label: 'Ordered', neededCount, totalCount };
  }
  if (lines.some((line) => line.line_status === 'pricing')) {
    return { key: 'pricing', label: 'Pricing', neededCount, totalCount };
  }

  const noun = neededCount === 1 ? 'item' : 'items';
  return {
    key: 'waiting',
    label: `Waiting on ${neededCount} ${noun}`,
    neededCount,
    totalCount,
  };
}
