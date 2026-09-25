import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, type Job, type MaterialOrder } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import { statusLabel } from '@/lib/documents';
import { materialOrderLineAmount } from '@/lib/estimateMath';
import { money, shortDate } from '@/lib/format';

export default function MaterialOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<MaterialOrder | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const next = await api.entities.MaterialOrder.get(id);
      setDoc(next);
      if (next.job_id) {
        try {
          setJob(await api.entities.Job.get(next.job_id));
        } catch {
          setJob(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading && !doc) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }
  if (error || !doc) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error || 'Not found'}</Text>
      </View>
    );
  }

  const lines = doc.lines || [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{doc.number || 'Material Order'}</Text>
      <Text style={styles.badge}>{statusLabel(doc.status) || '—'}</Text>
      <Text style={styles.meta}>Date {shortDate(doc.date || doc.updated_date)}</Text>
      {doc.total != null ? <Text style={styles.amount}>{money(doc.total)}</Text> : null}
      {doc.notes ? <Text style={styles.body}>{doc.notes}</Text> : null}

      <Pressable
        style={styles.editBtn}
        onPress={() => router.push(`/(app)/material-orders/${doc.id}/edit`)}
      >
        <Text style={styles.editText}>Edit material order</Text>
      </Pressable>

      {lines.length ? (
        <View style={styles.card}>
          <Text style={styles.label}>Lines</Text>
          {lines.map((line, i) => (
            <View key={`l-${i}`} style={styles.lineRow}>
              <Text style={styles.lineDesc}>
                {line.description || '—'}
                {line.qty != null ? ` × ${line.qty}` : ''}
                {line.supplier ? ` · ${line.supplier}` : ''}
              </Text>
              <Text style={styles.lineAmt}>{money(materialOrderLineAmount(line))}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>No lines yet</Text>
      )}

      {job ? (
        <Pressable onPress={() => router.push(`/(app)/jobs/${job.id}`)}>
          <Text style={styles.link}>Open job · {job.title}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { padding: 20, gap: 10, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: BRAND_HEX.black },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8e8f8',
    color: BRAND_HEX.royalBlue,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
    fontWeight: '600',
    fontSize: 13,
  },
  meta: { color: '#666', fontSize: 14 },
  amount: { fontSize: 22, fontWeight: '700', color: BRAND_HEX.black },
  body: { fontSize: 15, color: '#444', lineHeight: 22 },
  editBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: BRAND_HEX.royalBlue,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editText: { color: BRAND_HEX.royalBlue, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 8,
  },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666' },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineDesc: { flex: 1, fontSize: 14, color: BRAND_HEX.black },
  lineAmt: { fontSize: 14, fontWeight: '600' },
  empty: { color: '#888', fontSize: 14 },
  link: { color: BRAND_HEX.royalBlue, fontWeight: '600', fontSize: 16 },
  error: { color: '#b00020' },
});
