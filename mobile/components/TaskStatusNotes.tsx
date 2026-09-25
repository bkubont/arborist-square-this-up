import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { WorkItem, WorkItemStatusNote } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import { shortDate } from '@/lib/format';
import { taskStatusLabel } from '@/lib/tasks';

type Props = {
  item: WorkItem;
  /** Auto-focus add box after a status move that usually needs a reason. */
  focusAdd?: boolean;
  onAdd: (text: string) => void;
  onRemove: (noteId: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

/**
 * Status-stamped card notes (web TaskNotes). Server stamps id/status/created_at on create.
 */
export function TaskStatusNotes({
  item,
  focusAdd = false,
  onAdd,
  onRemove,
  disabled = false,
  compact = false,
}: Props) {
  const [text, setText] = useState('');
  const notes = item.status_notes || [];

  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onAdd(value);
    setText('');
  };

  return (
    <View style={styles.wrap}>
      {notes.map((note: WorkItemStatusNote, i) => (
        <View key={note.id || `n-${i}`} style={styles.note}>
          <View style={styles.noteBody}>
            <Text style={styles.noteText}>{note.text}</Text>
            <Text style={styles.noteMeta}>
              {taskStatusLabel(note.status || item.status || 'plan')}
              {note.created_at ? ` · ${shortDate(note.created_at)}` : ''}
            </Text>
          </View>
          {!disabled && note.id ? (
            <Pressable onPress={() => onRemove(note.id!)} hitSlop={8}>
              <Text style={styles.remove}>×</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, compact && styles.inputCompact]}
          value={text}
          onChangeText={setText}
          placeholder="Add a note…"
          placeholderTextColor="#999"
          maxLength={500}
          editable={!disabled}
          autoFocus={focusAdd}
          onSubmitEditing={submit}
          returnKeyType="done"
        />
        <Pressable
          style={[styles.addBtn, (disabled || !text.trim()) && styles.dim]}
          onPress={submit}
          disabled={disabled || !text.trim()}
        >
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#f0f0f8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0ec',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  noteBody: { flex: 1, gap: 2 },
  noteText: { fontSize: 12, color: BRAND_HEX.black, lineHeight: 16 },
  noteMeta: { fontSize: 10, color: '#777' },
  remove: { fontSize: 18, color: '#999', lineHeight: 18, paddingHorizontal: 2 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d0d0dc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: BRAND_HEX.black,
    backgroundColor: '#fff',
  },
  inputCompact: { paddingVertical: 6, fontSize: 12 },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: BRAND_HEX.royalBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 20 },
  dim: { opacity: 0.4 },
});
