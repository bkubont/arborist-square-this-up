import { Link, useLocalSearchParams, useRouter } from 'expo-router';
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

import { api } from '@/api/client';
import { authStyles as styles } from '@/lib/authStyles';
import { PRODUCT_NAME } from '@/lib/brand';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const resetToken = typeof params.token === 'string' ? params.token : '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
      setError('Use 12–128 characters for your password');
      return;
    }
    setBusy(true);
    try {
      await api.auth.resetPassword({ resetToken, newPassword });
      router.replace('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setBusy(false);
    }
  };

  if (!resetToken) {
    return (
      <View style={styles.screen}>
        <View style={styles.hero}>
          <View style={styles.mark} />
          <Text style={styles.brand}>{PRODUCT_NAME}</Text>
          <Text style={styles.subtitle}>Invalid reset link</Text>
        </View>
        <Text style={styles.error}>
          This password reset link is missing or incomplete. Request a new one.
        </Text>
        <Link href="/forgot-password" style={styles.link}>
          Request a new link
        </Link>
        <Link href="/login" style={styles.link}>
          Back to log in
        </Link>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.hero}>
        <View style={styles.mark} />
        <Text style={styles.brand}>{PRODUCT_NAME}</Text>
        <Text style={styles.subtitle}>New password</Text>
        <Text style={styles.hint}>Use at least 12 characters.</Text>
      </View>

      <View style={styles.form}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.label}>New password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          autoComplete="new-password"
          value={newPassword}
          onChangeText={setNewPassword}
          editable={!busy}
        />
        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          autoComplete="new-password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          editable={!busy}
        />
        <Pressable
          style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Reset password</Text>
          )}
        </Pressable>
        <Link href="/login" style={styles.link}>
          Back to log in
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
