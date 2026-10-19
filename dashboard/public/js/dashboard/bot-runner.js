import { apiFetch as request } from '../services/api.js';
import { dom } from './state.js';

export function createBotRunnerController({ showToast, loadData, escapeHtml }) {
let botPollInterval = null;
let lastBotStatus = 'idle';

async function openBotModal() {
  dom.modalBotRunner.classList.remove('hidden');

  try {
    const res = await request('/api/bot/status');
    const data = await res.json();
    const currentStatus = data.status || 'idle';
    lastBotStatus = currentStatus;

    if (currentStatus !== 'running' && currentStatus !== 'waiting_captcha') {
      dom.botTerminalLogs.innerHTML = '<div class="terminal-line" style="color: var(--accent-secondary); font-weight: 500;">[Inicializando robô e abrindo navegador Chrome...]</div>';
      dom.botStatusBadge.textContent = 'Iniciando...';
      dom.botStatusBadge.style.backgroundColor = 'var(--status-applied-bg)';
      dom.botStatusBadge.style.color = 'var(--kiwi-primary-light)';
      await startBotExecution();
    } else {
      await pollBotStatus();
    }
  } catch (err) {
    showToast('Não foi possível consultar o estado do robô. A execução não foi iniciada.', 'error');
    return;
  }

  if (!botPollInterval) {
    botPollInterval = setInterval(pollBotStatus, 1000);
  }
}

function closeBotModal() {
  dom.modalBotRunner.classList.add('hidden');
  if (lastBotStatus === 'idle' || lastBotStatus === 'completed' || lastBotStatus === 'error') {
    if (botPollInterval) {
      clearInterval(botPollInterval);
      botPollInterval = null;
    }
  }
}

async function startBotExecution() {
  dom.btnBotStart.disabled = true;
  dom.btnBotStart.style.opacity = '0.6';
  try {
    const res = await request('/api/bot/start', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Robô iniciado! Acompanhe o progresso no terminal.', 'info');
      await pollBotStatus();
      if (!botPollInterval) {
        botPollInterval = setInterval(pollBotStatus, 1000);
      }
    } else {
      showToast(data.error || 'Erro ao iniciar robô', 'error');
    }
  } catch (err) {
    showToast('Falha ao comunicar com o servidor', 'error');
  } finally {
    dom.btnBotStart.disabled = false;
    dom.btnBotStart.style.opacity = '1';
  }
}

async function startBotVerification() {
  if (dom.btnBotVerify) {
    dom.btnBotVerify.disabled = true;
    dom.btnBotVerify.style.opacity = '0.6';
  }
  try {
    const res = await request('/api/bot/verify', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Verificação de estado e links iniciada!', 'info');
      await pollBotStatus();
      if (!botPollInterval) {
        botPollInterval = setInterval(pollBotStatus, 1000);
      }
    } else {
      showToast(data.error || 'Erro ao iniciar verificação', 'error');
    }
  } catch (err) {
    showToast('Falha ao comunicar com o servidor', 'error');
  } finally {
    if (dom.btnBotVerify) {
      dom.btnBotVerify.disabled = false;
      dom.btnBotVerify.style.opacity = '1';
    }
  }
}

async function confirmBotCaptcha() {
  try {
    const res = await request('/api/bot/continue', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Retomando busca de vagas...', 'info');
      dom.botCaptchaAlert.classList.add('hidden');
      pollBotStatus();
    }
  } catch (err) {
    showToast('Erro ao confirmar verificação', 'error');
  }
}

async function stopBotExecution() {
  if (!confirm('Deseja realmente interromper a execução do robô?')) return;
  try {
    const res = await request('/api/bot/stop', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Execução do robô interrompida', 'info');
      pollBotStatus();
    }
  } catch (err) {
    showToast('Erro ao interromper robô', 'error');
  }
}

async function pollBotStatus() {
  try {
    const res = await request('/api/bot/status');
    const data = await res.json();
    if (!data.success) return;

    const currentStatus = data.status;

    // Atualizar Botão Superior no Header
    if (dom.btnOpenBotModal) {
      if (currentStatus === 'running' || currentStatus === 'waiting_captcha') {
        dom.btnOpenBotModal.innerHTML = `
          <svg class="btn-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1.2s linear infinite;">
            <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="10"></circle>
          </svg>
          <span>Robô Rodando...</span>
        `;
        dom.btnOpenBotModal.style.borderColor = 'var(--status-applied-border)';
        dom.btnOpenBotModal.style.color = 'var(--kiwi-primary-light)';
      } else {
        dom.btnOpenBotModal.innerHTML = `
          <svg class="btn-icon" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>Executar Robô</span>
        `;
        dom.btnOpenBotModal.style.borderColor = '';
        dom.btnOpenBotModal.style.color = '';
      }
    }

    // Atualizar Badge de Status no Modal
    const badge = dom.botStatusBadge;
    if (currentStatus === 'idle') {
      badge.textContent = 'Parado';
      badge.style.backgroundColor = 'var(--bg-surface-subtle)';
      badge.style.color = 'var(--text-secondary)';
      dom.btnBotStart.classList.remove('hidden');
      dom.btnBotStart.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>Iniciar Busca</span>
      `;
      dom.btnBotStop.classList.add('hidden');
      dom.botCaptchaAlert.classList.add('hidden');
    } else if (currentStatus === 'running') {
      badge.textContent = 'Executando...';
      badge.style.backgroundColor = 'var(--status-applied-bg)';
      badge.style.color = 'var(--kiwi-primary-light)';
      dom.btnBotStart.classList.add('hidden');
      dom.btnBotStop.classList.remove('hidden');
      dom.botCaptchaAlert.classList.add('hidden');
    } else if (currentStatus === 'waiting_captcha') {
      badge.textContent = 'Aguardando Captcha / 2FA';
      badge.style.backgroundColor = 'var(--status-pending-bg)';
      badge.style.color = 'var(--kiwi-primary-light)';
      dom.btnBotStart.classList.add('hidden');
      dom.btnBotStop.classList.remove('hidden');
      dom.botCaptchaAlert.classList.remove('hidden');
    } else if (currentStatus === 'completed') {
      badge.textContent = 'Finalizado com Sucesso';
      badge.style.backgroundColor = 'var(--status-offer-bg)';
      badge.style.color = 'var(--kiwi-primary-light)';
      dom.btnBotStart.classList.remove('hidden');
      dom.btnBotStart.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>Executar Novamente</span>
      `;
      dom.btnBotStop.classList.add('hidden');
      dom.botCaptchaAlert.classList.add('hidden');
    } else if (currentStatus === 'error') {
      badge.textContent = 'Finalizado com Erro';
      badge.style.backgroundColor = 'var(--color-danger-subtle)';
      badge.style.color = 'var(--text-secondary)';
      dom.btnBotStart.classList.remove('hidden');
      dom.btnBotStart.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>Executar Novamente</span>
      `;
      dom.btnBotStop.classList.add('hidden');
      dom.botCaptchaAlert.classList.add('hidden');
    }

    // Renderizar Logs no Terminal
    if (data.logs && data.logs.length > 0) {
      dom.botTerminalLogs.innerHTML = data.logs.map(line => {
        let color = 'var(--text-secondary)';
        if (line.includes('[ERRO]') || line.includes('Error') || line.includes('Erro')) color = 'var(--text-muted)';
        else if (line.includes('PAUSA') || line.includes('Aperte ENTER')) color = 'var(--kiwi-primary-light)';
        else if (line.includes('✅') || line.includes('sucesso') || line.includes('Candidatura')) color = 'var(--kiwi-primary-light)';
        return `<div class="terminal-line" style="color: ${color};">${escapeHtml(line)}</div>`;
      }).join('');
      dom.botTerminalLogs.scrollTop = dom.botTerminalLogs.scrollHeight;
    }

    // Atualização automática ao finalizar
    if (lastBotStatus !== 'completed' && currentStatus === 'completed') {
      showToast('Robô finalizado! Atualizando dados do painel...', 'success');
      await loadData();
    }

    lastBotStatus = currentStatus;
  } catch (error) {
    console.error('[bot] Falha ao consultar o estado:', error);
  }
}

  return {
    openBotModal,
    closeBotModal,
    startBotExecution,
    startBotVerification,
    confirmBotCaptcha,
    stopBotExecution,
    pollBotStatus
  };
}
