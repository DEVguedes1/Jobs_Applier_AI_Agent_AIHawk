export function apiFetch(input, options = {}) {
  const url = new URL(input, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
    throw new Error('A API deve ser acessada no mesmo servidor central do Dashboard.');
  }

  return window.fetch(url, {
    ...options,
    credentials: 'include'
  });
}
