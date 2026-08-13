// Verifies Neon Auth session JWTs in api/*.js routes. Neon Auth (built on
// Better Auth) runs as its own hosted service at NEON_AUTH_BASE_URL — the
// browser client (account.html) talks to it directly and hands us a JWT
// via `Authorization: Bearer <token>`, which we verify statelessly against
// its public JWKS (no round trip to the auth server per request).
import { createRemoteJWKSet, jwtVerify } from 'jose';

let _jwks = null;

function authOrigin() {
  return new URL(process.env.NEON_AUTH_BASE_URL).origin;
}

function jwksUrl() {
  const base = process.env.NEON_AUTH_BASE_URL.replace(/\/?$/, '/');
  return new URL('.well-known/jwks.json', base).href;
}

function jwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(jwksUrl()));
  return _jwks;
}

/** Returns the verified JWT payload ({ sub, email, name, ... }) or null. */
export async function getAuth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !process.env.NEON_AUTH_BASE_URL) return null;
  try {
    const origin = authOrigin();
    const { payload } = await jwtVerify(token, jwks(), {
      issuer: origin,
      audience: origin,
    });
    return payload;
  } catch {
    return null;
  }
}
