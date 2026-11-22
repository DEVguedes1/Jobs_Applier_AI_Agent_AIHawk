const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { logger } = require('./logger');

function resolvePythonCommand(rootDir, env = process.env, platform = process.platform) {
  const configuredPython = env.ATF_PYTHON_PATH || env.PYTHON_PATH;
  if (configuredPython && fs.existsSync(configuredPython)) return configuredPython;
  const windows = platform === 'win32';
  const candidates = [
    path.join(rootDir, '.venv', windows ? 'Scripts/python.exe' : 'bin/python'),
    path.join(rootDir, 'venv', windows ? 'Scripts/python.exe' : 'bin/python')
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || env.PYTHON || (windows ? 'python' : 'python3');
}

function createBotRunner({ rootDir, onRunStarted, onRunFinished, spawnProcess = spawn }) {
  let processHandle = null;
  let status = 'idle';
  let logs = [];
  let startedAt = null;
  let finishedAt = null;
  let ownerId = null;
  let runId = null;
  let stopRequested = false;

  function addLog(message, level = 'INFO', origin = 'BOT.PYTHON') {
    const normalized = String(level).toLowerCase();
    const record = logger[normalized]?.(origin, message) || {
      timestamp: new Date().toISOString(), level: String(level).toUpperCase(), origin, message: String(message)
    };
    logs.push({
      timestamp: record.timestamp,
      level: record.level,
      origin: record.origin,
      message: record.message
    });
    if (logs.length > 1000) logs.shift();
  }

  function ownsRun(userId) {
    return !!userId && ownerId === userId;
  }

  function finishRun(finalStatus) {
    if (!runId) return;
    finishedAt = new Date().toISOString();
    const completedRunId = runId;
    runId = null;
    try {
      onRunFinished?.({ runId: completedRunId, finishedAt, status: finalStatus, userId: ownerId });
    } catch (error) {
      addLog(`Falha ao persistir estado final da execução: ${error.message}`, 'ERROR', 'BOT.RUNNER');
    }
  }

  function parseChildLine(line, streamLevel) {
    const trimmed = line.trim();
    if (!trimmed) return;
    const declaredLevel = trimmed.match(/\|\s(DEBUG|INFO|WARNING|WARN|ERROR)\s*\|/i)?.[1]?.toUpperCase();
    const inferredLevel = /\b(ERROR|FATAL|EXCEPTION)\b|🚨|❌|\bErro\b|\bFalhou\b/i.test(trimmed)
      ? 'ERROR'
      : (/\b(WARN|WARNING)\b|⚠️|⏱️|PAUSA:/i.test(trimmed) ? 'WARN' : streamLevel);
    const level = declaredLevel === 'WARNING' ? 'WARN' : (declaredLevel || inferredLevel);
    addLog(trimmed, level, 'BOT.PYTHON');
    if (trimmed.includes('PAUSA:') || trimmed.includes('Aperte ENTER')) status = 'waiting_captcha';
  }

  return {
    getStatus(userId) {
      if (!ownsRun(userId)) {
        return { status: 'idle', isRunning: false, logs: [], startedAt: null, finishedAt: null };
      }
      return {
        status,
        isRunning: !!processHandle,
        logs: logs.slice(-500),
        startedAt,
        finishedAt
      };
    },
    start(mode = 'apply', apiContext = {}) {
      if (processHandle) return { success: false, statusCode: 400, error: 'O robô já está em execução!' };
      if (!apiContext.userId || !apiContext.sessionToken) {
        return { success: false, statusCode: 401, error: 'Sessão inválida para iniciar o bot.' };
      }

      const pythonCommand = resolvePythonCommand(rootDir);
      logs = [];
      startedAt = new Date().toISOString();
      finishedAt = null;
      status = 'running';
      ownerId = apiContext.userId;
      runId = crypto.randomBytes(8).toString('hex');
      stopRequested = false;

      const scriptArgs = mode === 'verify'
        ? ['-u', 'verificar_candidaturas.py']
        : ['-u', 'main.py'];
      const actionName = mode === 'verify'
        ? 'Verificação de Estado & Links Externos'
        : 'Candidaturas Automatizadas (Easy Apply)';

      addLog(`Iniciando [${actionName}] com Python em ${pythonCommand}`, 'INFO', 'BOT.RUNNER');
      addLog(
        `Configuração: browser=${process.env.ATF_BROWSER || 'chrome'} headless=${process.env.ATF_HEADLESS || 'false'} ` +
        `perfilPersistente=${process.env.ATF_BROWSER_PROFILE || 'padrão do projeto'} ` +
        `envioReal=${process.env.ATF_ALLOW_REAL_APPLICATIONS === 'true' ? 'habilitado' : 'bloqueado'}`,
        'INFO', 'BOT.RUNNER'
      );

      try {
        onRunStarted?.({ runId, startedAt, userId: apiContext.userId });
        processHandle = spawnProcess(pythonCommand, scriptArgs, {
          cwd: rootDir,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            KIWI_API_URL: apiContext.apiUrl,
            KIWI_SESSION_TOKEN: apiContext.sessionToken,
            KIWI_BOT_RUN_ID: runId,
            ATF_BROWSER: process.env.ATF_BROWSER || 'chrome',
            PYTHONUNBUFFERED: '1',
            PYTHONIOENCODING: 'utf-8'
          }
        });

        let stdoutBuffer = '';
        let stderrBuffer = '';
        processHandle.stdout.on('data', data => {
          stdoutBuffer += data.toString('utf-8');
          const lines = stdoutBuffer.split(/\r?\n/);
          stdoutBuffer = lines.pop() || '';
          lines.forEach(line => parseChildLine(line, 'INFO'));
        });
        processHandle.stderr.on('data', data => {
          stderrBuffer += data.toString('utf-8');
          const lines = stderrBuffer.split(/\r?\n/);
          stderrBuffer = lines.pop() || '';
          lines.forEach(line => parseChildLine(line, 'ERROR'));
        });
        processHandle.on('error', error => {
          addLog(`Falha ao iniciar/comunicar com Python: ${error.message}`, 'ERROR', 'BOT.RUNNER');
          status = 'error';
          processHandle = null;
          finishRun('error');
        });
        processHandle.on('close', (code, signal) => {
          if (stdoutBuffer.trim()) parseChildLine(stdoutBuffer, 'INFO');
          if (stderrBuffer.trim()) parseChildLine(stderrBuffer, 'ERROR');
          const finalStatus = stopRequested ? 'interrupted' : (code === 0 ? 'completed' : 'error');
          addLog(`Processo Python encerrado: exitCode=${code ?? 'null'} signal=${signal || 'none'}`,
            finalStatus === 'error' ? 'ERROR' : 'INFO', 'BOT.RUNNER');
          status = finalStatus;
          processHandle = null;
          finishRun(finalStatus);
        });
        return { success: true, message: `Robô iniciado com sucesso (${actionName})!` };
      } catch (error) {
        status = 'error';
        processHandle = null;
        addLog(`Falha ao criar processo Python: ${error.message}`, 'ERROR', 'BOT.RUNNER');
        finishRun('error');
        return { success: false, statusCode: 500, error: error.message };
      }
    },
    continue(userId) {
      if (!ownsRun(userId)) return { success: false, statusCode: 404, error: 'Execução não encontrada.' };
      if (status !== 'waiting_captcha' || !processHandle?.stdin) {
        return { success: false, statusCode: 400, error: 'O robô não está aguardando confirmação.' };
      }
      try {
        processHandle.stdin.write('\n');
        addLog('Confirmação manual recebida; retomando execução.', 'INFO', 'BOT.RUNNER');
        status = 'running';
        return { success: true };
      } catch (error) {
        addLog(`Falha ao continuar processo: ${error.message}`, 'ERROR', 'BOT.RUNNER');
        return { success: false, statusCode: 500, error: 'Falha ao enviar confirmação' };
      }
    },
    stop(userId) {
      if (!ownsRun(userId)) return { success: false, statusCode: 404, error: 'Execução não encontrada.' };
      if (!processHandle) return { success: false, statusCode: 400, error: 'O robô não está em execução.' };
      try {
        stopRequested = true;
        status = 'stopping';
        addLog('Solicitado encerramento do processo Python.', 'WARN', 'BOT.RUNNER');
        processHandle.kill();
        return { success: true, message: 'Encerramento solicitado.' };
      } catch (error) {
        addLog(`Falha ao encerrar processo Python: ${error.message}`, 'ERROR', 'BOT.RUNNER');
        return { success: false, statusCode: 500, error: 'Erro ao interromper' };
      }
    },
    shutdown() {
      if (!processHandle) return Promise.resolve();
      stopRequested = true;
      status = 'stopping';
      addLog('Servidor encerrando; solicitando término do bot.', 'WARN', 'BOT.RUNNER');
      return new Promise(resolve => {
        const child = processHandle;
        const timer = setTimeout(() => {
          if (processHandle === child) child.kill('SIGKILL');
        }, 5000);
        timer.unref();
        child.once('close', () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill();
      });
    }
  };
}

module.exports = { createBotRunner, resolvePythonCommand };
