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

import { api, type Job, type WorkItem } from '@/api/client';
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
import {
  TASK_STATUSES,
  isHiddenBuiltInTask,
  sortTasks,
  taskStatus,
  taskStatusLabel,
  taskTitle,
  type TaskStatus,
} from '@/lib/tasks';
import { useWorkTypes } from '@/lib/useWorkTypes';
import {
  normalizeWorkType,
  workTypeColumnKeys,
  workTypeForStorage,
  workTypeLabel,
} from '@/lib/workTypes';

type BoardMode = 'jobs' | 'tasks';
type GroupBy = 'stage' | 'type';

/**
 * Jobs board — Jobs/Tasks × Stage/Type (web JobBoard parity).
 * Move via Move / long-press (no DnD).
 */
export default function JobBoardScreen() {
  const router = useRouter();
  const { types: catalogTypes } = useWorkTypes();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tasks, setTasks] = useState<WorkItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<BoardMode>('jobs');
  const [groupBy, setGroupBy] = useState<GroupBy>('stage');
  const [activePhase, setActivePhase] = useState<JobPhase>('working');
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    const all = await api.entities.Job.listAll('-updated_date');
    setJobs(all.filter(isWorkingJob));
  }, []);

  const loadTasks = useCallback(async () => {
    const items = await api.entities.WorkItem.list('-created_date', 2000);
    setTasks(items.filter(i => !isHiddenBuiltInTask(i)));
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      if (mode === 'tasks') {
        await Promise.all([loadJobs(), loadTasks()]);
      } else {
        await loadJobs();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode, loadJobs, loadTasks]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const jobsById = useMemo(() => Object.fromEntries(jobs.map(j => [j.id, j])), [jobs]);

  const jobColumns = useMemo(() => {
      const phaseJobs = jobs.filter(j => ((j.phase as JobPhase) || 'working') === activePhase);
    if (groupBy === 'type') {
      const keys = workTypeColumnKeys(phaseJobs, j => j.work_type, catalogTypes);
      const map = Object.fromEntries(keys.map(k => [k, [] as Job[]])) as Record<string, Job[]>;
      for (const job of phaseJobs) {
        const key = normalizeWorkType(job.work_type);
        if (map[key]) map[key].push(job);
      }
      return { keys, map, kind: 'type' as const };
    }
    const statuses = statusesForPhase(activePhase);
    const map = Object.fromEntries(statuses.map(s => [s, [] as Job[]])) as Record<string, Job[]>;
    for (const job of phaseJobs) {
      const key = statuses.includes(job.status || '') ? (job.status as string) : statuses[0];
      if (key) map[key].push(job);
    }
    return { keys: statuses, map, kind: 'stage' as const };
  }, [jobs, activePhase, groupBy, catalogTypes]);

  const taskColumns = useMemo(() => {
    const list = sortTasks(tasks || []);
    if (groupBy === 'type') {
      const keys = workTypeColumnKeys(list, t => t.category, catalogTypes);
      const map = Object.fromEntries(keys.map(k => [k, [] as WorkItem[]])) as Record<
        string,
        WorkItem[]
      >;
      for (const item of list) {
        const key = normalizeWorkType(item.category);
        if (map[key]) map[key].push(item);
      }
      return { keys, map, kind: 'type' as const };
    }
    const map = Object.fromEntries(TASK_STATUSES.map(s => [s, [] as WorkItem[]])) as Record<
      string,
      WorkItem[]
    >;
    for (const item of list) {
      map[taskStatus(item)].push(item);
    }
    return { keys: [...TASK_STATUSES], map, kind: 'stage' as const };
  }, [tasks, groupBy, catalogTypes]);

  const moveJobStatus = async (job: Job, nextPhase: JobPhase, nextStatus: string) => {
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

  const moveJobType = async (job: Job, workTypeKey: string) => {
    const work_type = workTypeForStorage(workTypeKey);
    if (normalizeWorkType(job.work_type) === workTypeKey) return;
    const previous = job.work_type;
    setJobs(list => list.map(j => (j.id === job.id ? { ...j, work_type } : j)));
    setSavingId(job.id);
    try {
      await api.entities.Job.update(job.id, { work_type });
    } catch (err) {
      setJobs(list => list.map(j => (j.id === job.id ? { ...j, work_type: previous } : j)));
      Alert.alert('Could not update', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const promptMoveJob = (job: Job) => {
    if (groupBy === 'type') {
      const keys = workTypeColumnKeys(
        jobs.filter(j => ((j.phase as JobPhase) || 'working') === activePhase),
        j => j.work_type,
        catalogTypes,
      );
      Alert.alert('Change work type', job.title, [
        ...keys.map(key => ({
          text: workTypeLabel(key),
          onPress: () => void moveJobType(job, key),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
      return;
    }
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
              onPress: () => void moveJobStatus(job, phase, status),
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

  const moveTaskStatus = async (item: WorkItem, status: TaskStatus) => {
    if (taskStatus(item) === status) return;
    setSavingId(item.id);
    const previous = item.status;
    setTasks(list =>
      (list || []).map(t => (t.id === item.id ? { ...t, status } : t)),
    );
    try {
      await api.entities.WorkItem.update(item.id, { status });
    } catch (err) {
      setTasks(list =>
        (list || []).map(t => (t.id === item.id ? { ...t, status: previous } : t)),
      );
      Alert.alert('Could not update', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const moveTaskType = async (item: WorkItem, workTypeKey: string) => {
    const category = workTypeForStorage(workTypeKey);
    if (normalizeWorkType(item.category) === workTypeKey) return;
    const previous = item.category;
    setSavingId(item.id);
    setTasks(list =>
      (list || []).map(t => (t.id === item.id ? { ...t, category } : t)),
    );
    try {
      await api.entities.WorkItem.update(item.id, { category });
    } catch (err) {
      setTasks(list =>
        (list || []).map(t => (t.id === item.id ? { ...t, category: previous } : t)),
      );
      Alert.alert('Could not update', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const promptMoveTask = (item: WorkItem) => {
    if (groupBy === 'type') {
      const keys = workTypeColumnKeys(tasks || [], t => t.category, catalogTypes);
      Alert.alert('Change work type', taskTitle(item), [
        ...keys.map(key => ({
          text: workTypeLabel(key),
          onPress: () => void moveTaskType(item, key),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
      return;
    }
    Alert.alert('Change status', taskTitle(item), [
      ...TASK_STATUSES.map(status => ({
        text: taskStatusLabel(status),
        onPress: () => void moveTaskStatus(item, status),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  if (loading && !jobs.length && tasks == null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  const phaseJobCount = jobs.filter(j => ((j.phase as JobPhase) || 'working') === activePhase).length;
  const subtitle =
    mode === 'tasks'
      ? groupBy === 'type'
        ? "Every job's tasks — Move to change work type"
        : "Every job's tasks — Move to change status"
      : groupBy === 'type'
        ? 'Working · Payment — group by work type'
        : 'Working · Payment — tap a job to change status';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Board</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Segmented
          label="Board shows"
          value={mode}
          options={[
            { value: 'jobs', label: 'Jobs' },
            { value: 'tasks', label: 'Tasks' },
          ]}
          onChange={next => {
            setMode(next);
            setLoading(true);
          }}
        />
        <Segmented
          label="Group by"
          value={groupBy}
          options={[
            { value: 'stage', label: 'Stage' },
            { value: 'type', label: 'Type' },
          ]}
          onChange={setGroupBy}
        />

        {mode === 'jobs' ? (
          <>
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
            <Text style={styles.count}>
              {phaseJobCount} jobs in {JOB_PHASES[activePhase].label}
            </Text>
          </>
        ) : (
          <Text style={styles.count}>
            {(tasks || []).length} tasks across open jobs
          </Text>
        )}
      </View>

      {mode === 'tasks' && tasks == null ? (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND_HEX.royalBlue} />
        </View>
      ) : (
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
          {mode === 'jobs'
            ? jobColumns.keys.map(key => {
                const column = jobColumns.map[key] || [];
                const title =
                  jobColumns.kind === 'type' ? workTypeLabel(key) : key;
                return (
                  <View key={key} style={styles.column}>
                    <Text style={styles.columnTitle}>
                      {title} · {column.length}
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
                          onLongPress={() => promptMoveJob(job)}
                          delayLongPress={280}
                        >
                          <Text style={styles.cardTitle} numberOfLines={2}>
                            {job.title}
                          </Text>
                          <Text style={styles.cardMeta} numberOfLines={1}>
                            {job.client_name || '—'}
                          </Text>
                          {groupBy === 'type' && job.status ? (
                            <Text style={styles.cardMeta} numberOfLines={1}>
                              {formatJobStatus(job) || job.status}
                            </Text>
                          ) : null}
                          <Pressable
                            onPress={() => promptMoveJob(job)}
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
              })
            : taskColumns.keys.map(key => {
                const column = taskColumns.map[key] || [];
                const title =
                  taskColumns.kind === 'type'
                    ? workTypeLabel(key)
                    : taskStatusLabel(key);
                return (
                  <View key={key} style={styles.column}>
                    <Text style={styles.columnTitle}>
                      {title} · {column.length}
                    </Text>
                    {column.length === 0 ? (
                      <Text style={styles.columnEmpty}>—</Text>
                    ) : (
                      column.map(item => {
                        const job = jobsById[item.job_id];
                        return (
                          <Pressable
                            key={item.id}
                            style={({ pressed }) => [
                              styles.card,
                              pressed && styles.pressed,
                              savingId === item.id && styles.cardSaving,
                            ]}
                            onPress={() =>
                              router.push(`/(app)/work-items/${item.id}`)
                            }
                            onLongPress={() => promptMoveTask(item)}
                            delayLongPress={280}
                          >
                            <Text style={styles.cardTitle} numberOfLines={2}>
                              {taskTitle(item)}
                            </Text>
                            <Text style={styles.cardMeta} numberOfLines={1}>
                              {job?.title || 'Job'}
                            </Text>
                            {groupBy === 'type' ? (
                              <Text style={styles.cardMeta} numberOfLines={1}>
                                {taskStatusLabel(taskStatus(item))}
                              </Text>
                            ) : item.category?.trim() ? (
                              <Text style={styles.cardMeta} numberOfLines={1}>
                                {item.category.trim()}
                              </Text>
                            ) : null}
                            <Pressable
                              onPress={() => promptMoveTask(item)}
                              style={styles.moveBtn}
                              hitSlop={8}
                            >
                              <Text style={styles.moveBtnText}>Move</Text>
                            </Pressable>
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                );
              })}
        </ScrollView>
      )}
    </View>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.segmentWrap} accessibilityLabel={label}>
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segmentBtn, active && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
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
  segmentWrap: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#d8d8e4',
    borderRadius: 10,
    backgroundColor: '#ececf4',
    padding: 3,
    marginTop: 2,
  },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segmentBtnActive: { backgroundColor: '#fff' },
  segmentText: { fontSize: 13, fontWeight: '500', color: '#666' },
  segmentTextActive: { color: BRAND_HEX.royalBlue, fontWeight: '700' },
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
