import { loadNeonAuth, resolveNeonJwt, readStoredToken, storeAuthToken } from '../../engine/neon-browser-auth.js';

let _neonAuth = null;
let _client = null;

/** Full return path after sign-in (pathname + query string). */
export function authReturnUrl() {
  return `${location.pathname}${location.search}`;
}

export function loginUrl() {
  return `/amc-a-lister/sign-in.html?next=${encodeURIComponent(authReturnUrl())}`;
}

export { storeAuthToken } from '../../engine/neon-browser-auth.js';

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
  if (!links.length) return;

  links.forEach((link) => {
    if (!state.configured) {
      link.textContent = 'Account';
      link.href = loginUrl();
      return;
    }

    if (state.signedIn) {
      link.textContent = 'Log out';
      link.href = '#';
      link.onclick = async (e) => {
        e.preventDefault();
        storeAuthToken(null);
        await state.client.signOut();
        location.href = '/amc-a-lister/';
      };
    } else {
      link.textContent = 'Log in';
      link.href = loginUrl();
      link.onclick = null;
    }
  });
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
