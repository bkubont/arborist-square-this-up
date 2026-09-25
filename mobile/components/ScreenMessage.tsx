import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BRAND_HEX } from '@/lib/brand';

type Props = {
  /** Short primary line (empty or error title). */
  title: string;
  /** Optional supporting sentence. */
  detail?: string;
  /** When true, use error styling. */
  variant?: 'empty' | 'error';
  onRetry?: () => void;
  retryLabel?: string;
  /** Optional primary CTA (e.g. Add job) — shown below retry when both set. */
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * Shared empty / load-error block for list and detail screens.
 */
export function ScreenMessage({
  title,
  detail,
  variant = 'empty',
  onRetry,
  retryLabel = 'Try again',
  actionLabel,
  onAction,
}: Props) {
  const isError = variant === 'error';
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={[styles.title, isError && styles.titleError]}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
          onPress={onRetry}
        >
          <Text style={styles.btnText}>{retryLabel}</Text>
        </Pressable>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          onPress={onAction}
        >
          <Text style={styles.secondaryText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 32,
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    textAlign: 'center',
  },
  titleError: { color: '#b00020' },
  detail: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    lineHeight: 20,
  },
  btn: {
    marginTop: 6,
    backgroundColor: BRAND_HEX.royalBlue,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondary: {
    marginTop: 2,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: BRAND_HEX.royalBlue,
  },
  secondaryText: { color: BRAND_HEX.royalBlue, fontWeight: '600', fontSize: 15 },
  pressed: { opacity: 0.85 },
});
