import { DatabaseSync } from 'node:sqlite';
import mysql from 'mysql2/promise';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

export async function openDatabase(env = process.env) {
  if (env.DB_HOST) {
    const pool = mysql.createPool({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER,
      password: env.DB_PASSWORD, database: env.DB_NAME, connectionLimit: 5,
      ...(env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}) });
    const wrap = (connection) => ({
      async all(sql, params = []) { const [rows] = await connection.execute(sql, params); return rows; },
      async run(sql, params = []) { const [result] = await connection.execute(sql, params); return result; },
    });
    return { ...wrap(pool), dialect: 'mysql', close: () => pool.end(),
      async transaction(fn) {
        const connection = await pool.getConnection();
        try { await connection.beginTransaction(); const result = await fn(wrap(connection)); await connection.commit(); return result; }
        catch (error) { await connection.rollback(); throw error; }
        finally { connection.release(); }
      } };
  }
  if (env.NODE_ENV === 'production') throw new Error('Production requires DB_HOST, DB_USER, DB_PASSWORD and DB_NAME.');
  const filename = env.SQLITE_PATH || '.data/job-tracker.sqlite';
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const context = new AsyncLocalStorage();
  let queue = Promise.resolve();
  const exclusive = fn => {
    if (context.getStore()) return Promise.resolve().then(fn);
    const result = queue.then(() => context.run(true, fn));
    queue = result.catch(() => {});
    return result;
  };
  const adapter = {
    dialect: 'sqlite',
    all(sql, params = []) { return exclusive(() => sqlite.prepare(sql).all(...params)); },
    run(sql, params = []) { return exclusive(() => sqlite.prepare(sql).run(...params)); },
    async close() { sqlite.close(); },
  };
  // Serialize SQLite transactions, including async work between statements.
  adapter.transaction = (fn) => {
    return exclusive(async () => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const value = await fn(adapter); sqlite.exec('COMMIT'); return value; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
  };
  return adapter;
}

export async function migrate(db) {
  const blob = db.dialect === 'mysql' ? 'MEDIUMBLOB' : 'BLOB';
  const jsonText = db.dialect === 'mysql' ? 'MEDIUMTEXT' : 'TEXT';
  const suffix = db.dialect === 'mysql' ? ' ENGINE=InnoDB' : '';
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS users (id VARCHAR(36) PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_date VARCHAR(30) NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sessions (token_hash VARCHAR(64) PRIMARY KEY, user_id VARCHAR(36) NOT NULL, expires_at BIGINT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS tokens (token_hash VARCHAR(64) PRIMARY KEY, kind VARCHAR(12) NOT NULL, email VARCHAR(254) NOT NULL, expires_at BIGINT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS records (id VARCHAR(36) PRIMARY KEY, owner_id VARCHAR(36) NOT NULL, entity VARCHAR(20) NOT NULL, parent_id VARCHAR(36), data ${jsonText} NOT NULL, created_date VARCHAR(30) NOT NULL, updated_date VARCHAR(30) NOT NULL, FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS files (id VARCHAR(36) PRIMARY KEY, owner_id VARCHAR(36) NOT NULL, mime VARCHAR(50) NOT NULL, content ${blob} NOT NULL, size INTEGER NOT NULL, FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS rate_limits (bucket VARCHAR(64) PRIMARY KEY, attempts INTEGER NOT NULL, expires_at BIGINT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sign_links (token_hash VARCHAR(64) PRIMARY KEY, owner_id VARCHAR(36) NOT NULL, entity VARCHAR(20) NOT NULL, record_id VARCHAR(36) NOT NULL, job_id VARCHAR(36) NOT NULL, channel VARCHAR(12) NOT NULL, recipient VARCHAR(254), expires_at BIGINT NOT NULL, used_at VARCHAR(30), created_date VARCHAR(30) NOT NULL, FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE)`,
    // Multi-crew Phase 1: users belong to a company (owner's users.id) with a role.
    `CREATE TABLE IF NOT EXISTS company_members (user_id VARCHAR(36) PRIMARY KEY, company_id VARCHAR(36) NOT NULL, role VARCHAR(32) NOT NULL, created_date VARCHAR(30) NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(company_id) REFERENCES users(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS member_invites (token_hash VARCHAR(64) PRIMARY KEY, company_id VARCHAR(36) NOT NULL, email VARCHAR(254) NOT NULL, role VARCHAR(32) NOT NULL, invited_by VARCHAR(36) NOT NULL, expires_at BIGINT NOT NULL, created_date VARCHAR(30) NOT NULL, FOREIGN KEY(company_id) REFERENCES users(id) ON DELETE CASCADE)`,
  ]) await db.run(sql + suffix);
  for (const [name, table, columns] of [
    ['records_owner_entity', 'records', 'owner_id, entity, created_date'],
    ['records_owner_parent', 'records', 'owner_id, parent_id'],
    ['files_owner', 'files', 'owner_id'],
    ['sessions_expiry', 'sessions', 'expires_at'],
    ['sign_links_record', 'sign_links', 'owner_id, entity, record_id'],
    ['company_members_company', 'company_members', 'company_id'],
    ['member_invites_company', 'member_invites', 'company_id, email'],
  ]) {
    try { await db.run(`CREATE INDEX ${db.dialect === 'sqlite' ? 'IF NOT EXISTS ' : ''}${name} ON ${table} (${columns})`); }
    catch (error) { if (error.code !== 'ER_DUP_KEYNAME') throw error; }
  }
  // Solo accounts become company owners of themselves (idempotent).
  const { backfillOwnerMemberships } = await import('./membership.js');
  await backfillOwnerMemberships(db);
}
