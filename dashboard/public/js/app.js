/**
 * Kiwi Bot - Career ATS & Pipeline Management
 * Frontend Architecture: Modular, Responsive, Data-Driven
 */

// Estado Global da Aplicação
const appState = {
  user: null,
  jobs: [],
  stats: {},
  statusConfig: {},
  activities: [],
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

// Definição Semântica das Etapas do Processo — Estritamente Preto & Verde Kiwi
const STAGE_DEFINITIONS = [
  { key: 'pending', label: 'Pendente / Link Externo', color: '#A8C2AA' },
  { key: 'applied', label: 'Candidatura Enviada', color: '#88A98A' },
  { key: 'screening', label: 'Triagem / Contato RH', color: '#88A98A' },
  { key: 'technical', label: 'Desafio Técnico', color: '#88A98A' },
  { key: 'interview', label: 'Entrevista', color: '#88A98A' },
  { key: 'offer', label: 'Proposta / Oferta', color: '#A8C2AA' },
  { key: 'rejected', label: 'Não Selecionado', color: '#858A85' }
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
  landingPage: document.getElementById('landingPage'),
  appLayout: document.getElementById('appLayout'),
  // Navegação
  navItems: document.querySelectorAll('.nav-item'),
  mobileNavBtns: document.querySelectorAll('.mobile-nav-btn'),
  pipelineStagePills: document.getElementById('pipelineStagePills'),
  views: document.querySelectorAll('.view-panel'),
  pageTitle: document.getElementById('currentPageTitle'),
  pageSubtitle: document.getElementById('currentPageSubtitle'),
  badgeTotalOpps: document.getElementById('badgeTotalOpps'),
  badgeTotalCompanies: document.getElementById('badgeTotalCompanies'),
  btnToggleSidebar: document.getElementById('btnToggleSidebar'),
  sidebar: document.querySelector('.sidebar'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),

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

  toastStack: document.getElementById('toastNotificationStack'),

  // Autenticação & Cadastro
  authModal: document.getElementById('authModal'),
  tabBtnLogin: document.getElementById('tabBtnLogin'),
  tabBtnRegister: document.getElementById('tabBtnRegister'),
  paneLogin: document.getElementById('paneLogin'),
  paneRegister: document.getElementById('paneRegister'),
  formAuthLogin: document.getElementById('formAuthLogin'),
  formAuthRegister: document.getElementById('formAuthRegister'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  loginRememberMe: document.getElementById('loginRememberMe'),
  btnLoginSubmit: document.getElementById('btnLoginSubmit'),
  loginSpinner: document.getElementById('loginSpinner'),
  loginAlertBox: document.getElementById('loginAlertBox'),
  loginAlertText: document.getElementById('loginAlertText'),
  linkGoToRegister: document.getElementById('linkGoToRegister'),
  linkGoToLogin: document.getElementById('linkGoToLogin'),
  btnToggleLoginPassword: document.getElementById('btnToggleLoginPassword'),

  registerName: document.getElementById('registerName'),
  registerEmail: document.getElementById('registerEmail'),
  registerPassword: document.getElementById('registerPassword'),
  registerPasswordConfirm: document.getElementById('registerPasswordConfirm'),
  btnToggleRegisterPassword: document.getElementById('btnToggleRegisterPassword'),
  btnRegisterSubmit: document.getElementById('btnRegisterSubmit'),
  registerSpinner: document.getElementById('registerSpinner'),
  registerAlertBox: document.getElementById('registerAlertBox'),
  registerAlertText: document.getElementById('registerAlertText'),
  meterBar1: document.getElementById('meterBar1'),
  meterBar2: document.getElementById('meterBar2'),
  meterBar3: document.getElementById('meterBar3'),
  meterText: document.getElementById('meterText'),
  passwordMatchHint: document.getElementById('passwordMatchHint'),

  // Perfil Sidebar & Topbar
  sidebarUserProfilePill: document.getElementById('sidebarUserProfilePill'),
  sidebarUserDetails: document.getElementById('sidebarUserDetails'),
  sidebarUserName: document.getElementById('sidebarUserName'),
  sidebarUserStatus: document.getElementById('sidebarUserStatus'),
  sidebarAvatarText: document.getElementById('sidebarAvatarText'),
  sidebarAvatarImg: document.getElementById('sidebarAvatarImg'),
  btnSidebarLogout: document.getElementById('btnSidebarLogout'),

  topbarUserMenuWrap: document.getElementById('topbarUserMenuWrap'),
  btnTopbarUserMenu: document.getElementById('btnTopbarUserMenu'),
  topbarUserInitials: document.getElementById('topbarUserInitials'),
  topbarUserName: document.getElementById('topbarUserName'),
  userDropdownCard: document.getElementById('userDropdownCard'),
  dropdownUserName: document.getElementById('dropdownUserName'),
  dropdownUserEmail: document.getElementById('dropdownUserEmail'),
  btnOpenProfileModal: document.getElementById('btnOpenProfileModal'),
  btnDropdownLogout: document.getElementById('btnDropdownLogout'),

  // Modal de Edição de Perfil
  profileModal: document.getElementById('profileModal'),
  btnCloseProfileModal: document.getElementById('btnCloseProfileModal'),
  btnCancelProfileModal: document.getElementById('btnCancelProfileModal'),
  btnSaveProfile: document.getElementById('btnSaveProfile'),
  profileSpinner: document.getElementById('profileSpinner'),
  profileAlertBox: document.getElementById('profileAlertBox'),
  profileAlertText: document.getElementById('profileAlertText'),
  profileModalAvatar: document.getElementById('profileModalAvatar'),
  profileDisplayName: document.getElementById('profileDisplayName'),
  profileDisplayEmail: document.getElementById('profileDisplayEmail'),
  profileInputName: document.getElementById('profileInputName'),
  profileInputEmail: document.getElementById('profileInputEmail'),
  profileCurrentPassword: document.getElementById('profileCurrentPassword'),
  profileNewPassword: document.getElementById('profileNewPassword'),
  profileConfirmNewPassword: document.getElementById('profileConfirmNewPassword'),
  btnProfileLogout: document.getElementById('btnProfileLogout')
};

// ==========================================================================
// API REST & Sincronização
// ==========================================================================
async function loadData() {
  try {
    const res = await fetch('/api/jobs');
    const data = await res.json();
    if (data.success) {
      appState.jobs       = data.jobs       || [];
      appState.stats      = data.stats      || {};
      appState.statusConfig = data.statusConfig || {};
      appState.activities = data.activities || [];

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
      // Atualiza estatísticas em background
      fetch('/api/stats').then(r => r.json()).then(s => {
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
  btn.innerHTML = `<svg class="btn-icon skeleton" width="15" height="15" viewBox="0 0 24 24" style="border-radius:50%"></svg><span>Sincronizando…</span>`;
  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Sincronização concluída!', 'success');
      await loadData();
    }
  } catch (err) {
    showToast('Falha na sincronização', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg class="btn-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg><span>Sincronizar</span>`;
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
          <span class="status-pill status-${stage.key}">
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
      dom.botStatusBadge.style.color = 'var(--kiwi-primary-light)';
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
      closeProfileModal();
      closeTopbarUserMenu();
    }
  });
}

// ==========================================================================
// MÓDULO DE AUTENTICAÇÃO & USUÁRIO
// ==========================================================================

function getUserInitials(name) {
  if (!name) return 'KB';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function updateUserUI(user) {
  if (!user) return;
  const initials = getUserInitials(user.name);
  const firstName = user.name.split(/\s+/)[0];

  // Sidebar
  if (dom.sidebarUserName) dom.sidebarUserName.textContent = user.name;
  if (dom.sidebarAvatarText) dom.sidebarAvatarText.textContent = initials;
  if (dom.sidebarUserStatus) dom.sidebarUserStatus.textContent = `🥝 ${user.email}`;

  // Topbar
  if (dom.topbarUserName) dom.topbarUserName.textContent = firstName;
  if (dom.topbarUserInitials) dom.topbarUserInitials.textContent = initials;
  if (dom.dropdownUserName) dom.dropdownUserName.textContent = user.name;
  if (dom.dropdownUserEmail) dom.dropdownUserEmail.textContent = user.email;

  // Modal de Perfil
  if (dom.profileDisplayName) dom.profileDisplayName.textContent = user.name;
  if (dom.profileDisplayEmail) dom.profileDisplayEmail.textContent = user.email;
  if (dom.profileModalAvatar) dom.profileModalAvatar.textContent = initials;
  if (dom.profileInputName) dom.profileInputName.value = user.name;
  if (dom.profileInputEmail) dom.profileInputEmail.value = user.email;
}

function showPublicLanding() {
  dom.landingPage?.classList.remove('hidden');
  dom.appLayout?.classList.add('hidden');
  document.body.classList.add('public-mode');
}

function showAppShell() {
  dom.landingPage?.classList.add('hidden');
  dom.appLayout?.classList.remove('hidden');
  document.body.classList.remove('public-mode');
}

function showAuthModal(defaultTab = 'login') {
  if (!dom.authModal) return;
  dom.authModal.classList.remove('hidden');
  switchAuthTab(defaultTab);
}

function hideAuthModal() {
  if (!dom.authModal) return;
  dom.authModal.classList.add('hidden');
}

function switchAuthTab(tab) {
  clearAuthAlerts();
  if (tab === 'login') {
    dom.tabBtnLogin?.classList.add('active');
    dom.tabBtnLogin?.setAttribute('aria-selected', 'true');
    dom.tabBtnRegister?.classList.remove('active');
    dom.tabBtnRegister?.setAttribute('aria-selected', 'false');

    if (dom.paneLogin) dom.paneLogin.style.display = 'flex';
    if (dom.paneRegister) dom.paneRegister.style.display = 'none';
    setTimeout(() => dom.loginEmail?.focus(), 80);
  } else {
    dom.tabBtnRegister?.classList.add('active');
    dom.tabBtnRegister?.setAttribute('aria-selected', 'true');
    dom.tabBtnLogin?.classList.remove('active');
    dom.tabBtnLogin?.setAttribute('aria-selected', 'false');

    if (dom.paneRegister) dom.paneRegister.style.display = 'flex';
    if (dom.paneLogin) dom.paneLogin.style.display = 'none';
    setTimeout(() => dom.registerName?.focus(), 80);
  }
}

function clearAuthAlerts() {
  if (dom.loginAlertBox) {
    dom.loginAlertBox.classList.add('hidden');
    dom.loginAlertBox.classList.remove('success');
  }
  if (dom.loginAlertText) dom.loginAlertText.textContent = '';
  if (dom.registerAlertBox) {
    dom.registerAlertBox.classList.add('hidden');
    dom.registerAlertBox.classList.remove('success');
  }
  if (dom.registerAlertText) dom.registerAlertText.textContent = '';
  if (dom.profileAlertBox) {
    dom.profileAlertBox.classList.add('hidden');
    dom.profileAlertBox.classList.remove('success');
  }
}

function showLoginAlert(msg, isSuccess = false) {
  if (!dom.loginAlertBox || !dom.loginAlertText) return;
  dom.loginAlertText.textContent = msg;
  if (isSuccess) dom.loginAlertBox.classList.add('success');
  else dom.loginAlertBox.classList.remove('success');
  dom.loginAlertBox.classList.remove('hidden');
}

function showRegisterAlert(msg, isSuccess = false) {
  if (!dom.registerAlertBox || !dom.registerAlertText) return;
  dom.registerAlertText.textContent = msg;
  if (isSuccess) dom.registerAlertBox.classList.add('success');
  else dom.registerAlertBox.classList.remove('success');
  dom.registerAlertBox.classList.remove('hidden');
}

function showProfileAlert(msg, isSuccess = false) {
  if (!dom.profileAlertBox || !dom.profileAlertText) return;
  dom.profileAlertText.textContent = msg;
  if (isSuccess) dom.profileAlertBox.classList.add('success');
  else dom.profileAlertBox.classList.remove('success');
  dom.profileAlertBox.classList.remove('hidden');
}

function togglePasswordVisibility(inputEl, btnEl) {
  if (!inputEl) return;
  const isPassword = inputEl.type === 'password';
  inputEl.type = isPassword ? 'text' : 'password';

  if (btnEl) {
    const iconOpen = btnEl.querySelector('.icon-eye-open');
    const iconClosed = btnEl.querySelector('.icon-eye-closed');
    if (iconOpen && iconClosed) {
      if (isPassword) {
        iconOpen.classList.add('hidden');
        iconClosed.classList.remove('hidden');
      } else {
        iconOpen.classList.remove('hidden');
        iconClosed.classList.add('hidden');
      }
    }
  }
}

function updatePasswordStrengthUI(pwd) {
  if (!dom.meterBar1 || !dom.meterBar2 || !dom.meterBar3 || !dom.meterText) return;

  dom.meterBar1.className = 'meter-bar';
  dom.meterBar2.className = 'meter-bar';
  dom.meterBar3.className = 'meter-bar';

  if (!pwd) {
    dom.meterText.textContent = 'Mínimo de 6 caracteres';
    dom.meterText.style.color = 'var(--text-muted)';
    return;
  }

  let score = 0;
  if (pwd.length >= 6) score++;
  if (pwd.length >= 8 && (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd))) score++;
  if (pwd.length >= 10 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;

  if (score === 1) {
    dom.meterBar1.classList.add('weak');
    dom.meterText.textContent = 'Força: Senha fraca';
    dom.meterText.style.color = 'var(--kiwi-primary-light)';
  } else if (score === 2) {
    dom.meterBar1.classList.add('medium');
    dom.meterBar2.classList.add('medium');
    dom.meterText.textContent = 'Força: Senha média';
    dom.meterText.style.color = 'var(--kiwi-primary-light)';
  } else if (score >= 3) {
    dom.meterBar1.classList.add('strong');
    dom.meterBar2.classList.add('strong');
    dom.meterBar3.classList.add('strong');
    dom.meterText.textContent = 'Força: Senha forte e segura! ✅';
    dom.meterText.style.color = 'var(--kiwi-primary)';
  }
}

function updatePasswordMatchUI() {
  if (!dom.passwordMatchHint || !dom.registerPasswordConfirm) return;
  const pwd = dom.registerPassword.value;
  const conf = dom.registerPasswordConfirm.value;

  if (!conf) {
    dom.passwordMatchHint.classList.add('hidden');
    dom.passwordMatchHint.textContent = '';
    return;
  }

  dom.passwordMatchHint.classList.remove('hidden');
  if (pwd === conf) {
    dom.passwordMatchHint.className = 'password-match-hint match';
    dom.passwordMatchHint.textContent = '✓ Senhas conferem';
  } else {
    dom.passwordMatchHint.className = 'password-match-hint nomatch';
    dom.passwordMatchHint.textContent = '✕ As senhas não conferem';
  }
}

function getAuthHeaders(extraHeaders = {}) {
  const token = localStorage.getItem('kiwi_session_token');
  const headers = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ── Verificação de Sessão Inicial ─────────────────────────────────────────
async function checkAuthStatus() {
  try {
    const res = await fetch('/api/auth/me', {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    const data = await res.json();

    if (data.success && data.authenticated && data.user) {
      appState.user = data.user;
      updateUserUI(data.user);
      showAppShell();
      hideAuthModal();
      loadData();
    } else {
      appState.user = null;
      showPublicLanding();
    }
  } catch (err) {
    console.error('Erro ao verificar sessão:', err);
    showPublicLanding();
  }
}

// ── Handler Login ──────────────────────────────────────────────────────────
async function handleLogin(e) {
  if (e) e.preventDefault();
  clearAuthAlerts();

  const email = dom.loginEmail.value.trim();
  const password = dom.loginPassword.value;
  const rememberMe = dom.loginRememberMe.checked;

  if (!email || !password) {
    showLoginAlert('Preencha seu e-mail e sua senha.');
    return;
  }

  // Loading state
  dom.btnLoginSubmit.disabled = true;
  dom.loginSpinner?.classList.remove('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, rememberMe })
    });
    const data = await res.json();

    if (data.success && data.user) {
      if (data.token) {
        localStorage.setItem('kiwi_session_token', data.token);
      }
      appState.user = data.user;
      updateUserUI(data.user);
      showToast(data.message || `Bem-vindo de volta, ${data.user.name}!`, 'success');
      showAppShell();
      hideAuthModal();
      loadData();
    } else {
      showLoginAlert(data.error || 'Credenciais inválidas.');
    }
  } catch (err) {
    showLoginAlert('Falha na comunicação com o servidor.');
  } finally {
    dom.btnLoginSubmit.disabled = false;
    dom.loginSpinner?.classList.add('hidden');
  }
}

// ── Handler Cadastro ───────────────────────────────────────────────────────
async function handleRegister(e) {
  if (e) e.preventDefault();
  clearAuthAlerts();

  const name = dom.registerName.value.trim();
  const email = dom.registerEmail.value.trim();
  const password = dom.registerPassword.value;
  const confirm = dom.registerPasswordConfirm.value;

  if (!name) {
    showRegisterAlert('Informe seu nome completo.');
    dom.registerName.focus();
    return;
  }

  if (!email) {
    showRegisterAlert('Informe seu endereço de e-mail.');
    dom.registerEmail.focus();
    return;
  }

  if (!password || password.length < 6) {
    showRegisterAlert('A senha deve conter pelo menos 6 caracteres.');
    dom.registerPassword.focus();
    return;
  }

  if (password !== confirm) {
    showRegisterAlert('A confirmação de senha não confere com a senha digitada.');
    dom.registerPasswordConfirm.focus();
    return;
  }

  // Loading state
  dom.btnRegisterSubmit.disabled = true;
  dom.registerSpinner?.classList.remove('hidden');

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();

    if (data.success && data.user) {
      if (data.token) {
        localStorage.setItem('kiwi_session_token', data.token);
      }
      appState.user = data.user;
      updateUserUI(data.user);
      showToast(`Conta criada com sucesso! Olá, ${data.user.name}!`, 'success');
      showAppShell();
      hideAuthModal();
      loadData();
    } else {
      showRegisterAlert(data.error || 'Não foi possível concluir o cadastro.');
    }
  } catch (err) {
    showRegisterAlert('Erro ao conectar com o servidor.');
  } finally {
    dom.btnRegisterSubmit.disabled = false;
    dom.registerSpinner?.classList.add('hidden');
  }
}

// ── Handler Logout ─────────────────────────────────────────────────────────
async function handleLogout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include'
    });
  } catch (err) {
    console.error('Logout error:', err);
  }

  localStorage.removeItem('kiwi_session_token');
  appState.user = null;
  closeTopbarUserMenu();
  closeProfileModal();
  showPublicLanding();
  showAuthModal('login');
  showToast('Você saiu da sua conta.', 'info');
}

