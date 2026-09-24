import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { api, type Expense, type Job } from '@/api/client';
import { FormError, FormField, formStyles } from '@/components/FormFields';
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
        photo_url: expense?.photo_url,
      };
      if (expense?.id) {
        await api.entities.Expense.update(expense.id, payload);
        router.replace(`/(app)/expenses/${expense.id}`);
      } else {
        const created = await api.entities.Expense.create(payload);
        router.replace(`/(app)/expenses/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

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
        <FormField label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />

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
          <ActivityIndicator color="#0504AA" />
        ) : (
          <View style={formStyles.chipRow}>
            <Pressable
              onPress={() => setJobId('')}
              style={[formStyles.chip, !jobId && formStyles.chipActive]}
            >
              <Text style={[formStyles.chipText, !jobId && formStyles.chipTextActive]}>Unassigned</Text>
            </Pressable>
            {jobs.slice(0, 40).map(j => {
              const active = j.id === jobId;
              return (
                <Pressable
                  key={j.id}
                  onPress={() => setJobId(j.id)}
                  style={[formStyles.chip, active && formStyles.chipActive]}
                >
                  <Text style={[formStyles.chipText, active && formStyles.chipTextActive]} numberOfLines={1}>
                    {j.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          style={({ pressed }) => [formStyles.button, (pressed || busy) && formStyles.buttonDisabled]}
          onPress={submit}
          disabled={busy}
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
