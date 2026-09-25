import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import { authStyles as styles } from '@/lib/authStyles';
import { PRODUCT_NAME } from '@/lib/brand';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async () => {
    setError('');
    setBusy(true);
    try {
      await api.auth.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7fb' }}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.hero}>
          <View style={styles.mark} />
          <Text style={styles.brand}>{PRODUCT_NAME}</Text>
          <Text style={styles.subtitle}>Reset password</Text>
          <Text style={styles.hint}>
            We will email a link if that account exists (SMTP must be configured).
          </Text>
        </View>

        <View style={styles.form}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {sent ? (
            <Text style={styles.success}>
              If an account exists with that email, you will receive a password reset link shortly.
            </Text>
          ) : (
            <>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#999"
                editable={!busy}
                returnKeyType="done"
                onSubmitEditing={onSubmit}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  (pressed || busy || !email) && styles.buttonDisabled,
                ]}
                onPress={onSubmit}
                disabled={busy || !email}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Send reset link</Text>
                )}
              </Pressable>
            </>
          )}
          <Link href="/login" style={styles.link}>
            Back to log in
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
