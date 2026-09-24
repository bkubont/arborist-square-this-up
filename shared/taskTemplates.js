/** Built-in job task templates — Prep first, Materials next, Final walkthrough last on every job. */

export const JOB_TASK_TEMPLATE_KEYS = ['prep', 'materials', 'final_walkthrough'];

/** Prep leads; Materials follows Prep; signed scope sits between; Final walkthrough closes the list. */
export const JOB_TASK_SORT = {
  prep: 100,
  materials: 50_000,
  final_walkthrough: 999_000,
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

/**
 * Final walkthrough follows finish | find | funds — same three-beat ring as plan | prep | permits.
 * Finish = finish work (trim, paint); Find = walk through / double check; Funds = bill / get paid.
 */
export const FINAL_WALKTHROUGH_STEPS = [
  { text: 'Finish', done: false },
  { text: 'Find', done: false },
  { text: 'Funds', done: false },
];

/** @typedef {'prep' | 'materials' | 'final_walkthrough'} JobTaskTemplateKey */

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
  final_walkthrough: {
    template_key: 'final_walkthrough',
    description: 'Final walkthrough',
    sort_order: JOB_TASK_SORT.final_walkthrough,
    steps: FINAL_WALKTHROUGH_STEPS,
  },
};

/** Templates in attach order: Prep, Materials, Final walkthrough. */
export const DEFAULT_JOB_TASK_TEMPLATES = [
  JOB_TASK_TEMPLATES.prep,
  JOB_TASK_TEMPLATES.materials,
  JOB_TASK_TEMPLATES.final_walkthrough,
];
