import { randomUUID } from 'node:crypto';
import { emailSchema, hash, token } from './security.js';
import { ROLES, INVITABLE_ROLES, isRole, can, isCrewScopedRole, permissionsForRole } from './roles.js';
import { fail, decode, saveRecord, getRecord } from './domain.js';

export { isCrewScopedRole, can, ROLES, INVITABLE_ROLES, permissionsForRole };

/**
 * Ensure every user has a company membership. Solo accounts are owners of themselves.
 * @param {any} db
 * @param {string} userId
 */
export async function ensureMembership(db, userId) {
  const [existing] = await db.all(
    'SELECT user_id, company_id, role, created_date FROM company_members WHERE user_id = ?',
    [userId],
  );
  if (existing) return existing;
  const created_date = new Date().toISOString();
  await db.run(
    'INSERT INTO company_members (user_id, company_id, role, created_date) VALUES (?, ?, ?, ?)',
    [userId, userId, 'owner', created_date],
  );
  return { user_id: userId, company_id: userId, role: 'owner', created_date };
}

/**
 * @param {any} db
 * @param {string} userId
 */
export async function getMembership(db, userId) {
  const [row] = await db.all(
    'SELECT user_id, company_id, role, created_date FROM company_members WHERE user_id = ?',
    [userId],
  );
  return row || null;
}

/**
 * Backfill owners for users missing membership (migration / startup).
 * @param {any} db
 */
export async function backfillOwnerMemberships(db) {
  const users = await db.all('SELECT id, created_date FROM users');
  for (const user of users) {
    const [row] = await db.all('SELECT user_id FROM company_members WHERE user_id = ?', [user.id]);
    if (!row) {
      await db.run(
        'INSERT INTO company_members (user_id, company_id, role, created_date) VALUES (?, ?, ?, ?)',
        [user.id, user.id, 'owner', user.created_date || new Date().toISOString()],
      );
    }
  }
}

/**
 * @param {any} db
 * @param {string} companyId
 */
export async function listMembers(db, companyId) {
  const rows = await db.all(
    `SELECT m.user_id, m.company_id, m.role, m.created_date, u.email
     FROM company_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.company_id = ?
     ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, u.email ASC`,
    [companyId],
  );
  return rows.map((r) => ({
    user_id: r.user_id,
    company_id: r.company_id,
    role: r.role,
    email: r.email,
    created_date: r.created_date,
  }));
}

/**
 * Create a member invite (does not create a user yet).
 * @param {any} db
 * @param {{ companyId: string, email: string, role: string, invitedBy: string, origin: string }} opts
 */
