import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api, type Job } from '@/api/client';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { BRAND_HEX } from '@/lib/brand';
import { todayIso } from '@/lib/expenseCategories';
import { enqueuePhoto, isLikelyNetworkError, isNetworkOnline } from '@/lib/offlinePhotoQueue';
import { pickImage, type ImageSource } from '@/lib/pickImage';

type Props = {
  visible: boolean;
  onClose: () => void;
  jobs?: Job[];
  /** Prefill job when opened from a job context. */
  defaultJobId?: string;
  onSaved?: () => void;
  /** When true, open the camera as soon as the modal appears. */
  cameraFirst?: boolean;
};

/**
 * Field-fast receipt capture (web ReceiptCaptureDialog / Scan Receipt).
 * Photo → optional amount → optional job → Expense inbox and/or job timeline.
 * Offline: keeps a local preview and queues upload on Save.
 */
export function ReceiptCaptureModal({
  visible,
  onClose,
  jobs: jobsProp,
  defaultJobId = '',
  onSaved,
  cameraFirst = true,
}: Props) {
  const [jobs, setJobs] = useState<Job[]>(jobsProp || []);
  const [photoUrl, setPhotoUrl] = useState('');
  const [localUri, setLocalUri] = useState('');
  const [amount, setAmount] = useState('');
  const [jobId, setJobId] = useState(defaultJobId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [queuedNote, setQueuedNote] = useState('');
  const [didAutoCamera, setDidAutoCamera] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPhotoUrl('');
      setLocalUri('');
      setAmount('');
      setJobId(defaultJobId || '');
      setError('');
      setQueuedNote('');
      setBusy(false);
      setDidAutoCamera(false);
      return;
    }
    setJobId(defaultJobId || '');
    if (jobsProp?.length) {
      setJobs(jobsProp);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await api.entities.Job.list('-updated_date', 300);
        if (!cancelled) setJobs(list);
      } catch {
        // Job picker optional; capture still works for inbox.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, defaultJobId, jobsProp]);

  const capture = async (source: ImageSource) => {
    setError('');
    setQueuedNote('');
    const picked = await pickImage(source);
    if (!picked) return;
    if ('error' in picked) {
      setError(picked.error);
      return;
    }
    setBusy(true);
    try {
      const online = await isNetworkOnline();
      if (!online) {
        setLocalUri(picked.uri);
        setPhotoUrl('');
        setQueuedNote('Offline — photo kept on device until you save.');
        return;
      }
      try {
        const { file_url } = await api.uploadFile(picked.uri);
        setPhotoUrl(file_url);
        setLocalUri('');
      } catch (err) {
        if (isLikelyNetworkError(err)) {
          setLocalUri(picked.uri);
          setPhotoUrl('');
          setQueuedNote('Offline — photo kept on device until you save.');
          return;
        }
        throw err;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!visible || !cameraFirst || didAutoCamera || photoUrl || localUri) return;
    setDidAutoCamera(true);
    const t = setTimeout(() => {
      void capture('camera');
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-open once per modal show
  }, [visible, cameraFirst, didAutoCamera, photoUrl, localUri]);

  const save = async () => {
    if (!photoUrl && !localUri) {
      setError('Capture a receipt photo first.');
      return;
    }
    const n = amount === '' ? 0 : Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      setError('Enter a valid amount.');
      return;
    }
    setBusy(true);
    setError('');
    setQueuedNote('');
    try {
      if (!photoUrl && localUri) {
        await enqueuePhoto({
          sourceUri: localUri,
          kind: 'expense_receipt',
          jobId: jobId || undefined,
          amount: n,
        });
        setQueuedNote('Queued — will upload when you are back online.');
        onClose();
        onSaved?.();
        return;
      }

      if (jobId) {
        await api.entities.TimelineEntry.create({
          job_id: jobId,
          type: 'receipt',
          category: 'receipt',
          photo_url: photoUrl,
          amount: n || undefined,
          text: n ? `Receipt ${n}` : 'Receipt',
        });
        if (n > 0) {
          await api.entities.Expense.create({
            amount: n,
            date: todayIso(),
            category: 'Materials',
            job_id: jobId,
            photo_url: photoUrl,
            note: 'From receipt capture',
          });
        }
      } else {
        await api.entities.Expense.create({
          amount: n,
          date: todayIso(),
          category: 'Materials',
          photo_url: photoUrl,
          note: 'Unassigned receipt',
        });
      }
      onClose();
      onSaved?.();
    } catch (err) {
      if (localUri && isLikelyNetworkError(err)) {
        try {
          await enqueuePhoto({
            sourceUri: localUri,
            kind: 'expense_receipt',
            jobId: jobId || undefined,
            amount: n,
          });
          onClose();
          onSaved?.();
          return;
        } catch {
          /* fall through */
        }
      }
      setError(err instanceof Error ? err.message : 'Could not save receipt');
    } finally {
      setBusy(false);
    }
  };

  const hasPhoto = Boolean(photoUrl || localUri);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !busy && onClose()}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Scan Receipt</Text>
          <Text style={styles.subtitle}>Photo first, then optional amount and job.</Text>

          <View style={styles.actions}>
            <Pressable
              style={[styles.camBtn, busy && styles.dim]}
              disabled={busy}
              onPress={() => void capture('camera')}
            >
              <Text style={styles.camBtnText}>Camera</Text>
            </Pressable>
            <Pressable
              style={[styles.libBtn, busy && styles.dim]}
              disabled={busy}
              onPress={() => void capture('library')}
            >
              <Text style={styles.libBtnText}>Library</Text>
            </Pressable>
          </View>

          {photoUrl ? (
            <AuthenticatedImage fileUrl={photoUrl} style={styles.preview} />
          ) : localUri ? (
            <Image source={{ uri: localUri }} style={styles.preview} />
          ) : (
            <Text style={styles.hint}>Take or choose a receipt photo.</Text>
          )}

          <Text style={styles.label}>Amount (optional)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#999"
            editable={!busy}
          />

          <Text style={styles.label}>Job</Text>
          <Text style={styles.hint}>Leave unassigned to finish later from Receipts.</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Pressable
              onPress={() => setJobId('')}
              style={[styles.chip, !jobId && styles.chipActive]}
              disabled={busy}
            >
              <Text style={[styles.chipText, !jobId && styles.chipTextActive]}>Inbox</Text>
            </Pressable>
            {jobs.slice(0, 40).map(j => {
              const active = j.id === jobId;
              return (
                <Pressable
                  key={j.id}
                  onPress={() => setJobId(j.id)}
                  style={[styles.chip, active && styles.chipActive]}
                  disabled={busy}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                    numberOfLines={1}
                  >
                    {j.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {queuedNote ? <Text style={styles.queued}>{queuedNote}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {busy ? <ActivityIndicator color={BRAND_HEX.royalBlue} style={{ marginTop: 4 }} /> : null}

          <View style={styles.footer}>
            <Pressable onPress={onClose} disabled={busy}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, (!hasPhoto || busy) && styles.dim]}
              onPress={() => void save()}
              disabled={!hasPhoto || busy}
            >
              <Text style={styles.saveText}>
                {busy ? 'Saving…' : localUri && !photoUrl ? 'Queue' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    gap: 10,
    maxHeight: '92%',
  },
  title: { fontSize: 20, fontWeight: '700', color: BRAND_HEX.black },
  subtitle: { fontSize: 13, color: '#666', marginTop: -4 },
  actions: { flexDirection: 'row', gap: 10 },
  camBtn: {
    flex: 1,
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  camBtnText: { color: '#fff', fontWeight: '700' },
  libBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  libBtnText: { color: BRAND_HEX.royalBlue, fontWeight: '600' },
  preview: { width: '100%', height: 160, borderRadius: 12 },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#666',
    fontWeight: '700',
    marginTop: 4,
  },
  hint: { fontSize: 12, color: '#888' },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0dc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: BRAND_HEX.black,
    backgroundColor: '#f7f7fb',
  },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: {
    borderWidth: 1,
    borderColor: '#d0d0dc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    maxWidth: 160,
  },
  chipActive: { borderColor: BRAND_HEX.royalBlue, backgroundColor: '#e8e8f8' },
  chipText: { fontSize: 13, color: '#333' },
  chipTextActive: { color: BRAND_HEX.royalBlue, fontWeight: '700' },
  queued: { color: BRAND_HEX.royalBlue, fontSize: 13 },
  error: { color: '#b00020', fontSize: 13 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingBottom: 8,
  },
  cancel: { color: BRAND_HEX.royalBlue, fontWeight: '600', fontSize: 16 },
  saveBtn: {
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  saveText: { color: '#fff', fontWeight: '700' },
  dim: { opacity: 0.55 },
});
