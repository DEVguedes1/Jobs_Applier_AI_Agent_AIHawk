/**
 * Kiwi Bot - Career ATS & Pipeline Management
 * Frontend Architecture: Modular, Responsive, Data-Driven
 */

import { apiFetch as request } from '../services/api.js';
import { appState, STAGE_DEFINITIONS, VIEW_METADATA, dom } from './state.js';
import { createAuthController } from '../components/auth.js';
import { createBotRunnerController } from './bot-runner.js';

// ==========================================================================
// API REST & Sincronização
// ==========================================================================
let botController;

async function loadData() {
  try {
    const res = await request('/api/jobs');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Falha ao carregar os dados do banco.');
    appState.jobs       = data.jobs       || [];
    appState.stats      = data.stats      || {};
    appState.statusConfig = data.statusConfig || {};
    appState.activities = data.activities || [];

    populateCompanyFilter();
    updateAllViews();
    botController?.pollBotStatus();
    return true;
  } catch (err) {
    showToast('Falha na comunicação com o servidor', 'error');
    return false;
  }
}

async function updateOpportunity(id, payload) {
  try {
    const res = await request(`/api/jobs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      const idx = appState.jobs.findIndex(j => j.id === id);
      if (idx !== -1) {
        appState.jobs[idx] = data.job;
      }
      // Atualiza estatísticas em background
      request('/api/stats').then(r => r.json()).then(s => {
        if (s.success) appState.stats = s.stats;
      }).catch(() => {});
      updateAllViews();
      return true;
    }
    showToast(data.error || 'Não foi possível atualizar a oportunidade', 'error');
    return false;
  } catch (err) {
    showToast('Falha na comunicação com o servidor', 'error');
    return false;
  }
}

async function createOpportunity(jobPayload) {
  try {
    const res = await request('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobPayload)
    });
    const data = await res.json();
    if (data.success) {
      appState.jobs.unshift(data.job);
      populateCompanyFilter();
      updateAllViews();
      showToast('Oportunidade cadastrada com sucesso', 'success');
      return true;
    }
  } catch (err) {
    showToast('Erro ao cadastrar oportunidade', 'error');
    return false;
  }
}

async function deleteOpportunity(id) {
  if (!confirm('Deseja realmente remover esta oportunidade do acompanhamento?')) return;
  try {
    const res = await request(`/api/jobs/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      appState.jobs = appState.jobs.filter(j => j.id !== id);
      closeDrawer();
      populateCompanyFilter();
      updateAllViews();
      showToast('Oportunidade removida', 'info');
    }
  } catch (err) {
    showToast('Erro ao remover oportunidade', 'error');
  }
}

async function refreshDashboardData() {
  const btn = dom.btnRefreshData;
  btn.disabled = true;
  btn.innerHTML = `<svg class="btn-icon skeleton" width="15" height="15" viewBox="0 0 24 24" style="border-radius:50%"></svg><span>Atualizando…</span>`;
  try {
    if (await loadData()) showToast('Dados atualizados a partir do SQLite.', 'success');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg class="btn-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1 6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg><span>Atualizar</span>`;
  }
}

// ==========================================================================
// Roteamento de Visualização (Abas)
// ==========================================================================
function switchView(viewKey) {
  if (!VIEW_METADATA[viewKey]) return;
  appState.currentView = viewKey;

  // Atualiza sidebar
  dom.navItems.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewKey);
  });

  // Atualiza barra de navegação inferior mobile
  if (dom.mobileNavBtns) {
    dom.mobileNavBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewKey);
    });
  }

  // Atualiza título da Topbar
  dom.pageTitle.textContent = VIEW_METADATA[viewKey].title;
  dom.pageSubtitle.textContent = VIEW_METADATA[viewKey].subtitle;

  // Alterna painéis
  dom.views.forEach(panel => {
    panel.classList.toggle('active', panel.id === `view-${viewKey}`);
  });

  // Fecha drawer se aberto
  closeDrawer();

  // Fecha sidebar no mobile
  dom.sidebar.classList.remove('open');
  if (dom.sidebarBackdrop) dom.sidebarBackdrop.classList.remove('active');

  // Atualiza renderização específica da tela
  renderActiveView();
}

function updateAllViews() {
  updateSidebarBadges();
  renderActiveView();
}

