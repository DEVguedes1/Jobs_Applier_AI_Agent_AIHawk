/**
 * JobPulse - Career ATS & Pipeline Management
 * Frontend Architecture: Modular, Responsive, Data-Driven
 */

// Estado Global da Aplicação
const appState = {
  jobs: [],
  stats: {},
  statusConfig: {},
  currentView: 'dashboard',
  selectedJobId: null,
  filters: {
    search: '',
    workMode: 'all',
    status: 'all',
    company: 'all'
  },
  charts: {
    workMode: null,
    stagesBar: null
  }
};

// Definição Semântica das Etapas do Processo
const STAGE_DEFINITIONS = [
  { key: 'pending', label: 'Pendente / Link Externo', color: 'var(--status-pending)' },
  { key: 'applied', label: 'Candidatura Enviada', color: 'var(--status-applied)' },
  { key: 'screening', label: 'Triagem / Contato RH', color: 'var(--status-screening)' },
  { key: 'technical', label: 'Desafio Técnico', color: 'var(--status-technical)' },
  { key: 'interview', label: 'Entrevista', color: 'var(--status-interview)' },
  { key: 'offer', label: 'Proposta / Oferta', color: 'var(--status-offer)' },
  { key: 'rejected', label: 'Não Selecionado', color: 'var(--status-rejected)' }
];

// Metadados das Telas do Menu
const VIEW_METADATA = {
  dashboard: {
    title: 'Dashboard Analítico',
    subtitle: 'Visão geral e métricas de desempenho das suas candidaturas'
  },
  opportunities: {
    title: 'Oportunidades & Vagas',
    subtitle: 'Listagem completa com filtros avançados e busca em tempo real'
  },
  pipeline: {
    title: 'Pipeline de Seleção',
    subtitle: 'Quadro Kanban com acompanhamento de fases do processo seletivo'
  },
  companies: {
    title: 'Diretório de Empresas',
    subtitle: 'Empresas contratantes com vagas ativas ou acompanhadas'
  },
  reports: {
    title: 'Relatórios de Conversão',
    subtitle: 'Análise detalhada de taxas de passagem e eficiência do funil'
  }
};

// Referências aos Elementos DOM
const dom = {
  // Navegação
  navItems: document.querySelectorAll('.nav-item'),
  views: document.querySelectorAll('.view-panel'),
  pageTitle: document.getElementById('currentPageTitle'),
  pageSubtitle: document.getElementById('currentPageSubtitle'),
  badgeTotalOpps: document.getElementById('badgeTotalOpps'),
  badgeTotalCompanies: document.getElementById('badgeTotalCompanies'),
  btnToggleSidebar: document.getElementById('btnToggleSidebar'),
  sidebar: document.querySelector('.sidebar'),

  // Busca e Topbar
  globalSearch: document.getElementById('globalSearchInput'),
  btnSyncCsv: document.getElementById('btnSyncCsv'),
  btnOpenNewJobModal: document.getElementById('btnOpenNewJobModal'),

  // KPIs Dashboard
  kpiTotal: document.getElementById('kpiTotal'),
  kpiApplied: document.getElementById('kpiApplied'),
  kpiActive: document.getElementById('kpiActive'),
  kpiPending: document.getElementById('kpiPending'),
  kpiOffers: document.getElementById('kpiOffers'),
  kpiConversionRate: document.getElementById('kpiConversionRate'),
  funnelVisualizer: document.getElementById('funnelVisualizer'),
  recentActivitiesList: document.getElementById('recentActivitiesList'),

  // Tabela Oportunidades
  tableBody: document.getElementById('opportunitiesTableBody'),
  tableEmptyState: document.getElementById('tableEmptyState'),
  filterModalidade: document.getElementById('filterTableModalidade'),
  filterEtapa: document.getElementById('filterTableEtapa'),
  filterCompany: document.getElementById('filterTableCompany'),
  btnResetTableFilters: document.getElementById('btnResetTableFilters'),
  btnEmptyReset: document.getElementById('btnEmptyReset'),
  tableFilteredCount: document.getElementById('tableFilteredCount'),
  tableTotalCount: document.getElementById('tableTotalCount'),

  // Kanban Pipeline
  kanbanContainer: document.getElementById('kanbanContainer'),

  // Empresas & Relatórios
  companiesGrid: document.getElementById('companiesGrid'),
  reportFunnelTableBody: document.getElementById('reportFunnelTableBody'),
  insightsList: document.getElementById('insightsList'),
  locationsList: document.getElementById('locationsList'),

  // Drawer Lateral
  drawerOverlay: document.getElementById('drawerOverlay'),
  drawerPanel: document.getElementById('drawerPanel'),
  btnCloseDrawer: document.getElementById('btnCloseDrawer'),
  drawerStatusPill: document.getElementById('drawerStatusPill'),
  drawerWorkModeBadge: document.getElementById('drawerWorkModeBadge'),
  drawerJobTitle: document.getElementById('drawerJobTitle'),
  drawerCompany: document.getElementById('drawerCompany'),
  drawerExternalLink: document.getElementById('drawerExternalLink'),
  drawerBtnQuickApply: document.getElementById('drawerBtnQuickApply'),
  drawerInputStatus: document.getElementById('drawerInputStatus'),
  drawerInputWorkMode: document.getElementById('drawerInputWorkMode'),
  drawerInputLocation: document.getElementById('drawerInputLocation'),
  drawerInputSalary: document.getElementById('drawerInputSalary'),
  drawerInputDate: document.getElementById('drawerInputDate'),
  drawerInputUrl: document.getElementById('drawerInputUrl'),
  drawerInputNotes: document.getElementById('drawerInputNotes'),
  drawerMetaSource: document.getElementById('drawerMetaSource'),
  drawerMetaUpdated: document.getElementById('drawerMetaUpdated'),
  drawerBtnDelete: document.getElementById('drawerBtnDelete'),
  drawerBtnCancel: document.getElementById('drawerBtnCancel'),
  drawerBtnSave: document.getElementById('drawerBtnSave'),

  // Modal Nova Vaga
  modalNewJob: document.getElementById('modalNewJob'),
  formCreateJob: document.getElementById('formCreateJob'),
  btnCloseNewJobModal: document.getElementById('btnCloseNewJobModal'),
  btnCancelNewJob: document.getElementById('btnCancelNewJob'),

  // Modal e Controle do Robô
  btnOpenBotModal: document.getElementById('btnOpenBotModal'),
  modalBotRunner: document.getElementById('modalBotRunner'),
  btnCloseBotModal: document.getElementById('btnCloseBotModal'),
  btnCancelBotModal: document.getElementById('btnCancelBotModal'),
  btnBotStart: document.getElementById('btnBotStart'),
  btnBotStop: document.getElementById('btnBotStop'),
  btnBotConfirmCaptcha: document.getElementById('btnBotConfirmCaptcha'),
  botStatusBadge: document.getElementById('botStatusBadge'),
  botCaptchaAlert: document.getElementById('botCaptchaAlert'),
  botTerminalLogs: document.getElementById('botTerminalLogs'),

  toastStack: document.getElementById('toastNotificationStack')
};

