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

import { api, type Estimate } from '@/api/client';
import { FormError, FormField, formStyles } from '@/components/FormFields';
import { isEstimateReadOnly } from '@/lib/documents';
import {
  emptyEstimateLine,
  estimateTotals,
  fromApiEstimateLine,
  serializeEstimateLine,
  type ScopeLineForm,
} from '@/lib/estimateMath';
import { money } from '@/lib/format';

type Props = { estimate: Estimate };

export function EstimateForm({ estimate }: Props) {
  const router = useRouter();
  const readOnly = isEstimateReadOnly(estimate);
  const [number, setNumber] = useState(estimate.number || '');
  const [date, setDate] = useState(estimate.date || '');
  const [validTill, setValidTill] = useState(estimate.valid_till || '');
  const [notes, setNotes] = useState(estimate.notes || '');
  const [taxRate, setTaxRate] = useState(
    estimate.tax_rate != null ? String(estimate.tax_rate) : '',
  );
  const [lines, setLines] = useState<ScopeLineForm[]>(() => {
    const existing = Array.isArray(estimate.lines) ? estimate.lines.map(l => fromApiEstimateLine(l)) : [];
    return existing.length ? existing : [emptyEstimateLine()];
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [signBusy, setSignBusy] = useState(false);

  const totals = useMemo(
    () => estimateTotals(lines.map(serializeEstimateLine), taxRate),
    [lines, taxRate],
  );

  const setLine = (index: number, patch: Partial<ScopeLineForm>) => {
    setLines(rows => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const persist = async () => {
    const serialized = lines
      .map(serializeEstimateLine)
      .filter(line => line.description || line.labor_amount);
    const nextTotals = estimateTotals(serialized, taxRate);
    await api.entities.Estimate.update(estimate.id, {
      number: number.trim() || undefined,
      date: date.trim() || undefined,
      valid_till: validTill.trim() || undefined,
      notes: notes.trim() || undefined,
      tax_rate: taxRate === '' ? undefined : Number(taxRate),
      lines: serialized,
      subtotal: nextTotals.subtotal,
      tax_amount: nextTotals.tax_amount,
      total: nextTotals.total,
    });
    try {
      await api.entities.Job.update(estimate.job_id, { estimate_amount: nextTotals.total });
    } catch {
      /* non-blocking */
    }
  };

  const save = async () => {
    if (readOnly) return;
    setError('');
    setBusy(true);
    try {
      await persist();
      router.replace(`/(app)/estimates/${estimate.id}`);
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
      const result = await api.estimates.sendSign(estimate.id, {});
      if (result.sign_url) {
        Alert.alert(
          'Sign link ready',
          'Customer e-sign stays on the web. Open the link to copy or share.',
          [
            { text: 'Open link', onPress: () => void WebBrowser.openBrowserAsync(result.sign_url!) },
            { text: 'OK' },
          ],
        );
      } else {
        Alert.alert('Sent', result.message || 'Sign link created.');
      }
      router.replace(`/(app)/estimates/${estimate.id}`);
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
          <Text style={formStyles.sectionLabel}>
            Signed / terminal estimates are view-only. Customer e-sign stays on the web.
          </Text>
        ) : null}

        <FormField label="Number" value={number} onChangeText={setNumber} editable={!readOnly} />
        <FormField
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          editable={!readOnly}
        />
        <FormField
          label="Valid until"
          value={validTill}
          onChangeText={setValidTill}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          editable={!readOnly}
        />
        <FormField
          label="Tax %"
          value={taxRate}
          onChangeText={setTaxRate}
          keyboardType="decimal-pad"
          editable={!readOnly}
        />
        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          editable={!readOnly}
        />

        <Text style={formStyles.sectionLabel}>Lines</Text>
        {lines.map((line, index) => (
          <View key={line.id || `line-${index}`} style={{ gap: 8, marginBottom: 8 }}>
            <FormField
              label={`Line ${index + 1} description`}
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
          Subtotal {money(totals.subtotal)} · Tax {money(totals.tax_amount)} · Total{' '}
          {money(totals.total)}
        </Text>

        {!readOnly ? (
          <Pressable
            style={({ pressed }) => [formStyles.button, (pressed || busy) && formStyles.buttonDisabled]}
            onPress={save}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={formStyles.buttonText}>Save estimate</Text>}
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
