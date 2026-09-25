import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, JOB_STATUSES, type AccountSummaries, type Expense, type Job } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import { money, moneyCents } from '@/lib/format';

/**
 * Reports — read-only money / status / materials rollups (web Reports).
 */
export default function ReportsScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summaries, setSummaries] = useState<AccountSummaries | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [j, ex, moneySum] = await Promise.all([
        api.entities.Job.listAll('-updated_date'),
        api.entities.Expense.list('-created_date', 400),
        api.summaries.all(),
      ]);
      setJobs(j);
      setExpenses(ex);
      setSummaries(moneySum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
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

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const job of jobs) {
      const s = job.status || '—';
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [jobs]);

  const statusRows = useMemo(() => {
    const known = JOB_STATUSES.filter(s => statusCounts[s]);
    const extras = Object.keys(statusCounts)
      .filter(s => !(JOB_STATUSES as string[]).includes(s))
      .sort();
    return [...known, ...extras].map(status => ({ status, count: statusCounts[status] || 0 }));
  }, [statusCounts]);

  const materialsCost = useMemo(
    () => jobs.reduce((sum, j) => sum + (Number(j.materials_cost) || 0), 0),
    [jobs],
  );

  const expenseTotal = useMemo(
    () => expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [expenses],
  );

  const totals = summaries?.totals;
  const empty = !loading && jobs.length === 0 && expenses.length === 0;

  if (loading && !summaries) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
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
    >
      <Text style={styles.title}>Reports</Text>
      <Text style={styles.subtitle}>
        {loading ? 'Money, jobs, and materials at a glance' : `${jobs.length} jobs · read-only rollups`}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {empty ? (
        <Text style={styles.empty}>
          Nothing to report yet. Add jobs and documents — money and status counts show up here.
        </Text>
      ) : (
        <>
          <Text style={styles.section}>Money</Text>
          <View style={styles.grid}>
            <StatCard label="Received" value={moneyCents(totals?.paid_cents)} />
            <StatCard label="Outstanding" value={moneyCents(totals?.outstanding_cents)} attention />
            <StatCard label="Invoiced" value={moneyCents(totals?.invoiced_cents)} />
            <StatCard
              label="Waiting approval"
              value={moneyCents(totals?.waiting_approval_cents)}
              hint={`${totals?.waiting_approval_count || 0} docs`}
            />
            <StatCard
              label="Waiting payment"
              value={moneyCents(totals?.waiting_payment_cents)}
              hint={`${totals?.waiting_payment_count || 0} invoices`}
            />
            <StatCard
              label="Logged expenses"
              value={money(expenseTotal)}
              hint={`${expenses.length} records`}
            />
          </View>

          <Text style={styles.section}>Jobs by status</Text>
          {statusRows.length === 0 ? (
            <Text style={styles.empty}>No jobs yet.</Text>
          ) : (
            <View style={styles.list}>
              {statusRows.map(({ status, count }) => (
                <View key={status} style={styles.statusRow}>
                  <Text style={styles.statusLabel}>{status}</Text>
                  <Text style={styles.statusCount}>{count}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.section}>Materials cost</Text>
          <View style={styles.card}>
            <Text style={styles.hint}>From job material order rollups</Text>
            <Text style={styles.bigMoney}>{money(materialsCost)}</Text>
            <Text style={styles.hint}>
              Derived from Material Orders on jobs — open a job’s money section for detail.
            </Text>
          </View>

          <Pressable style={styles.linkBtn} onPress={() => router.push('/(app)/(tabs)/money')}>
            <Text style={styles.link}>Open Money tab</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  hint,
  attention,
}: {
  label: string;
  value: string;
  hint?: string;
  attention?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, attention && styles.attention]}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: BRAND_HEX.black },
  subtitle: { fontSize: 13, color: '#666', marginTop: -6 },
  error: { color: '#b00020', fontSize: 14 },
  empty: { fontSize: 14, color: '#888', lineHeight: 20 },
  section: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#666',
    fontWeight: '700',
    marginTop: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    padding: 12,
    gap: 2,
  },
  statLabel: { fontSize: 11, color: '#888' },
  statValue: { fontSize: 18, fontWeight: '700', color: BRAND_HEX.black },
  attention: { color: '#a16207' },
  statHint: { fontSize: 11, color: '#888' },
  list: { gap: 8 },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusLabel: { fontSize: 15, fontWeight: '600', color: BRAND_HEX.black },
  statusCount: { fontSize: 15, fontWeight: '700', color: BRAND_HEX.royalBlue },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    padding: 16,
    gap: 6,
  },
  hint: { fontSize: 12, color: '#888' },
  bigMoney: { fontSize: 28, fontWeight: '700', color: BRAND_HEX.black },
  linkBtn: { marginTop: 4 },
  link: { color: BRAND_HEX.royalBlue, fontWeight: '600', fontSize: 16 },
});
