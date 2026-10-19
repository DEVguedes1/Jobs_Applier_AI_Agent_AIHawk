const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

function createBotRunner({ rootDir, onLog, onRunStarted, onRunFinished }) {
  let processHandle = null;
  let status = 'idle';
  let logs = [];
  let startedAt = null;
  let finishedAt = null;

  function addLog(message) {
    const line = `[${new Date().toLocaleTimeString('pt-BR')}] ${message}`;
    logs.push(line);
    if (logs.length > 500) logs.shift();
    onLog?.(message);
  }

  function getPythonCommand() {
    if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) return process.env.PYTHON_PATH;
    const candidates = [
      path.join(rootDir, 'venv', 'Scripts', 'python.exe'),
      path.join(rootDir, '.venv', 'Scripts', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
      'C:\\Python311\\python.exe', 'C:\\Python310\\python.exe', 'C:\\Python312\\python.exe'
    ];
    return candidates.find(candidate => candidate && fs.existsSync(candidate)) || 'python';
  }

  function finalizeRun(runId, runStatus, shouldSync, userId) {
    finishedAt = new Date().toISOString();
    onRunFinished?.({ runId, finishedAt, status: runStatus, shouldSync, userId });
  }

  return {
    addLog,
    getStatus() {
      return {
        status,
        isRunning: !!processHandle,
        logs: logs.slice(-150),
        startedAt,
        finishedAt
      };
    },
    start(mode = 'apply', apiContext = {}) {
      if (processHandle) {
        try {
          process.kill(processHandle.pid, 0);
          return { success: false, statusCode: 400, error: 'O robô já está em execução!' };
        } catch (error) {
          processHandle = null;
        }
      }

      if (!apiContext.userId || !apiContext.sessionToken) {
        return { success: false, statusCode: 401, error: 'Sessão inválida para iniciar o bot.' };
      }

      const pythonCommand = getPythonCommand();
      logs = [];
      startedAt = new Date().toISOString();
      finishedAt = null;
      status = 'running';
      const runId = crypto.randomBytes(8).toString('hex');
      let runFinalized = false;
      const finishRun = (finalStatus, shouldSync) => {
        if (runFinalized) return;
        runFinalized = true;
        finalizeRun(runId, finalStatus, shouldSync, apiContext.userId);
      };
      onRunStarted?.({ runId, startedAt, userId: apiContext.userId });

      const scriptArgs = mode === 'verify'
        ? ['-u', 'verificar_candidaturas.py']
        : ['-u', 'main.py'];
      const actionName = mode === 'verify' ? 'Verificação de Estado & Links Externos' : 'Candidaturas Automatizadas (Easy Apply)';

      addLog(`Iniciando o robô [${actionName}] com: ${pythonCommand} ${scriptArgs.join(' ')}`);

      try {
        const isDirectExe = pythonCommand.endsWith('.exe') || pythonCommand.includes('\\') || pythonCommand.includes('/');

        // Ponto de entrada da execução: persiste 100% diretamente no SQLite
        processHandle = spawn(pythonCommand, scriptArgs, {
          cwd: rootDir,
          shell: !isDirectExe,
          env: {
            ...process.env,
            KIWI_API_URL: apiContext.apiUrl,
            KIWI_SESSION_TOKEN: apiContext.sessionToken,
            KIWI_BOT_RUN_ID: runId,
            PYTHONUNBUFFERED: '1',
            PYTHONIOENCODING: 'utf-8'
          }
        });

        processHandle.stdout.on('data', data => {
          const lines = data.toString('utf-8').split(/\r?\n/).filter(line => line.trim());
          for (const line of lines) {
            addLog(line);
            if (line.includes('PAUSA: Resolva Captcha') || line.includes('Aperte ENTER')) status = 'waiting_captcha';
          }
        });

        processHandle.stderr.on('data', data => {
          data.toString('utf-8').split(/\r?\n/).filter(line => line.trim()).forEach(line => addLog(`[INFO] ${line}`));
        });

        processHandle.on('error', error => {
          addLog(`Erro: ${error.message}`);
          status = 'error';
          processHandle = null;
          finishRun('error', false);
        });

        processHandle.on('close', code => {
          const finalStatus = code === 0 ? 'completed' : 'error';
          addLog(`Execução finalizada com código ${code}.`);
          status = finalStatus;
          processHandle = null;
          finishRun(finalStatus, false);
        });

        return { success: true, message: `Robô iniciado com sucesso (${actionName})!` };
      } catch (error) {
        status = 'error';
        processHandle = null;
        finishRun('error', false);
        return { success: false, statusCode: 500, error: error.message };
      }
    },
    continue() {
      if (!processHandle?.stdin) return { success: false, statusCode: 400, error: 'O robô não está aguardando confirmação.' };
      try {
        processHandle.stdin.write('\n');
        addLog('Captcha resolvido — retomando busca...');
        status = 'running';
        return { success: true };
      } catch (error) {
        return { success: false, statusCode: 500, error: 'Falha ao enviar confirmação' };
      }
    },
    stop() {
      if (!processHandle) return { success: false, statusCode: 400, error: 'O robô não está em execução.' };
      try {
        processHandle.kill();
        addLog('Robô interrompido pelo usuário.');
        processHandle = null;
        status = 'idle';
        finishedAt = new Date().toISOString();
        return { success: true, message: 'Robô interrompido.' };
      } catch (error) {
        return { success: false, statusCode: 500, error: 'Erro ao interromper' };
      }
    }
  };
}

module.exports = { createBotRunner };