// ── Topbar Dropdown Controls ──────────────────────────────────────────────
function toggleTopbarUserMenu() {
  if (!dom.userDropdownCard) return;
  const isHidden = dom.userDropdownCard.classList.contains('hidden');
  if (isHidden) {
    dom.userDropdownCard.classList.remove('hidden');
    dom.btnTopbarUserMenu?.classList.add('open');
  } else {
    closeTopbarUserMenu();
  }
}

function closeTopbarUserMenu() {
  if (!dom.userDropdownCard) return;
  dom.userDropdownCard.classList.add('hidden');
  dom.btnTopbarUserMenu?.classList.remove('open');
}

// ── Modal de Perfil ───────────────────────────────────────────────────────
function openProfileModal() {
  closeTopbarUserMenu();
  clearAuthAlerts();

  if (appState.user) {
    dom.profileInputName.value = appState.user.name || '';
    dom.profileInputEmail.value = appState.user.email || '';
    dom.profileDisplayName.textContent = appState.user.name || '';
    dom.profileDisplayEmail.textContent = appState.user.email || '';
    dom.profileModalAvatar.textContent = getUserInitials(appState.user.name);
  }

  if (dom.profileCurrentPassword) dom.profileCurrentPassword.value = '';
  if (dom.profileNewPassword) dom.profileNewPassword.value = '';
  if (dom.profileConfirmNewPassword) dom.profileConfirmNewPassword.value = '';

  dom.profileModal?.classList.remove('hidden');
}

