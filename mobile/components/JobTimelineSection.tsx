import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api, type TimelineEntry } from '@/api/client';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { BRAND_HEX } from '@/lib/brand';
import { money, shortDate } from '@/lib/format';
import { isPhotoEntry } from '@/lib/photoCategories';

type Props = {
  jobId: string;
  entries: TimelineEntry[];
  onChanged: () => void | Promise<void>;
};

const TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  photo: 'Photo',
  receipt: 'Receipt',
  document: 'Document',
  estimate_sent: 'Estimate sent',
  estimate_signed: 'Estimate signed',
  deposit_received: 'Deposit received',
  invoice_sent: 'Invoice sent',
  payment_received: 'Payment received',
  status_change: 'Status change',
  checklist: 'Checklist',
  work_order_created: 'Work order',
  change_order_sent: 'Change order sent',
  change_order_signed: 'Change order signed',
  document_created: 'Document created',
  document_voided: 'Document voided',
};

/**
 * Job timeline notes + recent activity (web TimelineFeed, notes-first for field use).
 */
export function JobTimelineSection({ jobId, entries, onChanged }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const feed = useMemo(() => {
    const sorted = [...entries].sort((a, b) =>
      String(b.created_date || '').localeCompare(String(a.created_date || '')),
    );
    return expanded ? sorted.slice(0, 40) : sorted.slice(0, 8);
  }, [entries, expanded]);

  const addNote = async () => {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    setError('');
    try {
      await api.entities.TimelineEntry.create({
        job_id: jobId,
        type: 'note',
        category: 'note',
        text: value,
      });
      setText('');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add note');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Timeline</Text>
      <Text style={styles.hint}>Field notes land here with photos, receipts, and money events.</Text>

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Add a note…"
          placeholderTextColor="#999"
          multiline
          editable={!busy}
          returnKeyType="default"
          blurOnSubmit={false}
        />
        <Pressable
          style={[styles.addBtn, (busy || !text.trim()) && styles.dim]}
          onPress={() => void addNote()}
          disabled={busy || !text.trim()}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.addBtnText}>Post</Text>}
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {feed.length === 0 ? (
        <Text style={styles.empty}>No notes or activity yet — post a field note above.</Text>
      ) : (
        <View style={styles.list}>
          {feed.map(entry => (
            <View key={entry.id} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.type}>
                  {TYPE_LABELS[entry.type] || String(entry.type || 'note').replace(/_/g, ' ')}
                </Text>
                <Text style={styles.when}>{shortDate(entry.created_date)}</Text>
              </View>
              {entry.text ? <Text style={styles.body}>{entry.text}</Text> : null}
              {entry.amount != null ? (
                <Text style={styles.amount}>{money(entry.amount)}</Text>
              ) : null}
              {entry.photo_url && isPhotoEntry(entry) ? (
                <AuthenticatedImage fileUrl={entry.photo_url} style={styles.thumb} />
              ) : null}
            </View>
          ))}
        </View>
      )}

      {entries.length > 8 ? (
        <Pressable onPress={() => setExpanded(v => !v)}>
          <Text style={styles.link}>{expanded ? 'Show less' : `Show more (${entries.length})`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
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
  hint: { fontSize: 12, color: '#888', marginTop: -4 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#d0d0dc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: BRAND_HEX.black,
    backgroundColor: '#f7f7fb',
  },
  addBtn: {
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 64,
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '700' },
  dim: { opacity: 0.5 },
  error: { color: '#b00020', fontSize: 13 },
  empty: { color: '#888', fontSize: 14 },
  list: { gap: 0 },
  row: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f5',
    gap: 4,
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  type: { fontSize: 13, fontWeight: '700', color: BRAND_HEX.black },
  when: { fontSize: 12, color: '#888' },
  body: { fontSize: 14, color: '#444', lineHeight: 20 },
  amount: { fontSize: 14, fontWeight: '700', color: '#047857' },
  thumb: { width: '100%', height: 120, borderRadius: 8, marginTop: 4 },
  link: { color: BRAND_HEX.royalBlue, fontWeight: '600', fontSize: 14 },
});
