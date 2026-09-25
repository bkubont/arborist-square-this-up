import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, type Job } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import {
  JOB_PHASE_ORDER,
  JOB_PHASES,
  applyInvoicedGate,
  formatJobStatus,
  isWorkingJob,
  statusesForPhase,
  type JobPhase,
} from '@/lib/jobStatus';

/**
 * Jobs board — Lead / Working / Payment columns with tap-to-move status actions
 * (web JobBoard kanban; v1 uses status actions instead of drag).
 */
export default function JobBoardScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activePhase, setActivePhase] = useState<JobPhase>('working');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const all = await api.entities.Job.listAll('-updated_date');
      setJobs(all.filter(isWorkingJob));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board');
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

  const columns = useMemo(() => {
    const statuses = statusesForPhase(activePhase);
    const map = Object.fromEntries(statuses.map(s => [s, [] as Job[]])) as Record<string, Job[]>;
    for (const job of jobs) {
      const phase = (job.phase as JobPhase) || 'lead';
      if (phase !== activePhase) continue;
      const key = statuses.includes(job.status || '') ? (job.status as string) : statuses[0];
      if (key) map[key].push(job);
    }
    return { statuses, map };
  }, [jobs, activePhase]);

  const moveJob = async (job: Job, nextPhase: JobPhase, nextStatus: string) => {
    const gated = applyInvoicedGate({ phase: nextPhase, status: nextStatus });
    if (job.phase === gated.phase && job.status === gated.status) return;

    const previous = { phase: job.phase, status: job.status };
    setJobs(list =>
      list.map(j => (j.id === job.id ? { ...j, phase: gated.phase, status: gated.status } : j)),
    );
    setSavingId(job.id);
    try {
      await api.entities.Job.update(job.id, gated);
      try {
        const phaseLabel = JOB_PHASES[gated.phase as JobPhase]?.label || gated.phase;
        await api.entities.TimelineEntry.create({
          job_id: job.id,
          type: 'status_change',
          text: `Status changed to ${phaseLabel} · ${gated.status}`,
          category: 'note',
          job_status: gated.status,
        });
      } catch {
        /* non-blocking */
      }
      // Archived terminal statuses drop off the working board
      if (!isWorkingJob({ ...job, ...gated })) {
        setJobs(list => list.filter(j => j.id !== job.id));
      }
    } catch (err) {
      setJobs(list =>
        list.map(j =>
          j.id === job.id ? { ...j, phase: previous.phase, status: previous.status } : j,
        ),
      );
      Alert.alert('Could not update', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const promptMove = (job: Job) => {
    const phaseButtons = JOB_PHASE_ORDER.map(phase => ({
      text: JOB_PHASES[phase].label,
      onPress: () => {
        const statuses = statusesForPhase(phase);
        Alert.alert(
          `Move · ${JOB_PHASES[phase].label}`,
          job.title,
          [
            ...statuses.map(status => ({
              text: status,
              onPress: () => void moveJob(job, phase, status),
            })),
            { text: 'Cancel', style: 'cancel' as const },
          ],
        );
      },
    }));
    Alert.alert('Change status', formatJobStatus(job) || job.status || '—', [
      ...phaseButtons,
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (loading && !jobs.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  const phaseJobCount = jobs.filter(j => ((j.phase as JobPhase) || 'lead') === activePhase).length;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Board</Text>
        <Text style={styles.subtitle}>
          Lead · Working · Payment — tap a job to change status
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.phaseTabs}>
          {JOB_PHASE_ORDER.map(phase => {
            const active = phase === activePhase;
            return (
              <Pressable
                key={phase}
                onPress={() => setActivePhase(phase)}
                style={[styles.phaseTab, active && styles.phaseTabActive]}
              >
                <Text style={[styles.phaseTabText, active && styles.phaseTabTextActive]}>
                  {JOB_PHASES[phase].label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.count}>{phaseJobCount} jobs in {JOB_PHASES[activePhase].label}</Text>
      </View>

      <ScrollView
        horizontal
        style={styles.boardScroll}
        contentContainerStyle={styles.boardContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={BRAND_HEX.royalBlue}
          />
        }
      >
        {columns.statuses.map(status => {
          const column = columns.map[status] || [];
          return (
            <View key={status} style={styles.column}>
              <Text style={styles.columnTitle}>
                {status} · {column.length}
              </Text>
              {column.length === 0 ? (
                <Text style={styles.columnEmpty}>—</Text>
              ) : (
                column.map(job => (
                  <Pressable
                    key={job.id}
                    style={({ pressed }) => [
                      styles.card,
                      pressed && styles.pressed,
                      savingId === job.id && styles.cardSaving,
                    ]}
                    onPress={() => router.push(`/(app)/jobs/${job.id}`)}
                    onLongPress={() => promptMove(job)}
                    delayLongPress={280}
                  >
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {job.title}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {job.client_name || '—'}
                    </Text>
                    <Pressable
                      onPress={() => promptMove(job)}
                      style={styles.moveBtn}
                      hitSlop={8}
                    >
                      <Text style={styles.moveBtnText}>Move</Text>
                    </Pressable>
                  </Pressable>
                ))
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 6 },
  title: { fontSize: 24, fontWeight: '700', color: BRAND_HEX.black },
  subtitle: { fontSize: 13, color: '#666' },
  error: { color: '#b00020', fontSize: 14 },
  phaseTabs: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#d8d8e4',
    borderRadius: 10,
    backgroundColor: '#ececf4',
    padding: 3,
    marginTop: 4,
  },
  phaseTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  phaseTabActive: { backgroundColor: '#fff' },
  phaseTabText: { fontSize: 13, fontWeight: '500', color: '#666' },
  phaseTabTextActive: { color: BRAND_HEX.royalBlue, fontWeight: '700' },
  count: { fontSize: 12, color: '#888', marginTop: 2 },
  boardScroll: { flex: 1 },
  boardContent: { paddingHorizontal: 12, paddingBottom: 24, gap: 10, alignItems: 'flex-start' },
  column: {
    width: 200,
    backgroundColor: '#ececf4',
    borderRadius: 12,
    padding: 10,
    gap: 8,
    minHeight: 120,
  },
  columnTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  columnEmpty: { color: '#bbb', fontSize: 13, paddingVertical: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e0e0ea',
    gap: 4,
  },
  cardSaving: { opacity: 0.55 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: BRAND_HEX.black },
  cardMeta: { fontSize: 12, color: '#666' },
  moveBtn: { alignSelf: 'flex-start', marginTop: 4 },
  moveBtnText: { fontSize: 12, fontWeight: '700', color: BRAND_HEX.royalBlue },
  pressed: { opacity: 0.85 },
});
