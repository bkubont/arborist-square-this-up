/** Job task (WorkItem) statuses, in board-column order — mirrors shared/taskStatus.js. */
export const TASK_STATUSES = [
  "plan",
  "permits",
  "waiting_on_approval",
  "blocked",
  "finish",
  "completed",
  "cancelled",
];

const LEGACY_TASK_STATUS_MAP = {
  prep: "plan",
  in_progress: "plan",
  waiting_materials: "blocked",
  on_hold: "blocked",
  done: "completed",
};

const LABELS = {
  plan: "Plan",
  permits: "Permits",
  waiting_on_approval: "Waiting on Approval",
  blocked: "Blocked",
  finish: "Finish",
  completed: "Completed",
  cancelled: "Cancelled",
  // Legacy labels (shown only before the server normalizes on save)
  prep: "Plan",
  in_progress: "Plan",
  waiting_materials: "Blocked",
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

/** Board/list order: by status column, then position, then age. */
export function sortTasks(items = []) {
  const rank = (item) => TASK_STATUSES.indexOf(taskStatus(item));
  return [...items].sort((a, b) =>
    rank(a) - rank(b)
    || (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity)
    || (a.created_date || "").localeCompare(b.created_date || ""));
}

/** List view: Prep first, signed scope in the middle, Final walkthrough last — regardless of status. */
export function sortTasksForList(items = []) {
  const band = (item) => {
    if (item?.template_key === "prep") return 0;
    if (item?.template_key === "final_walkthrough") return 2;
    return 1;
  };
  return [...items].sort((a, b) =>
    band(a) - band(b)
    || (a.sort_order ?? 0) - (b.sort_order ?? 0)
    || (a.created_date || "").localeCompare(b.created_date || ""));
}

/** Tasks from a voided estimate/change order no longer stand for signed scope and can be removed. */
export const taskSourceVoided = (item, documents = []) =>
  !!item?.source_id && documents.some((d) => d.id === item.source_id && d.status === "void");

export const taskDeletable = (item, documents = []) => !item?.source_type || taskSourceVoided(item, documents);

/** Statuses that usually need a reason; moving a task into one opens its card note. */
export const NOTE_PROMPT_STATUSES = [
  "waiting_on_approval",
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
