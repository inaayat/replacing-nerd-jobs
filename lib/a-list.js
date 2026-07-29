import { db, ensureSchema } from './db.js';
import { DEFAULT_PRICE_TIERS } from './a-list-billing.js';

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
           price_bump_on::text AS price_bump_on, price_tiers, display_name, updated_at
    FROM alist_membership
    WHERE user_id = ${userId}
  `;
  if (rows.length) return rows[0];

  const created = await db()`
    INSERT INTO alist_membership (user_id, price_tiers, current_cents)
    VALUES (${userId}, ${JSON.stringify(DEFAULT_PRICE_TIERS)}, ${2999})
    RETURNING user_id, promo_cents, standard_cents, current_cents,
              price_bump_on::text AS price_bump_on, price_tiers, display_name, updated_at
  `;
  return created[0];
}

export async function listWatches(userId) {
  return db()`
    SELECT w.id, w.watched_on::text AS watched_on, w.title, w.tmdb_id, w.location, w.format,
           w.saw_alone, w.auditorium, w.seat, w.ticket_cents, w.rating::float AS rating,
           w.dnf, w.notes, w.created_at, w.updated_at, c.poster_path
    FROM alist_watches w
    LEFT JOIN alist_movie_cache c ON c.tmdb_id = w.tmdb_id
    WHERE w.user_id = ${userId}
    ORDER BY w.watched_on DESC, w.created_at DESC
  `;
}

export function watchFromRow(row) {
  return {
    id: row.id,
    watched_on: row.watched_on,
    title: row.title,
    tmdb_id: row.tmdb_id,
    poster_path: row.poster_path || null,
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
