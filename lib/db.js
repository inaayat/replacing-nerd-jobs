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
        ALTER TABLE alist_membership
        ADD COLUMN IF NOT EXISTS rate_setup_complete BOOLEAN NOT NULL DEFAULT true
      `;
      await sql`
        ALTER TABLE alist_membership
        ADD COLUMN IF NOT EXISTS promo_folded BOOLEAN NOT NULL DEFAULT false
      `;
      // Public identity is opt-in and deliberately separate from users.name /
      // display_name: username is the only thing ever shown to other people.
      await sql`
        ALTER TABLE alist_membership
        ADD COLUMN IF NOT EXISTS username TEXT
      `;
      await sql`
        ALTER TABLE alist_membership
        ADD COLUMN IF NOT EXISTS public_profile BOOLEAN NOT NULL DEFAULT false
      `;
      await sql`
        ALTER TABLE alist_membership
        ADD COLUMN IF NOT EXISTS public_hide_theaters BOOLEAN NOT NULL DEFAULT false
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS alist_membership_username_lower
          ON alist_membership (lower(username)) WHERE username IS NOT NULL
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
        ALTER TABLE alist_watches
        ADD COLUMN IF NOT EXISTS in_theaters BOOLEAN NOT NULL DEFAULT true
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS alist_watches_user_date
          ON alist_watches (user_id, watched_on DESC)
      `;
      // Invite someone to a theater outing; they accept/deny into their own log.
      await sql`
        CREATE TABLE IF NOT EXISTS alist_watch_invites (
          id               TEXT PRIMARY KEY,
          from_user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          to_user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          source_watch_id  TEXT REFERENCES alist_watches(id) ON DELETE SET NULL,
          status           TEXT NOT NULL DEFAULT 'pending',
          watched_on       DATE NOT NULL,
          title            TEXT NOT NULL,
          tmdb_id          INT,
          location         TEXT,
          format           TEXT,
          ticket_cents     INT,
          in_theaters      BOOLEAN NOT NULL DEFAULT true,
          created_watch_id TEXT REFERENCES alist_watches(id) ON DELETE SET NULL,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS alist_watch_invites_to_status
          ON alist_watch_invites (to_user_id, status, created_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS alist_watch_invites_from_status
          ON alist_watch_invites (from_user_id, status, created_at DESC)
      `;
      // Bidirectional "watched together" tags between two watch rows.
      await sql`
        CREATE TABLE IF NOT EXISTS alist_watch_companions (
          watch_id           TEXT NOT NULL REFERENCES alist_watches(id) ON DELETE CASCADE,
          companion_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          companion_watch_id TEXT REFERENCES alist_watches(id) ON DELETE SET NULL,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (watch_id, companion_user_id)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS alist_watch_companions_user
          ON alist_watch_companions (companion_user_id)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS alist_watchlist (
          id               TEXT PRIMARY KEY,
          user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title            TEXT NOT NULL,
          tmdb_id          INT,
          notes            TEXT,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS alist_watchlist_user_created
          ON alist_watchlist (user_id, created_at DESC)
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
      await sql`
        ALTER TABLE alist_movie_cache
        ADD COLUMN IF NOT EXISTS release_date DATE
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS alist_tv_watches (
          id               TEXT PRIMARY KEY,
          user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          watched_on       DATE NOT NULL,
          title            TEXT NOT NULL,
          tmdb_id          INT,
          season           INT,
          episode          INT,
          rating           NUMERIC(2,1),
          dnf              BOOLEAN NOT NULL DEFAULT false,
          notes            TEXT,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS alist_tv_watches_user_date
          ON alist_tv_watches (user_id, watched_on DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS alist_tv_watchlist (
          id               TEXT PRIMARY KEY,
          user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title            TEXT NOT NULL,
          tmdb_id          INT,
          notes            TEXT,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS alist_tv_watchlist_user_created
          ON alist_tv_watchlist (user_id, created_at DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS alist_tv_cache (
          tmdb_id          INT PRIMARY KEY,
          title            TEXT NOT NULL,
          year             INT,
          poster_path      TEXT,
          genres           TEXT[],
          first_air_date   DATE,
          status           TEXT,
          raw              JSONB,
          fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS alist_movie_ranks (
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          tmdb_id      INT  NOT NULL,
          position     INT  NOT NULL,
          title        TEXT NOT NULL,
          year         INT,
          poster_path  TEXT,
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, tmdb_id)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS alist_movie_ranks_user_position
          ON alist_movie_ranks (user_id, position)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS pc_cubes (
          id            TEXT PRIMARY KEY,
          user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title         TEXT NOT NULL,
          blurb         TEXT NOT NULL DEFAULT '',
          tags          JSONB NOT NULL DEFAULT '[]'::jsonb,
          items         JSONB NOT NULL DEFAULT '[]'::jsonb,
          is_public     BOOLEAN NOT NULL DEFAULT false,
          github_pr_url TEXT,
          published_at  TIMESTAMPTZ,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS pc_cubes_user_updated
          ON pc_cubes (user_id, updated_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS pc_cubes_public
          ON pc_cubes (is_public) WHERE is_public = true
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS pc_suitcase_state (
          user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          active_suitcase_id TEXT,
          suitcases          JSONB NOT NULL DEFAULT '[]'::jsonb,
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS plot_points_cache (
          cache_key   TEXT PRIMARY KEY,
          payload     JSONB NOT NULL,
          fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS f500_headline_cache (
          cik         INT PRIMARY KEY,
          as_of_year  INT,
          payload     JSONB NOT NULL,
          fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS f500_filed_cache (
          cik         INT PRIMARY KEY,
          as_of_year  INT,
          payload     JSONB NOT NULL,
          fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS f500_price_cache (
          cache_key   TEXT PRIMARY KEY,
          payload     JSONB NOT NULL,
          fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS table_manners_sheets (
          user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          payload     JSONB NOT NULL,
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sn_collections (
          id          TEXT PRIMARY KEY,
          user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name        TEXT NOT NULL,
          status      TEXT NOT NULL DEFAULT 'board',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          filed_at    TIMESTAMPTZ
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sn_notes (
          id            TEXT PRIMARY KEY,
          user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          text          TEXT NOT NULL DEFAULT '',
          color_key     TEXT,
          icon_key      TEXT,
          status        TEXT NOT NULL DEFAULT 'board',
          collection_id TEXT REFERENCES sn_collections(id) ON DELETE SET NULL,
          x             REAL NOT NULL DEFAULT 24,
          y             REAL NOT NULL DEFAULT 24,
          w             REAL NOT NULL DEFAULT 220,
          h             REAL NOT NULL DEFAULT 64,
          pinned        BOOLEAN NOT NULL DEFAULT false,
          source_url    TEXT,
          source_title  TEXT,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          filed_at      TIMESTAMPTZ
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS sn_notes_user_status
          ON sn_notes (user_id, status, filed_at DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sn_arrows (
          id          TEXT PRIMARY KEY,
          user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          from_note   TEXT NOT NULL REFERENCES sn_notes(id) ON DELETE CASCADE,
          to_note     TEXT NOT NULL REFERENCES sn_notes(id) ON DELETE CASCADE,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS sn_arrows_user ON sn_arrows (user_id)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sn_legend (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind    TEXT NOT NULL,
          key     TEXT NOT NULL,
          label   TEXT NOT NULL,
          PRIMARY KEY (user_id, kind, key)
        )
      `;
    })().catch((err) => {
      _schemaReady = null;
      throw err;
    });
  }
  return _schemaReady;
}
