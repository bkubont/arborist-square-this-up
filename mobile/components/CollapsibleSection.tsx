import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BRAND_HEX } from '@/lib/brand';

type Props = {
  title: string;
  children: ReactNode;
  /** Start expanded. */
  defaultOpen?: boolean;
  /** Optional count badge in the header. */
  count?: number;
};

/** Expand/collapse header for long job detail stacks (children keep their own cards). */
export function CollapsibleSection({ title, children, defaultOpen = true, count }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        onPress={() => setOpen(v => !v)}
      >
        <Text style={styles.title}>
          {title}
          {count != null ? ` · ${count}` : ''}
        </Text>
        <Text style={styles.chevron}>{open ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#666',
  },
  chevron: { fontSize: 13, color: BRAND_HEX.royalBlue, fontWeight: '600' },
  pressed: { opacity: 0.75 },
});
