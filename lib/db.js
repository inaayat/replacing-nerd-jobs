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
    _schemaReady = db()`
      CREATE TABLE IF NOT EXISTS users (
        id           TEXT PRIMARY KEY,          -- Clerk user id (user_...)
        email        TEXT,
        name         TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.catch((err) => {
      _schemaReady = null; // let the next request retry
      throw err;
    });
  }
  return _schemaReady;
}
