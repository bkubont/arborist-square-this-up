/** Browser-safe work-type helpers (catalog list comes from GET /api/work-types). */

export const UNASSIGNED_WORK_TYPE = '__unassigned__';

export function normalizeWorkType(value) {
  const trimmed = String(value || '').trim();
  return trimmed || UNASSIGNED_WORK_TYPE;
}

export function workTypeForStorage(value) {
  const normalized = normalizeWorkType(value);
  return normalized === UNASSIGNED_WORK_TYPE ? '' : normalized;
}

export function workTypeLabel(value) {
  if (!value || value === UNASSIGNED_WORK_TYPE) return 'Unassigned';
  return value;
}

export function workTypeColumnKeys(items, getType, catalogTypes = []) {
  const present = new Set(items.map((item) => normalizeWorkType(getType(item))));
  const cols = [];
  if (present.has(UNASSIGNED_WORK_TYPE)) cols.push(UNASSIGNED_WORK_TYPE);
  for (const type of catalogTypes) {
    if (present.has(type)) cols.push(type);
  }
  for (const type of present) {
    if (!cols.includes(type)) cols.push(type);
  }
  return cols;
}

export function encodeTypeDroppableId(workType) {
  return `type::${workType}`;
}

export function parseTypeDroppableId(id) {
  if (!String(id).startsWith('type::')) return null;
  return id.slice(6);
}
