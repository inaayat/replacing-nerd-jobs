// Clerk auth for api/*.js routes. This is separate from lib/auth.js —
// that one is the single site-wide password gating /private/, while this
// verifies individual Clerk user sessions for logged-in-user features.
//
// Frontend contract: pages send `Authorization: Bearer <session token>`
// obtained from Clerk.session.getToken().
import { createClerkClient, verifyToken } from '@clerk/backend';

let _clerk = null;

export function clerk() {
  if (!_clerk) _clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  return _clerk;
}

// Returns the verified token payload ({ sub: userId, ... }) or null.
export async function getAuth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    return await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  } catch {
    return null;
  }
}
