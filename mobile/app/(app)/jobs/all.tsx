import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, JOB_STATUSES, type Job } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import { shortDate } from '@/lib/format';
import { isArchivedJob } from '@/lib/schedule';

/**
 * All Jobs — full list with status filter (web /jobs, includes archived).
 */
export default function AllJobsScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('All');

  const load = useCallback(async () => {
    setError('');
    try {
      setJobs(await api.entities.Job.listAll('-created_date'));
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

  const filterOptions = useMemo(() => {
    const present = new Set(jobs.map(j => j.status || '—').filter(Boolean));
    const known = JOB_STATUSES.filter(s => present.has(s));
    const extras = [...present].filter(s => !(JOB_STATUSES as string[]).includes(s)).sort();
    return ['All', ...known, ...extras];
  }, [jobs]);

  const shown = useMemo(
    () => (filter === 'All' ? jobs : jobs.filter(j => (j.status || '—') === filter)),
    [jobs, filter],
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
        <Text style={styles.title}>All Jobs</Text>
        <Text style={styles.subtitle}>
          {shown.length} of {jobs.length} jobs
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {filterOptions.map(opt => {
            const active = filter === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => setFilter(opt)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={shown}
        keyExtractor={item => item.id}
        contentContainerStyle={shown.length ? styles.listPad : styles.centered}
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
        ListEmptyComponent={<Text style={styles.empty}>No jobs here.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => router.push(`/(app)/jobs/${item.id}`)}
          >
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowMeta}>
                {item.client_name || 'No customer'} · {item.status || '—'}
              </Text>
              {isArchivedJob(item) || item.archived_at ? (
                <Text style={styles.archived}>
                  Archived{item.archived_at ? ` ${shortDate(item.archived_at)}` : ''}
                </Text>
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
  filters: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: {
    borderWidth: 1,
    borderColor: '#d0d0dc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  chipActive: { borderColor: BRAND_HEX.royalBlue, backgroundColor: '#e8e8f8' },
  chipText: { fontSize: 13, color: '#444', fontWeight: '500' },
  chipTextActive: { color: BRAND_HEX.royalBlue, fontWeight: '700' },
  listPad: { paddingHorizontal: 16, paddingBottom: 32 },
  empty: { color: '#888', fontSize: 15 },
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
