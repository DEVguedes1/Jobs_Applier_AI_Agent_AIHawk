import { apiFetch as request } from '../services/api.js';
import { appState, dom } from '../dashboard/state.js';

export function createAuthController({ showToast, loadData }) {
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
  if (window.location.hash !== '#/landing') window.history.replaceState(null, '', '#/landing');
}

function showAppShell() {
  dom.landingPage?.classList.add('hidden');
  dom.appLayout?.classList.remove('hidden');
  document.body.classList.remove('public-mode');
  if (window.location.hash !== '#/dashboard') window.history.replaceState(null, '', '#/dashboard');
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
    const res = await request('/api/auth/me', {
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
    const res = await request('/api/auth/login', {
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
    const res = await request('/api/auth/register', {
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
    await request('/api/auth/logout', {
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

    const res = await request('/api/auth/profile', {
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
  document.querySelectorAll('[data-back-landing]').forEach(button => {
    button.addEventListener('click', () => {
      hideAuthModal();
      showPublicLanding();
    });
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

  return {
    setupAuthEventListeners,
    checkAuthStatus,
    closeProfileModal,
    closeTopbarUserMenu
  };
}
