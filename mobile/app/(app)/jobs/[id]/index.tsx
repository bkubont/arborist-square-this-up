import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  api,
  type ChangeOrder,
  type Client,
  type Estimate,
  type Invoice,
  type Job,
  type MaterialOrder,
  type TimelineEntry,
  type WorkItem,
} from '@/api/client';
import { JobDocumentsSection } from '@/components/JobDocumentsSection';
import { JobPhotosSection } from '@/components/JobPhotosSection';
import { JobTasksSection } from '@/components/JobTasksSection';
import { BRAND_HEX } from '@/lib/brand';
import type { JobDoc } from '@/lib/documents';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [documents, setDocuments] = useState<JobDoc[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [next, timeline, estimates, invoices, changeOrders, materialOrders, tasks] =
        await Promise.all([
          api.entities.Job.get(id),
          api.entities.TimelineEntry.filter({ job_id: id }, '-created_date', 500),
          api.entities.Estimate.filter({ job_id: id }, '-created_date', 50),
          api.entities.Invoice.filter({ job_id: id }, '-created_date', 50),
          api.entities.ChangeOrder.filter({ job_id: id }, '-created_date', 100),
          api.entities.MaterialOrder.filter({ job_id: id }, '-created_date', 100),
          api.entities.WorkItem.filter({ job_id: id }, '-created_date', 500),
        ]);
      setJob(next);
      setEntries(timeline);
      setWorkItems(tasks);
      setDocuments([
        ...estimates.map((d: Estimate) => ({ ...d, entity: 'Estimate' as const })),
        ...invoices.map((d: Invoice) => ({ ...d, entity: 'Invoice' as const })),
        ...changeOrders.map((d: ChangeOrder) => ({ ...d, entity: 'ChangeOrder' as const })),
        ...materialOrders.map((d: MaterialOrder) => ({ ...d, entity: 'MaterialOrder' as const })),
      ]);
      if (next.client_id) {
        try {
          setClient(await api.entities.Client.get(next.client_id));
        } catch {
          setClient(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading && !job) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  if (error || !job) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error || 'Job not found'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{job.title}</Text>
      <Text style={styles.badge}>{job.status || '—'}</Text>
      {job.description ? <Text style={styles.body}>{job.description}</Text> : null}

      <Pressable style={styles.editBtn} onPress={() => router.push(`/(app)/jobs/${job.id}/edit`)}>
        <Text style={styles.editText}>Edit job</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.label}>Customer</Text>
        <Text style={styles.value}>{client?.name || job.client_name || '—'}</Text>
        {client ? (
          <Pressable onPress={() => router.push(`/(app)/customers/${client.id}`)}>
            <Text style={styles.link}>View customer</Text>
          </Pressable>
        ) : null}
      </View>

      <JobDocumentsSection jobId={job.id} documents={documents} onChanged={load} />
      <JobTasksSection jobId={job.id} items={workItems} />
      <JobPhotosSection jobId={job.id} entries={entries} onChanged={load} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: BRAND_HEX.black },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8e8f8',
    color: BRAND_HEX.royalBlue,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 13,
    fontWeight: '600',
  },
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
    gap: 6,
  },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666' },
  value: { fontSize: 17, fontWeight: '600', color: BRAND_HEX.black },
  link: { color: BRAND_HEX.royalBlue, fontWeight: '600', marginTop: 4 },
  error: { color: '#b00020' },
});
