/**
 * Kiwi Bot - Database Layer (SQLite)
 * Usa o módulo nativo do Node quando disponível e cai para better-sqlite3
 * para manter compatibilidade em máquinas com Node 22/24 e instalações mais simples.
 */

let DatabaseClass;
try {
  const sqlite = require('node:sqlite');
  DatabaseClass = sqlite.DatabaseSync;
} catch (error) {
  DatabaseClass = require('better-sqlite3');
}

const path = require('path');
const crypto = require('crypto');

const DB_FILE = process.env.KIWI_DB_PATH
  ? path.resolve(process.env.KIWI_DB_PATH)
  : path.join(__dirname, 'kiwibot.db');

const db = new DatabaseClass(DB_FILE);

// Enable WAL mode and foreign keys for performance and integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/**
 * Initialize Tables
 */
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      website TEXT DEFAULT '',
      linkedin TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      user_id TEXT,
      company_id TEXT,
      company_name TEXT NOT NULL,
      location TEXT DEFAULT 'Brasil',
      work_mode TEXT DEFAULT 'Remoto',
      stage TEXT NOT NULL DEFAULT 'pending',
      url TEXT DEFAULT '',
      date_added TEXT NOT NULL,
      date_applied TEXT,
      source TEXT DEFAULT 'LinkedIn Bot (Easy Apply)',
      notes TEXT DEFAULT '',
      salary TEXT DEFAULT '',
      original_status TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT,
      event_type TEXT NOT NULL,
      prev_value TEXT DEFAULT '',
      new_value TEXT DEFAULT '',
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bot_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      vagas_encontradas INTEGER DEFAULT 0,
      candidaturas_enviadas INTEGER DEFAULT 0,
      run_status TEXT DEFAULT 'running',
      log_output TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      avatar_url TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
    CREATE INDEX IF NOT EXISTS idx_opportunities_company_id ON opportunities(company_id);
    CREATE INDEX IF NOT EXISTS idx_activities_opportunity_id ON activities(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);

  const opportunityColumns = db.prepare('PRAGMA table_info(opportunities)').all();
  if (!opportunityColumns.some(column => column.name === 'user_id')) {
    db.exec('ALTER TABLE opportunities ADD COLUMN user_id TEXT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_opportunities_user_id ON opportunities(user_id)');
  const botRunColumns = db.prepare('PRAGMA table_info(bot_runs)').all();
  if (!botRunColumns.some(column => column.name === 'user_id')) {
    db.exec('ALTER TABLE bot_runs ADD COLUMN user_id TEXT');
  }

  const firstUser = db.prepare('SELECT id FROM users ORDER BY created_at LIMIT 1').get();
  if (firstUser) {
    db.prepare('UPDATE opportunities SET user_id = ? WHERE user_id IS NULL').run(firstUser.id);
  }
}

/**
 * Company Helper
 */
function upsertCompany(name) {
  if (!name || !name.trim()) return null;
  const cleanName = name.trim();
  const existing = db.prepare('SELECT id FROM companies WHERE LOWER(name) = LOWER(?)').get(cleanName);
  if (existing) return existing.id;

  const id = crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO companies (id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(id, cleanName, now, now);
  return id;
}

/**
 * Map DB row to Frontend camelCase object
 */
function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    company: row.company_name,
    companyId: row.company_id,
    location: row.location || 'Brasil',
    workMode: row.work_mode || 'Remoto',
    status: row.stage, // Frontend uses 'status' as stage identifier
    stage: row.stage,
    url: row.url || '',
    dateAdded: row.date_added,
    appliedDate: row.date_applied,
    source: row.source || 'LinkedIn Bot (Easy Apply)',
    notes: row.notes || '',
    salary: row.salary || '',
    originalStatus: row.original_status || '',
    recordStatus: row.status,
    updatedAt: row.updated_at
  };
}

/**
 * Get All Jobs with Optional Filters
 */
