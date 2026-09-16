const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_FILE = path.join(__dirname, 'jobs_tracker.json');
const CSV_SUCESSO = path.join(ROOT_DIR, 'vagas_sucesso.csv');
const CSV_PENDENTES = path.join(ROOT_DIR, 'vagas_pendentes.csv');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Estado do Robô LinkedIn
let botProcess = null;
let botStatus = 'idle'; // 'idle' | 'running' | 'waiting_captcha' | 'completed' | 'error'
let botLogs = [];
let botStartedAt = null;
let botFinishedAt = null;

function addBotLog(msg) {
  const line = `[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`;
  botLogs.push(line);
  if (botLogs.length > 500) botLogs.shift();
  console.log(`[ROBO] ${msg}`);
}

function getPythonCommand() {
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }

  const candidates = [
    path.join(ROOT_DIR, 'venv', 'Scripts', 'python.exe'),
    path.join(ROOT_DIR, '.venv', 'Scripts', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
    'C:\\Python311\\python.exe',
    'C:\\Python310\\python.exe',
    'C:\\Python312\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
    'C:\\Program Files\\Python310\\python.exe'
  ];

  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      return c;
    }
  }

  return 'python';
}

const STATUS_CONFIG = {
  pending: { label: 'Pendente / Link Externo', icon: '📌', color: '#f59e0b' },
  applied: { label: 'Candidatura Enviada', icon: '🚀', color: '#3b82f6' },
  screening: { label: 'Triagem / Contato RH', icon: '💬', color: '#8b5cf6' },
  technical: { label: 'Desafio Técnico', icon: '💻', color: '#06b6d4' },
  interview: { label: 'Entrevista', icon: '🎯', color: '#ec4899' },
  offer: { label: 'Proposta / Oferta', icon: '🏆', color: '#10b981' },
  rejected: { label: 'Não Selecionado', icon: '❌', color: '#ef4444' }
};

// Helper: Gera hash único baseado em cargo, empresa e link
function generateJobId(title, company, link) {
  const raw = `${(title || '').toLowerCase().trim()}_${(company || '').toLowerCase().trim()}_${(link || '').trim()}`;
  return crypto.createHash('md5').update(raw).digest('hex').substring(0, 12);
}

// Helper: Lê arquivo CSV com delimitador ';'
function parseCsvFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) return [];

    const jobs = [];
    // Pular cabeçalho
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(';');
      if (parts.length >= 5) {
        const dateTime = parts[0]?.trim() || '';
        const title = parts[1]?.trim() || 'Vaga Sem Título';
        const company = parts[2]?.trim() || 'Empresa Confidencial';
        const location = parts[3]?.trim() || 'Não especificado';
        const rawStatus = parts[4]?.trim() || '';
        const jobUrl = parts[5]?.trim() || '';

        let workMode = 'Não especificado';
        const lowerLoc = location.toLowerCase();
        const lowerTitle = title.toLowerCase();
        if (lowerLoc.includes('remot') || lowerTitle.includes('remote') || lowerTitle.includes('remoto')) {
          workMode = 'Remoto';
        } else if (lowerLoc.includes('híbrid') || lowerLoc.includes('hybrid')) {
          workMode = 'Híbrido';
        } else if (location && location !== 'Não especificado') {
          workMode = 'Presencial';
        }

        jobs.push({
          dateTime,
          title,
          company,
          location,
          rawStatus,
          jobUrl,
          workMode
        });
      }
    }
    return jobs;
  } catch (err) {
    console.error(`Erro ao ler CSV ${filePath}:`, err.message);
    return [];
  }
}

// Carrega o banco JSON existente
function loadJobsDatabase() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Erro ao ler jobs_tracker.json, recriando:', e.message);
    }
  }
  return [];
}

// Salva o banco JSON
function saveJobsDatabase(jobs) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
}

