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

import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { authStyles as styles } from '@/lib/authStyles';
import { PRODUCT_NAME } from '@/lib/brand';

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
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log in</Text>}
        </Pressable>
        <Link href="/forgot-password" style={styles.link}>
          Forgot password?
        </Link>
        <Link href="/register" style={styles.link}>
          Have an invitation? Create account
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