function getAllJobs(userId, filters = {}) {
  initDb();
  let sql = 'SELECT * FROM opportunities WHERE user_id = ?';
  const params = [userId];

  if (filters.stage && filters.stage !== 'all') {
    sql += ' AND stage = ?';
    params.push(filters.stage);
  }
  if (filters.workMode && filters.workMode !== 'all') {
    sql += ' AND work_mode = ?';
    params.push(filters.workMode);
  }
  if (filters.company && filters.company !== 'all') {
    sql += ' AND company_name = ?';
    params.push(filters.company);
  }
  if (filters.search && filters.search.trim()) {
    sql += ' AND (LOWER(title) LIKE ? OR LOWER(company_name) LIKE ? OR LOWER(location) LIKE ?)';
    const term = `%${filters.search.trim().toLowerCase()}%`;
    params.push(term, term, term);
  }

  sql += ' ORDER BY created_at DESC';

  const rows = db.prepare(sql).all(...params);
  return rows.map(mapJob);
}

/**
 * Get Comprehensive Dashboard Stats (All from real SQL aggregate queries)
 */
function getStats(userId) {
  initDb();

  const totalRow = db.prepare('SELECT COUNT(*) as c FROM opportunities WHERE user_id = ?').get(userId);
  const appliedRow = db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE user_id = ? AND stage = 'applied'").get(userId);
  const activeRow = db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE user_id = ? AND stage IN ('screening', 'technical', 'interview')").get(userId);
  const pendingRow = db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE user_id = ? AND stage = 'pending'").get(userId);
  const offersRow = db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE user_id = ? AND stage = 'offer'").get(userId);
  const rejectedRow = db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE user_id = ? AND stage = 'rejected'").get(userId);

  const total = totalRow.c || 0;
  const applied = appliedRow.c || 0;
  const active = activeRow.c || 0;
  const pending = pendingRow.c || 0;
  const offers = offersRow.c || 0;
  const rejected = rejectedRow.c || 0;

  const conversionRate = total > 0 ? Math.round(((applied + active + offers) / total) * 100) : 0;

  // Work mode counts
  const workModeRows = db.prepare('SELECT work_mode, COUNT(*) as c FROM opportunities WHERE user_id = ? GROUP BY work_mode').all(userId);
  const byWorkMode = { Remoto: 0, Híbrido: 0, Presencial: 0, Outros: 0 };
  for (const r of workModeRows) {
    if (Object.prototype.hasOwnProperty.call(byWorkMode, r.work_mode)) {
      byWorkMode[r.work_mode] = r.c;
    } else {
      byWorkMode.Outros += r.c;
    }
  }

  // Stage counts
  const stageRows = db.prepare('SELECT stage, COUNT(*) as c FROM opportunities WHERE user_id = ? GROUP BY stage').all(userId);
  const byStage = {};
  for (const r of stageRows) {
    byStage[r.stage] = r.c;
  }

  // Location counts (top 10)
  const locationRows = db.prepare(`
    SELECT location, COUNT(*) as count
    FROM opportunities
    WHERE user_id = ? AND location IS NOT NULL AND location != ''
    GROUP BY location
    ORDER BY count DESC
    LIMIT 10
  `).all(userId);

  return {
    total,
    applied,
    active,
    pending,
    offers,
    rejected,
    conversionRate,
    byWorkMode,
    byStage,
    topLocations: locationRows
  };
}

/**
 * Get Recent Activities
 */
