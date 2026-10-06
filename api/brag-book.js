import { getAuth } from '../lib/neon-auth.js';
import { upsertUser } from '../lib/a-list.js';
import { getBook, putBook } from '../lib/brag-book.js';

export default async function handler(req, res) {
  const route = String(req.query?.route || 'book').trim();
  if (route !== 'book') {
    res.status(404).json({ error: 'Unknown brag-book route.' });
    return;
  }
  return handleBook(req, res);
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

async function handleBook(req, res) {
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    try {
      const data = await getBook(session.userId);
      res.status(200).json(data);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PUT') {
    try {
      const data = await putBook(session.userId, req.body?.book, {
        expectedUpdatedAt: req.body?.updatedAt,
      });
      res.status(200).json(data);
    } catch (err) {
      if (err.status === 409) {
        res.status(409).json({
          error: err.message,
          conflict: true,
          updatedAt: err.updatedAt,
          revision: err.revision ?? null,
          book: err.book,
        });
        return;
      }
      const bad = err.status === 400 || /too large/i.test(err.message || '');
      res.status(bad ? 400 : 502).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Use GET or PUT.' });
}
