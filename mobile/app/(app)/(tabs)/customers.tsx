import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, type Client } from '@/api/client';
import { ScreenMessage } from '@/components/ScreenMessage';
import { BRAND_HEX } from '@/lib/brand';
import { shortDate } from '@/lib/format';
import { isArchivedClient } from '@/lib/jobStatus';

export default function CustomersListScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => router.push('/(app)/customers/new')}>
          <Text style={styles.headerAdd}>Add</Text>
        </Pressable>
      ),
    });
  }, [navigation, router]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      setClients(await api.entities.Client.list('-updated_date'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const activeClients = useMemo(() => clients.filter(c => !isArchivedClient(c)), [clients]);
  const archivedClients = useMemo(() => clients.filter(c => isArchivedClient(c)), [clients]);
  const shown = showArchived ? archivedClients : activeClients;

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={shown.length ? undefined : styles.centered}
      data={shown}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          {error && clients.length ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.count}>
            {shown.length} {showArchived ? 'archived' : 'active'}
          </Text>
          {archivedClients.length > 0 || showArchived ? (
            <Pressable onPress={() => setShowArchived(v => !v)}>
              <Text style={styles.toggle}>
                {showArchived ? 'Show active' : `Archived (${archivedClients.length})`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        error && clients.length === 0 ? (
          <ScreenMessage
            variant="error"
            title="Couldn’t load customers"
            detail={error}
            onRetry={() => void load()}
          />
        ) : (
          <ScreenMessage
            title={
              showArchived
                ? 'No archived customers'
                : clients.length === 0
                  ? 'No customers yet'
                  : 'No active customers'
            }
            detail={
              showArchived
                ? 'Declined contacts show up here when archived.'
                : 'Add a customer before creating their first job.'
            }
            actionLabel={showArchived ? undefined : 'Add customer'}
            onAction={showArchived ? undefined : () => router.push('/(app)/customers/new')}
          />
        )
      }
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() => router.push(`/(app)/customers/${item.id}`)}
        >
          <View style={styles.rowBody}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.sub}>
              {[item.city, item.state].filter(Boolean).join(', ') || item.phone || item.email || '—'}
            </Text>
            {item.status ? <Text style={styles.status}>{item.status}</Text> : null}
            {item.archived_at ? (
              <Text style={styles.archived}>Archived {shortDate(item.archived_at)}</Text>
            ) : null}
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f7f7fb' },
  centered: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  headerBlock: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 6 },
  count: { fontSize: 13, color: '#666' },
  toggle: { fontSize: 14, fontWeight: '600', color: BRAND_HEX.royalBlue },
  error: { color: '#b00020', padding: 12, backgroundColor: '#fde8ea' },
  headerAdd: { color: BRAND_HEX.royalBlue, fontWeight: '700', fontSize: 16, paddingHorizontal: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0ea',
  },
  pressed: { backgroundColor: '#f0f0f8' },
  rowBody: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '600', color: BRAND_HEX.black },
  sub: { fontSize: 13, color: '#666' },
  status: { fontSize: 12, color: '#555', fontWeight: '500' },
  archived: { fontSize: 11, color: '#888' },
  chevron: { fontSize: 22, color: '#aaa', paddingLeft: 8 },
});
