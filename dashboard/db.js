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
const fs = require('fs');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, 'kiwibot.db');
const ROOT_DIR = path.resolve(__dirname, '..');
const TRACKER_JSON = path.join(__dirname, 'jobs_tracker.json');
const CSV_SUCESSO = path.join(ROOT_DIR, 'vagas_sucesso.csv');
const CSV_PENDENTES = path.join(ROOT_DIR, 'vagas_pendentes.csv');

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
 * Parse CSV Lines Helper
 */
function parseCsv(filepath) {
  if (!fs.existsSync(filepath)) return [];
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length <= 1) return [];

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';').map(p => p.trim());
    if (parts.length >= 5) {
      results.push({
        dataHora: parts[0] || '',
        cargo: parts[1] || '',
        empresa: parts[2] || '',
        local: parts[3] || 'Brasil',
        status: parts[4] || '',
        link: parts[5] || ''
      });
    }
  }
  return results;
}

/**
 * Synchronize back to vagas_sucesso.csv
 * Ensures all applied opportunities from the database are present in the CSV file
 */
function syncBackToCsv() {
  try {
    const appliedJobs = db.prepare(`
      SELECT date_applied, date_added, title, company_name, location, original_status, url
      FROM opportunities
      WHERE stage = 'applied'
      ORDER BY date_applied DESC
    `).all();

    let csvContent = 'Data/Hora;Cargo;Empresa;Local;Status;Link da Vaga\n';
    for (const job of appliedJobs) {
      const date = job.date_applied || job.date_added || new Date().toLocaleString('pt-BR');
      const status = job.original_status || 'Candidatura Enviada com Sucesso! ✅';
      csvContent += `${date};${job.title};${job.company_name};${job.location};${status};${job.url}\n`;
    }
    fs.writeFileSync(CSV_SUCESSO, csvContent, 'utf8');
    console.log(`[DB] vagas_sucesso.csv atualizado com ${appliedJobs.length} candidaturas enviadas.`);
  } catch (err) {
    console.error('[DB] Erro ao sincronizar vagas_sucesso.csv:', err.message);
  }
}

/**
 * Seed Database from jobs_tracker.json (preserving 23 applied + 6 rejected + 28 pending)
 * and CSVs
 */
