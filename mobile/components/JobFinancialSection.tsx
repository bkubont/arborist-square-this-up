import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api, type JobAuthorizedTotal, type JobSummary, type Payment } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import { todayIso } from '@/lib/estimateMath';
import { money, moneyCents } from '@/lib/format';

type Props = {
  jobId: string;
  summary: JobSummary | null;
  authorized: JobAuthorizedTotal | null;
  payments: Payment[];
  onChanged: () => void | Promise<void>;
};

export function JobFinancialSection({
  jobId,
  summary,
  authorized,
  payments,
  onChanged,
}: Props) {
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'deposit' | 'payment'>('deposit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const deposits = payments.filter(p => p.kind === 'deposit');
  const depositCents = deposits.reduce((sum, p) => sum + (p.amount_cents || 0), 0);

  const logMoney = async () => {
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError('Enter an amount greater than zero.');
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
        job_id: jobId,
        amount_cents,
        kind,
        date: todayIso(),
        method: kind === 'deposit' ? 'deposit' : 'other',
        note: kind === 'deposit' ? 'Deposit received' : 'Payment received',
      });
      // Web FinancialPanel / invoice deposit sync still read timeline deposit_received.
      if (kind === 'deposit') {
        await api.entities.TimelineEntry.create({
          job_id: jobId,
          type: 'deposit_received',
          text: 'Deposit received',
          category: 'financial',
          amount: dollars,
        });
      }
      setAmount('');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log amount');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Money</Text>

      <View style={styles.chips}>
        <Stat
          label="Authorized"
          value={
            authorized
              ? money(authorized.authorized_total)
              : summary
                ? moneyCents(summary.authorized_cents)
                : '—'
          }
        />
        <Stat label="Invoiced" value={summary ? moneyCents(summary.invoiced_cents) : '—'} />
        <Stat label="Paid" value={summary ? moneyCents(summary.paid_cents) : '—'} />
        <Stat label="Balance" value={summary ? moneyCents(summary.balance_cents) : '—'} accent />
      </View>

      {summary ? (
        <Text style={styles.meta}>
          Running total {moneyCents(summary.running_total_cents)}
          {summary.running_total_basis === 'signed'
            ? ' · signed'
            : summary.running_total_basis === 'estimate'
              ? ' · draft/sent estimate'
              : ''}
          {summary.approved_change_cents
            ? ` · CO net ${moneyCents(summary.approved_change_cents)}`
            : ''}
          {depositCents > 0 ? ` · deposits ${moneyCents(depositCents)}` : ''}
          {summary.credit_cents > 0 ? ` · credit ${moneyCents(summary.credit_cents)}` : ''}
        </Text>
      ) : (
        <Text style={styles.meta}>Financial summary loads with the job.</Text>
      )}

      {summary?.awaiting_approval?.length ? (
        <Text style={styles.awaiting}>
          Awaiting approval: {summary.awaiting_approval.length} document
          {summary.awaiting_approval.length === 1 ? '' : 's'}
        </Text>
      ) : null}

      <Text style={styles.label}>Log deposit or payment</Text>
      <View style={styles.kindRow}>
        {(['deposit', 'payment'] as const).map(k => {
          const active = kind === k;
          return (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={[styles.kindChip, active && styles.kindChipActive]}
            >
              <Text style={[styles.kindText, active && styles.kindTextActive]}>
                {k === 'deposit' ? 'Deposit' : 'Payment'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="Amount"
          placeholderTextColor="#999"
        />
        <Pressable
          style={[styles.button, busy && styles.disabled]}
          onPress={logMoney}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Log</Text>
          )}
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.stat, accent && styles.statAccent]}>
      <Text style={[styles.statLabel, accent && styles.statLabelAccent]}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statValueAccent]} numberOfLines={1}>
        {value}
      </Text>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: '#f7f7fb',
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  statAccent: { backgroundColor: '#f8f1d8' },
  statLabel: { fontSize: 11, fontWeight: '600', color: '#666', textTransform: 'uppercase' },
  statLabelAccent: { color: '#8a6a12' },
  statValue: { fontSize: 15, fontWeight: '700', color: BRAND_HEX.black },
  statValueAccent: { color: '#8a6a12' },
  meta: { fontSize: 12, color: '#666', lineHeight: 17 },
  awaiting: { fontSize: 12, color: BRAND_HEX.royalBlue, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginTop: 4 },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindChip: {
    borderWidth: 1,
    borderColor: '#d0d0dc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  kindChipActive: { borderColor: BRAND_HEX.royalBlue, backgroundColor: '#e8e8f8' },
  kindText: { fontSize: 13, color: '#333', fontWeight: '500' },
  kindTextActive: { color: BRAND_HEX.royalBlue, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8d8e4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: BRAND_HEX.black,
  },
  button: {
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minWidth: 72,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.55 },
  error: { color: '#b00020', fontSize: 13 },
});