function renderActiveView() {
  switch (appState.currentView) {
    case 'dashboard':
      renderDashboardView();
      break;
    case 'opportunities':
      renderOpportunitiesTable();
      break;
    case 'pipeline':
      renderKanbanPipeline();
      break;
    case 'companies':
      renderCompaniesView();
      break;
    case 'reports':
      renderReportsView();
      break;
  }
}

// ==========================================================================
// RENDERIZAÇÃO: DASHBOARD
// ==========================================================================
function renderDashboardView() {
  const stats = appState.stats || {};
  const jobs = appState.jobs;
  const total = stats.total !== undefined ? stats.total : jobs.length;
  const applied = stats.applied !== undefined ? stats.applied : jobs.filter(j => j.status === 'applied').length;
  const pending = stats.pending !== undefined ? stats.pending : jobs.filter(j => j.status === 'pending').length;
  const active = stats.active !== undefined ? stats.active : jobs.filter(j => ['screening', 'technical', 'interview'].includes(j.status)).length;
  const offers = stats.offers !== undefined ? stats.offers : jobs.filter(j => j.status === 'offer').length;

  const rate = stats.conversionRate !== undefined ? stats.conversionRate : (total > 0 ? Math.round(((applied + active + offers) / total) * 100) : 0);

  // Atualizar contadores a partir de dados reais do banco
  dom.kpiTotal.textContent = total;
  dom.kpiApplied.textContent = applied;
  dom.kpiActive.textContent = active;
  dom.kpiPending.textContent = pending;
  dom.kpiOffers.textContent = offers;
  dom.kpiConversionRate.textContent = `${rate}%`;

  // 1. Funil de Conversão
  renderFunnelVisualizer(jobs);

  // 2. Gráfico Donut de Modalidade
  renderWorkModeChart(jobs);

  // 3. Gráfico de Barras de Etapas
  renderStagesBarChart(jobs);

  // 4. Feed de Atividades Recentes
  renderRecentActivities(jobs);
}

function renderFunnelVisualizer(jobs) {
  const total = jobs.length;
  const stages = [
    { label: 'Oportunidades Mapeadas',  count: total, color: '#A8C2AA' },
    { label: 'Candidaturas Enviadas',   count: jobs.filter(j => j.status !== 'pending').length, color: '#88A98A' },
    { label: 'Triagem / Contato RH',   count: jobs.filter(j => ['screening','technical','interview','offer'].includes(j.status)).length, color: '#88A98A' },
    { label: 'Entrevistas / Testes',   count: jobs.filter(j => ['technical','interview','offer'].includes(j.status)).length, color: '#88A98A' },
    { label: 'Propostas Recebidas',    count: jobs.filter(j => j.status === 'offer').length, color: '#A8C2AA' }
  ];

  dom.funnelVisualizer.innerHTML = stages.map(stage => {
    const pct = total > 0 ? Math.round((stage.count / total) * 100) : 0;
    return `
      <div class="funnel-step">
        <div class="funnel-step-info">
          <span class="funnel-step-name">${stage.label}</span>
          <span class="funnel-step-meta">${stage.count} vagas &nbsp;·&nbsp; ${pct}% do total</span>
        </div>
        <div class="funnel-bar-track">
          <div class="funnel-bar-fill" style="width:${Math.max(pct, 2)}%; background-color: ${stage.color};"></div>
        </div>
        <div class="funnel-step-stat">${stage.count}</div>
      </div>
    `;
  }).join('');
}

function renderWorkModeChart(jobs) {
  const ctx = document.getElementById('chartWorkMode');
  if (!ctx) return;

  const counts = {
    Remoto:     jobs.filter(j => j.workMode === 'Remoto').length,
    Híbrido:    jobs.filter(j => j.workMode === 'Híbrido').length,
    Presencial: jobs.filter(j => j.workMode === 'Presencial').length,
    Outros:     jobs.filter(j => !['Remoto','Híbrido','Presencial'].includes(j.workMode)).length
  };

  if (appState.charts.workMode) appState.charts.workMode.destroy();

  const isMobile = window.innerWidth < 640;

  appState.charts.workMode = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Remoto', 'Híbrido', 'Presencial', 'Outros'],
      datasets: [{
        data: [counts.Remoto, counts.Híbrido, counts.Presencial, counts.Outros],
        backgroundColor: ['#88A98A', '#88A98A', '#A8C2AA', '#505650'],
        borderColor: '#111311',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: isMobile ? 'bottom' : 'right',
          labels: { color: '#9CA3AF', font: { size: 11, family: 'Space Grotesk' }, boxWidth: 10, padding: 10 }
        }
      },
      cutout: '72%'
    }
  });
}

