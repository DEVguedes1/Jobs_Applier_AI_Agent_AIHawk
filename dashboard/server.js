const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const url      = require('url');
const crypto   = require('crypto');
const { spawn } = require('child_process');

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
  syncBackToCsv
} = require('./db');

// Ensure tables exist and initial migration is performed
initDb();
seedDatabase(false);

// ─── Configuração Semântica das Etapas ───────────────────────────────────────
const STATUS_CONFIG = {
  pending:   { label: 'Pendente / Link Externo', icon: '📌', color: '#F59E0B' },
  applied:   { label: 'Candidatura Enviada',      icon: '🚀', color: '#3B82F6' },
  screening: { label: 'Triagem / Contato RH',    icon: '💬', color: '#8B5CF6' },
  technical: { label: 'Desafio Técnico',          icon: '💻', color: '#06B6D4' },
  interview: { label: 'Entrevista',               icon: '🎯', color: '#EC4899' },
  offer:     { label: 'Proposta / Oferta',        icon: '🏆', color: '#22C55E' },
  rejected:  { label: 'Não Selecionado',          icon: '❌', color: '#64748B' }
};

// ─── Estado do Robô LinkedIn ──────────────────────────────────────────────────
let botProcess   = null;
let botStatus    = 'idle'; // idle | running | waiting_captcha | completed | error
let botLogs      = [];
let botStartedAt = null;
let botFinishedAt= null;

function addBotLog(msg) {
  const line = `[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`;
  botLogs.push(line);
  if (botLogs.length > 500) botLogs.shift();
  console.log(`[ROBO] ${msg}`);
}

function getPythonCommand() {
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) return process.env.PYTHON_PATH;
  const candidates = [
    path.join(ROOT_DIR, 'venv', 'Scripts', 'python.exe'),
    path.join(ROOT_DIR, '.venv', 'Scripts', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
    'C:\\Python311\\python.exe', 'C:\\Python310\\python.exe', 'C:\\Python312\\python.exe',
  ];
  for (const c of candidates) { if (c && fs.existsSync(c)) return c; }
  return 'python';
}

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
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
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

// ─── Servidor HTTP ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname  = parsedUrl.pathname;
  const query     = parsedUrl.query;
  const method    = req.method;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

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
    json(res, 200, {
      success: true,
      status: botStatus,
      isRunning: !!botProcess,
      logs: botLogs.slice(-150),
      startedAt: botStartedAt,
      finishedAt: botFinishedAt
    });
    return;
  }

  // ── POST /api/bot/start ───────────────────────────────────────────────────
  if (pathname === '/api/bot/start' && method === 'POST') {
    if (botProcess) {
      try {
        process.kill(botProcess.pid, 0);
        json(res, 400, { success: false, error: 'O robô já está em execução!' });
        return;
      } catch (e) {
        botProcess = null;
      }
    }
    const pyCmd = getPythonCommand();
    botLogs = [];
    botStartedAt  = new Date().toISOString();
    botFinishedAt = null;
    botStatus = 'running';

    const runId = crypto.randomBytes(8).toString('hex');
    db.prepare(`INSERT INTO bot_runs (id, started_at, run_status) VALUES (?, ?, ?)`).run(runId, botStartedAt, 'running');
    addBotLog(`Iniciando o robô de candidaturas com: ${pyCmd} -u main.py`);

    try {
      const isDirectExe = pyCmd.endsWith('.exe') || pyCmd.includes('\\') || pyCmd.includes('/');
      botProcess = spawn(pyCmd, ['-u', 'main.py'], {
        cwd: ROOT_DIR,
        shell: !isDirectExe,
        env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }
      });

      botProcess.stdout.on('data', data => {
        const str = data.toString('utf-8');
        const lines = str.split(/\r?\n/).filter(l => l.trim().length > 0);
        for (const line of lines) {
          addBotLog(line);
          if (line.includes('PAUSA: Resolva Captcha') || line.includes('Aperte ENTER')) {
            botStatus = 'waiting_captcha';
          }
        }
      });

      botProcess.stderr.on('data', data => {
        data.toString('utf-8').split(/\r?\n/).filter(l => l.trim()).forEach(l => addBotLog(`[INFO] ${l}`));
      });

      botProcess.on('error', err => {
        addBotLog(`Erro: ${err.message}`);
        botStatus = 'error';
        botProcess = null;
        botFinishedAt = new Date().toISOString();
        db.prepare(`UPDATE bot_runs SET finished_at=?, run_status=? WHERE id=?`).run(botFinishedAt, 'error', runId);
      });

      botProcess.on('close', code => {
        const status = code === 0 ? 'completed' : 'error';
        addBotLog(`Execução finalizada com código ${code}.`);
        botStatus = status;
        botProcess = null;
        botFinishedAt = new Date().toISOString();
        db.prepare(`UPDATE bot_runs SET finished_at=?, run_status=? WHERE id=?`).run(botFinishedAt, status, runId);
        
        // Sincroniza automaticamente com os CSVs e banco
        const added = seedFromCsvs();
        addBotLog(`Sincronização automática pós-execução: ${added} nova(s) vaga(s) processada(s).`);
      });

      json(res, 200, { success: true, message: 'Robô iniciado com sucesso!' });
    } catch (err) {
      botStatus = 'error';
      botProcess = null;
      db.prepare(`UPDATE bot_runs SET finished_at=?, run_status=? WHERE id=?`).run(new Date().toISOString(), 'error', runId);
      json(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // ── POST /api/bot/continue ────────────────────────────────────────────────
  if (pathname === '/api/bot/continue' && method === 'POST') {
    if (botProcess?.stdin) {
      try {
        botProcess.stdin.write('\n');
        addBotLog('Captcha resolvido — retomando busca...');
        botStatus = 'running';
        json(res, 200, { success: true });
      } catch (e) {
        json(res, 500, { success: false, error: 'Falha ao enviar confirmação' });
      }
    } else {
      json(res, 400, { success: false, error: 'O robô não está aguardando confirmação.' });
    }
    return;
  }

  // ── POST /api/bot/stop ────────────────────────────────────────────────────
  if (pathname === '/api/bot/stop' && method === 'POST') {
    if (botProcess) {
      try {
        botProcess.kill();
        addBotLog('Robô interrompido pelo usuário.');
        botProcess = null;
        botStatus = 'idle';
        botFinishedAt = new Date().toISOString();
        json(res, 200, { success: true, message: 'Robô interrompido.' });
      } catch (e) {
        json(res, 500, { success: false, error: 'Erro ao interromper' });
      }
    } else {
      json(res, 400, { success: false, error: 'O robô não está em execução.' });
    }
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

server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║   🥝  KIWI BOT — Career ATS Iniciado com Sucesso!            ║`);
  console.log(`║   🌐  http://localhost:${PORT}                               ║`);
  console.log(`║   🗄️   Banco Relacional: SQLite (kiwibot.db)                  ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
});
