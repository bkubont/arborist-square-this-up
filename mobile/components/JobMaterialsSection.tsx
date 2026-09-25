import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api, type JobMaterial } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import { money } from '@/lib/format';

type Row = {
  description: string;
  qty: string;
  unit: string;
  unit_price: string;
  have: boolean;
  notes: string;
};

const blankRow = (): Row => ({
  description: '',
  qty: '',
  unit: '',
  unit_price: '',
  have: false,
  notes: '',
});

function toRow(m: JobMaterial): Row {
  return {
    description: m.description || '',
    qty: m.qty != null ? String(m.qty) : '',
    unit: m.unit || '',
    unit_price: m.unit_price != null ? String(m.unit_price) : '',
    have: !!m.have,
    notes: m.notes || '',
  };
}

type Props = {
  jobId: string;
  materials?: JobMaterial[];
  onChanged: () => void | Promise<void>;
};

/** Job-level materials checklist — mirrors web JobMaterialsPanel. Unticked rows feed draft MO. */
export function JobMaterialsSection({ jobId, materials = [], onChanged }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    materials.length ? materials.map(toRow) : [blankRow()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(materials.length ? materials.map(toRow) : [blankRow()]);
  }, [materials]);

  const setRow = (index: number, patch: Partial<Row>) => {
    setRows(list => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    setRows(list => (list.length <= 1 ? [blankRow()] : list.filter((_, i) => i !== index)));
  };

  const total = rows.reduce(
    (sum, m) => sum + (Number(m.qty) || 0) * (Number(m.unit_price) || 0),
    0,
  );

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const num = (v: string) => (v === '' ? undefined : Number(v));
      const payload = rows
        .filter(m => m.description.trim())
        .map(m => ({
          description: m.description.trim(),
          qty: num(m.qty),
          unit: m.unit.trim() || undefined,
          unit_price: num(m.unit_price),
          have: !!m.have,
          notes: m.notes.trim() || undefined,
        }));
      await api.entities.Job.update(jobId, { materials: payload });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>Materials</Text>
          <Text style={styles.hint}>On the job, not the estimate. Unticked items feed the draft Material Order.</Text>
        </View>
        {total > 0 ? <Text style={styles.total}>{money(total)} listed</Text> : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {rows.map((m, i) => (
        <View key={`mat-${i}`} style={styles.row}>
          <TextInput
            style={styles.input}
            value={m.description}
            onChangeText={v => setRow(i, { description: v })}
            placeholder="Item"
            placeholderTextColor="#999"
          />
          <View style={styles.row2}>
            <TextInput
              style={[styles.input, styles.qty]}
              value={m.qty}
              onChangeText={v => setRow(i, { qty: v })}
              placeholder="Qty"
              placeholderTextColor="#999"
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.input, styles.unit]}
              value={m.unit}
              onChangeText={v => setRow(i, { unit: v })}
              placeholder="Unit"
              placeholderTextColor="#999"
            />
            <TextInput
              style={[styles.input, styles.price]}
              value={m.unit_price}
              onChangeText={v => setRow(i, { unit_price: v })}
              placeholder="$ each"
              placeholderTextColor="#999"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.rowActions}>
            <Pressable
              style={[styles.haveChip, m.have && styles.haveChipOn]}
              onPress={() => setRow(i, { have: !m.have })}
            >
              <Text style={[styles.haveText, m.have && styles.haveTextOn]}>
                {m.have ? 'Have ✓' : 'Have'}
              </Text>
            </Pressable>
            <Pressable onPress={() => removeRow(i)}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <View style={styles.footer}>
        <Pressable style={styles.secondary} onPress={() => setRows(list => [...list, blankRow()])}>
          <Text style={styles.secondaryText}>+ Add item</Text>
        </Pressable>
        <Pressable
          style={[styles.primary, saving && styles.disabled]}
          onPress={() => void save()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Save materials</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 10,
  },
  header: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  heading: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#666',
    fontWeight: '700',
  },
  hint: { fontSize: 11, color: '#888', marginTop: 4, lineHeight: 15 },
  total: { fontSize: 12, color: '#666', fontVariant: ['tabular-nums'] },
  error: { color: '#b00020', fontSize: 13 },
  row: {
    borderWidth: 1,
    borderColor: '#e8e8f0',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    backgroundColor: '#fafafc',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8d8e4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: BRAND_HEX.black,
  },
  row2: { flexDirection: 'row', gap: 8 },
  qty: { flex: 1 },
  unit: { flex: 1 },
  price: { flex: 1.2 },
  rowActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  haveChip: {
    borderWidth: 1,
    borderColor: '#d0d0dc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  haveChipOn: { borderColor: '#047857', backgroundColor: '#ecfdf5' },
  haveText: { fontSize: 13, fontWeight: '600', color: '#555' },
  haveTextOn: { color: '#047857' },
  remove: { color: '#b00020', fontWeight: '600', fontSize: 13 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  secondary: {
    borderWidth: 1,
    borderColor: '#d0d0dc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  secondaryText: { color: BRAND_HEX.royalBlue, fontWeight: '600' },
  primary: {
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.55 },
});
