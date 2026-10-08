import { fail } from './domain.js';
import {
  can,
  isCrewScopedRole,
  ENTITY_PERMISSIONS,
  canViewCrewRoster,
} from './roles.js';
import {
  crewIdsForUser,
  filterJobsForCrewScope,
  jobVisibleToCrew,
  jobIdFromRecord,
  loadJob,
} from './membership.js';

/**
 * Express middleware: require a permission on req.role.
 * @param {import('./roles.js').Permission} permission
 */
export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!can(req.role, permission)) throw fail(403, 'You do not have permission for this action');
    next();
  };
}

/**
 * Assert entity view/edit permission for the request role.
 * @param {string} entity
 * @param {'view'|'edit'} mode
 * @param {string} role
 */
export function assertEntityPermission(entity, mode, role) {
  if (entity === 'Crew') {
    if (mode === 'view' && canViewCrewRoster(role)) return;
    if (mode === 'edit' && can(role, 'manage_crews')) return;
    throw fail(403, 'You do not have permission for this action');
  }
  const spec = ENTITY_PERMISSIONS[entity];
  if (!spec) return;
  const needed = spec[mode];
  if (!can(role, needed)) throw fail(403, 'You do not have permission for this action');
}

/**
 * Load crew ids onto the request (cached per request).
 * @param {any} db
 * @param {import('express').Request} req
 */
export async function ensureCrewIds(db, req) {
  if (req.crewIds) return req.crewIds;
  if (!isCrewScopedRole(req.role)) {
    req.crewIds = [];
    return req.crewIds;
  }
  req.crewIds = await crewIdsForUser(db, req.ownerId, req.user.id);
  return req.crewIds;
}

/**
 * Filter a list of entity records for crew-scoped roles.
 * @param {any} db
 * @param {import('express').Request} req
 * @param {string} entity
 * @param {object[]} records
 */
export async function filterRecordsForRole(db, req, entity, records) {
  if (!isCrewScopedRole(req.role)) return records;
  const crewIds = await ensureCrewIds(db, req);
  if (entity === 'Job') return filterJobsForCrewScope(records, crewIds);
  if (entity === 'Crew') {
    const allowed = new Set(crewIds);
    return records.filter((c) => allowed.has(c.id));
  }
  if (entity === 'Client' || entity === 'CompanyProfile' || entity === 'Expense') {
    // Crew roles do not browse company-wide clients/expenses/settings.
    if (entity === 'Expense' && !can(req.role, 'view_expenses')) return [];
    if (entity === 'Client' && !can(req.role, 'view_clients')) return [];
    if (entity === 'CompanyProfile') return [];
  }
  // Job children: keep rows whose job is visible.
  const jobIds = new Set();
  for (const record of records) {
    const jid = jobIdFromRecord(entity, record);
    if (jid) jobIds.add(jid);
  }
  if (!jobIds.size) {
    // Payments etc. without job_id — hide from crew scope.
    return records.filter((r) => {
      const jid = jobIdFromRecord(entity, r);
      return jid && jobVisibleToCrew({ crew_id: null, id: jid }, crewIds);
    });
  }
  const visibleJobIds = new Set();
  for (const jid of jobIds) {
    try {
      const job = await loadJob(db, req.ownerId, jid);
      if (jobVisibleToCrew(job, crewIds)) visibleJobIds.add(jid);
    } catch {
      // missing job — skip
    }
  }
  return records.filter((r) => {
    const jid = jobIdFromRecord(entity, r);
    return jid && visibleJobIds.has(jid);
  });
}

/**
 * Assert a single record is visible to the requester.
 * @param {any} db
 * @param {import('express').Request} req
 * @param {string} entity
 * @param {object} record
 */
export async function assertRecordVisible(db, req, entity, record) {
  assertEntityPermission(entity, 'view', req.role);
  if (!isCrewScopedRole(req.role)) return;
  const crewIds = await ensureCrewIds(db, req);
  if (entity === 'Crew') {
    if (!crewIds.includes(record.id)) throw fail(403, 'You do not have access to this crew');
    return;
  }
  if (entity === 'Job') {
    if (!jobVisibleToCrew(record, crewIds)) throw fail(403, 'You do not have access to this job');
    return;
  }
  const jid = jobIdFromRecord(entity, record);
  if (!jid) throw fail(403, 'You do not have access to this record');
  const job = await loadJob(db, req.ownerId, jid);
  if (!jobVisibleToCrew(job, crewIds)) throw fail(403, 'You do not have access to this job');
}

/**
 * When crew-scoped users create job children, the job must be assigned to their crew.
 * Assigning crew_id on Job requires assign_crew (office) — crew roles cannot reassign.
 * @param {any} db
 * @param {import('express').Request} req
 * @param {string} entity
 * @param {object} body
 * @param {object|null} previous
 */
export async function assertWriteAllowed(db, req, entity, body, previous = null) {
  assertEntityPermission(entity, 'edit', req.role);
  if (entity === 'Job' && body && Object.prototype.hasOwnProperty.call(body, 'crew_id')) {
    const nextCrew = body.crew_id === '' || body.crew_id == null ? undefined : body.crew_id;
    const prevCrew = previous?.crew_id;
    if (nextCrew !== prevCrew && !can(req.role, 'assign_crew')) {
      throw fail(403, 'You do not have permission to assign crews');
    }
    if (nextCrew) {
      const { getRecord } = await import('./domain.js');
      await getRecord(db, req.ownerId, 'Crew', nextCrew);
    }
  }
  if (!isCrewScopedRole(req.role)) return;
  const crewIds = await ensureCrewIds(db, req);
  if (entity === 'Job') {
    // Crew can edit jobs already on their crew; creating unassigned jobs is blocked.
    const crewId = body?.crew_id ?? previous?.crew_id;
    if (!crewId || !crewIds.includes(crewId)) {
      throw fail(403, 'Crew roles can only work on jobs assigned to their crew');
    }
    return;
  }
  const jid = body?.job_id || previous?.job_id || (entity === 'Job' ? previous?.id : null);
  if (jid) {
    const job = await loadJob(db, req.ownerId, jid);
    if (!jobVisibleToCrew(job, crewIds)) throw fail(403, 'You do not have access to this job');
  }
}
