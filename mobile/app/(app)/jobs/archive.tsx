import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { shortDate } from '@/lib/format';
import { formatJobStatus, isArchivedJob } from '@/lib/jobStatus';

/**
 * Archive — Paid, Declined, and Cancelled jobs (web /jobs/archive).
 */
export default function ArchiveJobsScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const all = await api.entities.Job.listAll('-updated_date');
      setJobs(all.filter(isArchivedJob));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load archive');
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

  const sorted = useMemo(
    () =>
      [...jobs].sort((a, b) =>
        String(b.archived_at || b.updated_date || '').localeCompare(
          String(a.archived_at || a.updated_date || ''),
        ),
      ),
    [jobs],
  );

  if (loading && !jobs.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Archive</Text>
        <Text style={styles.subtitle}>
          {loading ? 'Paid, declined, and cancelled jobs' : `${sorted.length} archived`}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.links}>
          <Pressable onPress={() => router.push('/(app)/(tabs)/jobs')}>
            <Text style={styles.link}>Active</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/jobs/all')}>
            <Text style={styles.link}>All jobs</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/jobs/board')}>
            <Text style={styles.link}>Board</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={item => item.id}
        contentContainerStyle={sorted.length ? styles.listPad : styles.centered}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={BRAND_HEX.royalBlue}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>No archived jobs yet.</Text>
            <Text style={styles.emptyHint}>Jobs move here when marked Paid, Declined, or Cancelled.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => router.push(`/(app)/jobs/${item.id}`)}
          >
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowMeta}>
                {item.client_name || '—'} · {formatJobStatus(item) || item.status || '—'}
              </Text>
              {item.archived_at ? (
                <Text style={styles.archived}>Archived {shortDate(item.archived_at)}</Text>
              ) : null}
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  centered: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 6 },
  title: { fontSize: 24, fontWeight: '700', color: BRAND_HEX.black },
  subtitle: { fontSize: 13, color: '#666' },
  error: { color: '#b00020', fontSize: 14 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 },
  link: { fontSize: 14, fontWeight: '600', color: BRAND_HEX.royalBlue },
  listPad: { paddingHorizontal: 16, paddingBottom: 32 },
  emptyWrap: { alignItems: 'center', gap: 8 },
  empty: { color: '#888', fontSize: 15 },
  emptyHint: { color: '#aaa', fontSize: 13, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: BRAND_HEX.black },
  rowMeta: { fontSize: 13, color: '#666' },
  archived: { fontSize: 11, color: '#888', marginTop: 2 },
  chevron: { fontSize: 22, color: '#ccc', marginLeft: 8 },
  pressed: { opacity: 0.85 },
});