// Sincroniza CSVs para o JSON
function syncFromCsvFiles() {
  let existingJobs = loadJobsDatabase();
  const existingMap = new Map(existingJobs.map(j => [j.id, j]));

  const currentCsvIds = new Set();
  let addedCount = 0;

  // 1. Processar vagas com sucesso (já candidatadas)
  const sucessoJobs = parseCsvFile(CSV_SUCESSO);
  for (const item of sucessoJobs) {
    const id = generateJobId(item.title, item.company, item.jobUrl);
    currentCsvIds.add(id);
    if (!existingMap.has(id)) {
      const newJob = {
        id,
        title: item.title,
        company: item.company,
        location: item.location,
        workMode: item.workMode,
        url: item.jobUrl,
        status: 'applied',
        originalStatus: item.rawStatus,
        dateAdded: item.dateTime || new Date().toLocaleString('pt-BR'),
        appliedDate: item.dateTime || new Date().toLocaleString('pt-BR'),
        source: 'LinkedIn Bot (Easy Apply)',
        notes: '',
        salary: '',
        tags: [],
        updatedAt: new Date().toISOString()
      };
      existingJobs.push(newJob);
      existingMap.set(id, newJob);
      addedCount++;
    }
  }

  // 2. Processar vagas pendentes (formulário complexo ou link externo)
  const pendentesJobs = parseCsvFile(CSV_PENDENTES);
  for (const item of pendentesJobs) {
    const id = generateJobId(item.title, item.company, item.jobUrl);
    currentCsvIds.add(id);
    if (!existingMap.has(id)) {
      const newJob = {
        id,
        title: item.title,
        company: item.company,
        location: item.location,
        workMode: item.workMode,
        url: item.jobUrl,
        status: 'pending',
        originalStatus: item.rawStatus,
        dateAdded: item.dateTime || new Date().toLocaleString('pt-BR'),
        appliedDate: null,
        source: 'LinkedIn Bot (Pendente/Externo)',
        notes: item.rawStatus.includes('Formulário complexo') 
          ? 'Requer candidatura manual (perguntas personalizadas ou testes no LinkedIn)' 
          : 'Link externo (não foi clicado pelo bot)',
        salary: '',
        tags: [],
        updatedAt: new Date().toISOString()
      };
      existingJobs.push(newJob);
      existingMap.set(id, newJob);
      addedCount++;
    }
  }

  // 3. Remover do banco local vagas do robô que foram apagadas dos CSVs
  let removedCount = 0;
  const filteredJobs = existingJobs.filter(job => {
    // Vagas manuais são sempre preservadas
    if (job.source === 'Cadastro Manual' || job.source === 'Manual') {
      return true;
    }
    // Vagas importadas de CSV só permanecem se ainda existirem no arquivo
    const stillExists = currentCsvIds.has(job.id);
    if (!stillExists) removedCount++;
    return stillExists;
  });

  saveJobsDatabase(filteredJobs);
  return { addedCount, removedCount, total: filteredJobs.length };
}

// Sincronização inicial
syncFromCsvFiles();