function getRecentActivities(userId, limit = 20) {
  initDb();
  const rows = db.prepare(`
    SELECT a.*, o.title as job_title, o.company_name
    FROM activities a
    JOIN opportunities o ON o.id = a.opportunity_id
    WHERE o.user_id = ?
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(userId, limit);

  return rows.map(r => ({
    id: r.id,
    opportunityId: r.opportunity_id,
    eventType: r.event_type,
    prevValue: r.prev_value,
    newValue: r.new_value,
    description: r.description,
    title: r.job_title || 'Oportunidade',
    company: r.company_name || '',
    createdAt: r.created_at
  }));
}

function normalizeJobUrl(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch (error) {
    return '';
  }
}

function findBotOpportunity(userId, url) {
  const normalizedUrl = normalizeJobUrl(url);
  if (!normalizedUrl) return null;
  const rows = db.prepare(`
    SELECT id, url FROM opportunities
    WHERE user_id = ? AND url IS NOT NULL AND url != ''
  `).all(userId);
  return rows.find(row => normalizeJobUrl(row.url) === normalizedUrl) || null;
}

function isBotJobRegistered(userId, url) {
  return !!findBotOpportunity(userId, url);
}

function saveBotOpportunity(userId, {
  title, company, location, url, status_msg: statusMsg, is_success: isSuccess = false
}) {
  initDb();
  const nowIso = new Date().toISOString();
  const date = new Date().toLocaleString('pt-BR');
  const companyName = company?.trim() || 'Empresa Não Informada';
  const companyId = upsertCompany(companyName);
  const stage = isSuccess ? 'applied' : 'pending';
  const existing = findBotOpportunity(userId, url);

  if (existing) {
    const previous = db.prepare('SELECT stage FROM opportunities WHERE id = ? AND user_id = ?').get(existing.id, userId);
    db.prepare(`
      UPDATE opportunities
      SET title = ?, company_id = ?, company_name = ?, location = ?, stage = ?,
          original_status = ?, date_applied = COALESCE(date_applied, ?), updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      title, companyId, companyName, location, stage, statusMsg,
      isSuccess ? date : null, nowIso, existing.id, userId
    );
    if (previous && previous.stage !== stage) {
      logOpportunityActivity(existing.id, 'stage_change', previous.stage, stage, `Estágio atualizado para: ${stage}`, nowIso);
    }
    return existing.id;
  }

  const id = 'bot_' + crypto.randomBytes(6).toString('hex');
  const workMode = /remot/i.test(`${title} ${location}`) ? 'Remoto' : 'Presencial';
  db.prepare(`
    INSERT INTO opportunities
      (id, user_id, title, company_id, company_name, location, work_mode, stage, url,
       date_added, date_applied, source, original_status, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(
    id, userId, title, companyId, companyName, location || 'Brasil', workMode, stage, url || '',
    date, isSuccess ? date : null, 'LinkedIn Bot (Easy Apply)', statusMsg, nowIso, nowIso
  );
  logOpportunityActivity(
    id,
    isSuccess ? 'candidatura_enviada' : 'criacao',
    '',
    stage,
    isSuccess ? `Candidatura enviada via robô: ${title} @ ${companyName}` : `Vaga mapeada pelo robô: ${title} @ ${companyName}`,
    nowIso
  );
  return id;
}

function isolateExternalOpportunity(userId, { title, company, location, url }) {
  initDb();
  const existing = findBotOpportunity(userId, url);
  if (existing) return existing.id;

  const nowIso = new Date().toISOString();
  const date = new Date().toLocaleString('pt-BR');
  const companyName = company?.trim() || 'Empresa Não Informada';
  const companyId = upsertCompany(companyName);
  const id = 'ext_' + crypto.randomBytes(6).toString('hex');
  const workMode = /remot/i.test(`${title} ${location}`) ? 'Remoto' : 'Presencial';
  db.prepare(`
    INSERT INTO opportunities
      (id, user_id, title, company_id, company_name, location, work_mode, stage, url, date_added,
       source, notes, original_status, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, title, companyId, companyName, location || 'Brasil', workMode, url,
    date, 'Link Externo (Não Cadastrado)', 'Isolado automaticamente para triagem manual/posterior',
    'LINK_EXTERNO_NAO_CADASTRADO', 'LINK_EXTERNO_NAO_CADASTRADO', nowIso, nowIso
  );
  logOpportunityActivity(
    id,
    'link_externo_isolado',
    '',
    'LINK_EXTERNO_NAO_CADASTRADO',
    `Link externo não-LinkedIn isolado para análise: ${title} @ ${companyName}`,
    nowIso
  );
  return id;
}

