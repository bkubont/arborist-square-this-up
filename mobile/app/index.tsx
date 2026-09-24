import { Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { BRAND_HEX, PRODUCT_NAME } from '@/lib/brand';

/** Gated home stub — proves session restore + /api/auth/me + logout. */
export default function HomeScreen() {
  const { user, isAuthenticated, isLoadingAuth, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (isLoadingAuth) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  if (!isAuthenticated || !user) {
    return <Redirect href="/login" />;
  }

  const onLogout = async () => {
    setBusy(true);
    setError('');
    try {
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>{PRODUCT_NAME}</Text>
      <Text style={styles.heading}>Signed in</Text>
      <Text style={styles.meta}>API: {api.baseUrl}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Who am I</Text>
        <Text style={styles.value}>{user.email}</Text>
        <Text style={styles.meta}>id: {user.id}</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        onPress={onLogout}
        disabled={busy}
        style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonPressed]}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Log out</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f7fb' },
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f7f7fb',
    gap: 16,
  },
  brand: {
    fontSize: 28,
    fontWeight: '700',
    color: BRAND_HEX.royalBlue,
    letterSpacing: -0.5,
  },
  heading: { fontSize: 18, fontWeight: '600', color: BRAND_HEX.black },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 6,
  },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666' },
  value: { fontSize: 18, fontWeight: '600', color: BRAND_HEX.black },
  meta: { fontSize: 13, color: '#666' },
  error: { color: '#b00020', fontSize: 14 },
  button: {
    marginTop: 8,
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
