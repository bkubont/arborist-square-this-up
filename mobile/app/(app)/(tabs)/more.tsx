import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { BRAND_HEX, PRODUCT_NAME } from '@/lib/brand';

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

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

  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, jobs, customers, and photos. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => setDeleteOpen(true) },
      ],
    );
  };

  const onDelete = async () => {
    if (!password) return;
    setDeleting(true);
    setError('');
    try {
      await deleteAccount(password);
      setDeleteOpen(false);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete account');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>{PRODUCT_NAME}</Text>
      <Text style={styles.heading}>Settings</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Account</Text>
        <Text style={styles.value}>{user?.email}</Text>
        <Text style={styles.meta}>API {api.baseUrl}</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
        onPress={() => router.push('/(app)/company')}
      >
        <Text style={styles.linkRowText}>Company profile</Text>
        <Text style={styles.linkRowHint}>Name, tax %, payment terms</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
        onPress={() => router.push('/(app)/receipts')}
      >
        <Text style={styles.linkRowText}>Receipts inbox</Text>
        <Text style={styles.linkRowHint}>Unassigned expense photos → assign to a job</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={onLogout}
        disabled={busy}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log out</Text>}
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.dangerOutline, pressed && styles.pressed]}
        onPress={confirmDelete}
      >
        <Text style={styles.dangerText}>Delete account</Text>
      </Pressable>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.heading}>Confirm deletion</Text>
            <Text style={styles.meta}>Enter your password to permanently delete this account.</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              editable={!deleting}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => { setDeleteOpen(false); setPassword(''); }} disabled={deleting}>
                <Text style={styles.link}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
                onPress={onDelete}
                disabled={deleting || !password}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Delete forever</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#f7f7fb', gap: 14 },
  brand: { fontSize: 24, fontWeight: '700', color: BRAND_HEX.royalBlue },
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
  value: { fontSize: 17, fontWeight: '600', color: BRAND_HEX.black },
  meta: { fontSize: 13, color: '#666' },
  linkRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 4,
  },
  linkRowText: { fontSize: 16, fontWeight: '600', color: BRAND_HEX.royalBlue },
  linkRowHint: { fontSize: 13, color: '#666' },
  error: { color: '#b00020', fontSize: 14 },
  button: {
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dangerOutline: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#b00020',
  },
  dangerText: { color: '#b00020', fontWeight: '600', fontSize: 16 },
  dangerButton: {
    backgroundColor: '#b00020',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    minWidth: 140,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d8d8e4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  link: { color: BRAND_HEX.royalBlue, fontWeight: '600', fontSize: 16 },
});