function logOpportunityActivity(opportunityId, eventType, previous, next, description, createdAt) {
  db.prepare(`
    INSERT INTO activities (id, opportunity_id, event_type, prev_value, new_value, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(crypto.randomBytes(8).toString('hex'), opportunityId, eventType, previous, next, description, createdAt);
}

function getBotOpportunitiesToVerify(userId) {
  return db.prepare(`
    SELECT id, title, company_name, location, stage, url, original_status, status
    FROM opportunities
    WHERE user_id = ? AND url IS NOT NULL AND url != ''
      AND url LIKE '%linkedin.com/jobs/view%'
    ORDER BY updated_at DESC
  `).all(userId);
}

function updateBotVerifiedStatus(userId, opportunityId, stage, statusMessage, description) {
  const opportunity = db.prepare(`
    SELECT stage FROM opportunities WHERE id = ? AND user_id = ?
  `).get(opportunityId, userId);
  if (!opportunity) return false;

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE opportunities SET stage = ?, original_status = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(stage, statusMessage, nowIso, opportunityId, userId);
  logOpportunityActivity(opportunityId, 'status_verificado', opportunity.stage, stage, description, nowIso);
  return true;
}

function importLegacyBatch(userId, { opportunities = [], activities = [] }) {
  initDb();
  const idMap = new Map();
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    for (const item of opportunities) {
      if (!item.title || !item.company_name) continue;
      const companyId = upsertCompany(item.company_name);
      const oldId = String(item.id || crypto.randomBytes(8).toString('hex'));
      const newId = `legacy_${userId}_${oldId}`;
      const existing = db.prepare('SELECT id FROM opportunities WHERE id = ?').get(newId);
      if (existing) {
        idMap.set(oldId, existing.id);
        continue;
      }
      db.prepare(`
        INSERT INTO opportunities (
          id, user_id, title, company_id, company_name, location, work_mode, stage, url, date_added,
          date_applied, source, notes, salary, original_status, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId, userId, item.title, companyId, item.company_name, item.location || 'Brasil',
        item.work_mode || 'Remoto', item.stage || 'pending', item.url || '',
        item.date_added || now, item.date_applied || null, item.source || 'Migração SQLite',
        item.notes || '', item.salary || '', item.original_status || '', item.status || 'active',
        item.created_at || now, item.updated_at || now
      );
      idMap.set(oldId, newId);
    }
    for (const item of activities) {
      const opportunityId = item.opportunity_id ? idMap.get(String(item.opportunity_id)) : null;
      if (!opportunityId) continue;
      const activityId = item.id
        ? `legacy_${userId}_${String(item.id)}`
        : crypto.randomBytes(8).toString('hex');
      if (db.prepare('SELECT id FROM activities WHERE id = ?').get(activityId)) continue;
      db.prepare(`
        INSERT INTO activities (id, opportunity_id, event_type, prev_value, new_value, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        activityId, opportunityId, item.event_type || 'migracao',
        item.prev_value || '', item.new_value || '', item.description || 'Atividade migrada',
        item.created_at || now
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { opportunities: idMap.size };
}

/**
 * ─── Authentication & User Management ─────────────────────────────────────────
 */
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function verifyPassword(password, hash, salt) {
  try {
    const testHash = hashPassword(password, salt);
    const bufA = Buffer.from(hash, 'hex');
    const bufB = Buffer.from(testHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (e) {
    return false;
  }
}

function createUser({ name, email, password, avatarUrl = '', role = 'admin' }) {
  initDb();
  if (!name || !name.trim()) throw new Error('Nome é obrigatório.');
  if (!email || !email.trim()) throw new Error('E-mail é obrigatório.');
  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    throw new Error('Formato de e-mail inválido.');
  }
  if (!password || password.length < 6) {
    throw new Error('A senha deve ter no mínimo 6 caracteres.');
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
  if (existing) {
    throw new Error('Este e-mail já está cadastrado.');
  }

  const isFirstUser = getUserCount() === 0;
  const id = 'usr_' + crypto.randomBytes(8).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, salt, role, avatar_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), cleanEmail, hash, salt, role, avatarUrl ? avatarUrl.trim() : '', now, now);
  if (isFirstUser) {
    db.prepare('UPDATE opportunities SET user_id = ? WHERE user_id IS NULL').run(id);
  }

  return {
    id,
    name: name.trim(),
    email: cleanEmail,
    role,
    avatarUrl: avatarUrl ? avatarUrl.trim() : '',
    createdAt: now
  };
}

function authenticateUser(email, password) {
  initDb();
  if (!email || !password) return null;
  const cleanEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cleanEmail);
  if (!user) return null;

  const valid = verifyPassword(password, user.password_hash, user.salt);
  if (!valid) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatar_url || '',
    createdAt: user.created_at
  };
}

function createSession(userId, daysValid = 30) {
  initDb();
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + daysValid * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, now.toISOString(), expiresAt);

  return { token, expiresAt };
}

function getUserBySession(token) {
  initDb();
  if (!token) return null;
  const now = new Date().toISOString();
  const row = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.avatar_url, u.created_at, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, now);

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatar_url || '',
    createdAt: row.created_at,
    sessionExpiresAt: row.expires_at
  };
}

function deleteSession(token) {
  initDb();
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function getUserCount() {
  initDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
  return row ? row.count : 0;
}

function updateUserProfile(userId, { name, email, avatarUrl, currentPassword, newPassword }) {
  initDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('Usuário não encontrado.');

  const sets = [];
  const vals = [];

  if (name && name.trim()) {
    sets.push('name = ?');
    vals.push(name.trim());
  }

  if (email && email.trim()) {
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      throw new Error('Formato de e-mail inválido.');
    }
    if (cleanEmail !== user.email.toLowerCase()) {
      const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?').get(cleanEmail, userId);
      if (existing) throw new Error('Este e-mail já está sendo utilizado.');
      sets.push('email = ?');
      vals.push(cleanEmail);
    }
  }

  if (avatarUrl !== undefined) {
    sets.push('avatar_url = ?');
    vals.push(avatarUrl.trim());
  }

  if (newPassword) {
    if (!currentPassword) {
      throw new Error('A senha atual é necessária para definir uma nova senha.');
    }
    const valid = verifyPassword(currentPassword, user.password_hash, user.salt);
    if (!valid) {
      throw new Error('Senha atual incorreta.');
    }
    if (newPassword.length < 6) {
      throw new Error('A nova senha deve ter no mínimo 6 caracteres.');
    }
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = hashPassword(newPassword, newSalt);
    sets.push('password_hash = ?');
    vals.push(newHash);
    sets.push('salt = ?');
    vals.push(newSalt);
  }

  if (sets.length > 0) {
    const nowIso = new Date().toISOString();
    sets.push('updated_at = ?');
    vals.push(nowIso);
    vals.push(userId);

    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  const updated = db.prepare('SELECT id, name, email, role, avatar_url, created_at FROM users WHERE id = ?').get(userId);
  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    avatarUrl: updated.avatar_url || '',
    createdAt: updated.created_at
  };
}

module.exports = {
  db,
  initDb,
  getAllJobs,
  getStats,
  getRecentActivities,
  upsertCompany,
  mapJob,
  isBotJobRegistered,
  saveBotOpportunity,
  isolateExternalOpportunity,
  getBotOpportunitiesToVerify,
  updateBotVerifiedStatus,
  importLegacyBatch,
  // Auth exports
  createUser,
  authenticateUser,
  createSession,
  getUserBySession,
  deleteSession,
  getUserCount,
  updateUserProfile
};
