let _neonAuth = null;
let _client = null;
let _authUrl = null;

async function resolveToken(neonAuth, client) {
  try {
    const token = await neonAuth.getJWTToken();
    if (token) return token;
  } catch {
    // fall through to other strategies
  }

  try {
    const { data } = await client.getSession();
    const fromSession = data?.session?.token || data?.session?.access_token;
    if (fromSession) return fromSession;
  } catch {
    // fall through
  }

  if (!_authUrl) return null;

  try {
    const res = await fetch(`${_authUrl}/token`, { credentials: 'include' });
    const headerJwt = res.headers.get('set-auth-jwt');
    if (headerJwt) return headerJwt;
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body?.token) return body.token;
    }
  } catch {
    // no token available
  }

  return null;
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

  _authUrl = url;
  const { createInternalNeonAuth } = await import('https://esm.sh/@neondatabase/auth@0.4.2-beta');
  _neonAuth = createInternalNeonAuth(url);
  _client = _neonAuth.adapter;

  const { data } = await _client.getSession();
  const user = data?.user || null;
  const token = user ? await resolveToken(_neonAuth, _client) : null;

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
    return;
  }

  if (state.signedIn) {
    link.textContent = 'Log out';
    link.href = '#';
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      await state.client.signOut();
      location.href = '/amc-a-lister/';
    });
  } else {
    link.textContent = 'Log in';
    link.href = `/account.html?next=${encodeURIComponent(location.pathname)}`;
  }
}

export async function refreshToken(state) {
  if (!_neonAuth || !state.user) return null;
  state.token = await resolveToken(_neonAuth, _client);
  state.signedIn = !!state.user && !!state.token;
  state.needsReauth = !!state.user && !state.token;
  return state.token;
}
