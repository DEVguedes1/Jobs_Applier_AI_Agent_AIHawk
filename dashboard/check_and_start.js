const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

function nodeMajorVersion() {
  const version = process.versions.node || '0.0.0';
  return Number(version.split('.')[0]);
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/' }, () => {
      req.destroy();
      resolve(true);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function hasBuiltInSQLite() {
  try {
    require('node:sqlite');
    return true;
  } catch {
    return false;
  }
}

function hasBetterSqlite() {
  try {
    require.resolve('better-sqlite3');
    return true;
  } catch {
    return false;
  }
}

const major = nodeMajorVersion();
const builtInSQLite = hasBuiltInSQLite();
const betterSqlite = hasBetterSqlite();

if (major < 18) {
  console.error('[dashboard] Node muito antigo. Instale Node LTS 18+ para rodar o dashboard.');
  process.exit(1);
}

if (!builtInSQLite && !betterSqlite) {
  console.error('[dashboard] Dependência do dashboard ausente: instale Node 22 LTS (com node:sqlite) ou execute npm install better-sqlite3.');
  process.exit(1);
}

if (builtInSQLite) {
  console.log('[dashboard] Usando SQLite nativo (node:sqlite) do Node ' + process.versions.node);
} else {
  console.log('[dashboard] Usando driver better-sqlite3.');
}

(async () => {
  const portInUse = await isPortOpen(process.env.PORT || 3000);
  if (portInUse) {
    console.log('[dashboard] O dashboard já está em execução em http://localhost:3000');
    console.log('[dashboard] Nenhum novo processo foi iniciado para evitar conflito de porta.');
    process.exit(0);
  }

  console.log('[dashboard] Iniciando painel...');

  const serverPath = path.join(__dirname, 'server.js');
  const child = spawn(process.execPath, [serverPath], {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (err) => {
    console.error('[dashboard] Falha ao iniciar o servidor:', err.message);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[dashboard] Servidor encerrado por sinal: ${signal}`);
      process.exit(1);
    }
    process.exit(code ?? 0);
  });
})();