function renderStagesBarChart(jobs) {
  const ctx = document.getElementById('chartStagesBar');
  if (!ctx) return;

  const labels = STAGE_DEFINITIONS.map(s => s.label.split(' / ')[0]);
  const data   = STAGE_DEFINITIONS.map(s => jobs.filter(j => j.status === s.key).length);
  const colors = ['#A8C2AA', '#88A98A', '#88A98A', '#88A98A', '#88A98A', '#A8C2AA', '#505650'];

  if (appState.charts.stagesBar) appState.charts.stagesBar.destroy();

  const isMobile = window.innerWidth < 640;

  appState.charts.stagesBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderRadius: 3 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { 
            color: '#6B7280', 
            font: { size: isMobile ? 9 : 10, family: 'Space Grotesk' },
            maxRotation: isMobile ? 45 : 0,
            minRotation: isMobile ? 30 : 0
          },
          grid: { display: false }
        },
        y: {
          ticks: { color: '#6B7280', stepSize: 2, font: { size: 10, family: 'Space Grotesk' } },
          grid: { color: 'rgba(34,197,94,0.06)' }
        }
      }
    }
  });
}

function renderRecentActivities(jobs) {
  // Usa atividades reais do banco quando disponíveis
  const activities = appState.activities || [];
  if (activities.length === 0) {
    // Fallback: últimas vagas adicionadas
    const recent = [...jobs].slice(0, 6);
    if (recent.length === 0) {
      dom.recentActivitiesList.innerHTML = `<div style="padding:16px;color:var(--text-muted);font-size:0.8125rem">🥝 Nenhuma atividade registrada ainda.</div>`;
      return;
    }
    dom.recentActivitiesList.innerHTML = recent.map(job => {
      const stage = STAGE_DEFINITIONS.find(s => s.key === job.status) || STAGE_DEFINITIONS[0];
      return `<div class="activity-item" onclick="openOpportunityDrawer('${job.id}')" style="cursor:pointer">
        <div class="activity-dot" style="background-color:${stage.color}"></div>
        <div class="activity-body">
          <span class="activity-title">${escapeHtml(job.title)}</span>
          <span class="activity-meta">${escapeHtml(job.company)} · ${stage.label}</span>
        </div></div>`;
    }).join('');
    return;
  }

  const EVENT_ICONS = { criacao: '🌱', mudanca_etapa: '🔄', candidatura: '🚀', anotacao: '📝', default: '⚡' };
  dom.recentActivitiesList.innerHTML = activities.slice(0, 8).map(act => {
    const job = act.job_title ? appState.jobs.find(j => j.id === act.opportunity_id) : null;
    const stage = job ? (STAGE_DEFINITIONS.find(s => s.key === job.status) || STAGE_DEFINITIONS[0]) : null;
    const dotColor = stage ? stage.color : '#4ADE80';
    const icon = EVENT_ICONS[act.event_type] || EVENT_ICONS.default;
    const dateStr = act.created_at ? new Date(act.created_at).toLocaleDateString('pt-BR') : '';
    return `<div class="activity-item" ${job ? `onclick="openOpportunityDrawer('${job.id}')" style="cursor:pointer"` : ''}>
      <div class="activity-dot" style="background-color:${dotColor}"></div>
      <div class="activity-body">
        <span class="activity-title">${icon} ${escapeHtml(act.description || act.job_title || 'Atividade')}</span>
        <span class="activity-meta">${escapeHtml(act.company_name || '')} · ${dateStr}</span>
      </div></div>`;
  }).join('');
}

// ==========================================================================
// RENDERIZAÇÃO: OPORTUNIDADES (TABELA)
// ==========================================================================
function getFilteredOpportunities() {
  const q = appState.filters.search.toLowerCase().trim();
  const mode = appState.filters.workMode;
  const status = appState.filters.status;
  const company = appState.filters.company;

  return appState.jobs.filter(job => {
    if (q) {
      const matchTitle = (job.title || '').toLowerCase().includes(q);
      const matchCompany = (job.company || '').toLowerCase().includes(q);
      const matchLocation = (job.location || '').toLowerCase().includes(q);
      const matchNotes = (job.notes || '').toLowerCase().includes(q);
      if (!matchTitle && !matchCompany && !matchLocation && !matchNotes) return false;
    }

    if (mode !== 'all' && job.workMode !== mode) return false;
    if (status !== 'all' && job.status !== status) return false;
    if (company !== 'all' && job.company !== company) return false;

    return true;
  });
}

