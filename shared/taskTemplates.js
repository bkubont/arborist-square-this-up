/** Built-in job task templates — Prep on every job. Job materials live on Overview; punch list is a document. */

export const JOB_TASK_TEMPLATE_KEYS = ['prep'];

/** Prep leads; signed scope tasks follow by sort_order. */
export const JOB_TASK_SORT = {
  prep: 100,
};

/** Prep follows plan | prep | permits. */
export const PREP_TASK_STEPS = [
  { text: 'Plan', done: false },
  { text: 'Prep', done: false },
  { text: 'Permits', done: false },
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

/** Templates in attach order: Prep only. */
export const DEFAULT_JOB_TASK_TEMPLATES = [
  JOB_TASK_TEMPLATES.prep,
];
