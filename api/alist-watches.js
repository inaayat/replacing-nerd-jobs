import { randomUUID } from 'node:crypto';
import { getAuth } from '../lib/neon-auth.js';
import { db } from '../lib/db.js';
import { upsertUser, listWatches, getMembership, watchFromRow } from '../lib/a-list.js';

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

function normalizeBody(body) {
  const rating = body.dnf ? null : (body.rating != null ? Number(body.rating) : null);
  return {
    watched_on: body.watched_on,
    title: String(body.title || '').trim(),
    tmdb_id: body.tmdb_id != null ? Number(body.tmdb_id) : null,
    location: body.location ? String(body.location).trim() : null,
    format: body.format ? String(body.format).trim() : '',
    saw_alone: !!body.saw_alone,
    auditorium: body.auditorium ? String(body.auditorium).trim() : null,
    seat: body.seat ? String(body.seat).trim() : null,
    ticket_cents: body.ticket_cents != null ? Number(body.ticket_cents) : null,
    rating,
    dnf: !!body.dnf,
    notes: body.notes ? String(body.notes).trim() : null,
  };
}

export default async function handler(req, res) {
  if (!requireDb(res)) return;

  const session = await requireUser(req, res);
  if (!session) return;
  const { userId } = session;

  if (req.method === 'GET') {
    try {
      const rows = await listWatches(userId);
      res.status(200).json({ watches: rows.map(watchFromRow) });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'POST') {
    const data = normalizeBody(req.body || {});
    if (!data.watched_on || !data.title) {
      res.status(400).json({ error: 'watched_on and title are required.' });
      return;
    }
    const id = randomUUID();
    try {
      const rows = await db()`
        INSERT INTO alist_watches (
          id, user_id, watched_on, title, tmdb_id, location, format,
          saw_alone, auditorium, seat, ticket_cents, rating, dnf, notes
        ) VALUES (
          ${id}, ${userId}, ${data.watched_on}, ${data.title}, ${data.tmdb_id},
          ${data.location}, ${data.format}, ${data.saw_alone}, ${data.auditorium},
          ${data.seat}, ${data.ticket_cents}, ${data.rating}, ${data.dnf}, ${data.notes}
        )
        RETURNING id, watched_on::text AS watched_on, title, tmdb_id, location, format,
                  saw_alone, auditorium, seat, ticket_cents, rating::float AS rating,
                  dnf, notes, created_at, updated_at
      `;
      await getMembership(userId);
      res.status(201).json({ watch: watchFromRow(rows[0]) });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const id = req.body?.id;
    if (!id) {
      res.status(400).json({ error: 'id is required.' });
      return;
    }
    const data = normalizeBody(req.body || {});
    if (!data.watched_on || !data.title) {
      res.status(400).json({ error: 'watched_on and title are required.' });
      return;
    }
    try {
      const rows = await db()`
        UPDATE alist_watches SET
          watched_on = ${data.watched_on},
          title = ${data.title},
          tmdb_id = ${data.tmdb_id},
          location = ${data.location},
          format = ${data.format},
          saw_alone = ${data.saw_alone},
          auditorium = ${data.auditorium},
          seat = ${data.seat},
          ticket_cents = ${data.ticket_cents},
          rating = ${data.rating},
          dnf = ${data.dnf},
          notes = ${data.notes},
          updated_at = now()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, watched_on::text AS watched_on, title, tmdb_id, location, format,
                  saw_alone, auditorium, seat, ticket_cents, rating::float AS rating,
                  dnf, notes, created_at, updated_at
      `;
      if (!rows.length) {
        res.status(404).json({ error: 'Watch not found.' });
        return;
      }
      res.status(200).json({ watch: watchFromRow(rows[0]) });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const id = req.body?.id || req.query?.id;
    if (!id) {
      res.status(400).json({ error: 'id is required.' });
      return;
    }
    try {
      const rows = await db()`
        DELETE FROM alist_watches
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id
      `;
      if (!rows.length) {
        res.status(404).json({ error: 'Watch not found.' });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed.' });
}
