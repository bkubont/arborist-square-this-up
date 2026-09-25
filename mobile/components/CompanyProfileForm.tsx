import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
} from 'react-native';

import { api, type CompanyProfile } from '@/api/client';
import { FormError, FormField, formStyles } from '@/components/FormFields';
import { DEFAULT_SALES_TAX_RATE } from '@/lib/salesTax';

export function CompanyProfileForm() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [taxRate, setTaxRate] = useState(String(DEFAULT_SALES_TAX_RATE));
  const [paymentTerms, setPaymentTerms] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.entities.CompanyProfile.list('-created_date', 5);
        const existing = rows[0] || null;
        if (cancelled) return;
        setProfile(existing);
        if (existing) {
          setName(existing.name || '');
          setAddress(existing.address || '');
          setPhone(existing.phone || '');
          setEmail(existing.email || '');
          setWebsite(existing.website || '');
          setTaxRate(
            existing.default_tax_rate != null
              ? String(existing.default_tax_rate)
              : String(DEFAULT_SALES_TAX_RATE),
          );
          setPaymentTerms(existing.default_payment_terms || '');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setError('');
    setSaved(false);
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        website: website.trim() || undefined,
        default_payment_terms: paymentTerms.trim() || undefined,
        default_tax_rate: taxRate === '' ? DEFAULT_SALES_TAX_RATE : Number(taxRate),
      };
      if (profile) {
        const updated = await api.entities.CompanyProfile.update(profile.id, payload);
        setProfile(updated);
      } else {
        const created = await api.entities.CompanyProfile.create(payload);
        setProfile(created);
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <KeyboardAvoidingView style={formStyles.screen}>
        <ActivityIndicator color="#0504AA" style={{ marginTop: 40 }} />
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={formStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
        <FormError message={error} />
        {saved ? <Text style={formStyles.sectionLabel}>Saved</Text> : null}
        <FormField label="Company name" value={name} onChangeText={setName} placeholder="Your company" />
        <FormField label="Address" value={address} onChangeText={setAddress} multiline />
        <FormField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <FormField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FormField
          label="Website"
          value={website}
          onChangeText={setWebsite}
          autoCapitalize="none"
          placeholder="https://"
        />
        <FormField
          label="Sales tax %"
          value={taxRate}
          onChangeText={setTaxRate}
          keyboardType="decimal-pad"
        />
        <FormField
          label="Default payment terms"
          value={paymentTerms}
          onChangeText={setPaymentTerms}
          placeholder="Due upon receipt"
        />
        <Pressable
          style={({ pressed }) => [formStyles.button, (pressed || busy) && formStyles.buttonDisabled]}
          onPress={save}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={formStyles.buttonText}>Save profile</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
