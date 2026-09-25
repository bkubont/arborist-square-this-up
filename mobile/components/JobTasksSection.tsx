import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { api, type WorkItem } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import { moneyCents } from '@/lib/format';
import { materialsNeededCount } from '@/lib/jobMaterials';
import {
  NOTE_PROMPT_STATUSES,
  TASK_STATUSES,
  isTaskCompleted,
  sortTasks,
  sortTasksForList,
  taskStatus,
  taskStatusLabel,
  taskTitle,
  type TaskStatus,
} from '@/lib/tasks';

type ViewMode = 'board' | 'list';

type Props = {
  jobId: string;
  items: WorkItem[];
  onChanged: () => void | Promise<void>;
};

export function JobTasksSection({ jobId, items, onChanged }: Props) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>('board');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState('');

  const shown = view === 'board' ? sortTasks(items) : sortTasksForList(items);
  const doneCount = shown.filter(i => isTaskCompleted(taskStatus(i))).length;

  const changeStatus = useCallback(
    async (item: WorkItem, status: TaskStatus) => {
      if (taskStatus(item) === status) return;
      setBusyId(item.id);
      try {
        await api.entities.WorkItem.update(item.id, { status });
        if (NOTE_PROMPT_STATUSES.includes(status)) {
          Alert.alert('Status updated', 'Add a note on the task if you want to explain why.');
        }
        await onChanged();
      } catch (err) {
        Alert.alert('Could not update', err instanceof Error ? err.message : 'Try again.');
      } finally {
        setBusyId(null);
      }
    },
    [onChanged],
  );

  const addTask = async () => {
    const description = adding.trim();
    if (!description) return;
    setAdding('');
    setBusyId('new');
    try {
      await api.entities.WorkItem.create({ job_id: jobId, description });
      await onChanged();
    } catch (err) {
      Alert.alert('Could not add task', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.heading}>Tasks</Text>
        <View style={styles.headerRight}>
          <View style={styles.toggle}>
            {(['board', 'list'] as ViewMode[]).map(mode => {
              const active = view === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setView(mode)}
                  style={[styles.toggleBtn, active && styles.toggleActive]}
                >
                  <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                    {mode === 'board' ? 'Board' : 'List'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={() => router.push(`/(app)/work-items/new?jobId=${jobId}`)}>
            <Text style={styles.add}>+ Task</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.meta}>
        {items.length
          ? `${doneCount}/${items.length} done`
          : 'No tasks yet — they appear after estimate accept, or add one.'}
      </Text>

      {view === 'board' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.board}>
          {TASK_STATUSES.map(status => {
            const column = shown.filter(i => taskStatus(i) === status);
            return (
              <View key={status} style={styles.column}>
                <Text style={styles.columnTitle}>
                  {taskStatusLabel(status)} · {column.length}
                </Text>
                {column.length === 0 ? (
                  <Text style={styles.columnEmpty}>Empty</Text>
                ) : (
                  column.map(item => (
                    <TaskCard
                      key={item.id}
                      item={item}
                      busy={busyId === item.id}
                      onOpen={() => router.push(`/(app)/work-items/${item.id}`)}
                      onStatus={next => changeStatus(item, next)}
                    />
                  ))
                )}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.list}>
          {shown.map(item => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => router.push(`/(app)/work-items/${item.id}`)}
            >
              <Text style={styles.rowTitle} numberOfLines={2}>
                {taskTitle(item)}
              </Text>
              <Text style={styles.rowMeta}>
                {taskStatusLabel(taskStatus(item))}
                {item.amount_cents != null ? ` · ${moneyCents(item.amount_cents)}` : ''}
                {item.source_type ? ` · from ${item.source_type}` : ''}
                {materialsNeededCount(item.materials) > 0
                  ? ` · ${materialsNeededCount(item.materials)} to get`
                  : ''}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusRow}>
                {TASK_STATUSES.map(s => {
                  const active = taskStatus(item) === s;
                  return (
                    <Pressable
                      key={s}
                      disabled={busyId === item.id}
                      onPress={() => changeStatus(item, s)}
                      style={[styles.statusChip, active && styles.statusChipActive]}
                    >
                      <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                        {taskStatusLabel(s)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={adding}
          onChangeText={setAdding}
          placeholder="Add a task…"
          placeholderTextColor="#999"
          onSubmitEditing={addTask}
          returnKeyType="done"
        />
        <Pressable
          style={[styles.addBtn, busyId === 'new' && styles.disabled]}
          onPress={addTask}
          disabled={busyId === 'new'}
        >
          {busyId === 'new' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.addBtnText}>Add</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function TaskCard({
  item,
  busy,
  onOpen,
  onStatus,
}: {
  item: WorkItem;
  busy: boolean;
  onOpen: () => void;
  onStatus: (status: TaskStatus) => void;
}) {
  return (
    <View style={[styles.taskCard, busy && styles.disabled]}>
      <Pressable onPress={onOpen}>
        <Text style={styles.taskTitle} numberOfLines={3}>
          {taskTitle(item)}
        </Text>
        <Text style={styles.taskMeta}>
          {item.amount_cents != null ? moneyCents(item.amount_cents) : '—'}
          {item.labor_hours != null ? ` · ${item.labor_hours}h` : ''}
          {materialsNeededCount(item.materials) > 0
            ? ` · ${materialsNeededCount(item.materials)} to get`
            : ''}
        </Text>
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusRow}>
        {TASK_STATUSES.map(s => {
          const active = taskStatus(item) === s;
          return (
            <Pressable
              key={s}
              disabled={busy}
              onPress={() => onStatus(s)}
              style={[styles.statusChip, active && styles.statusChipActive]}
            >
              <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                {taskStatusLabel(s)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
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
    gap: 10,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heading: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#666',
    fontWeight: '700',
  },
  add: { color: BRAND_HEX.royalBlue, fontWeight: '700', fontSize: 14 },
  toggle: { flexDirection: 'row', borderWidth: 1, borderColor: '#d8d8e4', borderRadius: 8, overflow: 'hidden' },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  toggleActive: { backgroundColor: '#e8e8f8' },
  toggleText: { fontSize: 12, fontWeight: '600', color: '#666' },
  toggleTextActive: { color: BRAND_HEX.royalBlue },
  meta: { fontSize: 12, color: '#666' },
  board: { gap: 10, paddingBottom: 4 },
  column: {
    width: 220,
    backgroundColor: '#f7f7fb',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    minHeight: 120,
  },
  columnTitle: { fontSize: 12, fontWeight: '700', color: BRAND_HEX.royalBlue },
  columnEmpty: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  taskCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    padding: 10,
    gap: 8,
  },
  taskTitle: { fontSize: 14, fontWeight: '600', color: BRAND_HEX.black },
  taskMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  list: { gap: 0 },
  row: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f5',
    gap: 6,
  },
  pressed: { backgroundColor: '#f7f7fb' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: BRAND_HEX.black },
  rowMeta: { fontSize: 13, color: '#666' },
  statusRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  statusChip: {
    borderWidth: 1,
    borderColor: '#d0d0dc',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
  },
  statusChipActive: { borderColor: BRAND_HEX.royalBlue, backgroundColor: '#e8e8f8' },
  statusChipText: { fontSize: 11, color: '#555', fontWeight: '500' },
  statusChipTextActive: { color: BRAND_HEX.royalBlue, fontWeight: '700' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d8d8e4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: BRAND_HEX.black,
    backgroundColor: '#fff',
  },
  addBtn: {
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 56,
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.55 },
});
