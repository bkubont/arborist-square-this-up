/**
 * Job-level materials helpers — mirrors shared/jobMaterials.js.
 * Status is derived from checklist + material orders (never a second dropdown).
 */

export type MaterialItem = {
  description?: string;
  qty?: number;
  unit?: string;
  unit_price?: number;
  have?: boolean;
  status?: string;
  notes?: string;
  id?: string;
  task_id?: string;
};

export function collectJobMaterialItems(
  job?: { materials?: MaterialItem[] } | null,
  workItems: Array<{
    id?: string;
    status?: string;
    materials?: MaterialItem[];
    description?: string;
  }> = [],
): Array<MaterialItem & { source: 'job' | 'task'; taskDescription?: string }> {
  const tasks = new Map((workItems || []).filter(task => task?.id).map(task => [task.id, task]));
  const items: Array<MaterialItem & { source: 'job' | 'task'; taskDescription?: string }> = [];
  for (const material of job?.materials || []) {
    if (!String(material?.description || '').trim()) continue;
    const task = material.task_id ? tasks.get(material.task_id) : undefined;
    items.push({
      ...material,
      source: material.task_id ? 'task' : 'job',
      ...(task?.description ? { taskDescription: task.description } : {}),
    });
  }
  return items;
}

export type MaterialsStatus = {
  key: string;
  label: string;
  neededCount: number;
  totalCount: number;
};

export function deriveMaterialsStatus({
  job,
  workItems = [],
  materialOrders = [],
}: {
  job?: { materials?: MaterialItem[] } | null;
  workItems?: Array<{
    id?: string;
    status?: string;
    materials?: MaterialItem[];
    description?: string;
  }>;
  materialOrders?: Array<{
    status?: string;
    lines?: Array<{ line_status?: string }>;
  }>;
} = {}): MaterialsStatus {
  const items = collectJobMaterialItems(job, workItems);
  const needed = items.filter(m => !m.have);
  const totalCount = items.length;
  const neededCount = needed.length;

  if (totalCount === 0) {
    return { key: 'none', label: 'No materials listed', neededCount: 0, totalCount: 0 };
  }
  if (neededCount === 0) {
    return { key: 'on_hand', label: 'All on hand', neededCount: 0, totalCount };
  }

  const activeOrders = (materialOrders || []).filter(mo => mo?.status && mo.status !== 'void');
  const lines = activeOrders.flatMap(mo => mo.lines || []);
  if (lines.some(line => line.line_status === 'unavailable')) {
    return { key: 'unavailable', label: 'Unavailable', neededCount, totalCount };
  }
  if (lines.some(line => line.line_status === 'backorder')) {
    return { key: 'backorder', label: 'Backordered', neededCount, totalCount };
  }
  if (activeOrders.some(mo => mo.status === 'purchased' || mo.status === 'ordered')) {
    return { key: 'ordered', label: 'Ordered', neededCount, totalCount };
  }
  if (lines.some(line => line.line_status === 'pricing')) {
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

/** RN text color for derived materials status. */
export function materialsStatusColor(key: string): string {
  switch (key) {
    case 'on_hand':
      return '#047857';
    case 'ordered':
    case 'pricing':
      return '#a16207';
    case 'backorder':
    case 'unavailable':
    case 'waiting':
      return '#b45309';
    default:
      return '#666';
  }
}

export function materialsNeededCount(
  materials: Array<{ have?: boolean; description?: string }> | null | undefined,
): number {
  return (materials || []).filter(m => String(m.description || '').trim() && !m.have).length;
}
