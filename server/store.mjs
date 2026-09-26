import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export function openStore(databasePath = ':memory:') {
  if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('manager','member')), created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invites (token_hash TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), email TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL, used_at INTEGER);
    CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), type TEXT NOT NULL, reference TEXT, payload TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS log_revisions (company_id TEXT NOT NULL REFERENCES companies(id), log_id TEXT NOT NULL REFERENCES records(id), revision INTEGER NOT NULL CHECK(revision >= 1), payload TEXT NOT NULL, changed_at TEXT NOT NULL, changed_by_id TEXT NOT NULL, changed_by_name TEXT NOT NULL, reason TEXT NOT NULL, PRIMARY KEY(company_id,log_id,revision));
    CREATE INDEX IF NOT EXISTS records_company_type ON records(company_id,type,created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS cases_reference ON records(company_id,reference) WHERE type = 'cases' AND reference IS NOT NULL;
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
  // Membership lifecycle is additive: preserve every legacy account and its evidence.
  const schemaVersion = db.prepare('PRAGMA user_version').get().user_version;
  if (schemaVersion < 3) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'active')) {
        db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))');
      }
      db.exec('PRAGMA user_version = 3; COMMIT');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  const prepared = new Map();
  function stmt(sql) {
    if (!prepared.has(sql)) prepared.set(sql, db.prepare(sql));
    return prepared.get(sql);
  }
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const activeUser = row => row ? {...row, active: Boolean(row.active)} : null;
  return {
    db, transaction,
    close: () => db.close(),
    createCompany({ name, createdAt }) {
      const company = { id: randomUUID(), name, createdAt };
      stmt('INSERT INTO companies(id,name,created_at) VALUES(?,?,?)').run(company.id, name, createdAt);
      return company;
    },
    company(id) {
      const row = stmt('SELECT id,name,created_at AS createdAt FROM companies WHERE id = ?').get(id);
      return row ? { ...row } : null;
    },
    createUser({ companyId, name, email, passwordHash, role, createdAt }) {
      const user = { id: randomUUID(), companyId, name, email, role, createdAt, active: true };
      stmt('INSERT INTO users(id,company_id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)').run(user.id, companyId, name, email, passwordHash, role, createdAt);
      return user;
    },
    members(companyId) { return stmt('SELECT id,name,email,role,active FROM users WHERE company_id = ? ORDER BY created_at ASC').all(companyId).map(activeUser); },
    userByEmail(email) { return activeUser(stmt('SELECT id,company_id AS companyId,name,email,password_hash AS passwordHash,role,created_at AS createdAt,active FROM users WHERE email = ?').get(email)); },
    user(id) { return activeUser(stmt('SELECT id,company_id AS companyId,name,email,role,active FROM users WHERE id = ?').get(id)); },
    setMemberActive(companyId, userId, active) {
      return stmt('UPDATE users SET active = ? WHERE company_id = ? AND id = ?').run(active ? 1 : 0, companyId, userId).changes === 1;
    },
    saveSession({ tokenHash, userId, csrfToken, expiresAt }) {
      stmt('INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)').run(tokenHash, userId, csrfToken, expiresAt);
    },
    session(tokenHash, now) { return stmt('SELECT user_id AS userId,csrf_token AS csrfToken,expires_at AS expiresAt FROM sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, now) || null; },
    deleteSession(tokenHash) { stmt('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash); },
    deleteUserSessions(userId) { stmt('DELETE FROM sessions WHERE user_id = ?').run(userId); },
    pruneSessions(now) { stmt('DELETE FROM sessions WHERE expires_at <= ?').run(now); },
    invite({ tokenHash, companyId, email, createdBy, expiresAt }) {
      // Issuing a replacement invite revokes still-unused links for this person in this company.
      stmt('DELETE FROM invites WHERE company_id = ? AND email = ? AND used_at IS NULL').run(companyId, email);
      stmt('INSERT INTO invites(token_hash,company_id,email,created_by,expires_at) VALUES(?,?,?,?,?)').run(tokenHash, companyId, email, createdBy, expiresAt);
    },
    invitation(tokenHash, now) { return stmt('SELECT company_id AS companyId,email,expires_at AS expiresAt FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(tokenHash, now) || null; },
    consumeInvite(tokenHash, now) { return stmt('UPDATE invites SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').run(now, tokenHash, now).changes === 1; },
    all(companyId, type) { return stmt('SELECT payload FROM records WHERE company_id = ? AND type = ? ORDER BY created_at ASC, rowid ASC').all(companyId, type).map(row => JSON.parse(row.payload)); },
    get(companyId, type, id) {
      const row = stmt('SELECT payload FROM records WHERE company_id = ? AND type = ? AND id = ?').get(companyId, type, id);
      return row ? JSON.parse(row.payload) : null;
    },
    insert(companyId, type, record) {
      const reference = type === 'cases' && record.reference ? record.reference.trim().toLocaleUpperCase('en-US') : null;
      stmt('INSERT INTO records(id,company_id,type,reference,payload,created_at) VALUES(?,?,?,?,?,?)').run(record.id, companyId, type, reference, JSON.stringify(record), record.createdAt);
      return record;
    },
    replace(companyId, type, record) {
      const reference = type === 'cases' && record.reference ? record.reference.trim().toLocaleUpperCase('en-US') : null;
      const result = stmt('UPDATE records SET reference = ?,payload = ? WHERE company_id = ? AND type = ? AND id = ?').run(reference, JSON.stringify(record), companyId, type, record.id);
      return result.changes === 1 ? record : null;
    },
    saveLogRevision(companyId, entry) {
      stmt('INSERT INTO log_revisions(company_id,log_id,revision,payload,changed_at,changed_by_id,changed_by_name,reason) VALUES(?,?,?,?,?,?,?,?)')
        .run(companyId, entry.log.id, entry.revision, JSON.stringify(entry.log), entry.changedAt, entry.changedBy.id, entry.changedBy.name, entry.reason);
    },
    logHistory(companyId, logId) {
      return stmt('SELECT revision,payload,changed_at AS changedAt,changed_by_id AS changedById,changed_by_name AS changedByName,reason FROM log_revisions WHERE company_id = ? AND log_id = ? ORDER BY revision DESC')
        .all(companyId, logId).map(row => ({ revision: row.revision, log: JSON.parse(row.payload), changedAt: row.changedAt,
          changedBy: { id: row.changedById, name: row.changedByName }, reason: row.reason }));
    },
  };
}
