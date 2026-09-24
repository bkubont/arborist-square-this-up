import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type Client, type Job } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        const next = await api.entities.Client.get(id);
        const related = (await api.entities.Job.filter({ client_id: id }, '-updated_date')).filter(
          job => job.client_id === id,
        );
        if (cancelled) return;
        setClient(next);
        setJobs(related);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load customer');
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

  if (error || !client) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error || 'Customer not found'}</Text>
      </View>
    );
  }

  const address = [client.address, client.address_line2, [client.city, client.state, client.zip].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join('\n');

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={jobs}
      keyExtractor={item => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>{client.name}</Text>
          {client.phone ? <Text style={styles.meta}>{client.phone}</Text> : null}
          {client.email ? <Text style={styles.meta}>{client.email}</Text> : null}
          {address ? <Text style={styles.meta}>{address}</Text> : null}
          <Text style={styles.section}>Jobs</Text>
          {!jobs.length ? <Text style={styles.meta}>No jobs for this customer</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() => router.push(`/(app)/jobs/${item.id}`)}
        >
          <Text style={styles.jobTitle}>{item.title}</Text>
          <Text style={styles.meta}>{item.status || '—'}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { paddingBottom: 24 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { padding: 20, gap: 6 },
  title: { fontSize: 24, fontWeight: '700', color: BRAND_HEX.black, marginBottom: 4 },
  meta: { fontSize: 14, color: '#555', lineHeight: 20 },
  section: { marginTop: 16, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', color: '#666' },
  row: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 4,
  },
  pressed: { backgroundColor: '#f0f0f8' },
  jobTitle: { fontSize: 16, fontWeight: '600', color: BRAND_HEX.black },
  error: { color: '#b00020' },
});
