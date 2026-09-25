import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
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
import { isPhotoEntry, PHOTO_CATEGORIES, photoCategoryMeta, type PhotoCategoryKey } from '@/lib/photoCategories';

type Props = {
  jobId: string;
  entries: TimelineEntry[];
  onChanged: () => void;
};

export function JobPhotosSection({ jobId, entries, onChanged }: Props) {
  const [category, setCategory] = useState<PhotoCategoryKey>('before');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const photos = entries.filter(isPhotoEntry);

  const pick = async (source: 'camera' | 'library') => {
    setError('');
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError('Camera permission is required to take photos.');
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setError('Photo library permission is required.');
          return;
        }
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 1,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 1,
              allowsMultipleSelection: false,
            });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const meta = photoCategoryMeta(category);
      setBusy(true);
      const { file_url } = await api.uploadFile(result.assets[0].uri);
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
      <Text style={styles.heading}>Photos</Text>
      <Text style={styles.hint}>Category for next upload</Text>
      <View style={styles.chipRow}>
        {PHOTO_CATEGORIES.map(c => {
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

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.button, (pressed || busy) && styles.dim]}
          onPress={() => pick('camera')}
          disabled={busy}
        >
          <Text style={styles.buttonText}>Camera</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.buttonOutline, (pressed || busy) && styles.dim]}
          onPress={() => pick('library')}
          disabled={busy}
        >
          <Text style={styles.buttonOutlineText}>Library</Text>
        </Pressable>
      </View>

      {busy ? <ActivityIndicator color={BRAND_HEX.royalBlue} style={{ marginTop: 8 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {photos.length === 0 ? (
        <Text style={styles.empty}>No photos yet</Text>
      ) : (
        <View style={styles.grid}>
          {photos.map(p => (
            <Pressable key={p.id} onLongPress={() => remove(p)} style={styles.thumbWrap}>
              <AuthenticatedImage fileUrl={p.photo_url} style={styles.thumb} />
              <Text style={styles.cap} numberOfLines={1}>
                {p.related_material_order_id
                  ? `MO · ${photoCategoryMeta(p.category || '').label}`
                  : photoCategoryMeta(p.category || '').label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {photos.length > 0 ? <Text style={styles.hint}>Long-press a photo to delete</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, marginTop: 8 },
  heading: { fontSize: 16, fontWeight: '700', color: BRAND_HEX.black },
  hint: { fontSize: 12, color: '#777' },
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
