import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { api, type TimelineEntry } from '@/api/client';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { BRAND_HEX } from '@/lib/brand';
import { shortDate } from '@/lib/format';
import {
  isPhotoEntry,
  isReceiptEntry,
  PHOTO_CATEGORIES,
  photoCategoryMeta,
  type PhotoCategoryKey,
} from '@/lib/photoCategories';
import { pickImage } from '@/lib/pickImage';

type Mode = 'photos' | 'receipts';

type Props = {
  jobId: string;
  entries: TimelineEntry[];
  onChanged: () => void;
  /** Start on receipts tab when opened from Receipts → by job. */
  initialMode?: Mode;
};

export function JobPhotosSection({
  jobId,
  entries,
  onChanged,
  initialMode = 'photos',
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [category, setCategory] = useState<PhotoCategoryKey>(
    initialMode === 'receipts' ? 'receipt' : 'before',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const photos = entries.filter(e => {
    if (!isPhotoEntry(e)) return false;
    if (mode === 'receipts') return isReceiptEntry(e);
    return e.category !== 'receipt' && e.type !== 'receipt';
  });

  const categoryOptions =
    mode === 'receipts'
      ? PHOTO_CATEGORIES.filter(c => c.key === 'receipt')
      : PHOTO_CATEGORIES.filter(c => c.key !== 'receipt');

  const pick = async (source: 'camera' | 'library') => {
    setError('');
    const picked = await pickImage(source);
    if (!picked) return;
    if ('error' in picked) {
      setError(picked.error);
      return;
    }

    const uploadCategory = mode === 'receipts' ? 'receipt' : category;
    const meta = photoCategoryMeta(uploadCategory);
    setBusy(true);
    try {
      const { file_url } = await api.uploadFile(picked.uri);
      await api.entities.TimelineEntry.create({
        job_id: jobId,
        type: meta.type,
        text: `${meta.label} photo`,
        photo_url: file_url,
        category: meta.key,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = (entry: TimelineEntry) => {
    Alert.alert('Delete photo?', 'This removes the timeline photo from the job.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.entities.TimelineEntry.delete(entry.id);
            onChanged();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.heading}>{mode === 'receipts' ? 'Receipts' : 'Photos'}</Text>
        <View style={styles.toggle}>
          {(['photos', 'receipts'] as Mode[]).map(key => {
            const active = mode === key;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  setMode(key);
                  setCategory(key === 'receipts' ? 'receipt' : 'before');
                }}
                style={[styles.toggleBtn, active && styles.toggleActive]}
              >
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                  {key === 'photos' ? 'Photos' : 'Receipts'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {mode === 'receipts' ? (
        <Text style={styles.hint}>
          Job receipt photos and Material Order attachments. Scan from Receipts inbox for unassigned
          captures.
        </Text>
      ) : (
        <Text style={styles.hint}>Category for next upload</Text>
      )}

      {mode === 'photos' ? (
        <View style={styles.chipRow}>
          {categoryOptions.map(c => {
            const active = c.key === category;
            return (
              <Pressable
                key={c.key}
                onPress={() => setCategory(c.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.button, (pressed || busy) && styles.dim]}
          onPress={() => void pick('camera')}
          disabled={busy}
        >
          <Text style={styles.buttonText}>Camera</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.buttonOutline, (pressed || busy) && styles.dim]}
          onPress={() => void pick('library')}
          disabled={busy}
        >
          <Text style={styles.buttonOutlineText}>Library</Text>
        </Pressable>
      </View>

      {busy ? <ActivityIndicator color={BRAND_HEX.royalBlue} style={{ marginTop: 8 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {photos.length === 0 ? (
        <Text style={styles.empty}>
          {mode === 'receipts'
            ? 'No receipts on this job yet. Add one here or from a Material Order.'
            : 'No photos yet'}
        </Text>
      ) : (
        <View style={styles.grid}>
          {photos.map(p => (
            <Pressable
              key={p.id}
              onLongPress={() => remove(p)}
              onPress={() => {
                if (p.related_material_order_id) {
                  router.push(`/(app)/material-orders/${p.related_material_order_id}`);
                }
              }}
              style={styles.thumbWrap}
            >
              <AuthenticatedImage fileUrl={p.photo_url} style={styles.thumb} />
              <Text style={styles.cap} numberOfLines={1}>
                {p.related_material_order_id
                  ? `MO · ${photoCategoryMeta(p.category || '').label}`
                  : photoCategoryMeta(p.category || '').label}
                {p.created_date ? ` · ${shortDate(p.created_date)}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {photos.length > 0 ? (
        <Text style={styles.hint}>
          Long-press to delete
          {mode === 'receipts' ? ' · tap MO receipts to open the order' : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, marginTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  heading: { fontSize: 16, fontWeight: '700', color: BRAND_HEX.black },
  toggle: { flexDirection: 'row', borderWidth: 1, borderColor: '#d8d8e4', borderRadius: 8, overflow: 'hidden' },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  toggleActive: { backgroundColor: '#e8e8f8' },
  toggleText: { fontSize: 12, fontWeight: '600', color: '#666' },
  toggleTextActive: { color: BRAND_HEX.royalBlue },
  hint: { fontSize: 12, color: '#777', lineHeight: 18 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#d0d0dc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  chipActive: { borderColor: BRAND_HEX.royalBlue, backgroundColor: '#e8e8f8' },
  chipText: { fontSize: 12, color: '#333' },
  chipTextActive: { color: BRAND_HEX.royalBlue, fontWeight: '700' },
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
  thumbWrap: { width: '47%', gap: 4 },
  thumb: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  cap: { fontSize: 12, color: '#555' },
});
