/** Shared Neon Auth browser setup for static pages (account, A-Lister, etc.). */
const AUTH_IMPORT = 'https://esm.sh/@neondatabase/auth@0.4.2-beta';
const AUTH_TOKEN_KEY = 'alist-auth-jwt';

export const NEON_AUTH_FETCH_OPTIONS = { credentials: 'include' };

export function readStoredToken() {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeAuthToken(token) {
  try {
    if (token) sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    else sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // sessionStorage may be unavailable in some embedded contexts
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
