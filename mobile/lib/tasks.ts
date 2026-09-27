/** WorkItem statuses — mirrors src/lib/tasks.js / shared/taskStatus.js. */

export const TASK_STATUSES = [
  'plan',
  'in_progress',
  'permits',
  'waiting_on_approval',
  'waiting_on_materials',
  'blocked',
  'finish',
  'completed',
  'cancelled',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

const LEGACY_TASK_STATUS_MAP: Record<string, TaskStatus> = {
  prep: 'plan',
  materials: 'plan',
  waiting_materials: 'waiting_on_materials',
  on_hold: 'blocked',
  done: 'completed',
};

const LABELS: Record<string, string> = {
  plan: 'Plan',
  in_progress: 'In progress',
  materials: 'Plan',
  permits: 'Permits',
  waiting_on_approval: 'Waiting on Approval',
  waiting_on_materials: 'Waiting on Materials',
  blocked: 'Blocked',
  finish: 'Finish',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function normalizeTaskStatus(status: string | null | undefined): TaskStatus {
  if (!status) return 'plan';
  if (LEGACY_TASK_STATUS_MAP[status]) return LEGACY_TASK_STATUS_MAP[status];
  return (TASK_STATUSES as readonly string[]).includes(status) ? (status as TaskStatus) : 'plan';
}

export function taskStatusLabel(status: string | null | undefined): string {
  return LABELS[normalizeTaskStatus(status)] || String(status || '');
}

export function taskStatus(item: { status?: string; done?: boolean } | null | undefined): TaskStatus {
  return normalizeTaskStatus(item?.status || (item?.done ? 'completed' : 'plan'));
}

export function sortTasksForList<T extends {
  template_key?: string;
  source_type?: string;
  sort_order?: number;
  created_date?: string;
}>(items: T[] = []): T[] {
  const templateRank = (key?: string) => {
    if (key === 'prep') return 0;
    if (key === 'materials') return 1;
    if (key === 'final_walkthrough') return 3;
    return 2;
  };
  return [...items].sort(
    (a, b) =>
      templateRank(a.template_key) - templateRank(b.template_key) ||
      (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) ||
      (a.created_date || '').localeCompare(b.created_date || ''),
  );
}

/** Board order: by status column, then position, then age. */
export function sortTasks<T extends {
  status?: string;
  done?: boolean;
  sort_order?: number;
  created_date?: string;
}>(items: T[] = []): T[] {
  const rank = (item: T) => TASK_STATUSES.indexOf(taskStatus(item));
  return [...items].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) ||
      (a.created_date || '').localeCompare(b.created_date || ''),
  );
}

export function isTaskCompleted(status: string | null | undefined): boolean {
  return normalizeTaskStatus(status) === 'completed';
}

/** Built-in materials checklist task is hidden on the board (web parity). */
export function isHiddenBuiltInTask(item: { template_key?: string } | null | undefined): boolean {
  return item?.template_key === 'materials' || item?.template_key === 'prep';
}

/** Statuses that usually need a reason note on web. */
export const NOTE_PROMPT_STATUSES: TaskStatus[] = [
  'waiting_on_approval',
  'waiting_on_materials',
  'blocked',
  'cancelled',
];

export function taskTitle(item: {
  description?: string;
  template_key?: string;
} | null | undefined): string {
  if (item?.description?.trim()) return item.description.trim();
  if (item?.template_key === 'prep') return 'Prep';
  if (item?.template_key === 'materials') return 'Materials';
  if (item?.template_key === 'final_walkthrough') return 'Final walkthrough';
  return 'Task';
}
