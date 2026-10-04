import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import { getPrivacyPolicyUrl, getSupportUrl } from '@/lib/appConfig';
import { useAuth } from '@/lib/AuthContext';
import { BRAND_HEX, PRODUCT_NAME } from '@/lib/brand';

function LinkRow({
  title,
  hint,
  onPress,
  disabled,
}: {
  title: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.linkRow,
        disabled && styles.linkRowDisabled,
        pressed && !disabled && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.linkRowText, disabled && styles.linkRowTextDisabled]}>{title}</Text>
      <Text style={styles.linkRowHint}>{hint}</Text>
    </Pressable>
  );
}

async function openExternalUrl(url: string, label: string) {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    Alert.alert(`Could not open ${label}`, url);
  }
}

export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const privacyUrl = getPrivacyPolicyUrl();
  const supportUrl = getSupportUrl();

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

  const onPrivacy = () => {
    if (!privacyUrl) {
      Alert.alert(
        'Privacy policy',
        'Set EXPO_PUBLIC_PRIVACY_POLICY_URL to your live HTTPS privacy page before store submit. See the EAS store setup walkthrough.',
      );
      return;
    }
    void openExternalUrl(privacyUrl, 'privacy policy');
  };

  const onSupport = () => {
    if (!supportUrl) {
      Alert.alert(
        'Support',
        'Set EXPO_PUBLIC_SUPPORT_URL to your live HTTPS support or contact page before store submit.',
      );
      return;
    }
    void openExternalUrl(supportUrl, 'support');
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.brand}>{PRODUCT_NAME}</Text>

      <Text style={styles.groupLabel}>Work</Text>
      <LinkRow
        title="Board"
        hint="Working · Payment — tap Move to change status"
        onPress={() => router.push('/(app)/jobs/board')}
      />
      <LinkRow
        title="Archive"
        hint="Paid and declined jobs"
        onPress={() => router.push('/(app)/jobs/archive')}
      />
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

      <Text style={styles.groupLabel}>Legal & support</Text>
      <LinkRow
        title="Privacy policy"
        hint={
          privacyUrl
            ? privacyUrl
            : 'URL not configured yet — set EXPO_PUBLIC_PRIVACY_POLICY_URL for App Review'
        }
        onPress={onPrivacy}
      />
      <LinkRow
        title="Support"
        hint={
          supportUrl
            ? supportUrl
            : 'URL not configured yet — set EXPO_PUBLIC_SUPPORT_URL for App Review'
        }
        onPress={onSupport}
      />
      <Text style={styles.legalNote}>
        Account deletion is available below (App Store Guideline 5.1.1). Registration is
        invitation-only.
      </Text>

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
      <Text style={styles.deleteHint}>
        Permanently removes your account and all jobs, customers, documents, and photos stored for
        this login. Requires your password.
      </Text>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
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
              autoCapitalize="none"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={() => void onDelete()}
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
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f7f7fb' },
  container: { padding: 24, gap: 10 },
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
  legalNote: { fontSize: 12, color: '#777', lineHeight: 18, marginTop: 2 },
  deleteHint: { fontSize: 12, color: '#777', lineHeight: 18, marginTop: -2 },
  linkRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 4,
  },
  linkRowDisabled: { opacity: 0.65 },
  linkRowText: { fontSize: 16, fontWeight: '600', color: BRAND_HEX.royalBlue },
  linkRowTextDisabled: { color: '#555' },
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
