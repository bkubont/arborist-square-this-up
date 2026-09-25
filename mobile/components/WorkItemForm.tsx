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

import { api, type WorkItem, type WorkItemMaterial } from '@/api/client';
import { FormError, FormField, formStyles } from '@/components/FormFields';
import { TASK_STATUSES, taskStatus, taskStatusLabel } from '@/lib/tasks';

type MaterialRow = {
  description: string;
  qty: string;
  unit: string;
  unit_price: string;
  have: boolean;
};

const blankMaterial = (): MaterialRow => ({
  description: '',
  qty: '',
  unit: '',
  unit_price: '',
  have: false,
});

function toMaterialRow(m: WorkItemMaterial): MaterialRow {
  return {
    description: m.description || '',
    qty: m.qty != null ? String(m.qty) : '',
    unit: m.unit || '',
    unit_price: m.unit_price != null ? String(m.unit_price) : '',
    have: !!m.have,
  };
}

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
  const [materials, setMaterials] = useState<MaterialRow[]>(() => {
    const existing = Array.isArray(workItem?.materials) ? workItem.materials.map(toMaterialRow) : [];
    return existing.length ? existing : [blankMaterial()];
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setMaterial = (index: number, patch: Partial<MaterialRow>) => {
    setMaterials(rows => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const submit = async () => {
    if (!workItem && !description.trim()) {
      setError('Enter a task description.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const num = (v: string) => (v === '' ? undefined : Number(v));
      const materialPayload = materials
        .filter(m => m.description.trim())
        .map(m => ({
          description: m.description.trim(),
          qty: num(m.qty),
          unit: m.unit.trim() || undefined,
          unit_price: num(m.unit_price),
          have: !!m.have,
        }));

      const payload: Partial<WorkItem> = {
        job_id: jobId,
        status,
        notes: notes.trim() || undefined,
        category: category.trim() || undefined,
        labor_hours: laborHours === '' ? undefined : Number(laborHours),
        materials: materialPayload,
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
              : 'Built-in task — status, notes, and materials.'}
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

        <Text style={formStyles.sectionLabel}>Materials</Text>
        <Text style={{ fontSize: 11, color: '#888', marginTop: -4 }}>
          Unticked items feed the job draft Material Order.
        </Text>
        {materials.map((m, i) => (
          <View key={`mat-${i}`} style={{ gap: 8, marginBottom: 4 }}>
            <FormField
              label={`Item ${i + 1}`}
              value={m.description}
              onChangeText={v => setMaterial(i, { description: v })}
            />
            <FormField
              label="Qty"
              value={m.qty}
              onChangeText={v => setMaterial(i, { qty: v })}
              keyboardType="decimal-pad"
            />
            <FormField label="Unit" value={m.unit} onChangeText={v => setMaterial(i, { unit: v })} />
            <FormField
              label="Unit price"
              value={m.unit_price}
              onChangeText={v => setMaterial(i, { unit_price: v })}
              keyboardType="decimal-pad"
            />
            <View style={formStyles.chipRow}>
              <Pressable
                style={[formStyles.chip, m.have && { borderColor: '#047857', backgroundColor: '#ecfdf5' }]}
                onPress={() => setMaterial(i, { have: !m.have })}
              >
                <Text
                  style={[
                    formStyles.chipText,
                    m.have && { color: '#047857', fontWeight: '700' },
                  ]}
                >
                  {m.have ? 'Have it ✓' : 'Have it'}
                </Text>
              </Pressable>
              <Pressable
                style={formStyles.chip}
                onPress={() => setMaterials(rows => [...rows, blankMaterial()])}
              >
                <Text style={formStyles.chipText}>Add item</Text>
              </Pressable>
              <Pressable
                style={formStyles.chip}
                onPress={() =>
                  setMaterials(rows =>
                    rows.length <= 1 ? [blankMaterial()] : rows.filter((_, idx) => idx !== i),
                  )
                }
              >
                <Text style={[formStyles.chipText, { color: '#b00020' }]}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}

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
