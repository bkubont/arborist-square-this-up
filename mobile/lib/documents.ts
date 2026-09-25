/** Document labels / create gates — mirrors src/lib/documents.js + documentAvailability.js. */

export const DOCUMENT_TYPES = [
  { entity: 'Estimate' as const, label: 'Estimate' },
  { entity: 'MaterialOrder' as const, label: 'Material Order' },
  { entity: 'ChangeOrder' as const, label: 'Change Order' },
  { entity: 'Invoice' as const, label: 'Invoice' },
];

export type DocEntity = (typeof DOCUMENT_TYPES)[number]['entity'];

export const DOCUMENT_STATUSES: Record<DocEntity, string[]> = {
  Estimate: ['draft', 'sent', 'accepted', 'declined', 'void'],
  MaterialOrder: ['draft', 'quote', 'purchased', 'partial', 'received', 'void'],
  ChangeOrder: ['draft', 'sent', 'approved', 'rejected', 'void'],
  Invoice: ['draft', 'sent', 'partial', 'paid', 'void'],
};

const STATUS_LABELS: Record<string, string> = {
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
  paid: 'Paid',
};

export function statusLabel(status: string | null | undefined): string {
  if (status == null || status === '') return '';
  const key = String(status);
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function defaultDocumentNumber(entity: DocEntity, existingCount: number): string {
  const prefixes: Record<DocEntity, string> = {
    Estimate: 'EST',
    MaterialOrder: 'MO',
    ChangeOrder: 'CO',
    Invoice: 'INV',
  };
  return `${prefixes[entity]}-${String(existingCount + 1).padStart(3, '0')}`;
}

export const SINGLE_DOC_ENTITIES = new Set<DocEntity>(['Estimate', 'Invoice']);

export type JobDoc = {
  id: string;
  entity: DocEntity | string;
  status?: string;
  accepted_snapshot?: unknown;
  number?: string;
  total?: number;
  net_change?: number;
  revised_contract_total?: number;
  created_date?: string;
  [key: string]: unknown;
};

export function hasAcceptedEstimate(documents: JobDoc[] = []): boolean {
  return documents.some(
    d =>
      d.entity === 'Estimate' &&
      d.status !== 'void' &&
      (d.status === 'accepted' || !!d.accepted_snapshot),
  );
}

export function findActiveDocument(entity: DocEntity, documents: JobDoc[] = []): JobDoc | null {
  return documents.find(d => d.entity === entity && d.status !== 'void') || null;
}

export function findLiveAcceptedEstimate(documents: JobDoc[] = []): JobDoc | null {
  const estimates = documents.filter(d => d.entity === 'Estimate');
  return (
    estimates.find(e => e.status === 'accepted') ||
    estimates.find(e => e.status !== 'void' && e.accepted_snapshot) ||
    null
  );
}

export function documentCreateAvailability(
  entity: DocEntity,
  documents: JobDoc[] = [],
): { available: boolean; reason?: string; existing?: JobDoc | null; openExisting?: boolean } {
  if (SINGLE_DOC_ENTITIES.has(entity)) {
    const existing = findActiveDocument(entity, documents);
    if (existing) {
      return { available: true, openExisting: true, existing };
    }
  }
  if (entity === 'Estimate' || entity === 'MaterialOrder') {
    return { available: true };
  }
  if (!hasAcceptedEstimate(documents)) {
    const labels: Partial<Record<DocEntity, string>> = {
      ChangeOrder: 'Change Orders unlock after the customer accepts the estimate.',
      Invoice: 'Invoices unlock after the customer accepts the estimate.',
    };
    return { available: false, reason: labels[entity] || 'Available after the estimate is accepted.' };
  }
  return { available: true };
}

export function isEstimateReadOnly(document: { status?: string; accepted_snapshot?: unknown } | null): boolean {
  if (!document) return false;
  return ['accepted', 'declined', 'void'].includes(document.status || '') || !!document.accepted_snapshot;
}

export function isChangeOrderReadOnly(document: { status?: string; accepted_snapshot?: unknown } | null): boolean {
  if (!document) return false;
  return ['approved', 'rejected', 'void'].includes(document.status || '') || !!document.accepted_snapshot;
}

export function docRoute(entity: string, id: string): string {
  const map: Record<string, string> = {
    Estimate: 'estimates',
    Invoice: 'invoices',
    ChangeOrder: 'change-orders',
    MaterialOrder: 'material-orders',
  };
  const segment = map[entity] || entity.toLowerCase();
  return `/(app)/${segment}/${id}`;
}
