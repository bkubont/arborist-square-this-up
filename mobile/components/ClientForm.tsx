import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
} from 'react-native';

import { api, type Client } from '@/api/client';
import { AddressSuggestFields } from '@/components/AddressSuggestFields';
import { FormError, FormField, formStyles } from '@/components/FormFields';

type Props = {
  client?: Client | null;
};

const empty = {
  name: '',
  address: '',
  address_line2: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  email: '',
  notes: '',
};

export function ClientForm({ client }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({ ...empty, ...client });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof empty, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Enter a client name.');
      return;
    }
    if (!form.address.trim() || !form.city.trim() || !form.state.trim() || !form.zip.trim()) {
      setError('Enter street address, city, state, and ZIP.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim(),
        address_line2: form.address_line2.trim() || '',
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zip.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (client?.id) {
        await api.entities.Client.update(client.id, payload);
        router.replace(`/(app)/customers/${client.id}`);
      } else {
        const created = await api.entities.Client.create(payload);
        router.replace(`/(app)/customers/${created.id}`);
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
        <FormField label="Name" required value={form.name} onChangeText={v => set('name', v)} autoComplete="name" />
        <AddressSuggestFields
          value={{
            address: form.address,
            address_line2: form.address_line2,
            city: form.city,
            state: form.state,
            zip: form.zip,
          }}
          onChange={next => setForm(prev => ({ ...prev, ...next }))}
        />
        <FormField label="Phone" value={form.phone} onChangeText={v => set('phone', v)} keyboardType="phone-pad" autoComplete="tel" />
        <FormField label="Email" value={form.email} onChangeText={v => set('email', v)} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <FormField label="Notes" value={form.notes} onChangeText={v => set('notes', v)} multiline />
        <Pressable
          style={({ pressed }) => [formStyles.button, (pressed || busy) && formStyles.buttonDisabled]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={formStyles.buttonText}>{client ? 'Save' : 'Create customer'}</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
