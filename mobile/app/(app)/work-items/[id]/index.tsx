import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, type Job, type WorkItem } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import { moneyCents } from '@/lib/format';
import { taskStatus, taskStatusLabel } from '@/lib/tasks';

export default function WorkItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<WorkItem | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const next = await api.entities.WorkItem.get(id);
      setItem(next);
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

  if (loading && !item) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }
  if (error || !item) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error || 'Not found'}</Text>
      </View>
    );
  }

  const title =
    item.description ||
    (item.template_key === 'prep'
      ? 'Prep'
      : item.template_key === 'materials'
        ? 'Materials'
        : item.template_key === 'final_walkthrough'
          ? 'Final walkthrough'
          : 'Task');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.badge}>{taskStatusLabel(taskStatus(item))}</Text>
      {item.amount_cents != null ? (
        <Text style={styles.amount}>{moneyCents(item.amount_cents)}</Text>
      ) : null}
      {item.category ? <Text style={styles.meta}>Category · {item.category}</Text> : null}
      {item.labor_hours != null ? <Text style={styles.meta}>{item.labor_hours} labor hours</Text> : null}
      {item.source_type ? (
        <Text style={styles.meta}>From {item.source_type}</Text>
      ) : null}
      {item.notes ? <Text style={styles.body}>{item.notes}</Text> : null}

      {(item.materials || []).length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.label}>Materials</Text>
          {(item.materials || []).map((m, i) => (
            <Text key={m.id || `m-${i}`} style={styles.line}>
              {m.description || '—'}
              {m.qty != null ? ` × ${m.qty}` : ''}
              {m.unit ? ` ${m.unit}` : ''}
              {m.have ? ' · Have' : ' · need'}
            </Text>
          ))}
        </View>
      ) : null}

      <Pressable style={styles.editBtn} onPress={() => router.push(`/(app)/work-items/${item.id}/edit`)}>
        <Text style={styles.editText}>Edit task</Text>
      </Pressable>

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
  amount: { fontSize: 20, fontWeight: '700', color: BRAND_HEX.black },
  meta: { color: '#666', fontSize: 14 },
  body: { fontSize: 15, color: '#444', lineHeight: 22 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 6,
  },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666' },
  line: { fontSize: 14, color: '#333' },
  editBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: BRAND_HEX.royalBlue,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editText: { color: BRAND_HEX.royalBlue, fontWeight: '600' },
  link: { color: BRAND_HEX.royalBlue, fontWeight: '600', fontSize: 16 },
  error: { color: '#b00020' },
});
