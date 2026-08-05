import { loadNeonAuth, resolveNeonJwt } from '../../engine/neon-browser-auth.js';

let _neonAuth = null;
let _client = null;

/** Full return path after sign-in (pathname + query string). */
export function authReturnUrl() {
  return `${location.pathname}${location.search}`;
}

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
  const user = data?.user || null;
  const token = user ? await resolveNeonJwt(_neonAuth, _client) : null;

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
      link.href = '/account.html';
      return;
    }

    if (state.signedIn) {
      link.textContent = 'Log out';
      link.href = '#';
      link.onclick = async (e) => {
        e.preventDefault();
        await state.client.signOut();
        location.href = '/amc-a-lister/';
      };
    } else {
      link.textContent = 'Log in';
      link.href = `/account.html?next=${encodeURIComponent(authReturnUrl())}`;
      link.onclick = null;
    }
  });
}

export async function refreshToken(state) {
  if (!_neonAuth || !state.user) return null;
  state.token = await resolveNeonJwt(_neonAuth, _client);
  state.signedIn = !!state.user && !!state.token;
  state.needsReauth = !!state.user && !state.token;
  return state.token;
}
