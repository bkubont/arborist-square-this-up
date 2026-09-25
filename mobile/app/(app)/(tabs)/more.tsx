import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { BRAND_HEX, PRODUCT_NAME } from '@/lib/brand';

function LinkRow({
  title,
  hint,
  onPress,
}: {
  title: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]} onPress={onPress}>
      <Text style={styles.linkRowText}>{title}</Text>
      <Text style={styles.linkRowHint}>{hint}</Text>
    </Pressable>
  );
}

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
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.brand}>{PRODUCT_NAME}</Text>

      <Text style={styles.groupLabel}>Work</Text>
      <LinkRow
        title="Schedule"
        hint="Day / week / agenda from job start dates"
        onPress={() => router.push('/(app)/schedule')}
      />
      <LinkRow
        title="All jobs"
        hint="Full list with status filter · includes archived"
        onPress={() => router.push('/(app)/jobs/all')}
      />

      <Text style={styles.groupLabel}>Money</Text>
      <LinkRow
        title="Receipts inbox"
        hint="Scan receipts · assign unassigned photos to jobs"
        onPress={() => router.push('/(app)/receipts')}
      />

      <Text style={styles.groupLabel}>Business</Text>
      <LinkRow
        title="Reports"
        hint="Money, status counts, materials rollups"
        onPress={() => router.push('/(app)/reports')}
      />
      <LinkRow
        title="Company profile"
        hint="Name, tax %, payment terms"
        onPress={() => router.push('/(app)/company')}
      />

      <Text style={styles.groupLabel}>Account</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Signed in</Text>
        <Text style={styles.value}>{user?.email}</Text>
        <Text style={styles.meta}>API {api.baseUrl}</Text>
      </View>

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
              <Pressable
                onPress={() => {
                  setDeleteOpen(false);
                  setPassword('');
                }}
                disabled={deleting}
              >
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f7f7fb' },
  container: { padding: 24, gap: 10, paddingBottom: 40 },
  brand: { fontSize: 24, fontWeight: '700', color: BRAND_HEX.royalBlue, marginBottom: 4 },
  groupLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#666',
    fontWeight: '700',
    marginTop: 10,
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
    marginTop: 8,
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  link: { color: BRAND_HEX.royalBlue, fontWeight: '600', fontSize: 16 },
});
