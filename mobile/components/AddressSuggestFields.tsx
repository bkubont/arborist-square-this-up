import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api } from '@/api/client';
import { FormField } from '@/components/FormFields';
import { BRAND_HEX } from '@/lib/brand';

export type AddressValue = {
  address: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
};

type Suggestion = {
  id?: string;
  label: string;
  parsed?: Partial<AddressValue>;
};

type Props = {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
};

/** Street typeahead via GET /api/address-suggest (Photon), same as web without Google Places. */
export function AddressSuggestFields({ value, onChange }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = String(value.address || '').trim();
    if (q.length < 3) {
      setSuggestions([]);
      return undefined;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.address.suggest(q);
        if (!cancelled) {
          setSuggestions(Array.isArray(data.items) ? data.items : []);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [value.address]);

  const pick = (item: Suggestion) => {
    const parsed = item.parsed || {};
    if (!parsed.address) return;
    onChange({
      ...value,
      address: parsed.address || value.address,
      address_line2: parsed.address_line2 || value.address_line2,
      city: parsed.city || value.city,
      state: parsed.state || value.state,
      zip: parsed.zip || value.zip,
    });
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      <FormField
        label="Street"
        required
        value={value.address}
        onChangeText={v => {
          onChange({ ...value, address: v });
          setOpen(true);
        }}
        autoComplete="street-address"
        placeholder="123 Oak St"
      />
      <Text style={styles.hint}>Type the street — suggestions can fill city, state, and ZIP.</Text>
      {loading ? <ActivityIndicator color={BRAND_HEX.royalBlue} style={{ marginVertical: 4 }} /> : null}
      {open && suggestions.length > 0 ? (
        <View style={styles.dropdown}>
          {suggestions.map(item => (
            <Pressable
              key={item.id || item.label}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              onPress={() => pick(item)}
            >
              <Text style={styles.optionText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <FormField
        label="Apt / suite"
        value={value.address_line2}
        onChangeText={v => onChange({ ...value, address_line2: v })}
      />
      <FormField
        label="City"
        required
        value={value.city}
        onChangeText={v => onChange({ ...value, city: v })}
      />
      <FormField
        label="State"
        required
        value={value.state}
        onChangeText={v => onChange({ ...value, state: v })}
        autoCapitalize="characters"
      />
      <FormField
        label="ZIP"
        required
        value={value.zip}
        onChangeText={v => onChange({ ...value, zip: v })}
        keyboardType="number-pad"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  hint: { fontSize: 11, color: '#666', marginTop: -6 },
  dropdown: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e4ef',
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: -4,
  },
  option: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f5' },
  optionPressed: { backgroundColor: '#f0f0f8' },
  optionText: { fontSize: 14, color: BRAND_HEX.black },
});
