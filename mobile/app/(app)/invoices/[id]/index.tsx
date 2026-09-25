import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, type Invoice, type Job, type Payment } from '@/api/client';
import { InvoicePaymentsSection } from '@/components/InvoicePaymentsSection';
import { BRAND_HEX } from '@/lib/brand';
import { statusLabel } from '@/lib/documents';
import { money, shortDate } from '@/lib/format';

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const next = await api.entities.Invoice.get(id);
      setInvoice(next);
      const [jobRow, paymentRows] = await Promise.all([
        next.job_id
          ? api.entities.Job.get(next.job_id).catch(() => null)
          : Promise.resolve(null),
        next.job_id
          ? api.entities.Payment.filter({ job_id: next.job_id }, '-created_date', 200).catch(() => [])
          : Promise.resolve([]),
      ]);
      setJob(jobRow);
      setPayments(paymentRows);
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

  if (loading && !invoice) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }
  if (error || !invoice) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error || 'Not found'}</Text>
      </View>
    );
  }

  const materials = invoice.material_lines || [];
  const labor = invoice.labor_lines || [];
  const misc = invoice.misc_lines || [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{invoice.number || 'Invoice'}</Text>
      <Text style={styles.badge}>{statusLabel(invoice.status) || '—'}</Text>
      <Text style={styles.meta}>Date {shortDate(invoice.date || invoice.updated_date)}</Text>
      {invoice.total != null ? <Text style={styles.amount}>Total {money(invoice.total)}</Text> : null}
      {invoice.balance_due != null ? (
        <Text style={styles.due}>Balance due {money(invoice.balance_due)}</Text>
      ) : null}
      {invoice.payment_terms ? <Text style={styles.body}>Terms: {invoice.payment_terms}</Text> : null}
      {invoice.notes ? <Text style={styles.body}>{invoice.notes}</Text> : null}

      <Pressable
        style={styles.editBtn}
        onPress={() => router.push(`/(app)/invoices/${invoice.id}/edit`)}
      >
        <Text style={styles.editText}>Edit invoice</Text>
      </Pressable>

      <InvoicePaymentsSection invoice={invoice} payments={payments} onChanged={load} />

      {(materials.length > 0 || labor.length > 0 || misc.length > 0) && (
        <View style={styles.card}>
          <Text style={styles.label}>Lines</Text>
          {materials.map((line, i) => (
            <Text key={`m-${i}`} style={styles.line}>
              {line.description || 'Material'} · {line.qty ?? 0} × {money(line.unit_price)}
            </Text>
          ))}
          {labor.map((line, i) => (
            <Text key={`l-${i}`} style={styles.line}>
              {line.description || 'Labor'} · {line.hours ?? 0}h × {money(line.rate)}
            </Text>
          ))}
          {misc.map((line, i) => (
            <Text key={`x-${i}`} style={styles.line}>
              {line.description || 'Misc'} · {money(line.amount)}
            </Text>
          ))}
        </View>
      )}

      {job ? (
        <Pressable style={styles.linkBtn} onPress={() => router.push(`/(app)/jobs/${job.id}`)}>
          <Text style={styles.link}>Open job · {job.title}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { padding: 20, gap: 10, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: BRAND_HEX.black },
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
  amount: { fontSize: 20, fontWeight: '700', color: BRAND_HEX.black },
  due: { fontSize: 16, fontWeight: '600', color: '#8a6a12' },
  body: { fontSize: 15, color: '#444', lineHeight: 22 },
  editBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: BRAND_HEX.royalBlue,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editText: { color: BRAND_HEX.royalBlue, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 6,
  },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666' },
  line: { fontSize: 14, color: '#333' },
  linkBtn: { marginTop: 8 },
  link: { color: BRAND_HEX.royalBlue, fontWeight: '600', fontSize: 16 },
  error: { color: '#b00020' },
});
