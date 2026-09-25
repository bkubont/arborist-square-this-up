import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { api, type ChangeOrder } from '@/api/client';
import { FormError, FormField, formStyles } from '@/components/FormFields';
import { isChangeOrderReadOnly } from '@/lib/documents';
import {
  changeOrderNet,
  emptyEstimateLine,
  estimateLineAmount,
  fromApiEstimateLine,
  serializeChangeOrderLine,
  type ScopeLineForm,
} from '@/lib/estimateMath';
import { money } from '@/lib/format';

type Props = { changeOrder: ChangeOrder };

export function ChangeOrderForm({ changeOrder }: Props) {
  const router = useRouter();
  const readOnly = isChangeOrderReadOnly(changeOrder);
  const [number, setNumber] = useState(changeOrder.number || '');
  const [reason, setReason] = useState(changeOrder.reason || '');
  const [description, setDescription] = useState(changeOrder.description || '');
  const [credit, setCredit] = useState(changeOrder.credit != null ? String(changeOrder.credit) : '');
  const [notes, setNotes] = useState(changeOrder.notes || '');
  const [taxRate, setTaxRate] = useState(
    changeOrder.tax_rate != null ? String(changeOrder.tax_rate) : '',
  );
  const [lines, setLines] = useState<ScopeLineForm[]>(() => {
    const existing = Array.isArray(changeOrder.lines)
      ? changeOrder.lines.map(l => fromApiEstimateLine(l))
      : [];
    return existing.length ? existing : [emptyEstimateLine()];
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [signBusy, setSignBusy] = useState(false);

  const addedCost = useMemo(
    () => lines.reduce((sum, line) => sum + estimateLineAmount(serializeChangeOrderLine(line)), 0),
    [lines],
  );
  const net = changeOrderNet({ added_cost: addedCost, credit });

  const setLine = (index: number, patch: Partial<ScopeLineForm>) => {
    setLines(rows => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const persist = async () => {
    const serialized = lines
      .map(serializeChangeOrderLine)
      .filter(line => line.description || line.labor_amount || (line as { amount?: number }).amount);
    await api.entities.ChangeOrder.update(changeOrder.id, {
      number: number.trim() || undefined,
      reason: reason.trim() || undefined,
      description: description.trim() || undefined,
      credit: credit === '' ? undefined : Number(credit),
      added_cost: addedCost,
      net_change: net,
      notes: notes.trim() || undefined,
      tax_rate: taxRate === '' ? undefined : Number(taxRate),
      lines: serialized,
    });
  };

  const save = async () => {
    if (readOnly) return;
    setError('');
    setBusy(true);
    try {
      await persist();
      router.replace(`/(app)/change-orders/${changeOrder.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const sendSign = async () => {
    setSignBusy(true);
    setError('');
    try {
      if (!readOnly) await persist();
      const result = await api.changeOrders.sendSign(changeOrder.id, {});
      if (result.sign_url) {
        Alert.alert('Sign link ready', 'Customer e-sign stays on the web.', [
          { text: 'Open link', onPress: () => void WebBrowser.openBrowserAsync(result.sign_url!) },
          { text: 'OK' },
        ]);
      } else {
        Alert.alert('Sent', result.message || 'Sign link created.');
      }
      router.replace(`/(app)/change-orders/${changeOrder.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create sign link');
    } finally {
      setSignBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={formStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
        <FormError message={error} />
        {readOnly ? (
          <Text style={formStyles.sectionLabel}>Approved / terminal change orders are view-only.</Text>
        ) : null}

        <FormField label="Number" value={number} onChangeText={setNumber} editable={!readOnly} />
        <FormField label="Reason" value={reason} onChangeText={setReason} editable={!readOnly} />
        <FormField
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          editable={!readOnly}
        />
        <FormField
          label="Credit"
          value={credit}
          onChangeText={setCredit}
          keyboardType="decimal-pad"
          editable={!readOnly}
        />
        <FormField
          label="Tax %"
          value={taxRate}
          onChangeText={setTaxRate}
          keyboardType="decimal-pad"
          editable={!readOnly}
        />
        <FormField label="Notes" value={notes} onChangeText={setNotes} multiline editable={!readOnly} />

        <Text style={formStyles.sectionLabel}>Lines</Text>
        {lines.map((line, index) => (
          <View key={line.id || `co-${index}`} style={{ gap: 8, marginBottom: 8 }}>
            <FormField
              label={`Line ${index + 1}`}
              value={line.description}
              onChangeText={v => setLine(index, { description: v })}
              editable={!readOnly}
            />
            <FormField
              label="Amount"
              value={line.line_amount}
              onChangeText={v => setLine(index, { line_amount: v })}
              keyboardType="decimal-pad"
              editable={!readOnly}
            />
            {!readOnly ? (
              <View style={formStyles.chipRow}>
                <Pressable
                  style={formStyles.chip}
                  onPress={() => setLines(rows => [...rows, emptyEstimateLine()])}
                >
                  <Text style={formStyles.chipText}>Add line</Text>
                </Pressable>
                <Pressable
                  style={formStyles.chip}
                  onPress={() =>
                    setLines(rows =>
                      rows.length <= 1 ? [emptyEstimateLine()] : rows.filter((_, i) => i !== index),
                    )
                  }
                >
                  <Text style={formStyles.chipText}>Remove</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}

        <Text style={formStyles.sectionLabel}>
          Added {money(addedCost)} · Net change {money(net)}
        </Text>

        {!readOnly ? (
          <Pressable
            style={({ pressed }) => [formStyles.button, (pressed || busy) && formStyles.buttonDisabled]}
            onPress={save}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={formStyles.buttonText}>Save change order</Text>
            )}
          </Pressable>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            formStyles.button,
            { backgroundColor: '#fff', borderWidth: 1, borderColor: '#0504AA' },
            (pressed || signBusy) && formStyles.buttonDisabled,
          ]}
          onPress={sendSign}
          disabled={signBusy}
        >
          {signBusy ? (
            <ActivityIndicator color="#0504AA" />
          ) : (
            <Text style={[formStyles.buttonText, { color: '#0504AA' }]}>Get customer sign link</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
