import { getAuth } from '../lib/neon-auth.js';
import { upsertUser } from '../lib/a-list.js';
import { getBoard, putBoard } from '../lib/wedding.js';

export default async function handler(req, res) {
  const route = String(req.query?.route || 'board').trim();
  if (route !== 'board') {
    res.status(404).json({ error: 'Unknown wedding route.' });
    return;
  }
  return handleBoard(req, res);
}

function requireDb(res) {
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: 'DATABASE_URL not configured.' });
    return false;
  }
  if (!process.env.NEON_AUTH_BASE_URL) {
    res.status(503).json({ error: 'NEON_AUTH_BASE_URL not configured.' });
    return false;
  }
  return true;
}

async function requireUser(req, res) {
  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return null;
  }
  try {
    const userId = await upsertUser(auth);
    return { auth, userId };
  } catch (err) {
    res.status(502).json({ error: err.message });
    return null;
  }
}

async function handleBoard(req, res) {
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    try {
      const data = await getBoard(session.userId);
      res.status(200).json(data);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PUT') {
    try {
      const data = await putBoard(session.userId, req.body?.board);
      res.status(200).json(data);
    } catch (err) {
      const bad = /too large|Board is too large/i.test(err.message || '');
      res.status(bad ? 400 : 502).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Use GET or PUT.' });
}
