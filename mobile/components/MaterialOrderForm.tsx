import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { api, type MaterialOrder, type MaterialOrderLine } from '@/api/client';
import { CatalogPicker } from '@/components/CatalogPicker';
import { FormError, FormField, formStyles } from '@/components/FormFields';
import { DOCUMENT_STATUSES, statusLabel } from '@/lib/documents';
import { catalogItemToMaterialLine, materialOrderLineAmount, roundMoney } from '@/lib/estimateMath';
import { money } from '@/lib/format';

type LineForm = {
  description: string;
  qty: string;
  unit_price: string;
  supplier: string;
  notes: string;
};

const emptyLine = (): LineForm => ({
  description: '',
  qty: '1',
  unit_price: '',
  supplier: '',
  notes: '',
});

function toForm(line: MaterialOrderLine): LineForm {
  return {
    description: line.description || '',
    qty: line.qty != null ? String(line.qty) : '',
    unit_price: line.unit_price != null ? String(line.unit_price) : '',
    supplier: line.supplier || '',
    notes: line.notes || '',
  };
}

type Props = { materialOrder: MaterialOrder };

export function MaterialOrderForm({ materialOrder }: Props) {
  const router = useRouter();
  const frozen = materialOrder.status === 'void';
  const [number, setNumber] = useState(materialOrder.number || '');
  const [date, setDate] = useState(materialOrder.date || '');
  const [notes, setNotes] = useState(materialOrder.notes || '');
  const [status, setStatus] = useState(
    materialOrder.status === 'ordered' ? 'purchased' : materialOrder.status || 'draft',
  );
  const [lines, setLines] = useState<LineForm[]>(() => {
    const existing = Array.isArray(materialOrder.lines) ? materialOrder.lines.map(toForm) : [];
    return existing.length ? existing : [emptyLine()];
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [catalogFor, setCatalogFor] = useState<number | null>(null);

  const subtotal = useMemo(
    () =>
      roundMoney(
        lines.reduce(
          (sum, line) =>
            sum +
            materialOrderLineAmount({
              qty: line.qty === '' ? 0 : Number(line.qty),
              unit_price: line.unit_price === '' ? 0 : Number(line.unit_price),
            }),
          0,
        ),
      ),
    [lines],
  );

  const setLine = (index: number, patch: Partial<LineForm>) => {
    setLines(rows => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const save = async () => {
    if (frozen) return;
    setError('');
    setBusy(true);
    try {
      const serialized = lines
        .map(line => ({
          description: line.description || '',
          qty: line.qty === '' ? undefined : Number(line.qty),
          unit_price: line.unit_price === '' ? undefined : Number(line.unit_price),
          supplier: line.supplier.trim() || undefined,
          notes: line.notes.trim() || undefined,
        }))
        .filter(line => line.description || line.qty || line.unit_price);
      await api.entities.MaterialOrder.update(materialOrder.id, {
        number: number.trim() || undefined,
        date: date.trim() || undefined,
        notes: notes.trim() || undefined,
        status,
        lines: serialized,
        subtotal,
        total: subtotal,
      });
      router.replace(`/(app)/material-orders/${materialOrder.id}`);
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
        <FormField label="Number" value={number} onChangeText={setNumber} editable={!frozen} />
        <FormField
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          editable={!frozen}
        />
        <FormField label="Notes" value={notes} onChangeText={setNotes} multiline editable={!frozen} />

        <Text style={formStyles.sectionLabel}>Status</Text>
        <View style={formStyles.chipRow}>
          {DOCUMENT_STATUSES.MaterialOrder.map(s => {
            const active = s === status;
            return (
              <Pressable
                key={s}
                disabled={frozen}
                onPress={() => setStatus(s)}
                style={[formStyles.chip, active && formStyles.chipActive]}
              >
                <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                  {statusLabel(s)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={formStyles.sectionLabel}>Lines</Text>
        {lines.map((line, index) => (
          <View key={`mo-${index}`} style={{ gap: 8, marginBottom: 8 }}>
            <FormField
              label={`Item ${index + 1}`}
              value={line.description}
              onChangeText={v => setLine(index, { description: v })}
              editable={!frozen}
            />
            <FormField
              label="Qty"
              value={line.qty}
              onChangeText={v => setLine(index, { qty: v })}
              keyboardType="decimal-pad"
              editable={!frozen}
            />
            <FormField
              label="Unit price"
              value={line.unit_price}
              onChangeText={v => setLine(index, { unit_price: v })}
              keyboardType="decimal-pad"
              editable={!frozen}
            />
            <FormField
              label="Supplier"
              value={line.supplier}
              onChangeText={v => setLine(index, { supplier: v })}
              editable={!frozen}
            />
            {!frozen ? (
              <View style={formStyles.chipRow}>
                <Pressable style={formStyles.chip} onPress={() => setCatalogFor(index)}>
                  <Text style={formStyles.chipText}>From catalog</Text>
                </Pressable>
                <Pressable style={formStyles.chip} onPress={() => setLines(rows => [...rows, emptyLine()])}>
                  <Text style={formStyles.chipText}>Add line</Text>
                </Pressable>
                <Pressable
                  style={formStyles.chip}
                  onPress={() =>
                    setLines(rows => (rows.length <= 1 ? [emptyLine()] : rows.filter((_, i) => i !== index)))
                  }
                >
                  <Text style={formStyles.chipText}>Remove</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}

        <Text style={formStyles.sectionLabel}>Total {money(subtotal)}</Text>

        {!frozen ? (
          <Pressable
            style={({ pressed }) => [formStyles.button, (pressed || busy) && formStyles.buttonDisabled]}
            onPress={save}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={formStyles.buttonText}>Save material order</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>

      <CatalogPicker
        visible={catalogFor != null}
        title="Add from catalog"
        onClose={() => setCatalogFor(null)}
        onPick={item => {
          if (catalogFor == null) return;
          const mapped = catalogItemToMaterialLine(item);
          setLine(catalogFor, {
            description: mapped.description,
            qty: String(mapped.qty ?? 1),
            unit_price: mapped.unit_price != null ? String(mapped.unit_price) : '',
            notes: mapped.notes || '',
          });
        }}
      />
    </KeyboardAvoidingView>
  );
}