function closeProfileModal() {
  dom.profileModal?.classList.add('hidden');
  clearAuthAlerts();
}

async function handleProfileSave() {
  clearAuthAlerts();
  const name = dom.profileInputName.value.trim();
  const email = dom.profileInputEmail.value.trim();
  const currentPassword = dom.profileCurrentPassword.value;
  const newPassword = dom.profileNewPassword.value;
  const confirmNewPassword = dom.profileConfirmNewPassword.value;

  if (!name || !email) {
    showProfileAlert('Nome e E-mail são obrigatórios.');
    return;
  }

  if (newPassword) {
    if (!currentPassword) {
      showProfileAlert('Para alterar a senha, informe sua senha atual.');
      return;
    }
    if (newPassword.length < 6) {
      showProfileAlert('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showProfileAlert('A nova senha e a confirmação não conferem.');
      return;
    }
  }

  dom.btnSaveProfile.disabled = true;
  dom.profileSpinner?.classList.remove('hidden');

  try {
    const payload = { name, email };
    if (newPassword) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }

    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success && data.user) {
      appState.user = data.user;
      updateUserUI(data.user);
      showToast('Perfil atualizado com sucesso!', 'success');
      closeProfileModal();
    } else {
      showProfileAlert(data.error || 'Erro ao atualizar perfil.');
    }
  } catch (err) {
    showProfileAlert('Erro ao conectar com o servidor.');
  } finally {
    dom.btnSaveProfile.disabled = false;
    dom.profileSpinner?.classList.add('hidden');
  }
}

