import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api, type Invoice, type Payment } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import { todayIso } from '@/lib/estimateMath';
import { money, moneyCents, shortDate } from '@/lib/format';

const METHODS = ['cash', 'check', 'card', 'ach', 'other'];

type Props = {
  invoice: Invoice;
  payments: Payment[];
  onChanged: () => void | Promise<void>;
};

export function InvoicePaymentsSection({ invoice, payments, onChanged }: Props) {
  const frozen = invoice.status === 'void' || invoice.status === 'paid';
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState('');

  const balance = invoice.balance_due != null ? Number(invoice.balance_due) : null;

  const recordPayment = useCallback(async () => {
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError('Enter a payment amount greater than zero.');
      return;
    }
    const amount_cents = Math.round(dollars * 100);
    if (amount_cents < 1) {
      setError('Amount too small.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api.payments.create({
        job_id: invoice.job_id,
        invoice_id: invoice.id,
        amount_cents,
        kind: 'payment',
        method,
        note: note.trim() || undefined,
        date: todayIso(),
      });
      // Keep invoice balance/status in sync with editor-style payments_applied
      // (Payment entity drives summaries; invoice fields drive the document itself).
      const applied = Number(invoice.payments_applied) || 0;
      const deposits = Number(invoice.deposits_applied) || 0;
      const total = Number(invoice.total) || 0;
      const payments_applied = Math.round((applied + dollars) * 100) / 100;
      await api.entities.Invoice.update(invoice.id, {
        payments_applied,
        deposits_applied: deposits,
        // prepareInvoicePatch derives balance_due + partial/paid from these fields
        status: invoice.status === 'draft' ? 'sent' : invoice.status,
      });
      setAmount('');
      setNote('');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment');
    } finally {
      setBusy(false);
    }
  }, [amount, method, note, invoice, onChanged]);

  const markPaid = useCallback(async () => {
    Alert.alert('Mark invoice paid?', 'Sets balance due to $0 and status to paid.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark paid',
        onPress: async () => {
          setMarking(true);
          setError('');
          try {
            const total = Number(invoice.total) || 0;
            const deposits = Number(invoice.deposits_applied) || 0;
            const remaining = Math.max(0, Math.round((total - deposits - (Number(invoice.payments_applied) || 0)) * 100));
            if (remaining > 0) {
              await api.payments.create({
                job_id: invoice.job_id,
                invoice_id: invoice.id,
                amount_cents: remaining,
                kind: 'payment',
                method,
                note: note.trim() || 'Marked paid',
                date: todayIso(),
              });
            }
            await api.entities.Invoice.update(invoice.id, { status: 'paid' });
            setAmount('');
            setNote('');
            await onChanged();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not mark paid');
          } finally {
            setMarking(false);
          }
        },
      },
    ]);
  }, [invoice, method, note, onChanged]);

  const forInvoice = payments.filter(p => !p.invoice_id || p.invoice_id === invoice.id);

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Payments</Text>
      {balance != null ? (
        <Text style={styles.balance}>Balance due {money(balance)}</Text>
      ) : null}

      {forInvoice.length === 0 ? (
        <Text style={styles.empty}>No payments recorded yet</Text>
      ) : (
        forInvoice.map(p => (
          <View key={p.id} style={styles.row}>
            <Text style={styles.rowTitle}>
              {moneyCents(p.amount_cents)}
              {p.kind === 'deposit' ? ' · deposit' : ''}
            </Text>
            <Text style={styles.rowMeta}>
              {shortDate(p.date || p.created_date)}
              {p.method ? ` · ${p.method}` : ''}
              {p.note ? ` · ${p.note}` : ''}
            </Text>
          </View>
        ))
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!frozen ? (
        <>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#999"
          />
          <Text style={styles.label}>Method</Text>
          <View style={styles.chipRow}>
            {METHODS.map(m => {
              const active = m === method;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMethod(m)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{m}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={[styles.input, styles.note]}
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor="#999"
          />
          <Pressable
            style={[styles.button, busy && styles.disabled]}
            onPress={recordPayment}
            disabled={busy || marking}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Record payment</Text>
            )}
          </Pressable>
          {invoice.status !== 'paid' ? (
            <Pressable
              style={[styles.outline, marking && styles.disabled]}
              onPress={markPaid}
              disabled={busy || marking}
            >
              {marking ? (
                <ActivityIndicator color={BRAND_HEX.royalBlue} />
              ) : (
                <Text style={styles.outlineText}>Mark paid</Text>
              )}
            </Pressable>
          ) : null}
        </>
      ) : (
        <Text style={styles.empty}>
          {invoice.status === 'paid' ? 'Invoice is paid.' : 'Void invoices cannot accept payments.'}
        </Text>
      )}
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
  heading: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#666',
    fontWeight: '700',
  },
  balance: { fontSize: 16, fontWeight: '700', color: '#8a6a12' },
  empty: { fontSize: 13, color: '#888' },
  row: { gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f0f0f5' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: BRAND_HEX.black },
  rowMeta: { fontSize: 13, color: '#666' },
  label: { fontSize: 13, fontWeight: '600', color: '#333' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8d8e4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: BRAND_HEX.black,
  },
  note: { marginTop: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#d0d0dc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chipActive: { borderColor: BRAND_HEX.royalBlue, backgroundColor: '#e8e8f8' },
  chipText: { fontSize: 13, color: '#333', fontWeight: '500', textTransform: 'capitalize' },
  chipTextActive: { color: BRAND_HEX.royalBlue, fontWeight: '700' },
  button: {
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  outline: {
    borderWidth: 1,
    borderColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  outlineText: { color: BRAND_HEX.royalBlue, fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.55 },
  error: { color: '#b00020', fontSize: 14 },
});
