/** Brittany's task board columns, in order (finish | completed | cancelled at the end). Job materials live on Overview, not the board. */
export const TASK_STATUSES = [
  'plan',
  'permits',
  'waiting_on_approval',
  'waiting_on_materials',
  'blocked',
  'finish',
  'completed',
  'cancelled',
];

/** Pre-status-model values still on older WorkItems — normalized on read/write. */
export const LEGACY_TASK_STATUS_MAP = {
  prep: 'plan',
  in_progress: 'plan',
  materials: 'plan',
  waiting_materials: 'waiting_on_materials',
  on_hold: 'blocked',
  done: 'completed',
};

export const ALL_TASK_STATUSES = [...new Set([...TASK_STATUSES, ...Object.keys(LEGACY_TASK_STATUS_MAP)])];

export const DEFAULT_TASK_STATUS = 'plan';

/** Canonical status for reads and stored rows with unknown values. */
export function normalizeTaskStatus(status) {
  if (!status) return DEFAULT_TASK_STATUS;
  return LEGACY_TASK_STATUS_MAP[status] || (TASK_STATUSES.includes(status) ? status : DEFAULT_TASK_STATUS);
}

/** Strict parse for writes; stores legacy values as-is (board reads normalize them). */
export function parseTaskStatusForWrite(status) {
  if (!status) return DEFAULT_TASK_STATUS;
  if (status === 'done') return 'completed';
  if (ALL_TASK_STATUSES.includes(status)) return status;
  return null;
}

export function isTaskCompleted(status) {
  return normalizeTaskStatus(status) === 'completed';
}

export function isTaskCancelled(status) {
  return normalizeTaskStatus(status) === 'cancelled';
}

export function isTaskClosed(status) {
  return isTaskCompleted(status) || isTaskCancelled(status);
}

/** Built-in templates start in their home column (Prep → plan). */
export function defaultStatusForTemplate(templateKey) {
  if (templateKey === 'final_walkthrough') return 'finish';
  if (templateKey === 'materials') return 'plan';
  if (templateKey === 'prep') return 'plan';
  return DEFAULT_TASK_STATUS;
}
