import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { BRAND_HEX, PRODUCT_NAME } from '@/lib/brand';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.hero}>
        <View style={styles.mark} />
        <Text style={styles.brand}>{PRODUCT_NAME}</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>
        <Text style={styles.apiHint}>API {api.baseUrl}</Text>
      </View>

      <View style={styles.form}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#999"
          editable={!busy}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••••••"
          placeholderTextColor="#999"
          editable={!busy}
          onSubmitEditing={onSubmit}
        />
        <Pressable
          accessibilityRole="button"
          onPress={onSubmit}
          disabled={busy || !email || !password}
          style={({ pressed }) => [
            styles.button,
            (pressed || busy || !email || !password) && styles.buttonDisabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Log in</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f7fb',
    justifyContent: 'center',
    padding: 24,
  },
  hero: { marginBottom: 28, gap: 8 },
  mark: {
    width: 36,
    height: 36,
    borderWidth: 3,
    borderColor: BRAND_HEX.royalBlue,
    borderRightColor: 'transparent',
    marginBottom: 4,
  },
  brand: {
    fontSize: 34,
    fontWeight: '700',
    color: BRAND_HEX.royalBlue,
    letterSpacing: -0.8,
  },
  subtitle: { fontSize: 16, color: '#444' },
  apiHint: { fontSize: 12, color: '#888' },
  form: { gap: 10 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginTop: 4 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8d8e4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
    color: BRAND_HEX.black,
  },
  error: {
    backgroundColor: '#fde8ea',
    color: '#b00020',
    padding: 12,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 4,
  },
  button: {
    marginTop: 12,
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
