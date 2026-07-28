import { db, ensureSchema } from './db.js';

export async function upsertUser(auth) {
  await ensureSchema();
  await db()`
    INSERT INTO users (id, email, name)
    VALUES (${auth.sub}, ${auth.email || null}, ${auth.name || null})
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email, name = EXCLUDED.name, last_seen_at = now()
  `;
  return auth.sub;
}

export async function getMembership(userId) {
  const rows = await db()`
    SELECT user_id, promo_cents, standard_cents, current_cents,
           price_bump_on::text AS price_bump_on, display_name, updated_at
    FROM alist_membership
    WHERE user_id = ${userId}
  `;
  if (rows.length) return rows[0];

  const created = await db()`
    INSERT INTO alist_membership (user_id, price_bump_on)
    VALUES (${userId}, ${'2025-07-01'})
    RETURNING user_id, promo_cents, standard_cents, current_cents,
              price_bump_on::text AS price_bump_on, display_name, updated_at
  `;
  return created[0];
}

export async function listWatches(userId) {
  return db()`
    SELECT id, watched_on::text AS watched_on, title, tmdb_id, location, format,
           saw_alone, auditorium, seat, ticket_cents, rating::float AS rating,
           dnf, notes, created_at, updated_at
    FROM alist_watches
    WHERE user_id = ${userId}
    ORDER BY watched_on DESC, created_at DESC
  `;
}

export function watchFromRow(row) {
  return {
    id: row.id,
    watched_on: row.watched_on,
    title: row.title,
    tmdb_id: row.tmdb_id,
    location: row.location,
    format: row.format || '',
    saw_alone: !!row.saw_alone,
    auditorium: row.auditorium,
    seat: row.seat,
    ticket_cents: row.ticket_cents,
    rating: row.rating != null ? Number(row.rating) : null,
    dnf: !!row.dnf,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
