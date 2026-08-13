import { getAuth } from './neon-auth.js';
import { db, ensureSchema } from './db.js';

export function sendJson(res, status, body) {
  res.status(status).json(body);
}

export function methodNotAllowed(res, allowed) {
  sendJson(res, 405, { error: `Use ${allowed}.` });
}

export function badRequest(res, message) {
  sendJson(res, 400, { error: message });
}

/**
 * Body for rows that moved underneath an optimistic-concurrency guard.
 * Pure so the wording stays testable without a database.
 */
export function conflictBody(conflicts, extra = {}) {
  const count = conflicts.length;
  return {
    error:
      count === 1
        ? 'Someone else changed this row since you loaded it.'
        : `Someone else changed ${count} of these rows since you loaded them.`,
    conflicts,
    ...extra,
  };
}

/** Sends the 409 that tells a client its write was rejected, not applied. */
export function conflict(res, conflicts, extra = {}) {
  sendJson(res, 409, conflictBody(conflicts, extra));
}

export async function requireEnv(res) {
  if (!process.env.NEON_AUTH_BASE_URL) {
    sendJson(res, 503, { error: 'NEON_AUTH_BASE_URL not configured.' });
    return false;
  }
  if (!process.env.DATABASE_URL) {
    sendJson(res, 503, { error: 'DATABASE_URL not configured.' });
    return false;
  }
  return true;
}

/** Ensures schema and returns auth payload, or sends error and returns null. */
export async function requireAuth(req, res, { methods } = {}) {
  if (methods && !methods.includes(req.method)) {
    methodNotAllowed(res, methods.join(' or '));
    return null;
  }
  if (!(await requireEnv(res))) return null;

  const auth = await getAuth(req);
  if (!auth) {
    sendJson(res, 401, { error: 'Not signed in.' });
    return null;
  }

  try {
    await ensureSchema();
  } catch (err) {
    sendJson(res, 502, { error: err.message });
    return null;
  }

  return auth;
}

export function parseJsonBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body ?? null;
}

export function newId() {
  return crypto.randomUUID();
}

export async function touchUser(auth) {
  await db()`
    INSERT INTO users (id, email, name)
    VALUES (${auth.sub}, ${auth.email || null}, ${auth.name || null})
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email, name = EXCLUDED.name, last_seen_at = now()
  `;
}
