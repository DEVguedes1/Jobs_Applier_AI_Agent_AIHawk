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

  function finalizeRun(runId, runStatus, shouldSync) {
    finishedAt = new Date().toISOString();
    onRunFinished?.({ runId, finishedAt, status: runStatus, shouldSync });
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
    start() {
      if (processHandle) {
        try {
          process.kill(processHandle.pid, 0);
          return { success: false, statusCode: 400, error: 'O robô já está em execução!' };
        } catch (error) {
          processHandle = null;
        }
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
        finalizeRun(runId, finalStatus, shouldSync);
      };
      onRunStarted?.({ runId, startedAt });
      addLog(`Iniciando o robô de candidaturas com: ${pythonCommand} -u main.py`);

      try {
        const isDirectExe = pythonCommand.endsWith('.exe') || pythonCommand.includes('\\') || pythonCommand.includes('/');

        // Ponto de entrada da execução: substitua este spawn ao migrar para fila, worker ou outro executor.
        processHandle = spawn(pythonCommand, ['-u', 'main.py'], {
          cwd: rootDir,
          shell: !isDirectExe,
          env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }
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
          finishRun(finalStatus, true);
        });

        return { success: true, message: 'Robô iniciado com sucesso!' };
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