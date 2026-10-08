/**
 * Multi-crew schedule overlap detection (Phase 4).
 * Treats crews and major machines as reservable resources; warns on overlapping assignments.
 */

/**
 * Inclusive calendar-day range as [start, end] YYYY-MM-DD.
 * Missing end_date → single-day reservation on start_date.
 * @param {{ start_date?: string, end_date?: string }} job
 * @returns {[string, string]|null}
 */
export function jobDateRange(job = {}) {
  const start = String(job.start_date || '').trim();
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const endRaw = String(job.end_date || '').trim();
  const end = endRaw && /^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? endRaw : start;
  return end < start ? [end, start] : [start, end];
}

/** True when two inclusive YYYY-MM-DD ranges overlap. */
export function dateRangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !bStart) return false;
  const aE = aEnd || aStart;
  const bE = bEnd || bStart;
  return aStart <= bE && bStart <= aE;
}

/**
 * @param {{ start_date?: string, end_date?: string }} a
 * @param {{ start_date?: string, end_date?: string }} b
 */
export function jobsOverlapInTime(a, b) {
  const ra = jobDateRange(a);
  const rb = jobDateRange(b);
  if (!ra || !rb) return false;
  return dateRangesOverlap(ra[0], ra[1], rb[0], rb[1]);
}

/**
 * Build conflict warnings for a candidate reservation against existing dated jobs.
 * Soft warnings only — callers decide whether to save anyway.
 *
 * @param {object[]} existingJobs — company jobs (caller filters archived / same company)
 * @param {{
 *   id?: string,
 *   start_date?: string,
 *   end_date?: string,
 *   crew_id?: string,
 *   equipment_ids?: string[],
 * }} candidate
 * @param {{
 *   crewsById?: Record<string, { id: string, name?: string }>,
 *   equipmentById?: Record<string, { id: string, name?: string }>,
 * }} [lookups]
 * @returns {{
 *   ok: boolean,
 *   crewConflicts: object[],
 *   equipmentConflicts: object[],
 *   warnings: string[],
 * }}
 */
export function findScheduleConflicts(existingJobs = [], candidate = {}, lookups = {}) {
  const crewConflicts = [];
  const equipmentConflicts = [];
  const warnings = [];
  const range = jobDateRange(candidate);
  if (!range) {
    return { ok: true, crewConflicts, equipmentConflicts, warnings };
  }

  const candidateCrew = candidate.crew_id || null;
  const candidateEquip = new Set(
    (candidate.equipment_ids || []).filter(Boolean).map(String),
  );
  const excludeId = candidate.id || null;
  const crewsById = lookups.crewsById || {};
  const equipmentById = lookups.equipmentById || {};

  for (const job of existingJobs) {
    if (!job || job.archived_at) continue;
    if (excludeId && job.id === excludeId) continue;
    if (!jobsOverlapInTime(candidate, job)) continue;

    if (candidateCrew && job.crew_id && job.crew_id === candidateCrew) {
      const crewName = crewsById[candidateCrew]?.name || 'crew';
      const entry = {
        type: 'crew',
        resource_id: candidateCrew,
        resource_name: crewName,
        job_id: job.id,
        job_title: job.title || 'Untitled job',
        start_date: job.start_date,
        end_date: job.end_date || job.start_date,
      };
      crewConflicts.push(entry);
      warnings.push(
        `Double-booked ${crewName}: overlaps “${entry.job_title}” (${entry.start_date}`
        + (entry.end_date !== entry.start_date ? `–${entry.end_date}` : '')
        + ')',
      );
    }

    const otherEquip = new Set((job.equipment_ids || []).filter(Boolean).map(String));
    for (const eid of candidateEquip) {
      if (!otherEquip.has(eid)) continue;
      const equipName = equipmentById[eid]?.name || 'equipment';
      const entry = {
        type: 'equipment',
        resource_id: eid,
        resource_name: equipName,
        job_id: job.id,
        job_title: job.title || 'Untitled job',
        start_date: job.start_date,
        end_date: job.end_date || job.start_date,
      };
      equipmentConflicts.push(entry);
      warnings.push(
        `Double-booked ${equipName}: overlaps “${entry.job_title}” (${entry.start_date}`
        + (entry.end_date !== entry.start_date ? `–${entry.end_date}` : '')
        + ')',
      );
    }
  }

  return {
    ok: crewConflicts.length === 0 && equipmentConflicts.length === 0,
    crewConflicts,
    equipmentConflicts,
    warnings,
  };
}

/**
 * Schedule fields changed enough to re-check conflicts.
 * @param {object} previous
 * @param {object} next
 */
export function scheduleAssignmentChanged(previous = {}, next = {}) {
  const keys = ['start_date', 'end_date', 'crew_id'];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(next, key) && (next[key] || '') !== (previous[key] || '')) {
      return true;
    }
  }
  if (Object.prototype.hasOwnProperty.call(next, 'equipment_ids')) {
    const a = [...(previous.equipment_ids || [])].map(String).sort().join(',');
    const b = [...(next.equipment_ids || [])].map(String).sort().join(',');
    if (a !== b) return true;
  }
  return false;
}
