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

import { api, type Invoice, type InvoiceLaborLine, type InvoiceMaterialLine, type InvoiceMiscLine } from '@/api/client';
import { CatalogPicker } from '@/components/CatalogPicker';
import { FormError, FormField, formStyles } from '@/components/FormFields';
import { DOCUMENT_STATUSES, statusLabel } from '@/lib/documents';
import { catalogItemToLaborLine, catalogItemToMaterialLine, invoiceTotals } from '@/lib/estimateMath';
import { money } from '@/lib/format';

type Props = { invoice: Invoice };

type CatalogTarget = { kind: 'material' | 'labor'; index: number };

export function InvoiceForm({ invoice }: Props) {
  const router = useRouter();
  const frozen = ['paid', 'void'].includes(invoice.status || '');
  const [number, setNumber] = useState(invoice.number || '');
  const [date, setDate] = useState(invoice.date || '');
  const [notes, setNotes] = useState(invoice.notes || '');
  const [paymentTerms, setPaymentTerms] = useState(invoice.payment_terms || '');
  const [taxRate, setTaxRate] = useState(invoice.tax_rate != null ? String(invoice.tax_rate) : '');
  const [status, setStatus] = useState(invoice.status || 'draft');
  const [materialLines, setMaterialLines] = useState<InvoiceMaterialLine[]>(
    () => (invoice.material_lines?.length ? [...invoice.material_lines] : []),
  );
  const [laborLines, setLaborLines] = useState<InvoiceLaborLine[]>(
    () => (invoice.labor_lines?.length ? [...invoice.labor_lines] : []),
  );
  const [miscLines, setMiscLines] = useState<InvoiceMiscLine[]>(
    () => (invoice.misc_lines?.length ? [...invoice.misc_lines] : [{ description: '', amount: undefined }]),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [catalogTarget, setCatalogTarget] = useState<CatalogTarget | null>(null);

  const totals = useMemo(
    () =>
      invoiceTotals({
        material_lines: materialLines,
        labor_lines: laborLines,
        misc_lines: miscLines,
        tax_rate: taxRate,
        deposits_applied: invoice.deposits_applied,
        payments_applied: invoice.payments_applied,
      }),
    [materialLines, laborLines, miscLines, taxRate, invoice.deposits_applied, invoice.payments_applied],
  );

  const save = async () => {
    if (frozen) return;
    setError('');
    setBusy(true);
    try {
      const cleanedMisc = miscLines.filter(l => l.description || l.amount != null);
      await api.entities.Invoice.update(invoice.id, {
        number: number.trim() || undefined,
        date: date.trim() || undefined,
        notes: notes.trim() || undefined,
        payment_terms: paymentTerms.trim() || undefined,
        tax_rate: taxRate === '' ? undefined : Number(taxRate),
        material_lines: materialLines,
        labor_lines: laborLines,
        misc_lines: cleanedMisc,
        ...totals,
      });
      if (status !== invoice.status && ['draft', 'sent', 'partial', 'paid', 'void'].includes(status)) {
        try {
          await api.documents.setStatus('Invoice', invoice.id, status);
        } catch {
          await api.entities.Invoice.update(invoice.id, { status });
        }
      }
      router.replace(`/(app)/invoices/${invoice.id}`);
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
        {frozen ? (
          <Text style={formStyles.sectionLabel}>Paid / void invoices are view-only on mobile.</Text>
        ) : null}

        <FormField label="Number" value={number} onChangeText={setNumber} editable={!frozen} />
        <FormField
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          editable={!frozen}
        />
        <FormField
          label="Payment terms"
          value={paymentTerms}
          onChangeText={setPaymentTerms}
          editable={!frozen}
        />
        <FormField
          label="Tax %"
          value={taxRate}
          onChangeText={setTaxRate}
          keyboardType="decimal-pad"
          editable={!frozen}
        />
        <FormField label="Notes" value={notes} onChangeText={setNotes} multiline editable={!frozen} />

        <Text style={formStyles.sectionLabel}>Status</Text>
        <View style={formStyles.chipRow}>
          {DOCUMENT_STATUSES.Invoice.map(s => {
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

        <Text style={formStyles.sectionLabel}>Material lines ({materialLines.length})</Text>
        {materialLines.map((line, i) => (
          <View key={`m-${i}`} style={{ gap: 6, marginBottom: 6 }}>
            <FormField
              label="Description"
              value={line.description || ''}
              onChangeText={v =>
                setMaterialLines(rows => rows.map((r, idx) => (idx === i ? { ...r, description: v } : r)))
              }
              editable={!frozen}
            />
            <FormField
              label="Qty"
              value={line.qty != null ? String(line.qty) : ''}
              onChangeText={v =>
                setMaterialLines(rows =>
                  rows.map((r, idx) => (idx === i ? { ...r, qty: v === '' ? undefined : Number(v) } : r)),
                )
              }
              keyboardType="decimal-pad"
              editable={!frozen}
            />
            <FormField
              label="Unit price"
              value={line.unit_price != null ? String(line.unit_price) : ''}
              onChangeText={v =>
                setMaterialLines(rows =>
                  rows.map((r, idx) =>
                    idx === i ? { ...r, unit_price: v === '' ? undefined : Number(v) } : r,
                  ),
                )
              }
              keyboardType="decimal-pad"
              editable={!frozen}
            />
          </View>
        ))}
        {!frozen ? (
          <Pressable
            style={formStyles.chip}
            onPress={() => setMaterialLines(rows => [...rows, { description: '', qty: 1, unit_price: 0 }])}
          >
            <Text style={formStyles.chipText}>Add material line</Text>
          </Pressable>
        ) : null}
        {!frozen && materialLines.length > 0 ? (
          <Pressable
            style={formStyles.chip}
            onPress={() => setCatalogTarget({ kind: 'material', index: materialLines.length - 1 })}
          >
            <Text style={formStyles.chipText}>Fill last material from catalog</Text>
          </Pressable>
        ) : null}
        {!frozen && materialLines.length === 0 ? (
          <Pressable
            style={formStyles.chip}
            onPress={() => {
              setMaterialLines([{ description: '', qty: 1, unit_price: 0 }]);
              setCatalogTarget({ kind: 'material', index: 0 });
            }}
          >
            <Text style={formStyles.chipText}>Add material from catalog</Text>
          </Pressable>
        ) : null}

        <Text style={formStyles.sectionLabel}>Labor lines ({laborLines.length})</Text>
        {laborLines.map((line, i) => (
          <View key={`l-${i}`} style={{ gap: 6, marginBottom: 6 }}>
            <FormField
              label="Description"
              value={line.description || ''}
              onChangeText={v =>
                setLaborLines(rows => rows.map((r, idx) => (idx === i ? { ...r, description: v } : r)))
              }
              editable={!frozen}
            />
            <FormField
              label="Hours"
              value={line.hours != null ? String(line.hours) : ''}
              onChangeText={v =>
                setLaborLines(rows =>
                  rows.map((r, idx) => (idx === i ? { ...r, hours: v === '' ? undefined : Number(v) } : r)),
                )
              }
              keyboardType="decimal-pad"
              editable={!frozen}
            />
            <FormField
              label="Rate"
              value={line.rate != null ? String(line.rate) : ''}
              onChangeText={v =>
                setLaborLines(rows =>
                  rows.map((r, idx) => (idx === i ? { ...r, rate: v === '' ? undefined : Number(v) } : r)),
                )
              }
              keyboardType="decimal-pad"
              editable={!frozen}
            />
          </View>
        ))}
        {!frozen ? (
          <Pressable
            style={formStyles.chip}
            onPress={() => setLaborLines(rows => [...rows, { description: '', hours: 1, rate: 55 }])}
          >
            <Text style={formStyles.chipText}>Add labor line</Text>
          </Pressable>
        ) : null}
        {!frozen && laborLines.length > 0 ? (
          <Pressable
            style={formStyles.chip}
            onPress={() => setCatalogTarget({ kind: 'labor', index: laborLines.length - 1 })}
          >
            <Text style={formStyles.chipText}>Fill last labor from catalog</Text>
          </Pressable>
        ) : null}
        {!frozen && laborLines.length === 0 ? (
          <Pressable
            style={formStyles.chip}
            onPress={() => {
              setLaborLines([{ description: '', hours: 1, rate: 55 }]);
              setCatalogTarget({ kind: 'labor', index: 0 });
            }}
          >
            <Text style={formStyles.chipText}>Add labor from catalog</Text>
          </Pressable>
        ) : null}

        <Text style={formStyles.sectionLabel}>Misc lines</Text>
        {miscLines.map((line, i) => (
          <View key={`x-${i}`} style={{ gap: 6, marginBottom: 6 }}>
            <FormField
              label="Description"
              value={line.description || ''}
              onChangeText={v =>
                setMiscLines(rows => rows.map((r, idx) => (idx === i ? { ...r, description: v } : r)))
              }
              editable={!frozen}
            />
            <FormField
              label="Amount"
              value={line.amount != null ? String(line.amount) : ''}
              onChangeText={v =>
                setMiscLines(rows =>
                  rows.map((r, idx) => (idx === i ? { ...r, amount: v === '' ? undefined : Number(v) } : r)),
                )
              }
              keyboardType="numbers-and-punctuation"
              editable={!frozen}
            />
          </View>
        ))}
        {!frozen ? (
          <Pressable
            style={formStyles.chip}
            onPress={() => setMiscLines(rows => [...rows, { description: '', amount: undefined }])}
          >
            <Text style={formStyles.chipText}>Add misc line</Text>
          </Pressable>
        ) : null}

        <Text style={formStyles.sectionLabel}>
          Total {money(totals.total)} · Balance due {money(totals.balance_due)}
        </Text>

        {!frozen ? (
          <Pressable
            style={({ pressed }) => [formStyles.button, (pressed || busy) && formStyles.buttonDisabled]}
            onPress={save}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={formStyles.buttonText}>Save invoice</Text>}
          </Pressable>
        ) : null}
      </ScrollView>

      <CatalogPicker
        visible={catalogTarget != null}
        title="Add from catalog"
        onClose={() => setCatalogTarget(null)}
        onPick={item => {
          if (!catalogTarget) return;
          if (catalogTarget.kind === 'material') {
            const mapped = catalogItemToMaterialLine(item);
            setMaterialLines(rows =>
              rows.map((r, idx) =>
                idx === catalogTarget.index
                  ? {
                      description: mapped.description,
                      qty: mapped.qty,
                      unit_price: mapped.unit_price,
                    }
                  : r,
              ),
            );
          } else {
            const mapped = catalogItemToLaborLine(item);
            setLaborLines(rows =>
              rows.map((r, idx) =>
                idx === catalogTarget.index
                  ? {
                      description: mapped.description,
                      hours: mapped.hours,
                      rate: mapped.rate,
                    }
                  : r,
              ),
            );
          }
        }}
      />
    </KeyboardAvoidingView>
  );
}
