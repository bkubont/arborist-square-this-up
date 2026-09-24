/** Built-in job task templates — Prep first, Final walkthrough last on every job. */

export const JOB_TASK_TEMPLATE_KEYS = ['prep', 'final_walkthrough'];

/** Prep always leads the list; Final walkthrough closes it. Signed scope tasks sit between. */
export const JOB_TASK_SORT = {
  prep: 100,
  final_walkthrough: 999_000,
};

/** Prep follows plan | prep | permits. */
export const PREP_TASK_STEPS = [
  { text: 'Plan', done: false },
  { text: 'Prep', done: false },
  { text: 'Permits', done: false },
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

/** @typedef {'prep' | 'final_walkthrough'} JobTaskTemplateKey */

/** @type {Record<JobTaskTemplateKey, { template_key: JobTaskTemplateKey, description: string, sort_order: number, steps: Array<{ text: string, done: boolean }> }>} */
export const JOB_TASK_TEMPLATES = {
  prep: {
    template_key: 'prep',
    description: 'Prep',
    sort_order: JOB_TASK_SORT.prep,
    steps: PREP_TASK_STEPS,
  },
  final_walkthrough: {
    template_key: 'final_walkthrough',
    description: 'Final walkthrough',
    sort_order: JOB_TASK_SORT.final_walkthrough,
    steps: FINAL_WALKTHROUGH_STEPS,
  },
};

/** Templates in attach order: Prep first, Final walkthrough last. */
export const DEFAULT_JOB_TASK_TEMPLATES = [
  JOB_TASK_TEMPLATES.prep,
  JOB_TASK_TEMPLATES.final_walkthrough,
];
