/** Shared labels for job-linked contractor documents. */
export const DOCUMENT_TYPES = [
  { entity: 'Estimate', label: 'Estimate', createLabel: 'New Estimate' },
  { entity: 'MaterialOrder', label: 'Material Order', createLabel: 'New Material Order' },
  { entity: 'ChangeOrder', label: 'Change Order', createLabel: 'New Change Order' },
  { entity: 'Invoice', label: 'Invoice', createLabel: 'New Invoice' },
];

export const DOCUMENT_STATUSES = {
  Estimate: ['draft', 'sent', 'accepted', 'declined', 'void'],
  MaterialOrder: ['draft', 'quote', 'purchased', 'partial', 'received', 'void'],
  ChangeOrder: ['draft', 'sent', 'approved', 'rejected', 'void'],
  Invoice: ['draft', 'sent', 'partial', 'paid', 'void'],
};

/** Optional per-line procurement difficulty on Material Order lines. */
export const MATERIAL_LINE_STATUSES = ['pricing', 'backorder', 'unavailable', 'canceled', 'rebuild'];

const STATUS_LABELS = {
  draft: 'Draft',
  quote: 'Quote',
  purchased: 'Purchased',
  partial: 'Partial',
  received: 'Received',
  void: 'Void',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  approved: 'Approved',
  rejected: 'Rejected',
  issued: 'Issued',
  complete: 'Complete',
  paid: 'Paid',
  pricing: 'Pricing',
  backorder: 'Backorder',
  unavailable: 'Unavailable',
  canceled: 'Canceled',
  rebuild: 'Rebuild',
  ordered: 'Purchased', // legacy MO status
};

/** Title-case (or mapped) label for document / line status values. */
export function statusLabel(status) {
  if (status == null || status === '') return '';
  const key = String(status);
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Status colors: use `statusColors` / `StatusBadge` / `StatusSelect` from `@/lib/statusColors` — do not invent per-screen colors. */

export function documentTypeLabel(entity) {
  return DOCUMENT_TYPES.find((t) => t.entity === entity)?.label || entity;
}

export function defaultDocumentNumber(entity, existingCount) {
  const prefixes = {
    Estimate: 'EST',
    MaterialOrder: 'MO',
    ChangeOrder: 'CO',
    Invoice: 'INV',
  };
  const prefix = prefixes[entity] || 'DOC';
  return `${prefix}-${String(existingCount + 1).padStart(3, '0')}`;
}
