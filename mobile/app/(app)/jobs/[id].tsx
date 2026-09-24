import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, type Client, type Job } from '@/api/client';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { BRAND_HEX } from '@/lib/brand';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        const next = await api.entities.Job.get(id);
        if (cancelled) return;
        setJob(next);
        if (next.client_id) {
          try {
            setClient(await api.entities.Client.get(next.client_id));
          } catch {
            setClient(null);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load job');
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

      {job.photo_url ? (
        <AuthenticatedImage fileUrl={job.photo_url} style={styles.photo} />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Customer</Text>
        <Text style={styles.value}>{client?.name || job.client_name || '—'}</Text>
        {client ? (
          <Pressable onPress={() => router.push(`/(app)/customers/${client.id}`)}>
            <Text style={styles.link}>View customer</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { padding: 20, gap: 12 },
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
  photo: { width: '100%', height: 200, borderRadius: 12 },
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
