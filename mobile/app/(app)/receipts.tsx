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

import { api, type Expense, type Job } from '@/api/client';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { ReceiptCaptureModal } from '@/components/ReceiptCaptureModal';
import { BRAND_HEX } from '@/lib/brand';
import { money, shortDate } from '@/lib/format';

/**
 * Receipts inbox — unassigned expense photos + Scan Receipt (web /receipts).
 * Tap a card → pick a job to assign (mirrors receipt onto the job gallery).
 */
export default function ReceiptsScreen() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
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
      const [ex, j] = await Promise.all([
        api.entities.Expense.list('-created_date', 400),
        api.entities.Job.list('-updated_date', 300),
      ]);
      setExpenses(ex);
      setJobs(j);
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

  const assignedWithPhoto = useMemo(
    () =>
      expenses
        .filter(e => e.photo_url && e.job_id)
        .sort((a, b) =>
          String(b.date || b.created_date || '').localeCompare(String(a.date || a.created_date || '')),
        ),
    [expenses],
  );

  const jobById = useMemo(() => Object.fromEntries(jobs.map(j => [j.id, j])), [jobs]);

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

  if (loading && !expenses.length) {
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
              {inbox.length} unassigned · {assignedWithPhoto.length} on jobs
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
            No unassigned receipts. Add an expense with a photo and leave the job blank.
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

        <Text style={[styles.section, { marginTop: 20 }]}>Recently assigned</Text>
        {assignedWithPhoto.length === 0 ? (
          <Text style={styles.empty}>No job-linked receipt photos yet.</Text>
        ) : (
          <View style={styles.list}>
            {assignedWithPhoto.slice(0, 24).map(expense => {
              const job = expense.job_id ? jobById[expense.job_id] : undefined;
              return (
                <Pressable
                  key={expense.id}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  onPress={() => router.push(`/(app)/expenses/${expense.id}`)}
                >
                  <AuthenticatedImage fileUrl={expense.photo_url} style={styles.rowThumb} />
                  <View style={styles.rowBody}>
                    <Text style={styles.cardAmount}>{money(expense.amount)}</Text>
                    <Text style={styles.meta}>
                      {shortDate(expense.date || expense.created_date)}
                      {job ? ` · ${job.title}` : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
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
              <Pressable
                onPress={() => setAssigning(null)}
                disabled={busy}
              >
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
  cardAmount: { fontSize: 14, fontWeight: '700', color: BRAND_HEX.black, paddingHorizontal: 10, paddingTop: 8 },
  cardHint: { fontSize: 11, color: '#a16207', paddingHorizontal: 10, paddingBottom: 10, paddingTop: 2 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    padding: 10,
  },
  rowThumb: { width: 56, height: 56, borderRadius: 8 },
  rowBody: { flex: 1, gap: 2 },
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
