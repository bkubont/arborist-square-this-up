import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, type TimelineEntry } from '@/api/client';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { BRAND_HEX } from '@/lib/brand';
import { pickImage, type ImageSource } from '@/lib/pickImage';

function isMoReceipt(entry: TimelineEntry, materialOrderId: string) {
  return Boolean(
    entry.photo_url &&
      entry.related_material_order_id === materialOrderId &&
      (entry.category === 'receipt' || entry.type === 'receipt'),
  );
}

type Props = {
  materialOrderId: string;
  jobId?: string | null;
  orderNumber?: string;
  /** Void MOs are read-only (match web). */
  readOnly?: boolean;
  onChanged?: () => void;
};

/**
 * Attach receipt photos to a Material Order (TimelineEntry + related_material_order_id).
 * Same shape as web MaterialOrderEditorDialog receipts section.
 */
export function MaterialOrderReceipts({
  materialOrderId,
  jobId,
  orderNumber,
  readOnly = false,
  onChanged,
}: Props) {
  const [receipts, setReceipts] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!jobId) {
      setReceipts([]);
      setLoading(false);
      return;
    }
    setError('');
    try {
      const entries = await api.entities.TimelineEntry.filter({ job_id: jobId }, '-created_date', 500);
      setReceipts((entries || []).filter(e => isMoReceipt(e, materialOrderId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load receipts');
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [jobId, materialOrderId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const upload = async (source: ImageSource) => {
    if (!jobId || readOnly) return;
    setError('');
    const picked = await pickImage(source);
    if (!picked) return;
    if ('error' in picked) {
      setError(picked.error);
      return;
    }
    setBusy(true);
    try {
      const { file_url } = await api.uploadFile(picked.uri);
      await api.entities.TimelineEntry.create({
        job_id: jobId,
        type: 'receipt',
        text: `Receipt · Material Order ${orderNumber || ''}`.trim(),
        photo_url: file_url,
        category: 'receipt',
        related_material_order_id: materialOrderId,
      });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Receipt upload failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = (entry: TimelineEntry) => {
    if (readOnly) return;
    Alert.alert('Delete receipt?', 'Removes this photo from the material order and job timeline.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.entities.TimelineEntry.delete(entry.id);
            await load();
            onChanged?.();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed');
          }
        },
      },
    ]);
  };

  if (!jobId) {
    return (
      <View style={styles.section}>
        <Text style={styles.heading}>Receipts</Text>
        <Text style={styles.hint}>Link this order to a job to attach receipt photos.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Receipts</Text>
      <Text style={styles.hint}>
        Attach to this Material Order, the job Receipts gallery, and the timeline.
      </Text>

      {!readOnly ? (
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.button, (pressed || busy) && styles.dim]}
            onPress={() => void upload('camera')}
            disabled={busy}
          >
            <Text style={styles.buttonText}>Camera</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.buttonOutline, (pressed || busy) && styles.dim]}
            onPress={() => void upload('library')}
            disabled={busy}
          >
            <Text style={styles.buttonOutlineText}>Library</Text>
          </Pressable>
        </View>
      ) : null}

      {busy || loading ? <ActivityIndicator color={BRAND_HEX.royalBlue} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && receipts.length === 0 ? (
        <Text style={styles.empty}>No receipts yet</Text>
      ) : (
        <View style={styles.grid}>
          {receipts.map(entry => (
            <Pressable
              key={entry.id}
              style={styles.thumbWrap}
              onLongPress={() => remove(entry)}
              disabled={readOnly}
            >
              <AuthenticatedImage fileUrl={entry.photo_url} style={styles.thumb} />
            </Pressable>
          ))}
        </View>
      )}
      {receipts.length > 0 && !readOnly ? (
        <Text style={styles.hint}>Long-press a receipt to delete</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, marginTop: 8 },
  heading: { fontSize: 16, fontWeight: '700', color: BRAND_HEX.black },
  hint: { fontSize: 12, color: '#777', lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonOutline: {
    flex: 1,
    borderWidth: 1,
    borderColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  buttonOutlineText: { color: BRAND_HEX.royalBlue, fontWeight: '600' },
  dim: { opacity: 0.6 },
  error: { color: '#b00020', fontSize: 13 },
  empty: { color: '#666', fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { width: '30%', aspectRatio: 1 },
  thumb: { width: '100%', height: '100%', borderRadius: 10 },
});
