import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api, type CatalogItem } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import { money } from '@/lib/format';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (item: CatalogItem) => void;
  title?: string;
};

export function CatalogPicker({ visible, onClose, onPick, title = 'Catalog' }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [laborRate, setLaborRate] = useState<number | undefined>();

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.catalog.search({ q: q.trim() || undefined, limit: 40 });
      setItems(data.items || []);
      if (data.default_labor_rate != null) setLaborRate(data.default_labor_rate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Catalog search failed');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    void search('');
  }, [visible, search]);

  useEffect(() => {
    if (!visible) return;
    const handle = setTimeout(() => void search(query), 280);
    return () => clearTimeout(handle);
  }, [query, visible, search]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Done</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Search tasks…"
          placeholderTextColor="#999"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {laborRate != null ? (
          <Text style={styles.meta}>Default labor rate ${laborRate}/hr</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !items.length ? (
          <ActivityIndicator color={BRAND_HEX.royalBlue} style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>No catalog matches</Text>}
            renderItem={({ item }) => {
              const materials = Number(item.est_materials_cost) || 0;
              const labor =
                item.est_labor_cost ??
                (item.hours_mid != null
                  ? item.hours_mid * (item.labor_rate ?? laborRate ?? 55)
                  : 0);
              const total = materials + (Number(labor) || 0);
              return (
                <Pressable
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  onPress={() => {
                    onPick(item);
                    onClose();
                  }}
                >
                  <Text style={styles.rowTitle}>{item.task}</Text>
                  <Text style={styles.rowMeta}>
                    {item.category || '—'}
                    {total > 0 ? ` · ~${money(total)}` : ''}
                    {item.hours_mid != null ? ` · ${item.hours_mid}h` : ''}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb', paddingTop: 56 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: BRAND_HEX.black },
  close: { color: BRAND_HEX.royalBlue, fontWeight: '700', fontSize: 16 },
  input: {
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8d8e4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: BRAND_HEX.black,
  },
  meta: { marginHorizontal: 20, marginTop: 8, fontSize: 12, color: '#666' },
  error: { marginHorizontal: 20, marginTop: 8, color: '#b00020' },
  list: { padding: 20, paddingBottom: 40 },
  empty: { textAlign: 'center', color: '#888', marginTop: 24 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    padding: 14,
    marginBottom: 8,
    gap: 4,
  },
  pressed: { backgroundColor: '#f0f0f8' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: BRAND_HEX.black },
  rowMeta: { fontSize: 13, color: '#666' },
});
