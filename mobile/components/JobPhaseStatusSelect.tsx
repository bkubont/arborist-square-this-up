import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  JOB_PHASE_ORDER,
  JOB_PHASES,
  defaultStatusForPhase,
  resolvePhaseStatus,
  statusesForPhase,
  type JobPhase,
} from '@/lib/jobStatus';
import { formStyles } from '@/components/FormFields';

type Props = {
  phase?: string | null;
  status?: string | null;
  onChange: (next: { phase: JobPhase; status: string }) => void;
};

/**
 * Phase-first job status control (mirrors web JobPhaseStatusSelect).
 * Pick Lead / Working / Payment, then a status in that phase.
 */
export function JobPhaseStatusSelect({ phase, status, onChange }: Props) {
  const { phase: resolvedPhase, status: resolvedStatus } = resolvePhaseStatus(phase, status);

  const setPhase = (nextPhase: JobPhase) => {
    const nextStatus =
      nextPhase === resolvedPhase && statusesForPhase(nextPhase).includes(resolvedStatus)
        ? resolvedStatus
        : defaultStatusForPhase(nextPhase);
    onChange({ phase: nextPhase, status: nextStatus });
  };

  const setStatus = (nextStatus: string) => {
    onChange({ phase: resolvedPhase, status: nextStatus });
  };

  return (
    <View style={styles.wrap}>
      <View style={formStyles.chipRow}>
        {JOB_PHASE_ORDER.map(p => {
          const active = p === resolvedPhase;
          return (
            <Pressable
              key={p}
              onPress={() => setPhase(p)}
              style={[formStyles.chip, active && formStyles.chipActive]}
            >
              <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                {JOB_PHASES[p].label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={formStyles.chipRow}>
        {statusesForPhase(resolvedPhase).map(s => {
          const active = s === resolvedStatus;
          return (
            <Pressable
              key={s}
              onPress={() => setStatus(s)}
              style={[formStyles.chip, active && formStyles.chipActive]}
            >
              <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>{s}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>
        {JOB_PHASES[resolvedPhase].label} · {resolvedStatus}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  hint: { fontSize: 12, color: '#666' },
});
