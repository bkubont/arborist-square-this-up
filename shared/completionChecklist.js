/**
 * PDF §6 completion checklist — default items for arborist production close-out.
 * Jobs store a completion_checklist snapshot; auto flags are recomputed from records.
 */

/** @typedef {{ key: string, label: string, auto?: boolean }} ChecklistDef */

/** @type {ChecklistDef[]} */
export const DEFAULT_COMPLETION_CHECKLIST = [
  { key: 'approved_work', label: 'All approved work and approved changes completed', auto: true },
  { key: 'photos', label: 'Before and after photos attached', auto: true },
  { key: 'cleanup', label: 'Cleanup, wood handling, hauling, and stump work completed as agreed' },
  { key: 'damage', label: 'Damage, unresolved items, and customer concerns recorded' },
  { key: 'equipment', label: 'Equipment problems reported (or none)' },
  { key: 'return_visits', label: 'Return visits or subcontractor work scheduled (or none)' },
  { key: 'customer_informed', label: 'Customer informed that work is finished' },
];

/**
 * Default review-gate rules on CompanyProfile (PDF: job type / price / reported issue).
 * @typedef {{
 *   enabled: boolean,
 *   min_price: number,
 *   job_types: string[],
 *   require_on_problem: boolean,
 * }} ReviewGateRules
 */

/** @returns {ReviewGateRules} */
export function defaultReviewGateRules() {
  return {
    enabled: true,
    min_price: 5000,
    job_types: ['commercial', 'municipal', 'storm'],
    require_on_problem: true,
  };
}

/** Normalize stored / patched review gate rules. */
export function normalizeReviewGateRules(raw) {
  const base = defaultReviewGateRules();
  if (!raw || typeof raw !== 'object') return base;
  const min = Number(raw.min_price);
  const job_types = Array.isArray(raw.job_types)
    ? raw.job_types.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
    : base.job_types;
  return {
    enabled: raw.enabled !== false,
    min_price: Number.isFinite(min) && min >= 0 ? min : base.min_price,
    job_types,
    require_on_problem: raw.require_on_problem !== false,
  };
}
