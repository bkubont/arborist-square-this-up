import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { api, type WorkItem } from '@/api/client';
import { FormError, FormField, formStyles } from '@/components/FormFields';
import { TASK_STATUSES, taskStatus, taskStatusLabel } from '@/lib/tasks';

type Props = {
  workItem?: WorkItem | null;
  jobId: string;
};

export function WorkItemForm({ workItem, jobId }: Props) {
  const router = useRouter();
  const sourced = !!(workItem?.source_type && workItem?.source_id);
  const isTemplate = !!workItem?.template_key;
  const [description, setDescription] = useState(workItem?.description || '');
  const [notes, setNotes] = useState(workItem?.notes || '');
  const [category, setCategory] = useState(workItem?.category || '');
  const [laborHours, setLaborHours] = useState(
    workItem?.labor_hours != null ? String(workItem.labor_hours) : '',
  );
  const [status, setStatus] = useState(taskStatus(workItem));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!workItem && !description.trim()) {
      setError('Enter a task description.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const payload: Partial<WorkItem> = {
        job_id: jobId,
        status,
        notes: notes.trim() || undefined,
        category: category.trim() || undefined,
        labor_hours: laborHours === '' ? undefined : Number(laborHours),
      };
      // Signed / template descriptions are server-owned; free-standing tasks can edit description.
      if (!sourced && !isTemplate) {
        payload.description = description.trim();
      }

      if (workItem?.id) {
        await api.entities.WorkItem.update(workItem.id, payload);
        router.replace(`/(app)/work-items/${workItem.id}`);
      } else {
        const created = await api.entities.WorkItem.create({
          ...payload,
          description: description.trim(),
        });
        router.replace(`/(app)/work-items/${created.id}`);
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
        {sourced || isTemplate ? (
          <Text style={formStyles.sectionLabel}>
            {sourced
              ? 'Description comes from the signed estimate / change order line.'
              : 'Built-in task — status and notes only.'}
          </Text>
        ) : null}

        <FormField
          label="Description"
          required={!workItem}
          value={description}
          onChangeText={setDescription}
          multiline
          editable={!sourced && !isTemplate}
        />
        <FormField label="Category" value={category} onChangeText={setCategory} />
        <FormField
          label="Labor hours"
          value={laborHours}
          onChangeText={setLaborHours}
          keyboardType="decimal-pad"
        />
        <FormField label="Notes" value={notes} onChangeText={setNotes} multiline />

        <Text style={formStyles.sectionLabel}>Status</Text>
        <View style={formStyles.chipRow}>
          {TASK_STATUSES.map(s => {
            const active = s === status;
            return (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[formStyles.chip, active && formStyles.chipActive]}
              >
                <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                  {taskStatusLabel(s)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={({ pressed }) => [formStyles.button, (pressed || busy) && formStyles.buttonDisabled]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={formStyles.buttonText}>{workItem ? 'Save task' : 'Add task'}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
