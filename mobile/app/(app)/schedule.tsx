import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, type Job } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';
import { shortDate } from '@/lib/format';
import { addDays, dayKey, isArchivedJob, parseDay, startOfWeek } from '@/lib/schedule';

type ViewMode = 'day' | 'week' | 'agenda';

/**
 * Schedule — day / week / agenda from job start_date (web Schedule, read-first).
 */
export default function ScheduleScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewMode>('week');
  const [focusKey, setFocusKey] = useState(() => dayKey(new Date()));

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await api.entities.Job.listAll('-updated_date');
      setJobs(rows.filter(j => !isArchivedJob(j)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
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

  const focusDate = useMemo(() => parseDay(focusKey), [focusKey]);
  const todayKey = dayKey(new Date());

  const weekDays = useMemo(() => {
    const start = startOfWeek(focusDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [focusDate]);

  const jobsByDay = useMemo(() => {
    const groups: Record<string, Job[]> = {};
    for (const job of jobs) {
      if (!job.start_date) continue;
      (groups[job.start_date] ||= []).push(job);
    }
    return groups;
  }, [jobs]);

  const scheduled = useMemo(
    () =>
      jobs
        .filter(j => j.start_date)
        .slice()
        .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))),
    [jobs],
  );

  const dayJobs = jobsByDay[focusKey] || [];
  const weekLabel = weekDays.length
    ? `${shortDate(dayKey(weekDays[0]))} – ${shortDate(dayKey(weekDays[6]))}`
    : '';

  const shiftFocus = (days: number) => {
    setFocusKey(dayKey(addDays(focusDate, days)));
  };

  if (loading && !jobs.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
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
      <Text style={styles.title}>Schedule</Text>
      <Text style={styles.subtitle}>
        {view === 'day'
          ? `${dayJobs.length} job${dayJobs.length === 1 ? '' : 's'} · ${focusDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`
          : view === 'week'
            ? `${scheduled.length} dated · ${weekLabel}`
            : `${scheduled.length} dated jobs`}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.toggle}>
        {(['day', 'week', 'agenda'] as ViewMode[]).map(mode => {
          const active = view === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => setView(mode)}
              style={[styles.toggleBtn, active && styles.toggleActive]}
            >
              <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                {mode === 'day' ? 'Day' : mode === 'week' ? 'Week' : 'Agenda'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {view !== 'agenda' ? (
        <View style={styles.navRow}>
          <Pressable onPress={() => shiftFocus(view === 'day' ? -1 : -7)}>
            <Text style={styles.navLink}>‹ Prev</Text>
          </Pressable>
          <Pressable onPress={() => setFocusKey(todayKey)}>
            <Text style={styles.navLink}>Today</Text>
          </Pressable>
          <Pressable onPress={() => shiftFocus(view === 'day' ? 1 : 7)}>
            <Text style={styles.navLink}>Next ›</Text>
          </Pressable>
        </View>
      ) : null}

      {view === 'day' ? (
        <DayList jobs={dayJobs} onOpen={id => router.push(`/(app)/jobs/${id}`)} empty="Nothing scheduled this day." />
      ) : null}

      {view === 'week' ? (
        <View style={styles.week}>
          {weekDays.map(day => {
            const key = dayKey(day);
            const list = jobsByDay[key] || [];
            const isToday = key === todayKey;
            return (
              <Pressable
                key={key}
                style={[styles.weekDay, isToday && styles.weekDayToday]}
                onPress={() => {
                  setFocusKey(key);
                  setView('day');
                }}
              >
                <Text style={[styles.weekDow, isToday && styles.weekDowToday]}>
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </Text>
                <Text style={styles.weekDate}>{day.getDate()}</Text>
                {list.length === 0 ? (
                  <Text style={styles.weekEmpty}>—</Text>
                ) : (
                  list.slice(0, 3).map(job => (
                    <Pressable
                      key={job.id}
                      onPress={() => router.push(`/(app)/jobs/${job.id}`)}
                      style={styles.weekChip}
                    >
                      <Text style={styles.weekChipText} numberOfLines={1}>
                        {job.title}
                      </Text>
                    </Pressable>
                  ))
                )}
                {list.length > 3 ? <Text style={styles.weekMore}>+{list.length - 3}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {view === 'agenda' ? (
        scheduled.length === 0 ? (
          <Text style={styles.empty}>No jobs with a start date yet. Set one when editing a job.</Text>
        ) : (
          <View style={styles.agenda}>
            {scheduled.map(job => (
              <Pressable
                key={job.id}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => router.push(`/(app)/jobs/${job.id}`)}
              >
                <Text style={styles.rowDate}>{shortDate(job.start_date)}</Text>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{job.title}</Text>
                  <Text style={styles.rowMeta}>
                    {job.client_name || '—'} · {job.status || '—'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )
      ) : null}
    </ScrollView>
  );
}

function DayList({
  jobs,
  onOpen,
  empty,
}: {
  jobs: Job[];
  onOpen: (id: string) => void;
  empty: string;
}) {
  if (!jobs.length) return <Text style={styles.empty}>{empty}</Text>;
  return (
    <View style={styles.agenda}>
      {jobs.map(job => (
        <Pressable
          key={job.id}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() => onOpen(job.id)}
        >
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>{job.title}</Text>
            <Text style={styles.rowMeta}>
              {job.client_name || '—'} · {job.status || '—'}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: BRAND_HEX.black },
  subtitle: { fontSize: 13, color: '#666', marginTop: -6 },
  error: { color: '#b00020', fontSize: 14 },
  toggle: { flexDirection: 'row', borderWidth: 1, borderColor: '#d8d8e4', borderRadius: 10, overflow: 'hidden' },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  toggleActive: { backgroundColor: '#e8e8f8' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#666' },
  toggleTextActive: { color: BRAND_HEX.royalBlue },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navLink: { color: BRAND_HEX.royalBlue, fontWeight: '700', fontSize: 15 },
  week: { gap: 8 },
  weekDay: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    padding: 10,
    gap: 4,
  },
  weekDayToday: { borderColor: BRAND_HEX.royalBlue, backgroundColor: '#f4f4fc' },
  weekDow: { fontSize: 12, fontWeight: '700', color: '#666', textTransform: 'uppercase' },
  weekDowToday: { color: BRAND_HEX.royalBlue },
  weekDate: { fontSize: 16, fontWeight: '700', color: BRAND_HEX.black },
  weekEmpty: { fontSize: 12, color: '#ccc' },
  weekChip: {
    backgroundColor: '#e8e8f8',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  weekChipText: { fontSize: 12, fontWeight: '600', color: BRAND_HEX.royalBlue },
  weekMore: { fontSize: 11, color: '#888' },
  agenda: { gap: 8 },
  row: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    padding: 14,
    alignItems: 'center',
  },
  rowDate: { width: 56, fontSize: 12, fontWeight: '700', color: BRAND_HEX.royalBlue },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: BRAND_HEX.black },
  rowMeta: { fontSize: 13, color: '#666' },
  empty: { fontSize: 14, color: '#888', lineHeight: 20 },
  pressed: { opacity: 0.85 },
});
