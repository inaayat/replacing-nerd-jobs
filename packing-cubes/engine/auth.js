import { loadNeonAuth, resolveNeonJwt } from '../../engine/neon-browser-auth.js';

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

  const { data } = await clientSession();
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

async function clientSession() {
  return _client.getSession();
}

export function wireAuthLink(state) {
  const link = document.getElementById('nav-auth-link');
  if (!link) return;

  if (!state.configured) {
    link.textContent = 'Account';
    link.href = '/account.html';
    return;
  }

  if (state.signedIn) {
    link.textContent = 'Log out';
    link.href = '#';
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      await state.client.signOut();
      location.href = '/packing-cubes/';
    });
  } else {
    link.textContent = 'Log in';
    link.href = `/account.html?next=${encodeURIComponent(location.pathname + location.search)}`;
  }
}

export async function refreshToken(state) {
  if (!_neonAuth || !state.user) return null;
  state.token = await resolveNeonJwt(_neonAuth, _client);
  state.signedIn = !!state.user && !!state.token;
  return state.token;
}
