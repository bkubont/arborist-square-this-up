/**
 * Basic job time clock (multi-crew Phase 5).
 * Clock in/out against jobs; flag missing clock-outs for review.
 */
import { fail, decode, saveRecord } from './domain.js';

const OPEN_KINDS = new Set(['work', 'travel', 'disposal', 'break', 'errand', 'yard', 'training', 'maintenance', 'other']);

/** Local calendar day YYYY-MM-DD for an ISO timestamp. */
export function calendarDayOf(iso, now = new Date()) {
  const d = iso ? new Date(iso) : now;
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** True when an open entry's clock_in day is before today (forgotten clock-out). */
export function isMissingClockOut(entry, todayKey = calendarDayOf(null)) {
  if (!entry || entry.clock_out) return false;
  const day = calendarDayOf(entry.clock_in);
  return Boolean(day && todayKey && day < todayKey);
}

/**
 * Annotate entries with needs_review when missing clock-out (does not persist).
 * @param {object[]} entries
 * @param {string} [todayKey]
 */
export function flagMissingClockOuts(entries, todayKey = calendarDayOf(null)) {
  return (entries || []).map((e) => {
    if (isMissingClockOut(e, todayKey) || e.needs_review || e.manually_edited) {
      return { ...e, needs_review: true, missing_clock_out: isMissingClockOut(e, todayKey) };
    }
    return { ...e, missing_clock_out: false };
  });
}

/**
 * @param {any} db
 * @param {string} ownerId
 * @param {{ job_id?: string, user_id?: string, open_only?: boolean }} [filters]
 */
export async function listTimeEntries(db, ownerId, filters = {}) {
  const rows = await db.all(
    'SELECT * FROM records WHERE owner_id = ? AND entity = ?',
    [ownerId, 'TimeEntry'],
  );
  let entries = rows.map(decode);
  if (filters.job_id) entries = entries.filter((e) => e.job_id === filters.job_id);
  if (filters.user_id) entries = entries.filter((e) => e.user_id === filters.user_id);
  if (filters.open_only) entries = entries.filter((e) => !e.clock_out);
  return entries;
}

/**
 * @param {object} opts
 * @param {string} opts.job_id
 * @param {string} [opts.user_id]
 * @param {string} [opts.user_email]
 * @param {string} [opts.kind]
 * @param {string} [opts.note]
 * @param {string} [opts.at]
 * @param {object[]} [opts.openEntries] existing open entries for this user (any job)
 */
export function prepareClockIn(opts) {
  const kind = opts.kind || 'work';
  if (!OPEN_KINDS.has(kind)) throw fail(400, 'Invalid time entry kind');
  const clock_in = opts.at || new Date().toISOString();
  const openForUser = (opts.openEntries || []).filter(
    (e) => !e.clock_out && (!opts.user_id || e.user_id === opts.user_id),
  );
  if (openForUser.length) {
    throw fail(409, 'Clock out of your open time entry before clocking in again');
  }
  return {
    job_id: opts.job_id,
    user_id: opts.user_id,
    user_email: opts.user_email,
    clock_in,
    kind,
    note: opts.note || undefined,
  };
}

/**
 * @param {object} entry
 * @param {{ at?: string, note?: string, manually_edited?: boolean }} opts
 */
export function prepareClockOut(entry, opts = {}) {
  if (!entry) throw fail(404, 'Time entry not found');
  if (entry.clock_out) throw fail(409, 'Already clocked out');
  const clock_out = opts.at || new Date().toISOString();
  if (new Date(clock_out).getTime() < new Date(entry.clock_in).getTime()) {
    throw fail(400, 'Clock-out must be after clock-in');
  }
  const today = calendarDayOf(null);
  const wasMissing = isMissingClockOut(entry, today);
  return {
    ...entry,
    clock_out,
    note: opts.note != null && opts.note !== '' ? opts.note : entry.note,
    manually_edited: opts.manually_edited || entry.manually_edited || false,
    needs_review: wasMissing || entry.needs_review || opts.manually_edited || false,
  };
}

/**
 * Persist clock-in and a matching timeline row.
 * @param {any} tx
 * @param {string} ownerId
 * @param {object} payload from prepareClockIn
 */
export async function saveClockIn(tx, ownerId, payload) {
  const entry = await saveRecord(tx, ownerId, 'TimeEntry', payload);
  await saveRecord(tx, ownerId, 'TimelineEntry', {
    job_id: payload.job_id,
    type: 'time_clock',
    category: 'time',
    visibility: 'internal',
    text: `Clocked in (${payload.kind})${payload.user_email ? ` — ${payload.user_email}` : ''}`,
  });
  return entry;
}

/**
 * @param {any} tx
 * @param {string} ownerId
 * @param {object} entry prepared clock-out fields (must include id)
 */
export async function saveClockOut(tx, ownerId, entry) {
  const { id, ...data } = entry;
  const saved = await saveRecord(tx, ownerId, 'TimeEntry', data, id);
  const mins = Math.round(
    (new Date(saved.clock_out).getTime() - new Date(saved.clock_in).getTime()) / 60000,
  );
  await saveRecord(tx, ownerId, 'TimelineEntry', {
    job_id: saved.job_id,
    type: 'time_clock',
    category: 'time',
    visibility: 'internal',
    text: `Clocked out (${saved.kind}, ${mins} min)${saved.needs_review ? ' — needs review' : ''}${saved.user_email ? ` — ${saved.user_email}` : ''}`,
  });
  return saved;
}
