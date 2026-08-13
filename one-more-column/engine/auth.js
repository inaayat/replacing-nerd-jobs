import { loadNeonAuth, resolveNeonJwt, readStoredToken, storeAuthToken } from './neon-browser-auth.js';

let _neonAuth = null;
let _client = null;

export async function initAuth() {
  let url = null;
  try {
    const res = await fetch('/api/auth-config');
    url = (await res.json()).url;
  } catch {
    return { configured: false, signedIn: false, user: null, token: null };
  }
  if (!url) return { configured: false, signedIn: false, user: null, token: null };

  _neonAuth = await loadNeonAuth(url);
  _client = _neonAuth.adapter;

  const { data } = await _client.getSession();
  let user = data?.user || null;
  let token = user ? await resolveNeonJwt(_neonAuth, _client) : null;
  if (!token && user) token = readStoredToken();

  if (!user) {
    const stored = readStoredToken();
    if (stored) {
      try {
        const res = await fetch('/api/omc-me', { headers: { Authorization: `Bearer ${stored}` } });
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
  const link = document.getElementById('nav-auth-link');
  if (!link) return;

  if (!state.configured) {
    link.textContent = 'Account';
    link.href = '/account.html';
    link.onclick = null;
    return;
  }

  if (state.signedIn) {
    link.textContent = 'Log out';
    link.href = '#';
    link.onclick = async (e) => {
      e.preventDefault();
      storeAuthToken(null);
      await state.client.signOut();
      location.href = '/one-more-column/';
    };
  } else {
    link.textContent = 'Log in';
    link.href = `/account.html?next=${encodeURIComponent(location.pathname)}`;
    link.onclick = null;
  }
}

export async function refreshToken(state) {
  if (!_neonAuth || !state.user) return null;
  state.token = await resolveNeonJwt(_neonAuth, _client);
  if (!state.token) state.token = readStoredToken();
  state.signedIn = !!state.user && !!state.token;
  state.needsReauth = !!state.user && !state.token;
  storeAuthToken(state.token);
  return state.token;
}