// Helper de MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- ROTAS DA API ---

  // 1. GET /api/jobs (Listar todas as vagas e estatísticas)
  if (pathname === '/api/jobs' && method === 'GET') {
    const jobs = loadJobsDatabase();

    const stats = {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      applied: jobs.filter(j => j.status === 'applied').length,
      inProcess: jobs.filter(j => ['screening', 'technical', 'interview'].includes(j.status)).length,
      offer: jobs.filter(j => j.status === 'offer').length,
      rejected: jobs.filter(j => j.status === 'rejected').length
    };

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, stats, jobs, statusConfig: STATUS_CONFIG }));
    return;
  }

  // 2. POST /api/jobs (Criar nova vaga manual)
  if (pathname === '/api/jobs' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.title || !data.company) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Título e Empresa são obrigatórios.' }));
          return;
        }

        const jobs = loadJobsDatabase();
        const id = 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
        const nowFormatted = new Date().toLocaleString('pt-BR');

        const newJob = {
          id,
          title: data.title.trim(),
          company: data.company.trim(),
          location: data.location?.trim() || 'Brasil',
          workMode: data.workMode || 'Remoto',
          url: data.url?.trim() || '',
          status: data.status || 'pending',
          originalStatus: 'Cadastrado Manualmente',
          dateAdded: nowFormatted,
          appliedDate: data.status === 'applied' ? nowFormatted : (data.appliedDate || null),
          source: data.source || 'Manual',
          notes: data.notes?.trim() || '',
          salary: data.salary?.trim() || '',
          tags: data.tags || [],
          updatedAt: new Date().toISOString()
        };

        jobs.unshift(newJob);
        saveJobsDatabase(jobs);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, job: newJob }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'JSON inválido' }));
      }
    });
    return;
  }

  // 3. PUT /api/jobs/:id (Atualizar status, notas ou dados de uma vaga)
  if (pathname.startsWith('/api/jobs/') && method === 'PUT') {
    const id = pathname.replace('/api/jobs/', '');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const updates = JSON.parse(body);
        const jobs = loadJobsDatabase();
        const index = jobs.findIndex(j => j.id === id);

        if (index === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Vaga não encontrada' }));
          return;
        }

        const job = jobs[index];

        // Se mudou para applied e não tinha appliedDate, preenche
        if (updates.status === 'applied' && job.status !== 'applied' && !job.appliedDate) {
          job.appliedDate = new Date().toLocaleString('pt-BR');
        }

        const allowedFields = ['title', 'company', 'location', 'workMode', 'url', 'status', 'notes', 'salary', 'appliedDate', 'tags'];
        for (const field of allowedFields) {
          if (updates[field] !== undefined) {
            job[field] = updates[field];
          }
        }
        job.updatedAt = new Date().toISOString();

        saveJobsDatabase(jobs);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, job }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Erro ao atualizar vaga' }));
      }
    });
    return;
  }

  // 4. DELETE /api/jobs/:id (Remover vaga)
  if (pathname.startsWith('/api/jobs/') && method === 'DELETE') {
    const id = pathname.replace('/api/jobs/', '');
    let jobs = loadJobsDatabase();
    const initialLen = jobs.length;
    jobs = jobs.filter(j => j.id !== id);

    if (jobs.length === initialLen) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Vaga não encontrada' }));
      return;
    }

    saveJobsDatabase(jobs);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Vaga removida com sucesso' }));
    return;
  }

  // 5. POST /api/sync (Sincronizar CSVs novos e remoções)
  if (pathname === '/api/sync' && method === 'POST') {
    const result = syncFromCsvFiles();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `Sincronização concluída! ${result.addedCount} adicionadas, ${result.removedCount} removidas. Total: ${result.total}.`,
      ...result
    }));
    return;
  }

  // 6. GET /api/bot/status (Consultar status e logs do robô)
  if (pathname === '/api/bot/status' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      status: botStatus,
      isRunning: !!botProcess,
      logs: botLogs.slice(-150),
      startedAt: botStartedAt,
      finishedAt: botFinishedAt
    }));
    return;
  }

  // 7. POST /api/bot/start (Iniciar o robô LinkedIn)
  if (pathname === '/api/bot/start' && method === 'POST') {
    if (botProcess) {
      try {
        process.kill(botProcess.pid, 0);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'O robô já está em execução!' }));
        return;
      } catch (e) {
        botProcess = null;
      }
    }

    const pyCmd = getPythonCommand();
    botLogs = [];
    botStartedAt = new Date().toISOString();
    botFinishedAt = null;
    botStatus = 'running';
    addBotLog(`Iniciando o robô de candidaturas com: ${pyCmd} -u main.py`);

    try {
      const isDirectExe = pyCmd.endsWith('.exe') || pyCmd.includes('\\') || pyCmd.includes('/');
      botProcess = spawn(pyCmd, ['-u', 'main.py'], {
        cwd: ROOT_DIR,
        shell: !isDirectExe,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8'
        }
      });

      botProcess.stdout.on('data', data => {
        const str = data.toString();
        const lines = str.split(/\r?\n/).filter(l => l.trim().length > 0);
        for (const line of lines) {
          addBotLog(line);
          if (line.includes('PAUSA: Resolva Captcha') || line.includes('Aperte ENTER aqui para continuar')) {
            botStatus = 'waiting_captcha';
          }
        }
      });

      botProcess.stderr.on('data', data => {
        const str = data.toString();
        const lines = str.split(/\r?\n/).filter(l => l.trim().length > 0);
        for (const line of lines) {
          addBotLog(`[INFO/AVISO] ${line}`);
        }
      });

      botProcess.on('error', err => {
        addBotLog(`Erro ao disparar processo: ${err.message}`);
        botStatus = 'error';
        botProcess = null;
        botFinishedAt = new Date().toISOString();
      });

      botProcess.on('close', code => {
        addBotLog(`Execução finalizada com código ${code}.`);
        botStatus = (code === 0) ? 'completed' : 'error';
        botProcess = null;
        botFinishedAt = new Date().toISOString();
        // Sincroniza automaticamente os CSVs para o dashboard
        const syncResult = syncFromCsvFiles();
        addBotLog(`Sincronização automática pós-execução: ${syncResult.addedCount} novas vagas adicionadas ao painel.`);
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Robô iniciado com sucesso!' }));
    } catch (err) {
      botStatus = 'error';
      botProcess = null;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 8. POST /api/bot/continue (Enviar ENTER pós-captcha)
  if (pathname === '/api/bot/continue' && method === 'POST') {
    if (botProcess && botProcess.stdin) {
      try {
        botProcess.stdin.write('\n');
        addBotLog('Confirmação de Captcha enviada (ENTER). Retomando busca...');
        botStatus = 'running';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Retomando execução...' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Falha ao enviar confirmação' }));
      }
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'O robô não está aguardando confirmação.' }));
    }
    return;
  }

  // 9. POST /api/bot/stop (Interromper o robô)
  if (pathname === '/api/bot/stop' && method === 'POST') {
    if (botProcess) {
      try {
        botProcess.kill();
        addBotLog('Robô interrompido pelo usuário.');
        botProcess = null;
        botStatus = 'idle';
        botFinishedAt = new Date().toISOString();
        syncFromCsvFiles();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Robô interrompido com sucesso.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Erro ao interromper' }));
      }
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'O robô não está em execução.' }));
    }
    return;
  }

  // --- SERVIR ARQUIVOS ESTÁTICOS DO FRONTEND ---
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, safePath);
  const ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexPath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      }
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 DASHBOARD DO JOB TRACKER INICIADO COM SUCESSO!`);
  console.log(`🌐 Acesse no seu navegador: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
