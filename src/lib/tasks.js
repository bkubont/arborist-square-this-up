/** Job task (WorkItem) statuses, in board-column order — mirrors TASK_STATUSES in server/domain.js. */
export const TASK_STATUSES = ["prep", "in_progress", "waiting_materials", "on_hold", "cancelled", "done"];

const LABELS = {
  prep: "Prep",
  in_progress: "In Progress",
  waiting_materials: "Waiting on Materials",
  on_hold: "On Hold",
  cancelled: "Cancelled",
  done: "Completed",
};

export const taskStatusLabel = (status) => LABELS[status] || status;

/** A task's status; tasks saved before statuses existed fall back to their old done flag. */
export const taskStatus = (item) => item?.status || (item?.done ? "done" : "prep");

/** Board/list order: by status column, then position, then age. */
export function sortTasks(items = []) {
  const rank = (item) => TASK_STATUSES.indexOf(taskStatus(item));
  return [...items].sort((a, b) =>
    rank(a) - rank(b)
    || (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity)
    || (a.created_date || "").localeCompare(b.created_date || ""));
}

/** Tasks from a voided estimate/change order no longer stand for signed scope and can be removed. */
export const taskSourceVoided = (item, documents = []) =>
  !!item?.source_id && documents.some((d) => d.id === item.source_id && d.status === "void");

export const taskDeletable = (item, documents = []) => !item?.source_type || taskSourceVoided(item, documents);

/** Statuses that usually need a reason; moving a task into one opens its card note. */
export const NOTE_PROMPT_STATUSES = ["waiting_materials", "on_hold", "cancelled"];

/** "6 hrs", "1.5 hrs", "1 hr"; empty when unknown. */
export function formatHours(hours) {
  const n = Number(hours);
  if (hours == null || hours === "" || !Number.isFinite(n) || n <= 0) return "";
  const shown = Math.round(n * 100) / 100;
  return `${shown} ${shown === 1 ? "hr" : "hrs"}`;
}

/** Expected hours still to go: tasks not completed or cancelled. */
export const hoursRemaining = (items = []) => items
  .filter((item) => !["done", "cancelled"].includes(taskStatus(item)))
  .reduce((sum, item) => sum + (Number(item.labor_hours) || 0), 0);