function seedDatabase(force = false) {
  initDb();

  const countRow = db.prepare('SELECT COUNT(*) as count FROM opportunities').get();
  // Check if we need to force re-seed to restore the user's 23 applied jobs
  const appliedCountRow = db.prepare("SELECT COUNT(*) as count FROM opportunities WHERE stage = 'applied'").get();
  
  // If database has 0 opportunities OR fewer than 23 applied jobs when jobs_tracker has 23, we migrate!
  if (countRow.count > 0 && appliedCountRow.count >= 23 && !force) {
    console.log(`[DB] Banco já possui ${countRow.count} vagas (${appliedCountRow.count} candidaturas enviadas). Migração dispensada.`);
    return countRow.count;
  }

  console.log('[DB] Iniciando migração e recuperação completa das candidaturas...');

  // Read jobs_tracker.json if exists
  let trackerJobs = [];
  if (fs.existsSync(TRACKER_JSON)) {
    try {
      trackerJobs = JSON.parse(fs.readFileSync(TRACKER_JSON, 'utf8'));
      console.log(`[DB] Encontradas ${trackerJobs.length} vagas em jobs_tracker.json.`);
    } catch (e) {
      console.error('[DB] Erro ao ler jobs_tracker.json:', e.message);
    }
  }

  const existingUrls = new Set();
  const insertOpp = db.prepare(`
    INSERT OR REPLACE INTO opportunities (
      id, title, company_id, company_name, location, work_mode, stage,
      url, date_added, date_applied, source, notes, salary, original_status,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertActivity = db.prepare(`
    INSERT INTO activities (id, opportunity_id, event_type, prev_value, new_value, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let importedCount = 0;
  const nowIso = new Date().toISOString();

  // 1. Import from jobs_tracker.json (has the accurate applied: 23, rejected: 6, pending: 28)
  for (const item of trackerJobs) {
    const id = item.id || ('job_' + crypto.randomBytes(6).toString('hex'));
    const companyId = upsertCompany(item.company || 'Empresa Confidencial');
    const stage = item.status || 'pending'; // 'applied', 'rejected', 'pending', etc.
    const url = item.url || '';
    if (url) existingUrls.add(url);

    insertOpp.run(
      id,
      item.title || 'Vaga Sem Título',
      companyId,
      item.company || 'Empresa Confidencial',
      item.location || 'Brasil',
      item.workMode || 'Remoto',
      stage,
      url,
      item.dateAdded || item.appliedDate || new Date().toLocaleString('pt-BR'),
      item.appliedDate || (stage === 'applied' ? (item.dateAdded || new Date().toLocaleString('pt-BR')) : null),
      item.source || 'LinkedIn Bot (Easy Apply)',
      item.notes || '',
      item.salary || '',
      item.originalStatus || (stage === 'applied' ? 'Candidatura Enviada com Sucesso! ✅' : ''),
      stage === 'rejected' ? 'closed' : 'active',
      nowIso,
      item.updatedAt || nowIso
    );

    // Activity log
    const actId = crypto.randomBytes(8).toString('hex');
    const actDesc = stage === 'applied'
      ? `Candidatura enviada via robô para ${item.title} @ ${item.company}`
      : `Oportunidade importada: ${item.title} @ ${item.company}`;
    
    insertActivity.run(
      actId,
      id,
      stage === 'applied' ? 'candidatura_enviada' : 'criacao',
      '',
      stage,
      actDesc,
      item.appliedDate || item.dateAdded || nowIso
    );

    importedCount++;
  }

  // 2. Cross-check CSV files for any extra records not in tracker
  const csvSucesso = parseCsv(CSV_SUCESSO);
  for (const c of csvSucesso) {
    if (c.link && existingUrls.has(c.link)) continue;
    const id = 'csv_s_' + crypto.randomBytes(6).toString('hex');
    const companyId = upsertCompany(c.empresa);
    insertOpp.run(
      id, c.cargo, companyId, c.empresa, c.local || 'Brasil',
      c.local?.toLowerCase().includes('remot') ? 'Remoto' : 'Presencial',
      'applied', c.link, c.dataHora, c.dataHora,
      'LinkedIn Bot (Easy Apply)', '', '', c.status,
      'active', nowIso, nowIso
    );
    if (c.link) existingUrls.add(c.link);
    importedCount++;
  }

  const csvPendentes = parseCsv(CSV_PENDENTES);
  for (const c of csvPendentes) {
    if (c.link && existingUrls.has(c.link)) continue;
    const id = 'csv_p_' + crypto.randomBytes(6).toString('hex');
    const companyId = upsertCompany(c.empresa);
    insertOpp.run(
      id, c.cargo, companyId, c.empresa, c.local || 'Brasil',
      c.local?.toLowerCase().includes('remot') ? 'Remoto' : 'Presencial',
      'pending', c.link, c.dataHora, null,
      'LinkedIn Bot (Easy Apply)', '', '', c.status,
      'active', nowIso, nowIso
    );
    if (c.link) existingUrls.add(c.link);
    importedCount++;
  }

  console.log(`[DB] Migração concluída com sucesso! Total de vagas no banco: ${importedCount}`);

  // Synchronize back to vagas_sucesso.csv so the CSV also reflects all 23 applied jobs!
  syncBackToCsv();

  return importedCount;
}

/**
 * Seed / Sync from CSVs (called after bot execution or manual sync button)
 */
function seedFromCsvs() {
  initDb();
  let added = 0;
  const existingUrls = new Set(
    db.prepare("SELECT url FROM opportunities WHERE url IS NOT NULL AND url != ''").all().map(r => r.url)
  );

  const insertOpp = db.prepare(`
    INSERT INTO opportunities (
      id, title, company_id, company_name, location, work_mode, stage,
      url, date_added, date_applied, source, notes, salary, original_status,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const nowIso = new Date().toISOString();

  // Sucessos
  const sucessos = parseCsv(CSV_SUCESSO);
  for (const row of sucessos) {
    if (row.link && existingUrls.has(row.link)) continue;
    const id = 'bot_' + crypto.randomBytes(6).toString('hex');
    const companyId = upsertCompany(row.empresa);
    const workMode = (row.cargo + ' ' + row.local).toLowerCase().includes('remot') ? 'Remoto' : 'Presencial';

    insertOpp.run(
      id, row.cargo, companyId, row.empresa, row.local || 'Brasil',
      workMode, 'applied', row.link, row.dataHora || new Date().toLocaleString('pt-BR'),
      row.dataHora || new Date().toLocaleString('pt-BR'),
      'LinkedIn Bot (Easy Apply)', '', '', row.status,
      'active', nowIso, nowIso
    );

    db.prepare(`
      INSERT INTO activities (id, opportunity_id, event_type, prev_value, new_value, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomBytes(8).toString('hex'), id, 'candidatura_enviada', '', 'applied',
      `Nova candidatura enviada pelo robô: ${row.cargo} @ ${row.empresa}`, nowIso
    );

    if (row.link) existingUrls.add(row.link);
    added++;
  }

  // Pendentes
  const pendentes = parseCsv(CSV_PENDENTES);
  for (const row of pendentes) {
    if (row.link && existingUrls.has(row.link)) continue;
    const id = 'bot_' + crypto.randomBytes(6).toString('hex');
    const companyId = upsertCompany(row.empresa);
    const workMode = (row.cargo + ' ' + row.local).toLowerCase().includes('remot') ? 'Remoto' : 'Presencial';

    insertOpp.run(
      id, row.cargo, companyId, row.empresa, row.local || 'Brasil',
      workMode, 'pending', row.link, row.dataHora || new Date().toLocaleString('pt-BR'),
      null, 'LinkedIn Bot (Easy Apply)', '', '', row.status,
      'active', nowIso, nowIso
    );

    if (row.link) existingUrls.add(row.link);
    added++;
  }

  syncBackToCsv();
  return added;
}

/**
 * Get All Jobs with Optional Filters
 */
function getAllJobs(filters = {}) {
  initDb();
  let sql = 'SELECT * FROM opportunities WHERE 1=1';
  const params = [];

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
function getStats() {
  initDb();

  const totalRow = db.prepare('SELECT COUNT(*) as c FROM opportunities').get();
  const appliedRow = db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE stage = 'applied'").get();
  const activeRow = db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE stage IN ('screening', 'technical', 'interview')").get();
  const pendingRow = db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE stage = 'pending'").get();
  const offersRow = db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE stage = 'offer'").get();
  const rejectedRow = db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE stage = 'rejected'").get();

  const total = totalRow.c || 0;
  const applied = appliedRow.c || 0;
  const active = activeRow.c || 0;
  const pending = pendingRow.c || 0;
  const offers = offersRow.c || 0;
  const rejected = rejectedRow.c || 0;

  const conversionRate = total > 0 ? Math.round(((applied + active + offers) / total) * 100) : 0;

  // Work mode counts
  const workModeRows = db.prepare('SELECT work_mode, COUNT(*) as c FROM opportunities GROUP BY work_mode').all();
  const byWorkMode = { Remoto: 0, Híbrido: 0, Presencial: 0, Outros: 0 };
  for (const r of workModeRows) {
    if (Object.prototype.hasOwnProperty.call(byWorkMode, r.work_mode)) {
      byWorkMode[r.work_mode] = r.c;
    } else {
      byWorkMode.Outros += r.c;
    }
  }

  // Stage counts
  const stageRows = db.prepare('SELECT stage, COUNT(*) as c FROM opportunities GROUP BY stage').all();
  const byStage = {};
  for (const r of stageRows) {
    byStage[r.stage] = r.c;
  }

  // Location counts (top 10)
  const locationRows = db.prepare(`
    SELECT location, COUNT(*) as count
    FROM opportunities
    WHERE location IS NOT NULL AND location != ''
    GROUP BY location
    ORDER BY count DESC
    LIMIT 10
  `).all();

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
function getRecentActivities(limit = 20) {
  initDb();
  const rows = db.prepare(`
    SELECT a.*, o.title as job_title, o.company_name
    FROM activities a
    LEFT JOIN opportunities o ON o.id = a.opportunity_id
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(limit);

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

  const id = 'usr_' + crypto.randomBytes(8).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, salt, role, avatar_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), cleanEmail, hash, salt, role, avatarUrl ? avatarUrl.trim() : '', now, now);

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
  seedDatabase,
  seedFromCsvs,
  getAllJobs,
  getStats,
  getRecentActivities,
  upsertCompany,
  mapJob,
  syncBackToCsv,
  // Auth exports
  createUser,
  authenticateUser,
  createSession,
  getUserBySession,
  deleteSession,
  getUserCount,
  updateUserProfile
};

