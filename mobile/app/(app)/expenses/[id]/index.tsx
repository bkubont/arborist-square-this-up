import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, type Expense, type Job } from '@/api/client';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { BRAND_HEX } from '@/lib/brand';
import { money, shortDate } from '@/lib/format';

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const next = await api.entities.Expense.get(id);
      setExpense(next);
      if (next.job_id) {
        try {
          setJob(await api.entities.Job.get(next.job_id));
        } catch {
          setJob(null);
        }
      } else {
        setJob(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const remove = () => {
    if (!expense) return;
    Alert.alert('Delete expense?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.entities.Expense.delete(expense.id);
            router.replace('/(app)/(tabs)/money');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed');
          }
        },
      },
    ]);
  };

  if (loading && !expense) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }
  if (error || !expense) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error || 'Not found'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.amount}>{money(expense.amount)}</Text>
      <Text style={styles.badge}>{expense.category || 'Expense'}</Text>
      <Text style={styles.meta}>Date {shortDate(expense.date || expense.created_date)}</Text>
      {expense.vendor ? <Text style={styles.meta}>Vendor {expense.vendor}</Text> : null}
      {expense.note ? <Text style={styles.body}>{expense.note}</Text> : null}
      {expense.photo_url ? (
        <AuthenticatedImage fileUrl={expense.photo_url} style={styles.photo} />
      ) : (
        <Text style={styles.meta}>No receipt photo — add one in Edit.</Text>
      )}
      {job ? (
        <Pressable onPress={() => router.push(`/(app)/jobs/${job.id}`)}>
          <Text style={styles.link}>Job · {job.title}</Text>
        </Pressable>
      ) : (
        <Text style={styles.meta}>Unassigned</Text>
      )}
      <View style={styles.actions}>
        <Pressable
          style={styles.editBtn}
          onPress={() => router.push(`/(app)/expenses/${expense.id}/edit`)}
        >
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
        <Pressable style={styles.deleteBtn} onPress={remove}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { padding: 20, gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  amount: { fontSize: 28, fontWeight: '700', color: BRAND_HEX.black },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8e8f8',
    color: BRAND_HEX.royalBlue,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
    fontWeight: '600',
    fontSize: 13,
  },
  meta: { color: '#666', fontSize: 14 },
  body: { fontSize: 15, color: '#444', lineHeight: 22 },
  photo: { width: '100%', height: 200, borderRadius: 12 },
  link: { color: BRAND_HEX.royalBlue, fontWeight: '600', fontSize: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  editBtn: {
    borderWidth: 1,
    borderColor: BRAND_HEX.royalBlue,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  editText: { color: BRAND_HEX.royalBlue, fontWeight: '600' },
  deleteBtn: {
    borderWidth: 1,
    borderColor: '#b00020',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  deleteText: { color: '#b00020', fontWeight: '600' },
  error: { color: '#b00020' },
});
