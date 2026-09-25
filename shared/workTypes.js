/** Brittany + Tess work-type list — order preserved. */
export const WORK_TYPES = [
  'propane',
  'bathroom',
  'stairs',
  'demolition',
  'gutters',
  'windows',
  'doors',
  'addition',
  'cement',
  'lawn',
  'finish',
  'cleaning',
  'floors',
  'appliance',
  'cabinetry',
  'counters',
  'roofing',
  'siding',
  'deck',
  'insulation',
  'electric',
  'plumbing',
  'HVAC',
  'drywall',
  'painting',
  'trim',
  'prep',
  'paperwork',
  'permits',
  'structural',
  'inside doors',
  'installation',
  'removal',
  'fencing',
  'tile',
  'masonry',
  'framing',
  'garage',
  'drainage',
  'waterproofing',
  'chimney',
  'hauling',
  'glass',
  'foundation',
  'landscaping',
  'irrigation',
  'general',
  'unknown',
];

export function loadWorkTypes() {
  return WORK_TYPES;
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

/** Kanban columns: unassigned, full work-type list, then any legacy values on items. */
export function workTypeColumnKeys(items, getType, types = loadWorkTypes()) {
  const present = new Set(items.map((item) => normalizeWorkType(getType(item))));
  const cols = [UNASSIGNED_WORK_TYPE, ...types];
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
