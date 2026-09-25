import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const catalogPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'handyman-catalog.json');
let cached;

/** Full trade list from handyman-catalog.json (until Brittany sends a custom list). */
export function loadWorkTypes() {
  if (!cached) {
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    cached = catalog.categories || [];
  }
  return cached;
}

/** Sentinel for kanban columns / selects when no work type is set. */
export const UNASSIGNED_WORK_TYPE = '__unassigned__';

export function normalizeWorkType(value) {
  const trimmed = String(value || '').trim();
  return trimmed || UNASSIGNED_WORK_TYPE;
}

/** Stored value for WorkItem.category / Job.work_type (empty string clears). */
export function workTypeForStorage(value) {
  const normalized = normalizeWorkType(value);
  return normalized === UNASSIGNED_WORK_TYPE ? '' : normalized;
}

export function workTypeLabel(value) {
  if (!value || value === UNASSIGNED_WORK_TYPE) return 'Unassigned';
  return value;
}

/** Kanban columns: unassigned (if used), catalog order, then any legacy/custom values. */
export function workTypeColumnKeys(items, getType, catalogTypes = loadWorkTypes()) {
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
