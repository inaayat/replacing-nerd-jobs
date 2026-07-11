// Verifies Neon Auth session JWTs in api/*.js routes. Neon Auth (built on
// Better Auth) runs as its own hosted service at NEON_AUTH_BASE_URL — the
// browser client (account.html) talks to it directly and hands us a JWT
// via `Authorization: Bearer <token>`, which we verify statelessly against
// its public JWKS (no round trip to the auth server per request).
//
// The token's payload is the user's Better Auth record (id/email/name/...)
// with the user id as `sub` — see the "Use Neon Auth in api routes" note
// in the README before changing how fields are read here.
import { createRemoteJWKSet, jwtVerify } from 'jose';

let _jwks = null;

function jwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL('/jwks', process.env.NEON_AUTH_BASE_URL));
  return _jwks;
}

// Returns the verified JWT payload ({ sub, email, name, ... }) or null.
export async function getAuth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !process.env.NEON_AUTH_BASE_URL) return null;
  try {
    const { payload } = await jwtVerify(token, jwks(), {
      issuer: process.env.NEON_AUTH_BASE_URL,
      audience: process.env.NEON_AUTH_BASE_URL,
    });
    return payload;
  } catch {
    return null;
  }
}
