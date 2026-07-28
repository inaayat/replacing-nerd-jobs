import { getAuth } from '../../lib/neon-auth.js';
import { upsertUser, getMembership } from '../../lib/a-list.js';
import { db } from '../../lib/db.js';

function watchKey(w) {
  return `${w.watched_on}|${(w.title || '').toLowerCase()}|${(w.location || '').toLowerCase()}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_BASE_URL) {
    res.status(503).json({ error: 'Database or auth not configured.' });
    return;
  }

  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }

  const watches = Array.isArray(req.body?.watches) ? req.body.watches : null;
  if (!watches?.length) {
    res.status(400).json({ error: 'watches array is required.' });
    return;
  }

  try {
    const userId = await upsertUser(auth);
    await getMembership(userId);

    const existing = await db()`
      SELECT watched_on::text AS watched_on, title, location
      FROM alist_watches WHERE user_id = ${userId}
    `;
    const seen = new Set(existing.map(watchKey));

    let inserted = 0;
    let skipped = 0;

    for (const raw of watches) {
      const data = {
        watched_on: String(raw.watched_on || raw.date || '').slice(0, 10),
        title: String(raw.title || raw.movie || '').trim(),
        location: raw.location ? String(raw.location).trim() : null,
        format: raw.format ? String(raw.format).trim() : '',
        saw_alone: raw.saw_alone === true || raw.saw_alone === 'X' || raw.saw_alone === 'x',
        auditorium: raw.auditorium ? String(raw.auditorium).trim() : null,
        seat: raw.seat ? String(raw.seat).trim() : null,
        ticket_cents: raw.ticket_cents != null
          ? Number(raw.ticket_cents)
          : parseMoney(raw.charge ?? raw.ticket),
        rating: raw.dnf ? null : parseRating(raw.rating ?? raw.personal_rating),
        dnf: raw.dnf === true || String(raw.rating || raw.personal_rating || '').toUpperCase() === 'DNF',
        notes: raw.notes ? String(raw.notes).trim() : null,
        tmdb_id: raw.tmdb_id != null ? Number(raw.tmdb_id) : null,
      };

      if (!data.watched_on || !data.title) {
        skipped += 1;
        continue;
      }

      const key = watchKey(data);
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);

      await db()`
        INSERT INTO alist_watches (
          id, user_id, watched_on, title, tmdb_id, location, format,
          saw_alone, auditorium, seat, ticket_cents, rating, dnf, notes
        ) VALUES (
          ${crypto.randomUUID()}, ${userId}, ${data.watched_on}, ${data.title},
          ${data.tmdb_id}, ${data.location}, ${data.format}, ${data.saw_alone},
          ${data.auditorium}, ${data.seat}, ${data.ticket_cents}, ${data.rating},
          ${data.dnf}, ${data.notes}
        )
      `;
      inserted += 1;
    }

    res.status(200).json({ inserted, skipped, total: watches.length });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

function parseMoney(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isNaN(n) ? null : Math.round(n * 100);
}

function parseRating(value) {
  if (value == null || value === '') return null;
  const s = String(value).toUpperCase();
  if (s === 'DNF') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
