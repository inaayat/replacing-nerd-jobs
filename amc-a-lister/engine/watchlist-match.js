/**
 * Shared want-list ↔ logged-watch matching (browser + API).
 * Keep this file dependency-free — imported by the client and by lib/a-list.js.
 */

/**
 * True when a Coming Soon / Watch at Home row is the film that was just logged.
 * Prefer TMDB id; fall back to case-insensitive title; honor an explicit row id.
 */
export function watchlistItemMatchesLogged(item, logged = {}) {
  if (!item || !logged) return false;
  if (logged.watchlistId != null && String(item.id) === String(logged.watchlistId)) return true;
  if (
    logged.tmdb_id != null && item.tmdb_id != null
    && Number(logged.tmdb_id) === Number(item.tmdb_id)
  ) {
    return true;
  }
  const loggedTitle = String(logged.title || '').trim().toLowerCase();
  const itemTitle = String(item.title || '').trim().toLowerCase();
  return Boolean(loggedTitle && itemTitle && loggedTitle === itemTitle);
}

/** Titles that appear on both want lists (TMDB id, else exact title). */
export function sharedWatchlistItems(yours, theirs) {
  const out = [];
  const seen = new Set();
  for (const theirsItem of theirs || []) {
    const match = (yours || []).find((item) => watchlistItemMatchesLogged(item, theirsItem));
    if (!match) continue;
    const key = match.tmdb_id
      ? `tmdb:${Number(match.tmdb_id)}`
      : `title:${String(match.title || '').trim().toLowerCase()}`;
    if (!key.endsWith(':') && !seen.has(key)) {
      seen.add(key);
      out.push({
        title: theirsItem.title || match.title,
        tmdb_id: theirsItem.tmdb_id || match.tmdb_id || null,
        poster_path: theirsItem.poster_path || match.poster_path || null,
      });
    }
  }
  return out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
}