function renderOpportunitiesTable() {
  const filtered = getFilteredOpportunities();
  dom.tableFilteredCount.textContent = filtered.length;
  dom.tableTotalCount.textContent = appState.jobs.length;

  if (filtered.length === 0) {
    dom.tableBody.innerHTML = '';
    dom.tableEmptyState.classList.remove('hidden');
    return;
  }

  dom.tableEmptyState.classList.add('hidden');
  dom.tableBody.innerHTML = filtered.map(job => {
    const stage = STAGE_DEFINITIONS.find(s => s.key === job.status) || STAGE_DEFINITIONS[0];
    const dateStr = job.appliedDate ? job.appliedDate.split(' ')[0] : (job.dateAdded ? job.dateAdded.split(' ')[0] : '-');

    return `
      <tr onclick="openOpportunityDrawer('${job.id}')">
        <td>
          <div class="col-job-title">${escapeHtml(job.title)}</div>
          ${job.salary ? `<span class="col-job-sub">${escapeHtml(job.salary)}</span>` : ''}
        </td>
        <td>
          <span class="col-company">${escapeHtml(job.company)}</span>
        </td>
        <td>
          <div>${escapeHtml(job.location || 'Não especificado')}</div>
          <span class="badge-subtle" style="margin-top: 2px;">${escapeHtml(job.workMode || 'Geral')}</span>
        </td>
        <td>
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
            <span class="status-pill status-${stage.key}">
              ${stage.label}
            </span>
            ${(job.originalStatus === 'LINK_EXTERNO_NAO_CADASTRADO' || job.recordStatus === 'LINK_EXTERNO_NAO_CADASTRADO') ? `
              <span class="badge-subtle" style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3)" title="Link externo isolado automaticamente">Externo Isolado</span>
            ` : ''}
          </div>
        </td>
        <td>
          <span style="color: var(--text-muted); font-size: 0.75rem;">${dateStr}</span>
        </td>
        <td style="text-align: right;" onclick="event.stopPropagation();">
          <div style="display: inline-flex; gap: 6px; align-items: center;">
            ${job.url && !job.url.endsWith('/jobs/search/') ? `
              <a href="${job.url}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" title="Acessar link externo">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" x2="21" y1="14" y2="3"></line></svg>
                <span>Link</span>
              </a>
            ` : ''}
            <button class="btn btn-ghost btn-sm" onclick="openOpportunityDrawer('${job.id}')" title="Ver detalhes">
              <span>Detalhes</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================================================
// RENDERIZAÇÃO: PIPELINE (KANBAN)
// ==========================================================================
function renderKanbanPipeline() {
  const jobs = getFilteredOpportunities();
  dom.kanbanContainer.innerHTML = '';

  // Renderiza pills de navegação rápida por estágios no mobile/tablet
  if (dom.pipelineStagePills) {
    dom.pipelineStagePills.innerHTML = STAGE_DEFINITIONS.map((stage, idx) => {
      const stageJobs = jobs.filter(j => j.status === stage.key);
      const isFirst = idx === 0;
      return `
        <button class="pipeline-pill-btn ${isFirst ? 'active' : ''}" data-stage="${stage.key}">
          <span class="pipeline-pill-indicator" style="background-color: ${stage.color};"></span>
          <span>${stage.label.split(' / ')[0]}</span>
          <span class="pipeline-pill-count">${stageJobs.length}</span>
        </button>
      `;
    }).join('');

    dom.pipelineStagePills.querySelectorAll('.pipeline-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        dom.pipelineStagePills.querySelectorAll('.pipeline-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const stageKey = btn.dataset.stage;
        const col = dom.kanbanContainer.querySelector(`.kanban-column[data-stage="${stageKey}"]`);
        if (col) {
          col.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        }
      });
    });
  }

  STAGE_DEFINITIONS.forEach(stage => {
    const stageJobs = jobs.filter(j => j.status === stage.key);

    const colEl = document.createElement('div');
    colEl.className = 'kanban-column';
    colEl.dataset.stage = stage.key;

    colEl.innerHTML = `
      <div class="kanban-column-header">
        <div class="column-title-group">
          <div class="column-indicator" style="background-color: ${stage.color};"></div>
          <span class="column-title">${stage.label}</span>
        </div>
        <span class="column-count">${stageJobs.length}</span>
      </div>
      <div class="kanban-cards-track" data-stage="${stage.key}">
        ${stageJobs.length === 0 ? `
          <div class="column-empty-state">
            <img src="/assets/icon.png" class="column-empty-mascot" alt="Kiwi Bot">
            <span>Nenhuma vaga nesta etapa — o Kiwi está procurando!</span>
          </div>
        ` : ''}
      </div>
    `;

    const track = colEl.querySelector('.kanban-cards-track');

    stageJobs.forEach(job => {
      const card = createKanbanCard(job);
      track.appendChild(card);
    });

    // Drag and drop events com update otimista e rollback
    track.addEventListener('dragover', e => {
      e.preventDefault();
      track.classList.add('drag-over');
    });

    track.addEventListener('dragleave', () => {
      track.classList.remove('drag-over');
    });

    track.addEventListener('drop', async e => {
      e.preventDefault();
      track.classList.remove('drag-over');
      const jobId = e.dataTransfer.getData('text/plain');
      if (!jobId) return;

      const job = appState.jobs.find(j => j.id === jobId);
      if (!job || job.status === stage.key) return;

      const prevStage = job.status;
      // 1. Update Otimista na UI
      job.status = stage.key;
      renderActiveView();

      // 2. Persistência no Banco de Dados
      const ok = await updateOpportunity(jobId, { status: stage.key });
      if (ok) {
        showToast(`Vaga movida para "${stage.label}"`, 'info');
      } else {
        // Rollback automático em caso de erro
        job.status = prevStage;
        renderActiveView();
        showToast('Falha ao persistir no banco. Revertendo.', 'error');
      }
    });

    dom.kanbanContainer.appendChild(colEl);
  });
}

function createKanbanCard(job) {
  const card = document.createElement('div');
  card.className = 'kanban-card';
  card.draggable = true;
  card.dataset.id = job.id;

  const dateStr = job.appliedDate ? job.appliedDate.split(' ')[0] : (job.dateAdded ? job.dateAdded.split(' ')[0] : '-');

  card.innerHTML = `
    <div class="kanban-card-title">${escapeHtml(job.title)}</div>
    <div class="kanban-card-company">${escapeHtml(job.company)}</div>
    <div class="kanban-card-meta">
      <span class="badge-subtle">${escapeHtml(job.workMode || 'Remoto')}</span>
      ${(job.originalStatus === 'LINK_EXTERNO_NAO_CADASTRADO' || job.recordStatus === 'LINK_EXTERNO_NAO_CADASTRADO') ? `
        <span class="badge-subtle" style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3)">Externo Isolado</span>
      ` : ''}
      <span class="kanban-card-date">${dateStr}</span>
    </div>
    <div class="kanban-card-actions" onclick="event.stopPropagation();">
      ${job.url && !job.url.endsWith('/jobs/search/') ? `
        <a href="${job.url}" target="_blank" rel="noopener noreferrer" class="btn-card-action" title="Abrir link original">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" x2="21" y1="14" y2="3"></line></svg>
        </a>
      ` : ''}
      ${job.status === 'pending' ? `
        <button class="btn btn-secondary btn-sm" style="margin-left: auto; padding: 2px 6px; font-size: 0.6875rem;" onclick="quickMarkApplied('${job.id}')" title="Marcar como candidatado com 1 clique">
          Candidatado
        </button>
      ` : ''}
    </div>
  `;

  card.addEventListener('dragstart', e => {
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', job.id);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });

  card.addEventListener('click', () => {
    openOpportunityDrawer(job.id);
  });

  return card;
}

async function quickMarkApplied(jobId) {
  const ok = await updateOpportunity(jobId, { status: 'applied' });
  if (ok) {
    showToast('Candidatura marcada como enviada', 'success');
  }
}

// ==========================================================================
// RENDERIZAÇÃO: EMPRESAS
// ==========================================================================
function renderCompaniesView() {
  const jobs = appState.jobs;
  const companyMap = new Map();

  jobs.forEach(job => {
    const comp = job.company || 'Confidencial';
    if (!companyMap.has(comp)) {
      companyMap.set(comp, []);
    }
    companyMap.get(comp).push(job);
  });

  const sortedCompanies = Array.from(companyMap.entries()).sort((a, b) => b[1].length - a[1].length);

  dom.companiesGrid.innerHTML = sortedCompanies.map(([compName, compJobs]) => {
    return `
      <div class="company-card">
        <div class="company-card-header">
          <span class="company-name">${escapeHtml(compName)}</span>
          <span class="company-jobs-count">${compJobs.length} vaga${compJobs.length > 1 ? 's' : ''}</span>
        </div>
        <div class="company-card-jobs">
          ${compJobs.slice(0, 3).map(j => `
            <div class="company-job-pill" onclick="openOpportunityDrawer('${j.id}')">
              <span>${escapeHtml(j.title)}</span>
              <span style="color: var(--text-muted);">${escapeHtml(j.workMode || '')}</span>
            </div>
          `).join('')}
          ${compJobs.length > 3 ? `<span style="font-size: 0.6875rem; color: var(--text-muted);">+ ${compJobs.length - 3} outra(s)</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================================================
// RENDERIZAÇÃO: RELATÓRIOS
// ==========================================================================
function renderReportsView() {
  const jobs = appState.jobs;
  const total = jobs.length;

  // Tabela de Funil
  dom.reportFunnelTableBody.innerHTML = STAGE_DEFINITIONS.map((stage, idx) => {
    const count = jobs.filter(j => j.status === stage.key).length;
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
    
    // Retenção em relação à etapa anterior
    let retention = '-';
    if (idx > 0) {
      const prevCount = jobs.filter(j => j.status === STAGE_DEFINITIONS[idx - 1].key).length;
      retention = prevCount > 0 ? `${((count / prevCount) * 100).toFixed(0)}%` : '0%';
    }

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${stage.color};"></div>
            <strong>${stage.label}</strong>
          </div>
        </td>
        <td>${count}</td>
        <td>${pct}%</td>
        <td>${retention}</td>
        <td>
          <span class="status-pill status-${stage.key}">
            ${count > 0 ? 'Ativo' : 'Vazio'}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  // Insights
  const appliedCount = jobs.filter(j => j.status !== 'pending').length;
  const interviewCount = jobs.filter(j => ['interview', 'technical'].includes(j.status)).length;
  const interviewRate = appliedCount > 0 ? Math.round((interviewCount / appliedCount) * 100) : 0;

  dom.insightsList.innerHTML = `
    <div class="insight-item">
      <div style="margin-top:2px;color:var(--kiwi-primary)">🎯</div>
      <div><strong>Taxa de Conversão para Entrevistas:</strong> ${interviewRate}% de avanço das candidaturas para entrevistas/testes.</div>
    </div>
    <div class="insight-item">
      <div style="margin-top:2px;color:var(--status-pending)">📌</div>
      <div><strong>Oportunidades Pendentes:</strong> ${jobs.filter(j => j.status === 'pending').length} vagas com links externos prontas para aplicação manual.</div>
    </div>
    <div class="insight-item">
      <div style="margin-top:2px;color:var(--status-offer)">🏢</div>
      <div><strong>Empresas Mapeadas:</strong> ${new Set(jobs.map(j => j.company)).size} empresas diferentes no sistema.</div>
    </div>
    <div class="insight-item">
      <div style="margin-top:2px;color:var(--kiwi-primary)">🥝</div>
      <div><strong>Dica do Kiwi:</strong> Vagas remotas representam ${total > 0 ? Math.round((jobs.filter(j=>j.workMode==='Remoto').length/total)*100) : 0}% das suas oportunidades mapeadas.</div>
    </div>
  `;

  // Localidades
  const locMap = new Map();
  jobs.forEach(j => {
    const loc = j.location || 'Não especificado';
    locMap.set(loc, (locMap.get(loc) || 0) + 1);
  });

  const sortedLocs = Array.from(locMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  dom.locationsList.innerHTML = sortedLocs.map(([loc, count]) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div class="location-item">
        <div class="location-item-header">
          <span>${escapeHtml(loc)}</span>
          <span style="color:var(--text-muted)">${count} (${pct}%)</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

// ==========================================================================
// DRAWER LATERAL (SLIDE-OVER)
// ==========================================================================
function openOpportunityDrawer(jobId) {
  const job = appState.jobs.find(j => j.id === jobId);
  if (!job) return;

  appState.selectedJobId = jobId;

  dom.drawerJobTitle.textContent = job.title;
  dom.drawerCompany.textContent = job.company;
  dom.drawerWorkModeBadge.textContent = job.workMode || 'Geral';

  const stage = STAGE_DEFINITIONS.find(s => s.key === job.status) || STAGE_DEFINITIONS[0];
  dom.drawerStatusPill.textContent = stage.label;
  dom.drawerStatusPill.className = `status-pill status-${stage.key}`;
  dom.drawerStatusPill.style.backgroundColor = '';
  dom.drawerStatusPill.style.color = '';
  dom.drawerStatusPill.style.borderColor = '';

  // Inputs
  dom.drawerInputStatus.value = job.status;
  dom.drawerInputWorkMode.value = job.workMode || 'Remoto';
  dom.drawerInputLocation.value = job.location || '';
  dom.drawerInputSalary.value = job.salary || '';
  dom.drawerInputDate.value = job.appliedDate ? `Candidatado em: ${job.appliedDate}` : (job.dateAdded || '-');
  dom.drawerInputUrl.value = job.url || '';
  dom.drawerInputNotes.value = job.notes || '';
  dom.drawerMetaSource.textContent = `Origem: ${job.source || 'Sistema'}`;
  dom.drawerMetaUpdated.textContent = `Atualizado: ${job.updatedAt ? new Date(job.updatedAt).toLocaleDateString('pt-BR') : '-'}`;

  // Botão de Link Externo
  if (job.url && !job.url.endsWith('/jobs/search/')) {
    dom.drawerExternalLink.href = job.url;
    dom.drawerExternalLink.classList.remove('hidden');
  } else {
    dom.drawerExternalLink.classList.add('hidden');
  }

  // Ação rápida Candidatado
  if (job.status === 'pending') {
    dom.drawerBtnQuickApply.classList.remove('hidden');
  } else {
    dom.drawerBtnQuickApply.classList.add('hidden');
  }

  dom.drawerOverlay.classList.remove('hidden');
}

function closeDrawer() {
  dom.drawerOverlay.classList.add('hidden');
  appState.selectedJobId = null;
}

// ==========================================================================
// MODAL NOVA VAGA
// ==========================================================================
function openNewJobModal() {
  dom.modalNewJob.classList.remove('hidden');
  document.getElementById('newJobTitle').focus();
}

function closeNewJobModal() {
  dom.modalNewJob.classList.add('hidden');
  dom.formCreateJob.reset();
}

// ==========================================================================
// CONTROLE DO ROBÔ LINKEDIN
// ==========================================================================
// ==========================================================================
// TOAST NOTIFICATIONS
// ==========================================================================
function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast-item ${type}`;
  toast.textContent = msg;

  dom.toastStack.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.2s ease-out';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// ==========================================================================
// HELPERS
// ==========================================================================
function updateSidebarBadges() {
  dom.badgeTotalOpps.textContent = appState.jobs.length;
  const companies = new Set(appState.jobs.map(j => j.company));
  dom.badgeTotalCompanies.textContent = companies.size;
}

function populateCompanyFilter() {
  const companies = Array.from(new Set(appState.jobs.map(j => j.company).filter(Boolean))).sort();
  dom.filterCompany.innerHTML = '<option value="all">Todas as Empresas</option>' + 
    companies.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================================================
// EVENT LISTENERS & INICIALIZAÇÃO
// ==========================================================================
function setupEventListeners(auth, bot) {
  // Navegação na Sidebar
  dom.navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  // Navegação na Barra Inferior Mobile
  if (dom.mobileNavBtns) {
    dom.mobileNavBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
      });
    });
  }

  // Toggle Sidebar no Mobile
  // Toggle Sidebar Mobile com Backdrop
  dom.btnToggleSidebar.addEventListener('click', () => {
    const isOpen = dom.sidebar.classList.toggle('open');
    if (dom.sidebarBackdrop) dom.sidebarBackdrop.classList.toggle('active', isOpen);
  });

  if (dom.sidebarBackdrop) {
    dom.sidebarBackdrop.addEventListener('click', () => {
      dom.sidebar.classList.remove('open');
      dom.sidebarBackdrop.classList.remove('active');
    });
  }

  // Atualiza a visualização a partir do SQLite.
  dom.btnRefreshData.addEventListener('click', refreshDashboardData);

  // Modal Nova Vaga
  dom.btnOpenNewJobModal.addEventListener('click', openNewJobModal);
  dom.btnCloseNewJobModal.addEventListener('click', closeNewJobModal);
  dom.btnCancelNewJob.addEventListener('click', closeNewJobModal);

  dom.formCreateJob.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('newJobTitle').value,
      company: document.getElementById('newJobCompany').value,
      workMode: document.getElementById('newJobWorkMode').value,
      status: document.getElementById('newJobStatus').value,
      location: document.getElementById('newJobLocation').value,
      salary: document.getElementById('newJobSalary').value,
      url: document.getElementById('newJobUrl').value,
      notes: document.getElementById('newJobNotes').value,
      source: 'Cadastro Manual'
    };

    const success = await createOpportunity(payload);
    if (success) {
      closeNewJobModal();
    }
  });

  // Drawer Lateral
  dom.btnCloseDrawer.addEventListener('click', closeDrawer);
  dom.drawerBtnCancel.addEventListener('click', closeDrawer);
  dom.drawerOverlay.addEventListener('click', e => {
    if (e.target === dom.drawerOverlay) closeDrawer();
  });

  dom.drawerBtnSave.addEventListener('click', async () => {
    if (!appState.selectedJobId) return;

    const payload = {
      status: dom.drawerInputStatus.value,
      workMode: dom.drawerInputWorkMode.value,
      location: dom.drawerInputLocation.value,
      salary: dom.drawerInputSalary.value,
      url: dom.drawerInputUrl.value,
      notes: dom.drawerInputNotes.value
    };

    const success = await updateOpportunity(appState.selectedJobId, payload);
    if (success) {
      closeDrawer();
      showToast('Alterações salvas com sucesso', 'success');
    }
  });

  dom.drawerBtnQuickApply.addEventListener('click', async () => {
    if (!appState.selectedJobId) return;
    const success = await updateOpportunity(appState.selectedJobId, { status: 'applied' });
    if (success) {
      closeDrawer();
      showToast('Candidatura confirmada', 'success');
    }
  });

  dom.drawerBtnDelete.addEventListener('click', () => {
    if (appState.selectedJobId) {
      deleteOpportunity(appState.selectedJobId);
    }
  });

  // Filtros da Tabela
  let searchDebounce;
  dom.globalSearch.addEventListener('input', e => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      appState.filters.search = e.target.value;
      renderActiveView();
    }, 200);
  });

  dom.filterModalidade.addEventListener('change', e => {
    appState.filters.workMode = e.target.value;
    renderOpportunitiesTable();
  });

  dom.filterEtapa.addEventListener('change', e => {
    appState.filters.status = e.target.value;
    renderOpportunitiesTable();
  });

  dom.filterCompany.addEventListener('change', e => {
    appState.filters.company = e.target.value;
    renderOpportunitiesTable();
  });

  const resetFilters = () => {
    appState.filters = { search: '', workMode: 'all', status: 'all', company: 'all' };
    dom.globalSearch.value = '';
    dom.filterModalidade.value = 'all';
    dom.filterEtapa.value = 'all';
    dom.filterCompany.value = 'all';
    renderActiveView();
    showToast('Filtros restaurados', 'info');
  };

  dom.btnResetTableFilters.addEventListener('click', resetFilters);
  dom.btnEmptyReset.addEventListener('click', resetFilters);

  // Modal e Controles do Robô
  dom.btnOpenBotModal.addEventListener('click', bot.openBotModal);
  dom.btnCloseBotModal.addEventListener('click', bot.closeBotModal);
  dom.btnCancelBotModal.addEventListener('click', bot.closeBotModal);
  dom.btnBotStart.addEventListener('click', bot.startBotExecution);
  if (dom.btnBotVerify) dom.btnBotVerify.addEventListener('click', bot.startBotVerification);
  dom.btnBotConfirmCaptcha.addEventListener('click', bot.confirmBotCaptcha);
  dom.btnBotStop.addEventListener('click', bot.stopBotExecution);

  // Tecla de Atalho '/' para Buscar e Escape para Fechar
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== dom.globalSearch && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      dom.globalSearch.focus();
    }
    if (e.key === 'Escape') {
      closeDrawer();
      closeNewJobModal();
      bot.closeBotModal();
      auth.closeProfileModal();
      auth.closeTopbarUserMenu();
    }
  });
}

export async function startDashboard() {
  botController = createBotRunnerController({ showToast, loadData, escapeHtml });
  const auth = createAuthController({
    showToast,
    loadData
  });
  setupEventListeners(auth, botController);
  auth.setupAuthEventListeners();
  window.openOpportunityDrawer = openOpportunityDrawer;
  window.quickMarkApplied = quickMarkApplied;
  await auth.checkAuthStatus();
}
