/** Shared Neon Auth browser setup for static pages (account, A-Lister, etc.). */
const AUTH_IMPORT = 'https://esm.sh/@neondatabase/auth@0.4.2-beta';

export const NEON_AUTH_FETCH_OPTIONS = { credentials: 'include' };

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
