/** Built-in job task templates. Prep is no longer auto-created; existing template_key prep rows stay in the database and are hidden on list/board. */

export const JOB_TASK_TEMPLATE_KEYS = ['prep'];

/** Prep leads; signed scope tasks follow by sort_order. */
export const JOB_TASK_SORT = {
  prep: 100,
};

/** Prep follows plan | prep | clearances (utility locate / access). */
export const PREP_TASK_STEPS = [
  { text: 'Plan', done: false },
  { text: 'Prep', done: false },
  { text: 'Clearances / locate', done: false },
];

/** @typedef {'prep'} JobTaskTemplateKey */

/** @type {Record<JobTaskTemplateKey, { template_key: JobTaskTemplateKey, description: string, sort_order: number, steps: Array<{ text: string, done: boolean }> }>} */
export const JOB_TASK_TEMPLATES = {
  prep: {
    template_key: 'prep',
    description: 'Prep',
    sort_order: JOB_TASK_SORT.prep,
    steps: PREP_TASK_STEPS,
  },
};

/** No auto-created templates. Existing Prep rows are hidden, not deleted. */
export const DEFAULT_JOB_TASK_TEMPLATES = [];
