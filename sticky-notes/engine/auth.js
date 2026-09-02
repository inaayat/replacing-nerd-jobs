import { loadNeonAuth, resolveNeonJwt, readStoredToken, storeAuthToken } from '../../engine/neon-browser-auth.js';

let _neonAuth = null;
let _client = null;

export { storeAuthToken } from '../../engine/neon-browser-auth.js';

function offlineAuth() {
  const token = readStoredToken();
  return token
    ? { configured: true, signedIn: true, user: null, token, client: null, offline: true }
    : { configured: false, signedIn: false, user: null, token: null, client: null, offline: true };
}

export function loginUrl() {
  return `/account.html?next=${encodeURIComponent(location.pathname + location.search)}`;
}

export async function initAuth() {
  let url = null;
  try {
    const res = await fetch('/api/auth-config');
    url = (await res.json()).url;
  } catch {
    return offlineAuth();
  }
  if (!url) return { configured: false, signedIn: false, user: null, token: null };

  let data;
  try {
    _neonAuth = await loadNeonAuth(url);
    _client = _neonAuth.adapter;
    ({ data } = await _client.getSession());
  } catch {
    return offlineAuth();
  }
  let user = data?.user || null;
  let token = user ? await resolveNeonJwt(_neonAuth, _client) : null;
  if (!token && user) token = readStoredToken();

  if (!user) {
    const stored = readStoredToken();
    if (stored) {
      try {
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${stored}` } });
        if (res.ok) {
          const { user: profile } = await res.json();
          user = { id: profile.id, email: profile.email, name: profile.name };
          token = stored;
        } else {
          storeAuthToken(null);
        }
      } catch {
        storeAuthToken(null);
      }
    }
  }

  if (token) storeAuthToken(token);

  return {
    configured: true,
    signedIn: !!user && !!token,
    needsReauth: !!user && !token,
    user,
    token,
    client: _client,
  };
}

export function wireAuthLink(state) {
  const links = document.querySelectorAll('[data-nav-auth]');
  links.forEach((link) => {
    if (!state.configured) {
      link.textContent = 'Account';
      link.href = '/account.html';
      return;
    }
    if (state.signedIn) {
      link.textContent = 'Log out';
      link.href = '#';
      link.onclick = async (e) => {
        e.preventDefault();
        storeAuthToken(null);
        if (state.client) await state.client.signOut();
        location.href = '/sticky-notes/';
      };
    } else {
      link.textContent = 'Sign in';
      link.href = loginUrl();
    }
  });
}
