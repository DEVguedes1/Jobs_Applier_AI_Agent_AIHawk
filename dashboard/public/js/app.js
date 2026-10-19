async function loadTemplate(target, source) {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${source}: HTTP ${response.status}`);
  }
  document.querySelector(target).innerHTML = await response.text();
}

async function startApplication() {
  await Promise.all([
    loadTemplate('#landing-root', '/pages/landing.html'),
    loadTemplate('#dashboard-root', '/pages/dashboard.html'),
    loadTemplate('#auth-root', '/components/auth.html')
  ]);

  const dashboard = await import('/js/dashboard/dashboard.js');
  await dashboard.startDashboard();
}

startApplication().catch(error => {
  console.error('[Kiwi Bot] Falha ao iniciar a interface:', error);
  document.body.innerHTML = '<main role="alert"><h1>Não foi possível carregar o Kiwi Bot</h1><p>Verifique a conexão com o servidor e tente novamente.</p></main>';
});
