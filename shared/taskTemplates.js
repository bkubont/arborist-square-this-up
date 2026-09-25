/** Built-in job task templates — Prep first, Materials next on every job. Final walkthrough is a punch list document. */

export const JOB_TASK_TEMPLATE_KEYS = ['prep', 'materials'];

/** Prep leads; signed scope sits between Prep and Materials. */
export const JOB_TASK_SORT = {
  prep: 100,
  materials: 50_000,
};

/** Prep follows plan | prep | permits. */
export const PREP_TASK_STEPS = [
  { text: 'Plan', done: false },
  { text: 'Prep', done: false },
  { text: 'Permits', done: false },
];

/** Materials task — list what the job needs, order it, confirm on hand. */
export const MATERIALS_TASK_STEPS = [
  { text: 'List', done: false },
  { text: 'Order', done: false },
  { text: 'On hand', done: false },
];

/** @typedef {'prep' | 'materials'} JobTaskTemplateKey */

/** @type {Record<JobTaskTemplateKey, { template_key: JobTaskTemplateKey, description: string, sort_order: number, steps: Array<{ text: string, done: boolean }> }>} */
export const JOB_TASK_TEMPLATES = {
  prep: {
    template_key: 'prep',
    description: 'Prep',
    sort_order: JOB_TASK_SORT.prep,
    steps: PREP_TASK_STEPS,
  },
  materials: {
    template_key: 'materials',
    description: 'Materials',
    sort_order: JOB_TASK_SORT.materials,
    steps: MATERIALS_TASK_STEPS,
  },
};

/** Templates in attach order: Prep, Materials. */
export const DEFAULT_JOB_TASK_TEMPLATES = [
  JOB_TASK_TEMPLATES.prep,
  JOB_TASK_TEMPLATES.materials,
];
