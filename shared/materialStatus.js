/** Per-line materials status — editable on job Overview and task T-chart rows. */
export const MATERIAL_STATUSES = ['needed', 'ordered', 'waiting', 'on_hand'];

const LABELS = {
  needed: 'Needed',
  ordered: 'Ordered',
  waiting: 'Waiting',
  on_hand: 'On hand',
};

export function materialStatusLabel(status) {
  const key = normalizeMaterialStatus({ status });
  return LABELS[key] || LABELS.needed;
}

/** Read status from stored row; legacy `have` maps to on hand. */
export function normalizeMaterialStatus(material = {}) {
  const raw = String(material?.status || '').trim();
  if (MATERIAL_STATUSES.includes(raw)) return raw;
  if (material?.have) return 'on_hand';
  return 'needed';
}

export function isMaterialOnHand(material = {}) {
  return normalizeMaterialStatus(material) === 'on_hand';
}

/** Rows that still feed the draft Material Order (not on hand yet). */
export function materialNeedsOrder(material = {}) {
  return !isMaterialOnHand(material);
}

/** Keep legacy `have` in sync when persisting `status`. */
export function materialRowForStorage(material = {}) {
  const status = normalizeMaterialStatus(material);
  return {
    ...material,
    status,
    have: status === 'on_hand',
  };
}
