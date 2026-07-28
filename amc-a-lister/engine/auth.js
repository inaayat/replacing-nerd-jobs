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

  const { createInternalNeonAuth } = await import('https://esm.sh/@neondatabase/auth@0.4.2-beta');
  _neonAuth = createInternalNeonAuth(url);
  _client = _neonAuth.adapter;

  const { data } = await _client.getSession();
  const user = data?.user || null;
  let token = null;
  if (user) {
    try {
      token = await _neonAuth.getJWTToken();
    } catch {
      token = null;
    }
  }
  return { configured: true, signedIn: !!user, user, token, client: _client };
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
  if (!_neonAuth || !state.signedIn) return null;
  state.token = await _neonAuth.getJWTToken();
  return state.token;
}
