const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const url      = require('url');
const crypto   = require('crypto');
const { createBotRunner } = require('./bot_runner');

const PORT       = process.env.PORT || 3000;
const ROOT_DIR   = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ─── Banco de Dados SQLite (node:sqlite) ───────────────────────────────────────
const {
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
  createUser,
  authenticateUser,
  createSession,
  getUserBySession,
  deleteSession,
  getUserCount,
  updateUserProfile
} = require('./db');

// O carregamento do banco não deve bloquear a abertura do servidor HTTP. Se a migração
// do SQLite for mais pesada em alguma máquina, o dashboard ainda precisa ficar disponível.
function initializeDatabase() {
  try {
    initDb();
    seedDatabase(false);
    console.log('[SERVER] Banco do dashboard inicializado com sucesso.');
  } catch (error) {
    console.error('[SERVER] Falha ao inicializar o banco do dashboard:', error.message);
  }
}

setImmediate(initializeDatabase);

let botRunner;
botRunner = createBotRunner({
  rootDir: ROOT_DIR,
  onLog: message => console.log(`[ROBO] ${message}`),
  onRunStarted: ({ runId, startedAt }) => {
    db.prepare(`INSERT INTO bot_runs (id, started_at, run_status) VALUES (?, ?, ?)`).run(runId, startedAt, 'running');
  },
  onRunFinished: ({ runId, finishedAt, status, shouldSync }) => {
    db.prepare(`UPDATE bot_runs SET finished_at=?, run_status=? WHERE id=?`).run(finishedAt, status, runId);
    if (shouldSync) {
      const added = seedFromCsvs();
      botRunner.addLog(`Sincronização automática pós-execução: ${added} nova(s) vaga(s) processada(s).`);
    }
  }
});

// ─── Configuração Semântica das Etapas ───────────────────────────────────────
const STATUS_CONFIG = {
  pending:   { label: 'Pendente / Link Externo', icon: '📌', color: '#A8C2AA' },
  applied:   { label: 'Candidatura Enviada',      icon: '🚀', color: '#88A98A' },
  screening: { label: 'Triagem / Contato RH',    icon: '💬', color: '#88A98A' },
  technical: { label: 'Desafio Técnico',          icon: '💻', color: '#88A98A' },
  interview: { label: 'Entrevista',               icon: '🎯', color: '#88A98A' },
  offer:     { label: 'Proposta / Oferta',        icon: '🏆', color: '#A8C2AA' },
  rejected:  { label: 'Não Selecionado',          icon: '❌', color: '#858A85' }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
};

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function logActivity(opportunityId, eventType, prevValue, newValue, description) {
  const actId = crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO activities (id, opportunity_id, event_type, prev_value, new_value, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(actId, opportunityId, eventType, prevValue || '', newValue || '', description || '', now);
}

function getSessionToken(req) {
  const cookieHeader = req.headers['cookie'];
  if (cookieHeader) {
    const match = cookieHeader.match(/kiwi_session=([^;]+)/);
    if (match) return match[1].trim();
  }
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

function getAuthUser(req) {
  const token = getSessionToken(req);
  if (!token) return null;
  return getUserBySession(token);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => {
      body += c;
      if (body.length > 2e6) {
        req.socket.destroy();
        reject(new Error('Payload muito grande'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('JSON malformado'));
      }
    });
    req.on('error', reject);
  });
}

