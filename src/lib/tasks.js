/** Job task (WorkItem) statuses, in board-column order — mirrors shared/taskStatus.js. */
export const TASK_STATUSES = [
  "plan",
  "in_progress",
  "clearances",
  "waiting_on_approval",
  "waiting_on_access",
  "blocked",
  "finish",
  "completed",
  "cancelled",
];

const LEGACY_TASK_STATUS_MAP = {
  prep: "plan",
  materials: "plan",
  permits: "clearances",
  waiting_materials: "waiting_on_access",
  waiting_on_materials: "waiting_on_access",
  on_hold: "blocked",
  done: "completed",
};

const LABELS = {
  plan: "Plan",
  in_progress: "In progress",
  materials: "Plan",
  clearances: "Clearances",
  permits: "Clearances",
  waiting_on_approval: "Waiting on Approval",
  waiting_on_access: "Waiting on Access",
  waiting_on_materials: "Waiting on Access",
  blocked: "Blocked",
  finish: "Finish",
  completed: "Completed",
  cancelled: "Cancelled",
  // Legacy labels (shown only before the server normalizes on save)
  prep: "Plan",
  waiting_materials: "Waiting on Access",
  on_hold: "Blocked",
  done: "Completed",
};

export const normalizeTaskStatus = (status) => {
  if (!status) return "plan";
  return LEGACY_TASK_STATUS_MAP[status] || (TASK_STATUSES.includes(status) ? status : "plan");
};

export const isTaskCompleted = (status) => normalizeTaskStatus(status) === "completed";

export const taskStatusLabel = (status) => LABELS[normalizeTaskStatus(status)] || status;

/** A task's status; tasks saved before statuses existed fall back to their old done flag. */
export const taskStatus = (item) => normalizeTaskStatus(item?.status || (item?.done ? "completed" : "plan"));

/** Built-in Materials and Prep tasks are hidden — Prep is a job-board column. */
export const isHiddenBuiltInTask = (item) => item?.template_key === "materials" || item?.template_key === "prep";

/** Board/list order: by status column, then position, then age. */
export function sortTasks(items = []) {
  const rank = (item) => TASK_STATUSES.indexOf(taskStatus(item));
  return [...items].sort((a, b) =>
    rank(a) - rank(b)
    || (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity)
    || (a.created_date || "").localeCompare(b.created_date || ""));
}

/** List view: signed scope and ad-hoc tasks by sort_order. Hidden Prep rows never reach here. */
export function sortTasksForList(items = []) {
  return [...items].sort((a, b) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0)
    || (a.created_date || "").localeCompare(b.created_date || ""));
}

/** Tasks from a voided estimate/change order no longer stand for signed scope and can be removed. */
export const taskSourceVoided = (item, documents = []) =>
  !!item?.source_id && documents.some((d) => d.id === item.source_id && d.status === "void");

export const taskDeletable = (item, documents = []) => !item?.source_type || taskSourceVoided(item, documents);

/** Statuses that usually need a reason; moving a task into one opens its card note. */
export const NOTE_PROMPT_STATUSES = [
  "waiting_on_approval",
  "waiting_on_access",
  "blocked",
  "cancelled",
];

/** "6 hrs", "1.5 hrs", "1 hr"; empty when unknown. */
export function formatHours(hours) {
  const n = Number(hours);
  if (hours == null || hours === "" || !Number.isFinite(n) || n <= 0) return "";
  const shown = Math.round(n * 100) / 100;
  return `${shown} ${shown === 1 ? "hr" : "hrs"}`;
}

/** Expected hours still to go: tasks not completed or cancelled. */
export const hoursRemaining = (items = []) => items
  .filter((item) => !isTaskCompleted(taskStatus(item)) && taskStatus(item) !== "cancelled")
  .reduce((sum, item) => sum + (Number(item.labor_hours) || 0), 0);
