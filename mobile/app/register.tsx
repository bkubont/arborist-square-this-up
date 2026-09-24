import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/lib/AuthContext';
import { authStyles as styles } from '@/lib/authStyles';
import { PRODUCT_NAME } from '@/lib/brand';
import { DEFAULT_SALES_TAX_RATE } from '@/lib/salesTax';

export default function RegisterScreen() {
  const { register } = useAuth();
  const params = useLocalSearchParams<{ invite?: string; email?: string }>();
  const inviteToken = typeof params.invite === 'string' ? params.invite : '';
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [salesTaxRate, setSalesTaxRate] = useState(String(DEFAULT_SALES_TAX_RATE));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!inviteToken) {
      setError('An invitation link is required.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setError('Use 12–128 characters for your password');
      return;
    }
    const tax = Number(salesTaxRate);
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) {
      setError('Sales tax must be between 0 and 100');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await register({
        email: email.trim(),
        password,
        inviteToken,
        default_tax_rate: tax,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f7f7fb' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.mark} />
          <Text style={styles.brand}>{PRODUCT_NAME}</Text>
          <Text style={styles.subtitle}>
            {inviteToken ? 'Create your account' : 'Invitation required'}
          </Text>
          <Text style={styles.hint}>
            {inviteToken
              ? 'Your clients and jobs stay private to your account.'
              : 'Open the invitation link from the app owner, or paste invite details below if you have them.'}
          </Text>
        </View>

        {!inviteToken ? (
          <View style={styles.form}>
            <Text style={styles.error}>
              Contact the app owner for an invitation. Links look like …/register?invite=…&email=…
            </Text>
            <Link href="/login" style={styles.link}>
              Back to log in
            </Link>
          </View>
        ) : (
          <View style={styles.form}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
            />
            <Text style={styles.label}>Password (at least 12 characters)</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
              editable={!busy}
            />
            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              autoComplete="new-password"
              value={confirm}
              onChangeText={setConfirm}
              editable={!busy}
            />
            <Text style={styles.label}>Sales tax rate (%)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={salesTaxRate}
              onChangeText={setSalesTaxRate}
              editable={!busy}
            />
            <Text style={styles.hint}>
              Default {DEFAULT_SALES_TAX_RATE}%. Used on estimates and invoices; change later in Settings.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonDisabled]}
              onPress={onSubmit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Create account</Text>
              )}
            </Pressable>
            <Link href="/login" style={styles.link}>
              Back to log in
            </Link>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