// ─── Servidor HTTP ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname  = parsedUrl.pathname;
  const query     = parsedUrl.query;
  const method    = req.method;

  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── AUTH: GET /api/auth/me ───────────────────────────────────────────────
  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = getAuthUser(req);
    const userCount = getUserCount();
    if (user) {
      json(res, 200, { success: true, authenticated: true, user, userCount });
    } else {
      json(res, 200, { success: true, authenticated: false, user: null, userCount });
    }
    return;
  }

  // ── AUTH: POST /api/auth/register ────────────────────────────────────────
  if (pathname === '/api/auth/register' && method === 'POST') {
    readJsonBody(req).then(data => {
      try {
        const { name, email, password, avatarUrl } = data;
        if (!name || !name.trim()) {
          json(res, 400, { success: false, error: 'O nome é obrigatório.' });
          return;
        }
        if (!email || !email.trim()) {
          json(res, 400, { success: false, error: 'O e-mail é obrigatório.' });
          return;
        }
        if (!password || password.length < 6) {
          json(res, 400, { success: false, error: 'A senha deve conter no mínimo 6 caracteres.' });
          return;
        }
        const user = createUser({ name, email, password, avatarUrl });
        const session = createSession(user.id, 30);
        res.setHeader('Set-Cookie', `kiwi_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
        logActivity(null, 'usuario_criado', '', user.email, `Novo usuário registrado: ${user.name} (${user.email})`);
        json(res, 201, { success: true, user, token: session.token, message: 'Conta criada com sucesso!' });
      } catch (err) {
        json(res, 400, { success: false, error: err.message });
      }
    }).catch(err => {
      json(res, 400, { success: false, error: err.message || 'Requisição inválida.' });
    });
    return;
  }

  // ── AUTH: POST /api/auth/login ───────────────────────────────────────────
  if (pathname === '/api/auth/login' && method === 'POST') {
    readJsonBody(req).then(data => {
      const { email, password, rememberMe } = data;
      if (!email || !password) {
        json(res, 400, { success: false, error: 'E-mail e senha são obrigatórios.' });
        return;
      }
      const user = authenticateUser(email, password);
      if (!user) {
        json(res, 401, { success: false, error: 'E-mail ou senha incorretos.' });
        return;
      }
      const days = rememberMe ? 60 : 7;
      const session = createSession(user.id, days);
      res.setHeader('Set-Cookie', `kiwi_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 24 * 60 * 60}`);
      json(res, 200, { success: true, user, token: session.token, message: `Bem-vindo de volta, ${user.name}!` });
    }).catch(err => {
      json(res, 400, { success: false, error: 'Requisição inválida.' });
    });
    return;
  }

  // ── AUTH: POST /api/auth/logout ──────────────────────────────────────────
  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = getSessionToken(req);
    if (token) {
      deleteSession(token);
    }
    res.setHeader('Set-Cookie', 'kiwi_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    json(res, 200, { success: true, message: 'Sessão encerrada com sucesso.' });
    return;
  }

  // ── AUTH: PUT /api/auth/profile ──────────────────────────────────────────
  if (pathname === '/api/auth/profile' && method === 'PUT') {
    const user = getAuthUser(req);
    if (!user) {
      json(res, 401, { success: false, error: 'Sessão expirada. Faça login novamente.' });
      return;
    }
    readJsonBody(req).then(data => {
      try {
        const updated = updateUserProfile(user.id, data);
        json(res, 200, { success: true, user: updated, message: 'Perfil atualizado com sucesso!' });
      } catch (err) {
        json(res, 400, { success: false, error: err.message });
      }
    }).catch(err => {
      json(res, 400, { success: false, error: 'Requisição inválida.' });
    });
    return;
  }

  // ── GET /api/jobs ─────────────────────────────────────────────────────────
  if (pathname === '/api/jobs' && method === 'GET') {
    const filters = {
      stage: query.stage || query.status || 'all',
      workMode: query.workMode || 'all',
      company: query.company || 'all',
      search: query.search || ''
    };
    const jobs  = getAllJobs(filters);
    const stats = getStats();
    const activities = getRecentActivities(20);
    json(res, 200, { success: true, stats, jobs, activities, statusConfig: STATUS_CONFIG });
    return;
  }

  // ── GET /api/stats ────────────────────────────────────────────────────────
  if (pathname === '/api/stats' && method === 'GET') {
    const stats = getStats();
    json(res, 200, { success: true, stats });
    return;
  }

  // ── GET /api/activities ───────────────────────────────────────────────────
  if (pathname === '/api/activities' && method === 'GET') {
    const limit = parseInt(query.limit, 10) || 20;
    const activities = getRecentActivities(limit);
    json(res, 200, { success: true, activities });
    return;
  }

  // ── GET /api/reports ──────────────────────────────────────────────────────
  if (pathname === '/api/reports' && method === 'GET') {
    const stats = getStats();
    const funnel = [
      { stage: 'Mapeadas', count: stats.total, rate: 100 },
      { stage: 'Candidaturas', count: stats.total - stats.pending, rate: stats.total > 0 ? Math.round(((stats.total - stats.pending) / stats.total) * 100) : 0 },
      { stage: 'Triagem / Ativos', count: stats.active + stats.offers, rate: stats.total > 0 ? Math.round(((stats.active + stats.offers) / stats.total) * 100) : 0 },
      { stage: 'Propostas', count: stats.offers, rate: stats.total > 0 ? Math.round((stats.offers / stats.total) * 100) : 0 }
    ];
    json(res, 200, { success: true, stats, funnel, topLocations: stats.topLocations });
    return;
  }

  // ── POST /api/jobs ────────────────────────────────────────────────────────
  if (pathname === '/api/jobs' && method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.title || !data.company) {
          json(res, 400, { success: false, error: 'Título e Empresa são obrigatórios.' }); return;
        }
        const id  = 'job_' + crypto.randomBytes(6).toString('hex');
        const cid = upsertCompany(data.company.trim());
        const now = new Date().toLocaleString('pt-BR');
        const nowIso = new Date().toISOString();
        const stage = data.status || data.stage || 'pending';

        db.prepare(`
          INSERT INTO opportunities
            (id, title, company_id, company_name, location, work_mode, stage, url, date_added, date_applied, source, notes, salary, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, data.title.trim(), cid, data.company.trim(),
          data.location?.trim() || 'Brasil',
          data.workMode || 'Remoto',
          stage,
          data.url?.trim() || '',
          now,
          stage === 'applied' ? now : (data.appliedDate || null),
          'Cadastro Manual',
          data.notes?.trim() || '',
          data.salary?.trim() || '',
          nowIso,
          nowIso
        );

        logActivity(id, 'criacao', '', stage, `Nova vaga cadastrada: ${data.title.trim()} @ ${data.company.trim()}`);
        if (stage === 'applied') syncBackToCsv();

        const job = mapJob(db.prepare(`SELECT * FROM opportunities WHERE id = ?`).get(id));
        json(res, 201, { success: true, job });
      } catch (err) {
        json(res, 400, { success: false, error: err.message });
      }
    });
    return;
  }

  // ── PUT /api/jobs/:id ─────────────────────────────────────────────────────
  if (pathname.startsWith('/api/jobs/') && method === 'PUT') {
    const id = pathname.replace('/api/jobs/', '');
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const updates = JSON.parse(body);
        const existing = db.prepare(`SELECT * FROM opportunities WHERE id = ?`).get(id);
        if (!existing) { json(res, 404, { success: false, error: 'Vaga não encontrada' }); return; }

        const prevStage = existing.stage;
        const sets = [];
        const vals = [];

        const fieldMap = {
          title: 'title', company: 'company_name', location: 'location',
          workMode: 'work_mode', url: 'url', status: 'stage', stage: 'stage',
          notes: 'notes', salary: 'salary', appliedDate: 'date_applied'
        };

        const targetStage = updates.status || updates.stage;

        for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
          if (updates[jsKey] !== undefined) {
            sets.push(`${dbCol} = ?`);
            vals.push(updates[jsKey]);
          }
        }

        // Se mudou para applied, preenche date_applied se não houver
        if (targetStage === 'applied' && prevStage !== 'applied' && !existing.date_applied) {
          sets.push(`date_applied = ?`);
          vals.push(new Date().toLocaleString('pt-BR'));
        }

        if (updates.company !== undefined) {
          const cid = upsertCompany(updates.company.trim());
          sets.push(`company_id = ?`);
          vals.push(cid);
        }

        const nowIso = new Date().toISOString();
        sets.push(`updated_at = ?`);
        vals.push(nowIso);
        vals.push(id);

        if (sets.length > 1) {
          db.prepare(`UPDATE opportunities SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        }

        // Auditoria
        if (targetStage && targetStage !== prevStage) {
          logActivity(id, 'mudanca_etapa', prevStage, targetStage,
            `Etapa alterada: ${STATUS_CONFIG[prevStage]?.label || prevStage} → ${STATUS_CONFIG[targetStage]?.label || targetStage}`);
        }
        if (updates.notes !== undefined && updates.notes !== existing.notes) {
          logActivity(id, 'anotacao', '', '', 'Anotação atualizada');
        }

        if (targetStage === 'applied' || prevStage === 'applied') {
          syncBackToCsv();
        }

        const job = mapJob(db.prepare(`SELECT * FROM opportunities WHERE id = ?`).get(id));
        json(res, 200, { success: true, job });
      } catch (err) {
        json(res, 400, { success: false, error: err.message });
      }
    });
    return;
  }

  // ── DELETE /api/jobs/:id ──────────────────────────────────────────────────
  if (pathname.startsWith('/api/jobs/') && method === 'DELETE') {
    const id = pathname.replace('/api/jobs/', '');
    const existing = db.prepare(`SELECT * FROM opportunities WHERE id = ?`).get(id);
    const result = db.prepare(`DELETE FROM opportunities WHERE id = ?`).run(id);
    if (result.changes === 0) { json(res, 404, { success: false, error: 'Vaga não encontrada' }); return; }
    
    if (existing?.stage === 'applied') syncBackToCsv();
    json(res, 200, { success: true, message: 'Vaga removida com sucesso' });
    return;
  }

  // ── POST /api/sync ────────────────────────────────────────────────────────
  if (pathname === '/api/sync' && method === 'POST') {
    const added = seedFromCsvs();
    const stats = getStats();
    json(res, 200, {
      success: true,
      message: `Sincronização concluída! ${added} nova(s) vaga(s) importada(s).`,
      addedCount: added,
      ...stats
    });
    return;
  }

  // ── GET /api/companies ────────────────────────────────────────────────────
  if (pathname === '/api/companies' && method === 'GET') {
    const companies = db.prepare(`
      SELECT c.id, c.name,
             COUNT(o.id) AS total,
             SUM(CASE WHEN o.stage NOT IN ('rejected') THEN 1 ELSE 0 END) AS active
      FROM companies c
      LEFT JOIN opportunities o ON o.company_id = c.id
      GROUP BY c.id ORDER BY total DESC
    `).all();
    json(res, 200, { success: true, companies });
    return;
  }

  // ── GET /api/bot/status ───────────────────────────────────────────────────
  if (pathname === '/api/bot/status' && method === 'GET') {
    json(res, 200, { success: true, ...botRunner.getStatus() });
    return;
  }

  // ── POST /api/bot/start ───────────────────────────────────────────────────
  if (pathname === '/api/bot/start' && method === 'POST') {
    const result = botRunner.start();
    json(res, result.statusCode || (result.success ? 200 : 400), result);
    return;
  }

  // ── POST /api/bot/continue ────────────────────────────────────────────────
  if (pathname === '/api/bot/continue' && method === 'POST') {
    const result = botRunner.continue();
    json(res, result.statusCode || (result.success ? 200 : 400), result);
    return;
  }

  // ── POST /api/bot/stop ────────────────────────────────────────────────────
  if (pathname === '/api/bot/stop' && method === 'POST') {
    const result = botRunner.stop();
    json(res, result.statusCode || (result.success ? 200 : 400), result);
    return;
  }

  // ─── Arquivos estáticos ───────────────────────────────────────────────────
  let safePath = path.normalize(pathname).replace(/^(\.\.[\\/])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, safePath);
  const ext      = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const idx = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(idx)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(idx).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on('error', (error) => {
  console.error('[SERVER] Falha ao iniciar o servidor HTTP:', error.message);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║   🥝  KIWI BOT — Career ATS Iniciado com Sucesso!            ║`);
  console.log(`║   🌐  http://localhost:${PORT}                               ║`);
  console.log(`║   🗄️   Banco Relacional: SQLite (kiwibot.db)                  ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
});
