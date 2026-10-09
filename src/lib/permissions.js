/**
 * Client-side permission helpers. Server remains authoritative;
 * /auth/me returns permissions[] and role for UI gating.
 */

/** @param {{ permissions?: string[], role?: string } | null | undefined} user */
export function userCan(user, permission) {
  if (!user) return false;
  if (Array.isArray(user.permissions)) return user.permissions.includes(permission);
  return false;
}

export const ROLE_LABELS = {
  owner: 'Owner',
  operations_manager: 'Operations manager',
  office_admin: 'Office admin',
  estimator: 'Estimator',
  crew_leader: 'Crew leader',
  crew_member: 'Crew member',
  bookkeeper: 'Bookkeeper',
};

/** Nav path → permission (null = any authenticated member). */
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
  '/today': 'view_jobs',
  '/jobs/ready-to-schedule': 'view_jobs',
  '/expenses': 'view_expenses',
  '/receipts': 'view_expenses',
  '/reports': 'view_reports',
  '/reports/crews': 'view_reports',
  '/settings': 'manage_company_profile',
  '/team': 'manage_members',
};

/** @param {{ permissions?: string[] } | null | undefined} user @param {string} path */
export function canAccessPath(user, path) {
  const needed = NAV_PERMISSIONS[path];
  if (needed == null) return true;
  return userCan(user, needed);
}
