import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, type Expense, type Job } from '@/api/client';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { FormError, FormField, formStyles } from '@/components/FormFields';
import { BRAND_HEX } from '@/lib/brand';
import { EXPENSE_CATEGORIES, todayIso } from '@/lib/expenseCategories';

type Props = { expense?: Expense | null };

export function ExpenseForm({ expense }: Props) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [amount, setAmount] = useState(expense?.amount != null ? String(expense.amount) : '');
  const [date, setDate] = useState(expense?.date || todayIso());
  const [category, setCategory] = useState(expense?.category || 'Materials');
  const [vendor, setVendor] = useState(expense?.vendor || '');
  const [note, setNote] = useState(expense?.note || '');
  const [jobId, setJobId] = useState(expense?.job_id || '');
  const [photoUrl, setPhotoUrl] = useState(expense?.photo_url || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.entities.Job.list('-updated_date', 300);
        if (!cancelled) setJobs(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load jobs');
      } finally {
        if (!cancelled) setLoadingJobs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pickReceipt = async (source: 'camera' | 'library') => {
    setError('');
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError('Camera permission is required to take a receipt photo.');
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

      setUploading(true);
      const { file_url } = await api.uploadFile(result.assets[0].uri);
      setPhotoUrl(file_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Enter a valid amount.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const payload = {
        amount: parsed,
        date: date.trim() || todayIso(),
        category,
        vendor: vendor.trim() || undefined,
        note: note.trim() || undefined,
        job_id: jobId || undefined,
        // Empty string clears a previously attached receipt on update (omit would leave it).
        photo_url: photoUrl || '',
      };
      const wasUnassigned = !!(expense?.id && !expense.job_id);
      let saved: Expense;
      if (expense?.id) {
        saved = await api.entities.Expense.update(expense.id, payload);
      } else {
        saved = await api.entities.Expense.create(payload);
      }

      // Mirror receipt onto the job gallery when newly linked (create or assign) — same as web.
      if (saved.job_id && saved.photo_url && (!expense?.id || wasUnassigned)) {
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
          // Expense is saved; gallery mirror is best-effort.
        }
      }

      router.replace(`/(app)/expenses/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const blocked = busy || uploading;

  return (
    <KeyboardAvoidingView
      style={formStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
        <FormError message={error} />
        <FormField
          label="Amount"
          required
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />
        <FormField
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />

        <Text style={formStyles.sectionLabel}>Category</Text>
        <View style={formStyles.chipRow}>
          {EXPENSE_CATEGORIES.map(c => {
            const active = c === category;
            return (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[formStyles.chip, active && formStyles.chipActive]}
              >
                <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>

        <FormField label="Vendor" value={vendor} onChangeText={setVendor} />
        <FormField label="Note" value={note} onChangeText={setNote} multiline />

        <Text style={formStyles.sectionLabel}>Job (optional)</Text>
        {loadingJobs ? (
          <ActivityIndicator color={BRAND_HEX.royalBlue} />
        ) : (
          <View style={formStyles.chipRow}>
            <Pressable
              onPress={() => setJobId('')}
              style={[formStyles.chip, !jobId && formStyles.chipActive]}
            >
              <Text style={[formStyles.chipText, !jobId && formStyles.chipTextActive]}>
                Unassigned
              </Text>
            </Pressable>
            {jobs.slice(0, 40).map(j => {
              const active = j.id === jobId;
              return (
                <Pressable
                  key={j.id}
                  onPress={() => setJobId(j.id)}
                  style={[formStyles.chip, active && formStyles.chipActive]}
                >
                  <Text
                    style={[formStyles.chipText, active && formStyles.chipTextActive]}
                    numberOfLines={1}
                  >
                    {j.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={formStyles.sectionLabel}>Receipt photo</Text>
        <Text style={styles.hint}>Optional. Unassigned receipts stay on the expense until you pick a job.</Text>
        <View style={styles.photoActions}>
          <Pressable
            style={[styles.photoBtn, blocked && styles.dim]}
            onPress={() => void pickReceipt('camera')}
            disabled={blocked}
          >
            <Text style={styles.photoBtnText}>Camera</Text>
          </Pressable>
          <Pressable
            style={[styles.photoBtnOutline, blocked && styles.dim]}
            onPress={() => void pickReceipt('library')}
            disabled={blocked}
          >
            <Text style={styles.photoBtnOutlineText}>Library</Text>
          </Pressable>
          {photoUrl ? (
            <Pressable onPress={() => setPhotoUrl('')} disabled={blocked}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
        {uploading ? <ActivityIndicator color={BRAND_HEX.royalBlue} /> : null}
        {photoUrl ? <AuthenticatedImage fileUrl={photoUrl} style={styles.preview} /> : null}

        <Pressable
          style={({ pressed }) => [
            formStyles.button,
            (pressed || blocked) && formStyles.buttonDisabled,
          ]}
          onPress={submit}
          disabled={blocked}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={formStyles.buttonText}>{expense ? 'Save' : 'Add expense'}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 11, color: '#888', marginTop: -4 },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  photoBtn: {
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  photoBtnText: { color: '#fff', fontWeight: '600' },
  photoBtnOutline: {
    borderWidth: 1,
    borderColor: BRAND_HEX.royalBlue,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  photoBtnOutlineText: { color: BRAND_HEX.royalBlue, fontWeight: '600' },
  remove: { color: '#b00020', fontWeight: '600', fontSize: 14 },
  preview: { width: '100%', height: 180, borderRadius: 12 },
  dim: { opacity: 0.55 },
});
