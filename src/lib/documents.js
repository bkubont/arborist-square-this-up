/** Shared labels for job-linked contractor documents. */
export const DOCUMENT_TYPES = [
  { entity: 'Estimate', label: 'Estimate', createLabel: 'New Estimate' },
  { entity: 'MaterialOrder', label: 'Material Order', createLabel: 'New Material Order' },
  { entity: 'WorkOrder', label: 'Work Order', createLabel: 'New Work Order' },
  { entity: 'ChangeOrder', label: 'Change Order', createLabel: 'New Change Order' },
  { entity: 'Invoice', label: 'Invoice', createLabel: 'New Invoice' },
];

export const DOCUMENT_STATUSES = {
  Estimate: ['draft', 'sent', 'accepted', 'declined', 'void'],
  MaterialOrder: ['draft', 'ordered', 'received', 'void'],
  WorkOrder: ['draft', 'issued', 'complete', 'void'],
  ChangeOrder: ['draft', 'sent', 'approved', 'rejected', 'void'],
  Invoice: ['draft', 'sent', 'partial', 'paid', 'void'],
};

/** Status colors: use `statusColors` / `StatusBadge` / `StatusSelect` from `@/lib/statusColors` — do not invent per-screen colors. */

export function documentTypeLabel(entity) {
  return DOCUMENT_TYPES.find((t) => t.entity === entity)?.label || entity;
}

export function defaultDocumentNumber(entity, existingCount) {
  const prefixes = {
    Estimate: 'EST',
    MaterialOrder: 'MO',
    WorkOrder: 'WO',
    ChangeOrder: 'CO',
    Invoice: 'INV',
  };
  const prefix = prefixes[entity] || 'DOC';
  return `${prefix}-${String(existingCount + 1).padStart(3, '0')}`;
}
