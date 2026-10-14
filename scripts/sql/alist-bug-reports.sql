-- Safe to run on production (no-op if the table already exists).
-- A-Lister Settings → Report a bug. ensureSchema() in lib/db.js also
-- creates this on the next authenticated API request.

CREATE TABLE IF NOT EXISTS alist_bug_reports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  url         TEXT,
  user_agent  TEXT,
  screenshot  TEXT,
  context     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      TEXT NOT NULL DEFAULT 'open'
);

CREATE INDEX IF NOT EXISTS alist_bug_reports_created
  ON alist_bug_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS alist_bug_reports_user_created
  ON alist_bug_reports (user_id, created_at DESC);

-- Owner read (no admin UI):
-- SELECT r.created_at, r.status, u.email, u.name, r.message, r.details,
--        r.url, r.user_agent, r.context
-- FROM alist_bug_reports r
-- LEFT JOIN users u ON u.id = r.user_id
-- ORDER BY r.created_at DESC;
