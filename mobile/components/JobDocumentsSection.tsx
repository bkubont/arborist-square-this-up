import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type ChangeOrder, type Estimate, type Invoice, type MaterialOrder } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import {
  type DocEntity,
  type JobDoc,
  DOCUMENT_TYPES,
  defaultDocumentNumber,
  documentCreateAvailability,
  docRoute,
  findLiveAcceptedEstimate,
  statusLabel,
} from '@/lib/documents';
import { addDaysIso, ESTIMATE_VALID_DAYS, todayIso } from '@/lib/estimateMath';
import { money, shortDate } from '@/lib/format';
import { loadAccountTaxRate } from '@/lib/salesTax';

type Props = {
  jobId: string;
  documents: JobDoc[];
  onChanged: () => void | Promise<void>;
};

export function JobDocumentsSection({ jobId, documents, onChanged }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState<DocEntity | null>(null);

  const sorted = [...documents].sort(
    (a, b) =>
      Number(b.entity === 'Estimate') - Number(a.entity === 'Estimate') ||
      (b.created_date || '').localeCompare(a.created_date || ''),
  );

  const openDoc = (entity: string, id: string) => {
    router.push(docRoute(entity, id) as never);
  };

  const createDraft = async (entity: DocEntity) => {
    const gate = documentCreateAvailability(entity, documents);
    if (!gate.available) {
      Alert.alert('Not available', gate.reason || 'Not available yet.');
      return;
    }
    if (gate.openExisting && gate.existing) {
      openDoc(entity, gate.existing.id);
      return;
    }

    setCreating(entity);
    try {
      const existing = documents.filter(d => d.entity === entity);
      const today = todayIso();
      const base: Record<string, unknown> = {
        job_id: jobId,
        number: defaultDocumentNumber(entity, existing.length),
        status: 'draft',
        notes: '',
      };

      if (entity === 'Estimate') {
        const tax_rate = await loadAccountTaxRate(api);
        Object.assign(base, {
          date: today,
          valid_till: addDaysIso(today, ESTIMATE_VALID_DAYS),
          lines: [],
          tax_rate,
        });
      }

      if (entity === 'MaterialOrder') {
        const accepted = findLiveAcceptedEstimate(documents);
        Object.assign(base, {
          date: today,
          lines: [],
          related_estimate_id: accepted?.id,
        });
      }

      if (entity === 'ChangeOrder') {
        const accepted = findLiveAcceptedEstimate(documents);
        const snapshotTax = (accepted?.accepted_snapshot as { tax_rate?: number } | undefined)?.tax_rate;
        const estimateTax = typeof accepted?.tax_rate === 'number' ? accepted.tax_rate : undefined;
        const tax_rate = snapshotTax ?? estimateTax ?? (await loadAccountTaxRate(api));
        Object.assign(base, {
          lines: [],
          related_estimate_id: accepted?.id,
          added_cost: 0,
          credit: 0,
          net_change: 0,
          tax_rate,
        });
      }

      if (entity === 'Invoice') {
        const created = await api.invoices.fromJob(jobId);
        await onChanged();
        openDoc('Invoice', created.id);
        return;
      }

      let created: Estimate | MaterialOrder | ChangeOrder | Invoice;
      if (entity === 'Estimate') created = await api.entities.Estimate.create(base);
      else if (entity === 'MaterialOrder') created = await api.entities.MaterialOrder.create(base);
      else created = await api.entities.ChangeOrder.create(base);

      await onChanged();
      openDoc(entity, created.id);
    } catch (err) {
      Alert.alert('Could not create', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setCreating(null);
    }
  };

  const displayMoney = (doc: JobDoc) => {
    if (doc.entity === 'ChangeOrder') return doc.revised_contract_total ?? doc.net_change;
    return doc.total as number | undefined;
  };

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Documents</Text>
      <View style={styles.actions}>
        {DOCUMENT_TYPES.map(t => {
          const gate = documentCreateAvailability(t.entity, documents);
          const busy = creating === t.entity;
          return (
            <Pressable
              key={t.entity}
              style={[styles.chip, !gate.available && styles.chipDisabled]}
              disabled={!!creating || !gate.available}
              onPress={() => createDraft(t.entity)}
            >
              {busy ? (
                <ActivityIndicator color={BRAND_HEX.royalBlue} size="small" />
              ) : (
                <Text style={[styles.chipText, !gate.available && styles.chipTextDisabled]}>
                  {gate.openExisting ? `Open ${t.label}` : `+ ${t.label}`}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {!hasAcceptedHint(documents) ? (
        <Text style={styles.hint}>
          Start with an Estimate. After the customer signs on the web, Change Orders and Invoice unlock.
        </Text>
      ) : null}

      {sorted.length === 0 ? (
        <Text style={styles.empty}>No documents yet</Text>
      ) : (
        sorted.map(doc => (
          <Pressable
            key={`${doc.entity}-${doc.id}`}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => openDoc(String(doc.entity), doc.id)}
          >
            <Text style={styles.rowTitle}>
              {labelFor(String(doc.entity))} · {doc.number || '—'}
            </Text>
            <Text style={styles.rowMeta}>
              {statusLabel(doc.status)} · {shortDate(doc.created_date as string | undefined)}
              {displayMoney(doc) != null ? ` · ${money(displayMoney(doc))}` : ''}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function hasAcceptedHint(documents: JobDoc[]) {
  return documents.some(
    d => d.entity === 'Estimate' && (d.status === 'accepted' || !!d.accepted_snapshot),
  );
}

function labelFor(entity: string) {
  return DOCUMENT_TYPES.find(t => t.entity === entity)?.label || entity;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 10,
  },
  heading: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#666',
    fontWeight: '700',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: BRAND_HEX.royalBlue,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chipDisabled: { borderColor: '#ccc', opacity: 0.55 },
  chipText: { fontSize: 12, fontWeight: '600', color: BRAND_HEX.royalBlue },
  chipTextDisabled: { color: '#888' },
  hint: { fontSize: 12, color: '#777', lineHeight: 17 },
  empty: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#ddd',
    borderRadius: 8,
  },
  row: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f5',
    gap: 2,
  },
  pressed: { backgroundColor: '#f7f7fb' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: BRAND_HEX.black },
  rowMeta: { fontSize: 13, color: '#666' },
});
