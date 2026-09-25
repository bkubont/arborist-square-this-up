import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, type Expense, type Job, type TimelineEntry } from '@/api/client';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { ReceiptCaptureModal } from '@/components/ReceiptCaptureModal';
import { BRAND_HEX } from '@/lib/brand';
import { money, shortDate } from '@/lib/format';
import { isReceiptEntry } from '@/lib/photoCategories';

type JobReceiptItem = {
  kind: 'timeline' | 'expense';
  id: string;
  photo_url?: string;
  amount?: number;
  text?: string;
  job_id?: string;
  moId?: string;
  date?: string;
};

/**
 * Receipts inbox + by-job gallery (web /receipts).
 * Tap inbox → assign job; tap by-job card → open job receipts tab.
 */
export default function ReceiptsScreen() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [assigning, setAssigning] = useState<Expense | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [ex, j, tl] = await Promise.all([
        api.entities.Expense.list('-created_date', 400),
        api.entities.Job.list('-updated_date', 300),
        api.entities.TimelineEntry.list('-created_date', 500),
      ]);
      setExpenses(ex);
      setJobs(j);
      setTimeline(tl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load receipts');
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

  const inbox = useMemo(
    () => expenses.filter(e => e.photo_url && !e.job_id),
    [expenses],
  );

  const jobById = useMemo(() => Object.fromEntries(jobs.map(j => [j.id, j])), [jobs]);

  const jobReceipts = useMemo(() => {
    const fromTimeline: JobReceiptItem[] = timeline.filter(isReceiptEntry).map(e => ({
      kind: 'timeline',
      id: e.id,
      photo_url: e.photo_url,
      amount: e.amount,
      text: e.text,
      job_id: e.job_id,
      moId: e.related_material_order_id,
      date: e.created_date,
    }));
    const timelineUrls = new Set(fromTimeline.map(r => r.photo_url).filter(Boolean));
    const fromExpenses: JobReceiptItem[] = expenses
      .filter(e => e.photo_url && e.job_id && !timelineUrls.has(e.photo_url))
      .map(e => ({
        kind: 'expense',
        id: e.id,
        photo_url: e.photo_url,
        amount: e.amount,
        text: e.vendor || e.note || e.category,
        job_id: e.job_id,
        date: e.date || e.created_date,
      }));
    return [...fromTimeline, ...fromExpenses].sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')),
    );
  }, [timeline, expenses]);

  const byJob = useMemo(() => {
    const map = new Map<string, JobReceiptItem[]>();
    for (const r of jobReceipts) {
      if (!r.job_id) continue;
      if (!map.has(r.job_id)) map.set(r.job_id, []);
      map.get(r.job_id)!.push(r);
    }
    return [...map.entries()].map(([jobId, items]) => ({
      job: jobById[jobId],
      jobId,
      items,
    }));
  }, [jobReceipts, jobById]);

  const assignToJob = async (jobId: string) => {
    if (!assigning) return;
    setBusy(true);
    setError('');
    try {
      const saved = await api.entities.Expense.update(assigning.id, {
        amount: assigning.amount,
        date: assigning.date,
        category: assigning.category,
        vendor: assigning.vendor,
        note: assigning.note,
        job_id: jobId,
        photo_url: assigning.photo_url || '',
      });
      if (saved.job_id && saved.photo_url) {
        try {
          await api.entities.TimelineEntry.create({
            job_id: saved.job_id,
            type: 'receipt',
            category: 'receipt',
            photo_url: saved.photo_url,
            amount: saved.amount || undefined,
            text: saved.vendor || saved.note || saved.category || 'Receipt',
          });
        } catch {
          // Expense assigned; gallery mirror is best-effort.
        }
      }
      setAssigning(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign job');
    } finally {
      setBusy(false);
    }
  };

  const openReceipt = (item: JobReceiptItem) => {
    if (item.moId) {
      router.push(`/(app)/material-orders/${item.moId}`);
      return;
    }
    if (item.kind === 'expense') {
      router.push(`/(app)/expenses/${item.id}`);
      return;
    }
    if (item.job_id) {
      router.push(`/(app)/jobs/${item.job_id}?tab=receipts`);
    }
  };

  if (loading && !expenses.length && !timeline.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
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
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Receipts</Text>
            <Text style={styles.subtitle}>
              {inbox.length} unassigned · {jobReceipts.length} on jobs
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.scanBtn, pressed && styles.pressed]}
            onPress={() => setCaptureOpen(true)}
          >
            <Text style={styles.scanBtnText}>Scan Receipt</Text>
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.section}>Unassigned inbox</Text>
        {inbox.length === 0 ? (
          <Text style={styles.empty}>
            No unassigned receipts. Scan one without a job to park it here.
          </Text>
        ) : (
          <View style={styles.grid}>
            {inbox.map(expense => (
              <Pressable
                key={expense.id}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                onPress={() => setAssigning(expense)}
                onLongPress={() => router.push(`/(app)/expenses/${expense.id}`)}
              >
                <AuthenticatedImage fileUrl={expense.photo_url} style={styles.thumb} />
                <Text style={styles.cardAmount}>{money(expense.amount)}</Text>
                <Text style={styles.cardHint}>Tap to assign job</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={[styles.section, { marginTop: 20 }]}>By job</Text>
        {byJob.length === 0 ? (
          <Text style={styles.empty}>
            No job receipts yet. Scan with a job, or attach from a Material Order.
          </Text>
        ) : (
          <View style={styles.byJob}>
            {byJob.map(({ job, jobId, items }) => (
              <View key={jobId} style={styles.jobBlock}>
                <Pressable
                  style={styles.jobHeader}
                  onPress={() => router.push(`/(app)/jobs/${jobId}?tab=receipts`)}
                >
                  <Text style={styles.jobTitle} numberOfLines={1}>
                    {job?.title || 'Job'}
                  </Text>
                  <Text style={styles.jobCount}>{items.length}</Text>
                </Pressable>
                <View style={styles.grid}>
                  {items.map(item => (
                    <Pressable
                      key={`${item.kind}-${item.id}`}
                      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                      onPress={() => openReceipt(item)}
                    >
                      <AuthenticatedImage fileUrl={item.photo_url} style={styles.thumb} />
                      <Text style={styles.cardCap} numberOfLines={1}>
                        {item.moId ? 'MO · ' : ''}
                        {item.amount != null ? money(item.amount) : shortDate(item.date)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        <Pressable style={styles.linkBtn} onPress={() => setCaptureOpen(true)}>
          <Text style={styles.link}>Scan another receipt</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={() => router.push('/(app)/expenses/new')}>
          <Text style={styles.link}>+ New expense with receipt</Text>
        </Pressable>
      </ScrollView>

      <ReceiptCaptureModal
        visible={captureOpen}
        onClose={() => setCaptureOpen(false)}
        jobs={jobs}
        onSaved={() => void load()}
      />

      <Modal
        visible={!!assigning}
        transparent
        animationType="slide"
        onRequestClose={() => !busy && setAssigning(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Assign to job</Text>
            {assigning ? (
              <Text style={styles.meta}>
                {money(assigning.amount)}
                {assigning.vendor ? ` · ${assigning.vendor}` : ''}
              </Text>
            ) : null}
            <ScrollView style={styles.jobList} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
              {jobs.map(job => (
                <Pressable
                  key={job.id}
                  style={[styles.jobChip, busy && styles.dim]}
                  disabled={busy}
                  onPress={() => void assignToJob(job.id)}
                >
                  <Text style={styles.jobChipText} numberOfLines={2}>
                    {job.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setAssigning(null)} disabled={busy}>
                <Text style={styles.link}>Cancel</Text>
              </Pressable>
              {assigning ? (
                <Pressable
                  onPress={() => {
                    const id = assigning.id;
                    setAssigning(null);
                    router.push(`/(app)/expenses/${id}/edit`);
                  }}
                  disabled={busy}
                >
                  <Text style={styles.link}>Full edit</Text>
                </Pressable>
              ) : null}
            </View>
            {busy ? <ActivityIndicator color={BRAND_HEX.royalBlue} style={{ marginTop: 8 }} /> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { padding: 20, gap: 10, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: BRAND_HEX.black },
  subtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  scanBtn: {
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scanBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  section: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#666',
    fontWeight: '700',
    marginTop: 8,
  },
  empty: { fontSize: 14, color: '#888', lineHeight: 20 },
  error: { color: '#b00020', fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    overflow: 'hidden',
  },
  thumb: { width: '100%', aspectRatio: 1 },
  cardAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_HEX.black,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  cardHint: {
    fontSize: 11,
    color: '#a16207',
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 2,
  },
  cardCap: {
    fontSize: 11,
    color: '#666',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  byJob: { gap: 16 },
  jobBlock: { gap: 8 },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  jobTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: BRAND_HEX.royalBlue },
  jobCount: { fontSize: 12, color: '#888' },
  meta: { fontSize: 13, color: '#666' },
  pressed: { opacity: 0.85 },
  linkBtn: { marginTop: 12 },
  link: { color: BRAND_HEX.royalBlue, fontWeight: '600', fontSize: 16 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '70%',
    gap: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: BRAND_HEX.black },
  jobList: { maxHeight: 320 },
  jobChip: {
    borderWidth: 1,
    borderColor: '#d0d0dc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#f7f7fb',
  },
  jobChipText: { fontSize: 15, fontWeight: '600', color: BRAND_HEX.black },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  dim: { opacity: 0.55 },
});