export async function createMemberInvite(db, { companyId, email, role, invitedBy, origin }) {
  const normalized = emailSchema.parse(email);
  if (!INVITABLE_ROLES.includes(/** @type {any} */ (role))) {
    throw fail(400, 'Invalid role for invitation');
  }
  const [existingUser] = await db.all('SELECT id FROM users WHERE email = ?', [normalized]);
  if (existingUser) {
    const membership = await getMembership(db, existingUser.id);
    if (membership) throw fail(409, 'That email already has an account');
  }
  const value = token();
  const expires_at = Date.now() + 48 * 60 * 60 * 1000;
  const created_date = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.run(
      'DELETE FROM member_invites WHERE company_id = ? AND email = ?',
      [companyId, normalized],
    );
    await tx.run(
      `INSERT INTO member_invites
        (token_hash, company_id, email, role, invited_by, expires_at, created_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [hash(value), companyId, normalized, role, invitedBy, expires_at, created_date],
    );
  });
  const inviteUrl = `${origin}/register?invite=${value}&email=${encodeURIComponent(normalized)}&kind=member`;
  return { email: normalized, role, inviteUrl, expires_at };
}

/**
 * @param {any} db
 * @param {string} companyId
 */
export async function listMemberInvites(db, companyId) {
  await db.run('DELETE FROM member_invites WHERE expires_at < ?', [Date.now()]);
  return db.all(
    `SELECT email, role, invited_by, expires_at, created_date
     FROM member_invites WHERE company_id = ? ORDER BY created_date DESC`,
    [companyId],
  );
}

/**
 * Accept a member invite during registration. Returns null if token is a company (solo) invite.
 * @param {any} tx
 * @param {{ inviteToken: string, email: string, userId: string }} opts
 */
export async function acceptMemberInvite(tx, { inviteToken, email, userId }) {
  const [row] = await tx.all(
    `SELECT * FROM member_invites
     WHERE token_hash = ? AND email = ? AND expires_at > ?`,
    [hash(inviteToken), email, Date.now()],
  );
  if (!row) return null;
  const created_date = new Date().toISOString();
  await tx.run(
    'INSERT INTO company_members (user_id, company_id, role, created_date) VALUES (?, ?, ?, ?)',
    [userId, row.company_id, row.role, created_date],
  );
  await tx.run('DELETE FROM member_invites WHERE token_hash = ?', [hash(inviteToken)]);
  return { company_id: row.company_id, role: row.role };
}

/**
 * Peek whether an invite token is a pending member invite (for register UI).
 * @param {any} db
 * @param {string} inviteToken
 * @param {string} email
 */
export async function peekMemberInvite(db, inviteToken, email) {
  try {
    const normalized = emailSchema.parse(email);
    const [row] = await db.all(
      `SELECT role, company_id, expires_at FROM member_invites
       WHERE token_hash = ? AND email = ? AND expires_at > ?`,
      [hash(inviteToken), normalized, Date.now()],
    );
    return row || null;
  } catch {
    return null;
  }
}

/**
 * @param {any} db
 * @param {string} companyId
 * @param {string} targetUserId
 * @param {string} newRole
 * @param {string} actorUserId
 */
export async function updateMemberRole(db, companyId, targetUserId, newRole, actorUserId) {
  if (!isRole(newRole) || newRole === 'owner') throw fail(400, 'Invalid role');
  const [target] = await db.all(
    'SELECT * FROM company_members WHERE company_id = ? AND user_id = ?',
    [companyId, targetUserId],
  );
  if (!target) throw fail(404, 'Member not found');
  if (target.role === 'owner') throw fail(400, 'Cannot change the owner role');
  if (targetUserId === actorUserId) throw fail(400, 'Cannot change your own role');
  await db.run(
    'UPDATE company_members SET role = ? WHERE user_id = ? AND company_id = ?',
    [newRole, targetUserId, companyId],
  );
  return { user_id: targetUserId, company_id: companyId, role: newRole };
}

/**
 * Remove a non-owner member from the company (and delete their user row).
 * @param {any} db
 * @param {string} companyId
 * @param {string} targetUserId
 * @param {string} actorUserId
 */
export async function removeMember(db, companyId, targetUserId, actorUserId) {
  if (targetUserId === actorUserId) throw fail(400, 'Cannot remove yourself this way');
  const [target] = await db.all(
    'SELECT * FROM company_members WHERE company_id = ? AND user_id = ?',
    [companyId, targetUserId],
  );
  if (!target) throw fail(404, 'Member not found');
  if (target.role === 'owner') throw fail(400, 'Cannot remove the company owner');
  await db.transaction(async (tx) => {
    await stripUserFromCrews(tx, companyId, targetUserId);
    await tx.run('DELETE FROM company_members WHERE user_id = ?', [targetUserId]);
    await tx.run('DELETE FROM sessions WHERE user_id = ?', [targetUserId]);
    await tx.run('DELETE FROM users WHERE id = ?', [targetUserId]);
  });
  return { ok: true };
}

/**
 * Crew ids the user belongs to (as leader or member).
 * @param {any} db
 * @param {string} companyId
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function crewIdsForUser(db, companyId, userId) {
  const rows = await db.all(
    'SELECT id, data FROM records WHERE owner_id = ? AND entity = ?',
    [companyId, 'Crew'],
  );
  const ids = [];
  for (const row of rows) {
    const crew = decode(row);
    if (crew.leader_user_id === userId) {
      ids.push(crew.id);
      continue;
    }
    if (Array.isArray(crew.member_user_ids) && crew.member_user_ids.includes(userId)) {
      ids.push(crew.id);
    }
  }
  return ids;
}

/**
 * @param {object[]} jobs
 * @param {string[]} allowedCrewIds
 */
export function filterJobsForCrewScope(jobs, allowedCrewIds) {
  const allowed = new Set(allowedCrewIds);
  return jobs.filter((job) => job.crew_id && allowed.has(job.crew_id));
}

/**
 * @param {object} job
 * @param {string[]} allowedCrewIds
 */
export function jobVisibleToCrew(job, allowedCrewIds) {
  return Boolean(job?.crew_id && allowedCrewIds.includes(job.crew_id));
}

/**
 * @param {string} entity
 * @param {object} record
 */
export function jobIdFromRecord(entity, record) {
  if (entity === 'Job') return record.id;
  if (record?.job_id) return record.job_id;
  return null;
}

/**
 * Validate crew payload membership against company members.
 * @param {any} db
 * @param {string} companyId
 * @param {{ leader_user_id?: string, member_user_ids?: string[] }} data
 */
export async function validateCrewMembers(db, companyId, data) {
  const members = await listMembers(db, companyId);
  const ids = new Set(members.map((m) => m.user_id));
  if (data.leader_user_id && !ids.has(data.leader_user_id)) {
    throw fail(400, 'Crew leader must be a company member');
  }
  if (Array.isArray(data.member_user_ids)) {
    for (const mid of data.member_user_ids) {
      if (!ids.has(mid)) throw fail(400, 'Crew member must be a company member');
    }
  }
}

/**
 * Remove a user from all crew leader/member lists in the company.
 * @param {any} tx
 * @param {string} companyId
 * @param {string} userId
 */
export async function stripUserFromCrews(tx, companyId, userId) {
  const rows = await tx.all(
    'SELECT id, data FROM records WHERE owner_id = ? AND entity = ?',
    [companyId, 'Crew'],
  );
  for (const row of rows) {
    const crew = JSON.parse(row.data);
    let changed = false;
    let leader = crew.leader_user_id;
    if (leader === userId) {
      leader = undefined;
      changed = true;
    }
    let member_user_ids = Array.isArray(crew.member_user_ids) ? [...crew.member_user_ids] : [];
    const next = member_user_ids.filter((id) => id !== userId);
    if (next.length !== member_user_ids.length) {
      member_user_ids = next;
      changed = true;
    }
    if (changed) {
      await saveRecord(tx, companyId, 'Crew', {
        name: crew.name,
        leader_user_id: leader,
        member_user_ids,
        capability_tags: crew.capability_tags || [],
      }, row.id);
    }
  }
}

/**
 * @param {{ id: string, email: string, created_date?: string }} user
 * @param {{ company_id: string, role: string }} membership
 * @param {string[]} [crewIds]
 */
export function toPublicUser(user, membership, crewIds = []) {
  return {
    id: user.id,
    email: user.email,
    created_date: user.created_date,
    company_id: membership.company_id,
    role: membership.role,
    crew_ids: crewIds,
    permissions: permissionsForRole(membership.role),
  };
}

/**
 * Seed helper: create a user + membership under an existing company (tests / local demo).
 * @param {any} db
 * @param {{ email: string, passwordHash: string, companyId: string, role: string }} opts
 */
export async function createMemberUser(db, { email, passwordHash, companyId, role }) {
  const normalized = emailSchema.parse(email);
  if (!isRole(role) || role === 'owner') throw new Error('Invalid member role');
  const userId = randomUUID();
  const created_date = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.run(
      'INSERT INTO users (id, email, password_hash, created_date) VALUES (?, ?, ?, ?)',
      [userId, normalized, passwordHash, created_date],
    );
    await tx.run(
      'INSERT INTO company_members (user_id, company_id, role, created_date) VALUES (?, ?, ?, ?)',
      [userId, companyId, role, created_date],
    );
  });
  return { id: userId, email: normalized, company_id: companyId, role };
}

/** @param {any} db @param {string} companyId @param {string} jobId */
export async function loadJob(db, companyId, jobId) {
  return getRecord(db, companyId, 'Job', jobId);
}
