/**
 * Pure helpers for "add someone to a showing" / watched-together matching.
 * Kept free of DB imports so the match rules can be unit-tested alone.
 */

/** Trim + casefold so "AMC Lincoln Square 13" matches "amc lincoln square 13". */
export function normalizeLocation(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Same title rules the movie linker uses: drop articles/punctuation, casefold. */
export function normalizeMovieTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Two theater watches count as the same outing when date, theater, and movie
 * agree. Prefer tmdb_id when both sides have one; otherwise fall back to
 * normalized titles.
 */
export function watchesMatchForTogether(a, b) {
  if (!a || !b) return false;
  if (String(a.watched_on || '').slice(0, 10) !== String(b.watched_on || '').slice(0, 10)) {
    return false;
  }
  if (normalizeLocation(a.location) !== normalizeLocation(b.location)) return false;
  if (!normalizeLocation(a.location)) return false;

  const aTmdb = a.tmdb_id != null && a.tmdb_id !== '' ? Number(a.tmdb_id) : null;
  const bTmdb = b.tmdb_id != null && b.tmdb_id !== '' ? Number(b.tmdb_id) : null;
  if (aTmdb && bTmdb) return aTmdb === bTmdb;

  const aTitle = normalizeMovieTitle(a.title);
  const bTitle = normalizeMovieTitle(b.title);
  return Boolean(aTitle) && aTitle === bTitle;
}

export function inviteFromRow(row) {
  return {
    id: row.id,
    from_user_id: row.from_user_id,
    to_user_id: row.to_user_id,
    source_watch_id: row.source_watch_id || null,
    status: row.status,
    watched_on: row.watched_on,
    title: row.title,
    tmdb_id: row.tmdb_id != null ? Number(row.tmdb_id) : null,
    location: row.location || null,
    format: row.format || '',
    ticket_cents: row.ticket_cents != null ? Number(row.ticket_cents) : null,
    in_theaters: row.in_theaters !== false,
    created_watch_id: row.created_watch_id || null,
    from_username: row.from_username || null,
    to_username: row.to_username || null,
    poster_path: row.poster_path || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Roll up per-watch bulk-invite outcomes for UI status copy. */
export function summarizeBulkInviteResults(results = []) {
  let linked = 0;
  let already = 0;
  let invited = 0;
  let failed = 0;
  for (const row of results) {
    if (row.error) failed += 1;
    else if (row.already || row.already_pending) already += 1;
    else if (row.linked) linked += 1;
    else if (row.invited) invited += 1;
  }
  return { linked, already, invited, failed, total: results.length };
}

/**
 * Normalize a "seen with" username list from chips / comma text / API body.
 * Keeps first-seen order, lowercases, and caps length.
 */
export function normalizeSeenWithUsernames(raw, { max = 12 } = {}) {
  const source = Array.isArray(raw)
    ? raw
    : String(raw || '').split(/[\s,]+/);
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const username = String(item || '').trim().toLowerCase();
    if (!username || seen.has(username)) continue;
    if (username.length < 3 || username.length > 24) continue;
    if (!/^[a-z0-9_]+$/.test(username)) continue;
    seen.add(username);
    out.push(username);
    if (out.length >= max) break;
  }
  return out;
}
