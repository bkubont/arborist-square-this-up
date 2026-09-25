/** Work-type helpers — mirrors src/lib/workTypes.js (list from GET /api/work-types). */

export const UNASSIGNED_WORK_TYPE = '__unassigned__';

export function normalizeWorkType(value: string | null | undefined): string {
  const trimmed = String(value || '').trim();
  return trimmed || UNASSIGNED_WORK_TYPE;
}

export function workTypeForStorage(value: string | null | undefined): string {
  const normalized = normalizeWorkType(value);
  return normalized === UNASSIGNED_WORK_TYPE ? '' : normalized;
}

export function workTypeLabel(value: string | null | undefined): string {
  if (!value || value === UNASSIGNED_WORK_TYPE) return 'Unassigned';
  return value;
}

export function workTypeColumnKeys<T>(
  items: T[],
  getType: (item: T) => string | null | undefined,
  types: string[] = [],
): string[] {
  const present = new Set(items.map(item => normalizeWorkType(getType(item))));
  const cols = [UNASSIGNED_WORK_TYPE, ...types];
  for (const type of present) {
    if (!cols.includes(type)) cols.push(type);
  }
  return cols;
}
