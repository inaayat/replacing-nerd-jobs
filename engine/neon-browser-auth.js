/** Shared Neon Auth browser setup for static pages (account, A-Lister, etc.). */
const AUTH_IMPORT = 'https://esm.sh/@neondatabase/auth@0.4.2-beta';
const AUTH_TOKEN_KEY = 'alist-auth-jwt';

export const NEON_AUTH_FETCH_OPTIONS = { credentials: 'include' };

export function readStoredToken() {
  try {
    const fromLocal = localStorage.getItem(AUTH_TOKEN_KEY);
    if (fromLocal) return fromLocal;
    // One-time migration from sessionStorage (pre-persistent-login).
    const fromSession = sessionStorage.getItem(AUTH_TOKEN_KEY);
    if (fromSession) {
      localStorage.setItem(AUTH_TOKEN_KEY, fromSession);
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      return fromSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function storeAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // localStorage may be unavailable in some embedded contexts
  }
}

export async function loadNeonAuth(authUrl) {
  const { createInternalNeonAuth } = await import(AUTH_IMPORT);
  return createInternalNeonAuth(authUrl, { fetchOptions: NEON_AUTH_FETCH_OPTIONS });
}

export async function resolveNeonJwt(neonAuth, client) {
  try {
    const token = await neonAuth.getJWTToken();
    if (token) return token;
  } catch {
    // fall through
  }

  if (typeof client.token === 'function') {
    try {
      const { data, error } = await client.token();
      if (!error && data?.token) return data.token;
    } catch {
      // fall through
    }
  }

  try {
    const { data } = await client.getSession();
    const fromSession = data?.session?.token || data?.session?.access_token;
    if (fromSession && String(fromSession).split('.').length === 3) return fromSession;
  } catch {
    // fall through
  }

  return null;
}

/** Pull a bearer JWT from a sign-in/sign-up response before cookies are available. */
export function tokenFromAuthResult(result) {
  const candidates = [
    result?.data?.token,
    result?.data?.session?.token,
    result?.data?.session?.access_token,
    result?.token,
  ];
  for (const value of candidates) {
    if (value && String(value).split('.').length === 3) return String(value);
  }
  return null;
}

/** Sign in/up via our API so PWAs get a JWT without third-party auth cookies. */
export async function loginViaApi({ email, password, name, mode = 'signin' }) {
  const res = await fetch('/api/auth-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, mode }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: { message: data.error || `Authentication failed (${res.status})` }, token: null };
  }
  return { error: null, token: data.token || null, user: data.user || null };
}
