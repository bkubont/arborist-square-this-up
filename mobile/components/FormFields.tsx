import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { BRAND_HEX } from '@/lib/brand';

type FieldProps = TextInputProps & {
  label: string;
  required?: boolean;
  multiline?: boolean;
};

export function FormField({ label, required, multiline, style, ...props }: FieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <TextInput
        {...props}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, style]}
        placeholderTextColor="#999"
      />
    </View>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

export const formStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  button: {
    marginTop: 8,
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#d0d0dc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chipActive: {
    borderColor: BRAND_HEX.royalBlue,
    backgroundColor: '#e8e8f8',
  },
  chipText: { fontSize: 13, color: '#333', fontWeight: '500' },
  chipTextActive: { color: BRAND_HEX.royalBlue, fontWeight: '700' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#333', marginTop: 4 },
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#333' },
  req: { color: '#b00020' },
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
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  error: {
    backgroundColor: '#fde8ea',
    color: '#b00020',
    padding: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