// ==========================================================================
// API REST & Sincronização
// ==========================================================================
async function loadData() {
  try {
    const res = await fetch('/api/jobs');
    const data = await res.json();
    if (data.success) {
      appState.jobs = data.jobs || [];
      appState.stats = data.stats || {};
      appState.statusConfig = data.statusConfig || {};
      
      populateCompanyFilter();
      updateAllViews();
      pollBotStatus();
    }
  } catch (err) {
    showToast('Falha na comunicação com o servidor', 'error');
  }
}

async function updateOpportunity(id, payload) {
  try {
    const res = await fetch(`/api/jobs/${id}`, {
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
      updateAllViews();
      return true;
    }
  } catch (err) {
    showToast('Não foi possível atualizar a oportunidade', 'error');
    return false;
  }
}

async function createOpportunity(jobPayload) {
  try {
    const res = await fetch('/api/jobs', {
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
    const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
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

async function triggerCsvSync() {
  const btn = dom.btnSyncCsv;
  btn.disabled = true;
  btn.style.opacity = '0.6';
  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Sincronização concluída com sucesso', 'success');
      await loadData();
    }
  } catch (err) {
    showToast('Falha na sincronização dos arquivos CSV', 'error');
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
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
  const jobs = appState.jobs;
  const total = jobs.length;
  const applied = jobs.filter(j => j.status === 'applied').length;
  const pending = jobs.filter(j => j.status === 'pending').length;
  const active = jobs.filter(j => ['screening', 'technical', 'interview'].includes(j.status)).length;
  const offers = jobs.filter(j => j.status === 'offer').length;

  const rate = total > 0 ? Math.round(((applied + active + offers) / total) * 100) : 0;

  // Atualizar contadores
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
    { label: 'Oportunidades Mapeadas', count: total, color: '#6366F1' },
    { label: 'Candidaturas Enviadas', count: jobs.filter(j => j.status !== 'pending').length, color: '#06B6D4' },
    { label: 'Triagem / Contato RH', count: jobs.filter(j => ['screening', 'technical', 'interview', 'offer'].includes(j.status)).length, color: '#8B5CF6' },
    { label: 'Entrevistas / Testes', count: jobs.filter(j => ['technical', 'interview', 'offer'].includes(j.status)).length, color: '#EC4899' },
    { label: 'Propostas Recebidas', count: jobs.filter(j => j.status === 'offer').length, color: '#10B981' }
  ];

  dom.funnelVisualizer.innerHTML = stages.map(stage => {
    const pct = total > 0 ? Math.round((stage.count / total) * 100) : 0;
    return `
      <div class="funnel-step">
        <div class="funnel-step-info">
          <span class="funnel-step-name">${stage.label}</span>
          <span class="funnel-step-meta">${stage.count} vagas (${pct}% do total)</span>
        </div>
        <div class="funnel-bar-track">
          <div class="funnel-bar-fill" style="width: ${Math.max(pct, 3)}%; background-color: ${stage.color};"></div>
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
    Remoto: jobs.filter(j => j.workMode === 'Remoto').length,
    Híbrido: jobs.filter(j => j.workMode === 'Híbrido').length,
    Presencial: jobs.filter(j => j.workMode === 'Presencial').length,
    Outros: jobs.filter(j => !['Remoto', 'Híbrido', 'Presencial'].includes(j.workMode)).length
  };

  if (appState.charts.workMode) {
    appState.charts.workMode.destroy();
  }

  appState.charts.workMode = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Remoto', 'Híbrido', 'Presencial', 'Outros'],
      datasets: [{
        data: [counts.Remoto, counts.Híbrido, counts.Presencial, counts.Outros],
        backgroundColor: ['#10B981', '#06B6D4', '#F59E0B', '#64748B'],
        borderColor: '#131823',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#94A3B8',
            font: { size: 11, family: 'Inter' },
            boxWidth: 12,
            padding: 12
          }
        }
      },
      cutout: '72%'
    }
  });
}

function renderStagesBarChart(jobs) {
  const ctx = document.getElementById('chartStagesBar');
  if (!ctx) return;

  const labels = STAGE_DEFINITIONS.map(s => s.label);
  const data = STAGE_DEFINITIONS.map(s => jobs.filter(j => j.status === s.key).length);
  const colors = ['#F59E0B', '#6366F1', '#8B5CF6', '#06B6D4', '#EC4899', '#10B981', '#64748B'];

  if (appState.charts.stagesBar) {
    appState.charts.stagesBar.destroy();
  }

  appState.charts.stagesBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: {
            color: '#64748B',
            font: { size: 10, family: 'Inter' }
          },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: '#64748B',
            stepSize: 2,
            font: { size: 10, family: 'Inter' }
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.04)'
          }
        }
      }
    }
  });
}

function renderRecentActivities(jobs) {
  const recent = [...jobs].slice(0, 5);
  if (recent.length === 0) {
    dom.recentActivitiesList.innerHTML = `<div style="padding: 16px; color: var(--text-muted); font-size: 0.8125rem;">Nenhuma atividade recente registrada.</div>`;
    return;
  }

  dom.recentActivitiesList.innerHTML = recent.map(job => {
    const stage = STAGE_DEFINITIONS.find(s => s.key === job.status) || STAGE_DEFINITIONS[0];
    return `
      <div class="activity-item" onclick="openOpportunityDrawer('${job.id}')" style="cursor: pointer;">
        <div class="activity-dot" style="background-color: ${stage.color};"></div>
        <div class="activity-body">
          <span class="activity-title">${escapeHtml(job.title)}</span>
          <span class="activity-meta">${escapeHtml(job.company)} • ${stage.label}</span>
        </div>
      </div>
    `;
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
          <span class="status-pill" style="background-color: ${stage.color}15; color: ${stage.color}; border-color: ${stage.color}35;">
            ${stage.label}
          </span>
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
            <span>Nenhuma vaga nesta etapa</span>
          </div>
        ` : ''}
      </div>
    `;

    const track = colEl.querySelector('.kanban-cards-track');

    stageJobs.forEach(job => {
      const card = createKanbanCard(job);
      track.appendChild(card);
    });

    // Drag and drop events
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
      if (jobId) {
        const job = appState.jobs.find(j => j.id === jobId);
        if (job && job.status !== stage.key) {
          await updateOpportunity(jobId, { status: stage.key });
          showToast(`Vaga movida para "${stage.label}"`, 'info');
        }
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
          <span class="status-pill" style="background-color: ${stage.color}15; color: ${stage.color};">
            Ativo
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
      <div style="margin-top: 2px; color: var(--color-primary);">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
      </div>
      <div><strong>Taxa de Conversão para Entrevistas:</strong> Você tem ${interviewRate}% de avanço das candidaturas submetidas para entrevistas ou testes.</div>
    </div>
    <div class="insight-item">
      <div style="margin-top: 2px; color: var(--status-pending);">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
      </div>
      <div><strong>Oportunidades Pendentes:</strong> Há ${jobs.filter(j => j.status === 'pending').length} vagas pendentes com links externos prontas para aplicação manual.</div>
    </div>
    <div class="insight-item">
      <div style="margin-top: 2px; color: var(--status-offer);">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
      </div>
      <div><strong>Empresas Mapeadas:</strong> Você tem contato com ${new Set(jobs.map(j => j.company)).size} empresas diferentes registradas no sistema.</div>
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
          <span style="color: var(--text-muted);">${count} (${pct}%)</span>
        </div>
        <div class="funnel-bar-track">
          <div class="funnel-bar-fill" style="width: ${pct}%; background-color: var(--color-primary);"></div>
        </div>
      </div>
    `;
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
  dom.drawerStatusPill.style.backgroundColor = `${stage.color}15`;
  dom.drawerStatusPill.style.color = stage.color;
  dom.drawerStatusPill.style.borderColor = `${stage.color}30`;

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
let botPollInterval = null;
let lastBotStatus = 'idle';

async function openBotModal() {
  dom.modalBotRunner.classList.remove('hidden');

  try {
    const res = await fetch('/api/bot/status');
    const data = await res.json();
    const currentStatus = data.status || 'idle';
    lastBotStatus = currentStatus;

    if (currentStatus !== 'running' && currentStatus !== 'waiting_captcha') {
      dom.botTerminalLogs.innerHTML = '<div class="terminal-line" style="color: var(--accent-secondary); font-weight: 500;">[Inicializando robô e abrindo navegador Chrome...]</div>';
      dom.botStatusBadge.textContent = 'Iniciando...';
      dom.botStatusBadge.style.backgroundColor = 'var(--status-applied-bg)';
      dom.botStatusBadge.style.color = '#60a5fa';
      await startBotExecution();
    } else {
      await pollBotStatus();
    }
  } catch (err) {
    await startBotExecution();
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
    const res = await fetch('/api/bot/start', { method: 'POST' });
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

async function confirmBotCaptcha() {
  try {
    const res = await fetch('/api/bot/continue', { method: 'POST' });
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
    const res = await fetch('/api/bot/stop', { method: 'POST' });
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
    const res = await fetch('/api/bot/status');
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
        dom.btnOpenBotModal.style.color = '#60a5fa';
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
      badge.style.color = '#60a5fa';
      dom.btnBotStart.classList.add('hidden');
      dom.btnBotStop.classList.remove('hidden');
      dom.botCaptchaAlert.classList.add('hidden');
    } else if (currentStatus === 'waiting_captcha') {
      badge.textContent = 'Aguardando Captcha / 2FA';
      badge.style.backgroundColor = 'var(--status-pending-bg)';
      badge.style.color = '#facc15';
      dom.btnBotStart.classList.add('hidden');
      dom.btnBotStop.classList.remove('hidden');
      dom.botCaptchaAlert.classList.remove('hidden');
    } else if (currentStatus === 'completed') {
      badge.textContent = 'Finalizado com Sucesso';
      badge.style.backgroundColor = 'var(--status-offer-bg)';
      badge.style.color = '#34d399';
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
      badge.style.color = '#f87171';
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
        let color = '#cbd5e1';
        if (line.includes('[ERRO]') || line.includes('Error') || line.includes('Erro')) color = '#f87171';
        else if (line.includes('PAUSA') || line.includes('Aperte ENTER')) color = '#facc15';
        else if (line.includes('✅') || line.includes('sucesso') || line.includes('Candidatura')) color = '#34d399';
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
  } catch (e) {
    // Falha silenciosa
  }
}

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
function setupEventListeners() {
  // Navegação na Sidebar
  dom.navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  // Toggle Sidebar no Mobile
  dom.btnToggleSidebar.addEventListener('click', () => {
    dom.sidebar.classList.toggle('open');
  });

  // Sincronização
  dom.btnSyncCsv.addEventListener('click', triggerCsvSync);

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
  dom.btnOpenBotModal.addEventListener('click', openBotModal);
  dom.btnCloseBotModal.addEventListener('click', closeBotModal);
  dom.btnCancelBotModal.addEventListener('click', closeBotModal);
  dom.btnBotStart.addEventListener('click', startBotExecution);
  dom.btnBotConfirmCaptcha.addEventListener('click', confirmBotCaptcha);
  dom.btnBotStop.addEventListener('click', stopBotExecution);

  // Tecla de Atalho '/' para Buscar e Escape para Fechar
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== dom.globalSearch && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      dom.globalSearch.focus();
    }
    if (e.key === 'Escape') {
      closeDrawer();
      closeNewJobModal();
      closeBotModal();
    }
  });
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadData();
});
