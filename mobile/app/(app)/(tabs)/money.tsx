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

import {
  api,
  type AccountSummaries,
  type Estimate,
  type Expense,
  type Invoice,
  type Job,
} from '@/api/client';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { BRAND_HEX } from '@/lib/brand';
import { money, moneyCents, shortDate } from '@/lib/format';

type Segment = 'estimates' | 'invoices' | 'expenses';

export default function MoneyScreen() {
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>('invoices');
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
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
      const [e, inv, ex, j, moneySum] = await Promise.all([
        api.entities.Estimate.list('-updated_date', 300),
        api.entities.Invoice.list('-updated_date', 300),
        api.entities.Expense.list('-created_date', 400),
        api.entities.Job.list('-updated_date', 300),
        api.summaries.all(),
      ]);
      setEstimates(e);
      setInvoices(inv);
      setExpenses(ex);
      setJobs(j);
      setSummaries(moneySum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load money');
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

  const jobById = Object.fromEntries(jobs.map(j => [j.id, j]));
  const totals = summaries?.totals;

  const data =
    segment === 'estimates' ? estimates : segment === 'invoices' ? invoices : expenses;

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.summaryRow}>
        <SummaryChip label="Invoiced" value={moneyCents(totals?.invoiced_cents)} />
        <SummaryChip label="Outstanding" value={moneyCents(totals?.outstanding_cents)} />
        <SummaryChip label="Waiting pay" value={String(totals?.waiting_payment_count || 0)} />
      </View>

      <View style={styles.segments}>
        {(['estimates', 'invoices', 'expenses'] as Segment[]).map(key => {
          const active = segment === key;
          const label = key === 'estimates' ? 'Estimates' : key === 'invoices' ? 'Invoices' : 'Expenses';
          return (
            <Pressable
              key={key}
              onPress={() => setSegment(key)}
              style={[styles.seg, active && styles.segActive]}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {segment === 'expenses' ? (
        <View style={styles.expenseActions}>
          <Pressable style={styles.addBtn} onPress={() => router.push('/(app)/expenses/new')}>
            <Text style={styles.addText}>Add expense</Text>
          </Pressable>
          <Pressable style={styles.inboxBtn} onPress={() => router.push('/(app)/receipts')}>
            <Text style={styles.inboxText}>Receipts inbox</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.hint}>Create estimates, invoices, and orders from a job.</Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={data as Array<{ id: string }>}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        contentContainerStyle={data.length ? styles.listPad : styles.centered}
        ListEmptyComponent={<Text style={styles.empty}>Nothing here yet</Text>}
        renderItem={({ item }) => {
          if (segment === 'estimates') {
            const est = item as Estimate;
            const job = est.job_id ? jobById[est.job_id] : undefined;
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => router.push(`/(app)/estimates/${est.id}`)}
              >
                <Text style={styles.title}>
                  {est.number || 'Estimate'}
                  {job ? ` · ${job.title}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {est.status || '—'} · {shortDate(est.date || est.updated_date)}
                  {est.total != null ? ` · ${money(est.total)}` : ''}
                </Text>
              </Pressable>
            );
          }
          if (segment === 'invoices') {
            const inv = item as Invoice;
            const job = inv.job_id ? jobById[inv.job_id] : undefined;
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => router.push(`/(app)/invoices/${inv.id}`)}
              >
                <Text style={styles.title}>
                  {inv.number || 'Invoice'}
                  {job ? ` · ${job.title}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {inv.status || '—'} · {shortDate(inv.date || inv.updated_date)}
                  {inv.total != null ? ` · ${money(inv.total)}` : ''}
                  {inv.balance_due != null ? ` · due ${money(inv.balance_due)}` : ''}
                </Text>
              </Pressable>
            );
          }
          const ex = item as Expense;
          const job = ex.job_id ? jobById[ex.job_id] : undefined;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, styles.expenseRow, pressed && styles.pressed]}
              onPress={() => router.push(`/(app)/expenses/${ex.id}`)}
            >
              {ex.photo_url ? (
                <AuthenticatedImage fileUrl={ex.photo_url} style={styles.receiptThumb} />
              ) : (
                <View style={styles.receiptPlaceholder} />
              )}
              <View style={styles.expenseBody}>
                <Text style={styles.title}>
                  {money(ex.amount)} · {ex.category || 'Expense'}
                </Text>
                <Text style={styles.meta}>
                  {shortDate(ex.date || ex.created_date)}
                  {ex.vendor ? ` · ${ex.vendor}` : ''}
                  {job ? ` · ${job.title}` : ' · Unassigned'}
                  {ex.photo_url ? ' · receipt' : ''}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  centered: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  summaryRow: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 4 },
  chip: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e4e4ef',
  },
  chipLabel: { fontSize: 10, color: '#666', fontWeight: '600', textTransform: 'uppercase' },
  chipValue: { fontSize: 14, fontWeight: '700', color: BRAND_HEX.black, marginTop: 2 },
  segments: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  seg: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8d8e4',
  },
  segActive: { borderColor: BRAND_HEX.royalBlue, backgroundColor: '#e8e8f8' },
  segText: { fontSize: 13, fontWeight: '600', color: '#555' },
  segTextActive: { color: BRAND_HEX.royalBlue },
  addBtn: {
    flex: 1,
    marginHorizontal: 0,
    marginBottom: 0,
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  expenseActions: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  inboxBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BRAND_HEX.royalBlue,
    backgroundColor: '#fff',
  },
  inboxText: { color: BRAND_HEX.royalBlue, fontWeight: '600' },
  addText: { color: '#fff', fontWeight: '600' },
  hint: { marginHorizontal: 12, marginBottom: 8, fontSize: 12, color: '#777' },
  listPad: { paddingBottom: 24 },
  row: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 4,
  },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  expenseBody: { flex: 1, gap: 4 },
  receiptThumb: { width: 52, height: 52, borderRadius: 8 },
  receiptPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#f0f0f5',
    borderWidth: 1,
    borderColor: '#e4e4ef',
  },
  pressed: { backgroundColor: '#f0f0f8' },
  title: { fontSize: 15, fontWeight: '600', color: BRAND_HEX.black },
  meta: { fontSize: 13, color: '#666' },
  empty: { color: '#777' },
  error: { color: '#b00020', paddingHorizontal: 12, marginBottom: 8 },
});
