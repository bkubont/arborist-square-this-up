/**
 * Company roles and permission matrix (PDF §8 / multi-crew Phase 1).
 * Tenant data is owned by company_id (= the owner's users.id).
 */

export const ROLES = /** @type {const} */ ([
  'owner',
  'operations_manager',
  'office_admin',
  'estimator',
  'crew_leader',
  'crew_member',
  'bookkeeper',
]);

/** @typedef {(typeof ROLES)[number]} Role */

/** Human labels for UI / invites. */
export const ROLE_LABELS = {
  owner: 'Owner',
  operations_manager: 'Operations manager',
  office_admin: 'Office admin',
  estimator: 'Estimator',
  crew_leader: 'Crew leader',
  crew_member: 'Crew member',
  bookkeeper: 'Bookkeeper',
};

/** Roles that may be assigned when inviting a member (owner is created with the company). */
export const INVITABLE_ROLES = ROLES.filter((r) => r !== 'owner');

/**
 * Permission keys used by API middleware and UI gating.
 * @typedef {'manage_members'|'manage_crews'|'manage_settings'|'manage_company_profile'|'view_clients'|'edit_clients'|'view_jobs'|'edit_jobs'|'assign_crew'|'view_estimates'|'edit_estimates'|'view_money'|'edit_money'|'view_expenses'|'edit_expenses'|'view_reports'|'export_backup'|'delete_account'|'view_all_crews'} Permission
 */

/** @type {Record<Role, Set<Permission>>} */
const MATRIX = {
  owner: new Set([
    'manage_members', 'manage_crews', 'manage_settings', 'manage_company_profile',
    'view_clients', 'edit_clients', 'view_jobs', 'edit_jobs', 'assign_crew',
    'view_estimates', 'edit_estimates', 'view_money', 'edit_money',
    'view_expenses', 'edit_expenses', 'view_reports', 'export_backup',
    'delete_account', 'view_all_crews',
  ]),
  operations_manager: new Set([
    'manage_members', 'manage_crews', 'manage_settings',
    'view_clients', 'edit_clients', 'view_jobs', 'edit_jobs', 'assign_crew',
    'view_estimates', 'edit_estimates', 'view_money', 'edit_money',
    'view_expenses', 'edit_expenses', 'view_reports', 'export_backup',
    'view_all_crews',
  ]),
  office_admin: new Set([
    'manage_members', 'manage_crews',
    'view_clients', 'edit_clients', 'view_jobs', 'edit_jobs', 'assign_crew',
    'view_estimates', 'edit_estimates', 'view_money', 'edit_money',
    'view_expenses', 'edit_expenses', 'view_reports', 'view_all_crews',
  ]),
  estimator: new Set([
    'view_clients', 'edit_clients', 'view_jobs', 'edit_jobs',
    'view_estimates', 'edit_estimates', 'view_all_crews',
  ]),
  crew_leader: new Set([
    'view_jobs', 'edit_jobs', 'view_estimates',
  ]),
  crew_member: new Set([
    'view_jobs', 'edit_jobs',
  ]),
  bookkeeper: new Set([
    'view_clients', 'view_jobs', 'view_estimates',
    'view_money', 'edit_money', 'view_expenses', 'edit_expenses',
    'view_reports', 'export_backup', 'view_all_crews',
  ]),
};

/** @param {string} role */
export function isRole(role) {
  return ROLES.includes(/** @type {Role} */ (role));
}

/**
 * @param {string} role
 * @param {Permission} permission
 */
export function can(role, permission) {
  const set = MATRIX[/** @type {Role} */ (role)];
  return Boolean(set?.has(permission));
}

/** Crew roles only see jobs assigned to their crew(s). */
export function isCrewScopedRole(role) {
  return role === 'crew_leader' || role === 'crew_member';
}

/**
 * Nav / screen keys → required permission (UI gating).
 * Missing key = visible to every authenticated member.
 */
export const NAV_PERMISSIONS = {
  '/': null,
  '/clients': 'view_clients',
  '/jobs': 'view_jobs',
  '/jobs/active': 'view_jobs',
  '/jobs/board': 'view_jobs',
  '/jobs/archive': 'view_jobs',
  '/jobs/outstanding': 'view_money',
  '/jobs/action-items': 'view_jobs',
  '/estimates': 'view_estimates',
  '/schedule': 'view_jobs',
  '/expenses': 'view_expenses',
  '/receipts': 'view_expenses',
  '/reports': 'view_reports',
  '/settings': 'manage_company_profile',
  '/team': 'manage_members',
  '/crews': 'manage_crews',
};

/**
 * Entity → create/update/delete permission (list/get use view_*).
 * @type {Record<string, { view: Permission, edit: Permission }>}
 */
export const ENTITY_PERMISSIONS = {
  Client: { view: 'view_clients', edit: 'edit_clients' },
  Property: { view: 'view_clients', edit: 'edit_clients' },
  Job: { view: 'view_jobs', edit: 'edit_jobs' },
  TimelineEntry: { view: 'view_jobs', edit: 'edit_jobs' },
  CompanyProfile: { view: 'manage_company_profile', edit: 'manage_company_profile' },
  Estimate: { view: 'view_estimates', edit: 'edit_estimates' },
  MaterialOrder: { view: 'view_jobs', edit: 'edit_jobs' },
  WorkItem: { view: 'view_jobs', edit: 'edit_jobs' },
  ChangeOrder: { view: 'view_estimates', edit: 'edit_estimates' },
  Invoice: { view: 'view_money', edit: 'edit_money' },
  PunchList: { view: 'view_jobs', edit: 'edit_jobs' },
  Expense: { view: 'view_expenses', edit: 'edit_expenses' },
  TreeInventory: { view: 'view_jobs', edit: 'edit_jobs' },
  Payment: { view: 'view_money', edit: 'edit_money' },
  Crew: { view: 'manage_crews', edit: 'manage_crews' },
};

/** Roles that can view Crew records without manage_crews (read-only roster). */
export function canViewCrewRoster(role) {
  return can(role, 'manage_crews') || can(role, 'view_all_crews') || isCrewScopedRole(role);
}

/** Stable permission list for a role (for /auth/me). */
export function permissionsForRole(role) {
  const keys = [
    'manage_members', 'manage_crews', 'manage_settings', 'manage_company_profile',
    'view_clients', 'edit_clients', 'view_jobs', 'edit_jobs', 'assign_crew',
    'view_estimates', 'edit_estimates', 'view_money', 'edit_money',
    'view_expenses', 'edit_expenses', 'view_reports', 'export_backup',
    'delete_account', 'view_all_crews',
  ];
  return keys.filter((k) => can(role, /** @type {any} */ (k)));
}
