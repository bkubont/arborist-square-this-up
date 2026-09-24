import {
  TASK_STATUSES,
  LEGACY_TASK_STATUS_MAP,
  ALL_TASK_STATUSES,
  DEFAULT_TASK_STATUS,
  normalizeTaskStatus,
  parseTaskStatusForWrite,
  isTaskCompleted,
  isTaskCancelled,
  isTaskClosed,
  defaultStatusForTemplate,
} from '../shared/taskStatus.js';

export {
  TASK_STATUSES,
  LEGACY_TASK_STATUS_MAP,
  ALL_TASK_STATUSES,
  DEFAULT_TASK_STATUS,
  normalizeTaskStatus,
  parseTaskStatusForWrite,
  isTaskCompleted,
  isTaskCancelled,
  isTaskClosed,
  defaultStatusForTemplate,
};

/** Normalize status on API responses so the client always sees canonical columns. */
export function normalizeWorkItemRecord(item) {
  if (!item || typeof item !== 'object') return item;
  const status = normalizeTaskStatus(item.status ?? (item.done ? 'completed' : DEFAULT_TASK_STATUS));
  return { ...item, status, done: isTaskCompleted(status) };
}
