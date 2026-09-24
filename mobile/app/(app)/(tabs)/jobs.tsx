import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, type Job } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';

export default function JobsListScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      setJobs(await api.entities.Job.list('-updated_date'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={jobs.length ? undefined : styles.centered}
      data={jobs}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{error || 'No jobs yet'}</Text>
      }
      ListHeaderComponent={error && jobs.length ? <Text style={styles.error}>{error}</Text> : null}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() => router.push(`/(app)/jobs/${item.id}`)}
        >
          <View style={styles.rowBody}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.sub}>{item.client_name || 'No customer'} · {item.status || '—'}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f7f7fb' },
  centered: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: '#666', fontSize: 15 },
  error: { color: '#b00020', padding: 12, backgroundColor: '#fde8ea' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0ea',
  },
  pressed: { backgroundColor: '#f0f0f8' },
  rowBody: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '600', color: BRAND_HEX.black },
  sub: { fontSize: 13, color: '#666' },
  chevron: { fontSize: 22, color: '#aaa', paddingLeft: 8 },
});
