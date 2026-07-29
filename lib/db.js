// Neon Postgres access for api/*.js routes. Everything is lazy so this
// module can be imported (and the site deployed) before DATABASE_URL is
// configured — routes that need the database check for it explicitly and
// return a clear 503 instead of crashing at import time.
import { neon } from '@neondatabase/serverless';

let _sql = null;

// Tagged-template query function: const rows = await db()`SELECT ...`.
// Interpolated values are sent as bound parameters, never spliced into SQL.
export function db() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql;
}

// The schema lives here (CREATE TABLE IF NOT EXISTS) rather than in a
// separate migration step so a fresh Neon database provisions itself on
// first request. Future tables for logged-in-user features go in this
// same list; for changes to *existing* tables, run an ALTER in the Neon
// SQL editor and mirror it here.
let _schemaReady = null;

export function ensureSchema() {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      const sql = db();
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id           TEXT PRIMARY KEY,
          email        TEXT,
          name         TEXT,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS alist_membership (
          user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          promo_cents      INT  NOT NULL DEFAULT 99,
          standard_cents   INT  NOT NULL DEFAULT 2495,
          current_cents    INT  NOT NULL DEFAULT 2799,
          price_bump_on    DATE,
          price_tiers      JSONB,
          display_name     TEXT,
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        ALTER TABLE alist_membership
        ADD COLUMN IF NOT EXISTS price_tiers JSONB
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS alist_watches (
          id               TEXT PRIMARY KEY,
          user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          watched_on       DATE NOT NULL,
          title            TEXT NOT NULL,
          tmdb_id          INT,
          location         TEXT,
          format           TEXT,
          saw_alone        BOOLEAN NOT NULL DEFAULT false,
          auditorium       TEXT,
          seat             TEXT,
          ticket_cents     INT,
          rating           NUMERIC(2,1),
          dnf              BOOLEAN NOT NULL DEFAULT false,
          notes            TEXT,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS alist_watches_user_date
          ON alist_watches (user_id, watched_on DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS alist_movie_cache (
          tmdb_id          INT PRIMARY KEY,
          title            TEXT NOT NULL,
          year             INT,
          poster_path      TEXT,
          runtime_min      INT,
          genres           TEXT[],
          raw              JSONB,
          fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
    })().catch((err) => {
      _schemaReady = null;
      throw err;
    });
  }
  return _schemaReady;
}