// ── Configuração de Ouvintes de Autenticação ──────────────────────────────
function setupAuthEventListeners() {
  if (dom.authModal && dom.authModal.parentElement !== document.body) {
    document.body.appendChild(dom.authModal);
  }

  document.querySelectorAll('[data-auth-tab]').forEach(button => {
    button.addEventListener('click', () => showAuthModal(button.dataset.authTab));
  });

  // Troca de abas
  dom.tabBtnLogin?.addEventListener('click', () => switchAuthTab('login'));
  dom.tabBtnRegister?.addEventListener('click', () => switchAuthTab('register'));
  dom.linkGoToRegister?.addEventListener('click', (e) => { e.preventDefault(); switchAuthTab('register'); });
  dom.linkGoToLogin?.addEventListener('click', (e) => { e.preventDefault(); switchAuthTab('login'); });

  // Toggle de visualização de senha
  dom.btnToggleLoginPassword?.addEventListener('click', () => {
    togglePasswordVisibility(dom.loginPassword, dom.btnToggleLoginPassword);
  });
  dom.btnToggleRegisterPassword?.addEventListener('click', () => {
    togglePasswordVisibility(dom.registerPassword, dom.btnToggleRegisterPassword);
  });

  // Indicador de força de senha e confirmação em tempo real
  dom.registerPassword?.addEventListener('input', () => {
    updatePasswordStrengthUI(dom.registerPassword.value);
    updatePasswordMatchUI();
  });
  dom.registerPasswordConfirm?.addEventListener('input', updatePasswordMatchUI);

  // Submissão dos formulários de Auth
  dom.formAuthLogin?.addEventListener('submit', handleLogin);
  dom.formAuthRegister?.addEventListener('submit', handleRegister);

  // Sidebar profile pill e logout
  dom.btnSidebarLogout?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleLogout();
  });
  dom.sidebarUserDetails?.addEventListener('click', openProfileModal);

  // Topbar user menu e dropdown
  dom.btnTopbarUserMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTopbarUserMenu();
  });
  dom.btnOpenProfileModal?.addEventListener('click', openProfileModal);
  dom.btnDropdownLogout?.addEventListener('click', handleLogout);

  // Fechar dropdown do topbar ao clicar fora
  document.addEventListener('click', (e) => {
    if (dom.topbarUserMenuWrap && !dom.topbarUserMenuWrap.contains(e.target)) {
      closeTopbarUserMenu();
    }
  });

  // Modal de edição de perfil
  dom.btnCloseProfileModal?.addEventListener('click', closeProfileModal);
  dom.btnCancelProfileModal?.addEventListener('click', closeProfileModal);
  dom.btnProfileLogout?.addEventListener('click', handleLogout);
  dom.btnSaveProfile?.addEventListener('click', handleProfileSave);
  dom.profileModal?.addEventListener('click', (e) => {
    if (e.target === dom.profileModal) closeProfileModal();
  });
}

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupAuthEventListeners();
  await checkAuthStatus();
});

