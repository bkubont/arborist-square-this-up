import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, type Estimate, type Job } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import { money, shortDate } from '@/lib/format';

export default function EstimateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      try {
        const next = await api.entities.Estimate.get(id);
        if (cancelled) return;
        setEstimate(next);
        if (next.job_id) {
          try {
            setJob(await api.entities.Job.get(next.job_id));
          } catch {
            setJob(null);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }
  if (error || !estimate) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error || 'Not found'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{estimate.number || 'Estimate'}</Text>
      <Text style={styles.badge}>{estimate.status || '—'}</Text>
      <Text style={styles.meta}>Date {shortDate(estimate.date || estimate.updated_date)}</Text>
      {estimate.total != null ? <Text style={styles.amount}>{money(estimate.total)}</Text> : null}
      {estimate.notes ? <Text style={styles.body}>{estimate.notes}</Text> : null}
      {job ? (
        <Pressable style={styles.linkBtn} onPress={() => router.push(`/(app)/jobs/${job.id}`)}>
          <Text style={styles.link}>Open job · {job.title}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.hint}>Customer e-sign stays on the web app.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { padding: 20, gap: 10 },
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
  linkBtn: { marginTop: 8 },
  link: { color: BRAND_HEX.royalBlue, fontWeight: '600', fontSize: 16 },
  hint: { marginTop: 16, fontSize: 12, color: '#888' },
  error: { color: '#b00020' },
});
