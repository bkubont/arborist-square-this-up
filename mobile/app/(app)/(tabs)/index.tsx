import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, type AccountSummaries, type Job } from '@/api/client';
import { ScreenMessage } from '@/components/ScreenMessage';
import { useAuth } from '@/lib/AuthContext';
import { BRAND_HEX, PRODUCT_NAME } from '@/lib/brand';
import { ACTIVE_JOB_STATUSES, moneyCents } from '@/lib/format';
import { isWorkingJob } from '@/lib/jobStatus';

type AttentionRow = { id: string; title: string; detail: string; href?: string };

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [summaries, setSummaries] = useState<AccountSummaries | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [jobList, money] = await Promise.all([
        api.entities.Job.list('-updated_date', 300),
        api.summaries.all(),
      ]);
      setJobs(jobList);
      setSummaries(money);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
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

  const active = jobs.filter(
    j => isWorkingJob(j) && ACTIVE_JOB_STATUSES.includes(j.status || ''),
  );
  const totals = summaries?.totals;
  const attention: AttentionRow[] = [];
  if (summaries?.waiting_payment?.length) {
    attention.push({
      id: 'waiting-payment',
      title: `${summaries.totals.waiting_payment_count || summaries.waiting_payment.length} invoice(s) awaiting payment`,
      detail: moneyCents(summaries.totals.waiting_payment_cents),
      href: '/(app)/(tabs)/money',
    });
  }
  if (summaries?.waiting_approval?.length) {
    attention.push({
      id: 'waiting-approval',
      title: `${summaries.totals.waiting_approval_count || summaries.waiting_approval.length} doc(s) awaiting approval`,
      detail: moneyCents(summaries.totals.waiting_approval_cents),
      href: '/(app)/(tabs)/money',
    });
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  if (error && !summaries && jobs.length === 0) {
    return (
      <View style={styles.centered}>
        <ScreenMessage
          variant="error"
          title="Couldn’t load dashboard"
          detail={error}
          onRetry={() => void load()}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <Text style={styles.brand}>{PRODUCT_NAME}</Text>
      <Text style={styles.heading}>Dashboard</Text>
      <Text style={styles.meta}>
        {user?.email} · {attention.length} need attention · {active.length} active jobs
      </Text>
      {error ? (
        <Pressable onPress={() => void load(true)}>
          <Text style={styles.error}>{error} · Tap to retry</Text>
        </Pressable>
      ) : null}

      <Text style={styles.section}>Money snapshot</Text>
      <View style={styles.cards}>
        <StatCard label="Invoiced" value={moneyCents(totals?.invoiced_cents)} />
        <StatCard label="Received" value={moneyCents(totals?.paid_cents)} />
        <StatCard label="Outstanding" value={moneyCents(totals?.outstanding_cents)} accent />
      </View>

      <Text style={styles.section}>Needs attention</Text>
      {attention.length === 0 ? (
        <Text style={styles.empty}>Nothing waiting right now</Text>
      ) : (
        attention.map(row => (
          <Pressable
            key={row.id}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => row.href && router.push(row.href as never)}
          >
            <Text style={styles.rowTitle}>{row.title}</Text>
            <Text style={styles.rowMeta}>{row.detail}</Text>
          </Pressable>
        ))
      )}

      <Text style={styles.section}>Active jobs</Text>
      {active.length === 0 ? (
        <ScreenMessage
          title="No active jobs"
          detail="Add a job from the Jobs tab when you’re ready for the next site visit."
          actionLabel="Go to Jobs"
          onAction={() => router.push('/(app)/(tabs)/jobs')}
        />
      ) : (
        active.slice(0, 8).map(job => (
          <Pressable
            key={job.id}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => router.push(`/(app)/jobs/${job.id}`)}
          >
            <Text style={styles.rowTitle}>{job.title}</Text>
            <Text style={styles.rowMeta}>
              {job.client_name || '—'} · {job.status}
              {summaries?.jobs?.[job.id]?.balance_cents
                ? ` · bal ${moneyCents(summaries.jobs[job.id].balance_cents)}`
                : ''}
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[styles.stat, accent && styles.statAccent]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { padding: 20, gap: 10, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f7fb' },
  brand: { fontSize: 26, fontWeight: '700', color: BRAND_HEX.royalBlue, letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '600', color: BRAND_HEX.black },
  meta: { fontSize: 13, color: '#666', marginBottom: 4 },
  section: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#666',
  },
  cards: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 4,
  },
  statAccent: { borderColor: BRAND_HEX.gold, backgroundColor: '#fffbf0' },
  statLabel: { fontSize: 11, color: '#666', fontWeight: '600' },
  statValue: { fontSize: 15, fontWeight: '700', color: BRAND_HEX.black },
  statValueAccent: { color: '#8a6a12' },
  row: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 4,
  },
  pressed: { backgroundColor: '#f0f0f8' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: BRAND_HEX.black },
  rowMeta: { fontSize: 13, color: '#666' },
  empty: { color: '#777', fontSize: 14 },
  error: { color: '#b00020', fontSize: 14 },
});
