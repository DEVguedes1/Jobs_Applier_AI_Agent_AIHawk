// Estado Global da Aplicação
export const appState = {
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
export const STAGE_DEFINITIONS = [
  { key: 'pending', label: 'Pendente / Link Externo', color: '#A8C2AA' },
  { key: 'applied', label: 'Candidatura Enviada', color: '#88A98A' },
  { key: 'screening', label: 'Triagem / Contato RH', color: '#88A98A' },
  { key: 'technical', label: 'Desafio Técnico', color: '#88A98A' },
  { key: 'interview', label: 'Entrevista', color: '#88A98A' },
  { key: 'offer', label: 'Proposta / Oferta', color: '#A8C2AA' },
  { key: 'rejected', label: 'Não Selecionado', color: '#858A85' }
];

// Metadados das Telas do Menu
export const VIEW_METADATA = {
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
export const dom = {
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
  btnRefreshData: document.getElementById('btnRefreshData'),
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
  btnBotVerify: document.getElementById('btnBotVerify'),
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
