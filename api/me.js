// Returns the signed-in user's row from Neon, creating/refreshing it on
// the way (upsert keyed on the Neon Auth user id). This doubles as the
// sync point between Neon Auth and the app's own tables: every
// authenticated visit to the account page keeps email/name current, so
// future features can join their tables against users.id without a
// separate webhook pipeline.
//
// DELETE removes app data (cascades to A-Lister, packing cubes, etc.) and
// then deletes the Neon Auth account when password verification succeeds.
import { getAuth } from '../lib/neon-auth.js';
import { db, ensureSchema } from '../lib/db.js';

const AUTH_BASE = () => process.env.NEON_AUTH_BASE_URL?.replace(/\/$/, '') || '';

function siteOrigin(req) {
  if (req.headers.origin) return req.headers.origin;
  const referer = req.headers.referer || req.headers.referrer;
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // fall through
    }
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://www.inaayat.xyz';
}

function authHeaders(req) {
  const origin = siteOrigin(req);
  return {
    'Content-Type': 'application/json',
    Origin: origin,
    Referer: `${origin}/`,
  };
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

async function verifyPassword(req, email, password) {
  const base = AUTH_BASE();
  const signRes = await fetch(`${base}/sign-in/email`, {
    method: 'POST',
    headers: authHeaders(req),
    body: JSON.stringify({ email, password }),
  });
  return signRes.ok;
}

async function deleteAuthUser(req, token, password) {
  const base = AUTH_BASE();
  const res = await fetch(`${base}/delete-user`, {
    method: 'POST',
    headers: {
      ...authHeaders(req),
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export default async function handler(req, res) {
  if (!process.env.NEON_AUTH_BASE_URL) {
    res.status(503).json({ error: 'NEON_AUTH_BASE_URL not configured.' });
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: 'DATABASE_URL not configured.' });
    return;
  }

  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res, auth);
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET or DELETE.' });
    return;
  }

  try {
    await ensureSchema();
    const rows = await db()`
      INSERT INTO users (id, email, name)
      VALUES (${auth.sub}, ${auth.email || null}, ${auth.name || null})
      ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email, name = EXCLUDED.name, last_seen_at = now()
      RETURNING id, email, name, created_at, last_seen_at
    `;
    res.status(200).json({ user: rows[0] });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

async function handleDelete(req, res, auth) {
  const password = String(req.body?.password || '');
  if (!password) {
    res.status(400).json({ error: 'Password is required to delete your account.' });
    return;
  }

  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing session token. Sign out and back in, then try again.' });
    return;
  }

  if (!auth.email) {
    res.status(400).json({ error: 'This account cannot be deleted here. Contact support.' });
    return;
  }

  try {
    const passwordOk = await verifyPassword(req, auth.email, password);
    if (!passwordOk) {
      res.status(401).json({ error: 'Incorrect password.' });
      return;
    }

    await ensureSchema();
    await db()`DELETE FROM users WHERE id = ${auth.sub}`;

    const authDelete = await deleteAuthUser(req, token, password);
    if (!authDelete.ok) {
      const message = authDelete.body?.message
        || 'Your app data was deleted, but sign-in could not be removed. Contact support if you still see an account.';
      res.status(200).json({ deleted: true, auth_removed: false, message });
      return;
    }

    res.status(200).json({ deleted: true, auth_removed: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
