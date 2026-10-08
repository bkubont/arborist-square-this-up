/**
 * Today screen payload — ordered jobs for a calendar day (multi-crew Phase 5).
 */
import { decode } from './domain.js';
import { calendarDayOf, flagMissingClockOuts, listTimeEntries } from './timeClock.js';
import { filterJobsForCrewScope } from './membership.js';
import { isCrewScopedRole } from './roles.js';

/** Inclusive date range check (YYYY-MM-DD). */
export function jobTouchesDay(job, dayKey) {
  if (!job?.start_date || !dayKey) return false;
  const end = job.end_date || job.start_date;
  return job.start_date <= dayKey && end >= dayKey;
}

/**
 * Sort: jobs already in progress / active visit first, then by start_date, title.
 * @param {object[]} jobs
 */
export function orderTodayJobs(jobs) {
  return [...jobs].sort((a, b) => {
    const aLive = a.active_visit?.started_at || a.status === 'In progress' ? 0 : 1;
    const bLive = b.active_visit?.started_at || b.status === 'In progress' ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    const ad = a.start_date || '';
    const bd = b.start_date || '';
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

/**
 * Build the Today workspace response for one company / day.
 * @param {any} db
 * @param {{
 *   ownerId: string,
 *   role: string,
 *   userId: string,
 *   crewIds?: string[],
 *   date?: string,
 * }} opts
 */
export async function buildTodayPayload(db, opts) {
  const date = opts.date || calendarDayOf(null);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw Object.assign(new Error('Invalid date'), { status: 400 });
  }

  const jobRows = await db.all(
    'SELECT * FROM records WHERE owner_id = ? AND entity = ?',
    [opts.ownerId, 'Job'],
  );
  let jobs = jobRows.map(decode).filter((j) => !j.archived_at && jobTouchesDay(j, date));
  if (isCrewScopedRole(opts.role)) {
    jobs = filterJobsForCrewScope(jobs, opts.crewIds || []);
  }
  jobs = orderTodayJobs(jobs);

  const [crewRows, equipmentRows, clientRows, propertyRows, workItemRows] = await Promise.all([
    db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ?', [opts.ownerId, 'Crew']),
    db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ?', [opts.ownerId, 'Equipment']),
    db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ?', [opts.ownerId, 'Client']),
    db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ?', [opts.ownerId, 'Property']),
    db.all('SELECT * FROM records WHERE owner_id = ? AND entity = ?', [opts.ownerId, 'WorkItem']),
  ]);

  const crewsById = Object.fromEntries(crewRows.map(decode).map((c) => [c.id, c]));
  const equipmentById = Object.fromEntries(equipmentRows.map(decode).map((e) => [e.id, e]));
  const clientsById = Object.fromEntries(clientRows.map(decode).map((c) => [c.id, c]));
  const propertiesById = Object.fromEntries(propertyRows.map(decode).map((p) => [p.id, p]));
  const workItems = workItemRows.map(decode);

  const allTime = flagMissingClockOuts(await listTimeEntries(db, opts.ownerId), date);
  const missing_clock_outs = allTime.filter((e) => e.missing_clock_out || (e.needs_review && !e.clock_out));
  const openForUser = allTime.filter((e) => !e.clock_out && e.user_id === opts.userId);

  const enriched = jobs.map((job) => {
    const crew = job.crew_id ? crewsById[job.crew_id] || null : null;
    const equipment = (job.equipment_ids || [])
      .map((id) => equipmentById[id])
      .filter(Boolean);
    const client = job.client_id ? clientsById[job.client_id] || null : null;
    const property = job.property_id ? propertiesById[job.property_id] || null : null;
    const jobTasks = workItems.filter((w) => w.job_id === job.id);
    const open_tasks = jobTasks.filter((w) => {
      const s = String(w.status || '').toLowerCase();
      return s !== 'done' && s !== 'completed' && s !== 'cancelled' && s !== 'finish';
    });
    const jobTime = allTime.filter((e) => e.job_id === job.id);
    return {
      ...job,
      crew: crew
        ? {
          id: crew.id,
          name: crew.name,
          leader_user_id: crew.leader_user_id,
          member_user_ids: crew.member_user_ids || [],
          capability_tags: crew.capability_tags || [],
        }
        : null,
      equipment: equipment.map((e) => ({
        id: e.id,
        name: e.name,
        kind: e.kind,
        capability_tags: e.capability_tags || [],
      })),
      client: client
        ? {
          id: client.id,
          name: client.name,
          phone: client.phone,
          email: client.email,
          preferred_contact_method: client.preferred_contact_method,
        }
        : null,
      property: property
        ? {
          id: property.id,
          name: property.name,
          address: property.address,
          city: property.city,
          state: property.state,
          zip: property.zip,
          access_notes: property.access_notes,
          hazard_notes: property.hazard_notes,
          parking_notes: property.parking_notes,
          pets_notes: property.pets_notes,
          special_instructions: property.special_instructions,
        }
        : null,
      open_task_count: open_tasks.length,
      time_entries: jobTime,
      open_time_entries: jobTime.filter((e) => !e.clock_out),
    };
  });

  return {
    date,
    jobs: enriched,
    missing_clock_outs,
    my_open_time_entry: openForUser[0] || null,
  };
}
