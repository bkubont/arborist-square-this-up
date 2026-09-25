import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { WorkItem } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import { moneyCents } from '@/lib/format';
import { sortTasksForList, taskStatus, taskStatusLabel } from '@/lib/tasks';

type Props = {
  jobId: string;
  items: WorkItem[];
};

export function JobTasksSection({ jobId, items }: Props) {
  const router = useRouter();
  const sorted = sortTasksForList(items);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.heading}>Tasks</Text>
        <Pressable onPress={() => router.push(`/(app)/work-items/new?jobId=${jobId}`)}>
          <Text style={styles.add}>+ Task</Text>
        </Pressable>
      </View>

      {sorted.length === 0 ? (
        <Text style={styles.empty}>No tasks yet — they appear after estimate accept, or add one.</Text>
      ) : (
        sorted.map(item => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => router.push(`/(app)/work-items/${item.id}`)}
          >
            <Text style={styles.rowTitle} numberOfLines={2}>
              {item.description || (item.template_key === 'prep'
                ? 'Prep'
                : item.template_key === 'materials'
                  ? 'Materials'
                  : item.template_key === 'final_walkthrough'
                    ? 'Final walkthrough'
                    : 'Task')}
            </Text>
            <Text style={styles.rowMeta}>
              {taskStatusLabel(taskStatus(item))}
              {item.amount_cents != null ? ` · ${moneyCents(item.amount_cents)}` : ''}
              {item.source_type ? ` · from ${item.source_type}` : ''}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 8,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#666',
    fontWeight: '700',
  },
  add: { color: BRAND_HEX.royalBlue, fontWeight: '700', fontSize: 14 },
  empty: { fontSize: 13, color: '#888', lineHeight: 18 },
  row: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f5',
    gap: 2,
  },
  pressed: { backgroundColor: '#f7f7fb' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: BRAND_HEX.black },
  rowMeta: { fontSize: 13, color: '#666' },
});
