/**
 * Pure poster / TMDB-id matching. No database — tests and the server backfill
 * share this so a remake cannot steal another title's artwork.
 */

/** Same fold the client uses so "The Odyssey" matches "odyssey". */
export function foldMovieTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function movieYear(row) {
  if (row?.year != null && Number.isFinite(Number(row.year))) return Number(row.year);
  const date = row?.release_date;
  if (date && /^\d{4}/.test(String(date))) return Number(String(date).slice(0, 4));
  return null;
}

export function hintYearFromWatch({ year, watchedOn, watched_on } = {}) {
  if (year != null && Number.isFinite(Number(year))) return Number(year);
  const date = watchedOn || watched_on;
  if (date && /^\d{4}/.test(String(date))) return Number(String(date).slice(0, 4));
  return null;
}

/**
 * Auto-link matcher for writes and backfill.
 *
 * Exact folded title only — never substring ("It" must not claim "Titanic").
 * One exact hit wins. Remakes need a year (or screening date year); the uniquely
 * closest year wins, otherwise leave null rather than guess.
 */
export function pickBestMovieMatch(results, title, hint = {}) {
  const key = foldMovieTitle(title);
  if (!key || !results?.length) return null;
  const exact = results.filter((row) => foldMovieTitle(row.title) === key);
  if (!exact.length) return null;
  if (exact.length === 1) return exact[0];

  const yearHint = hintYearFromWatch(hint);
  if (yearHint == null) return null;

  let best = null;
  let bestDist = Infinity;
  let tied = false;
  for (const row of exact) {
    const y = movieYear(row);
    if (y == null) continue;
    const dist = Math.abs(y - yearHint);
    if (dist < bestDist) {
      best = row;
      bestDist = dist;
      tied = false;
    } else if (dist === bestDist && Number(row.tmdb_id) !== Number(best?.tmdb_id)) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/** Exact unique title, no year hint — remakes stay unlinked. */
export function uniqueExactSearchMatch(results, title) {
  return pickBestMovieMatch(results, title);
}

/** Folded title → tmdb_id only when every row agrees on that id. */
export function uniqueTmdbByFoldedTitle(rows) {
  const ids = new Map();
  const posters = new Map();
  for (const row of rows || []) {
    const key = foldMovieTitle(row.title);
    if (!key) continue;
    if (row.tmdb_id) {
      if (!ids.has(key)) ids.set(key, new Set());
      ids.get(key).add(Number(row.tmdb_id));
    }
    if (row.poster_path) {
      if (!posters.has(key)) posters.set(key, new Set());
      posters.get(key).add(row.poster_path);
    }
  }
  const out = new Map();
  for (const [key, set] of ids) {
    if (set.size !== 1) continue;
    const posterSet = posters.get(key);
    out.set(key, {
      tmdb_id: [...set][0],
      poster_path: posterSet?.size === 1 ? [...posterSet][0] : null,
    });
  }
  return out;
}

function fillMissingArtwork(row, hit, posterByTmdb) {
  const tmdbId = row.tmdb_id ? Number(row.tmdb_id) : null;
  let nextTmdb = tmdbId;
  let nextPoster = row.poster_path || null;
  if (!nextPoster && nextTmdb && posterByTmdb.has(nextTmdb)) {
    nextPoster = posterByTmdb.get(nextTmdb);
  }
  if (hit) {
    if (!nextTmdb) nextTmdb = hit.tmdb_id || null;
    if (!nextPoster) nextPoster = hit.poster_path || null;
  }
  if (nextTmdb === tmdbId && nextPoster === (row.poster_path || null)) return row;
  return { ...row, tmdb_id: nextTmdb || row.tmdb_id || null, poster_path: nextPoster };
}

/** Copy artwork from other rows in the same list that share a unique title. */
export function applyLocalArtwork(rows) {
  const byTitle = uniqueTmdbByFoldedTitle(rows);
  const posterByTmdb = new Map();
  for (const row of rows || []) {
    if (row.tmdb_id && row.poster_path) posterByTmdb.set(Number(row.tmdb_id), row.poster_path);
  }
  return (rows || []).map((row) => (
    fillMissingArtwork(row, byTitle.get(foldMovieTitle(row.title)), posterByTmdb)
  ));
}

/** Overlay alist_movie_cache (or tv cache) rows onto a list. */
export function applyCachedArtwork(rows, cacheRows) {
  const byTitle = uniqueTmdbByFoldedTitle(cacheRows);
  const posterByTmdb = new Map();
  for (const row of cacheRows || []) {
    if (row.tmdb_id && row.poster_path) {
      posterByTmdb.set(Number(row.tmdb_id), row.poster_path);
    }
  }
  return (rows || []).map((row) => (
    fillMissingArtwork(row, byTitle.get(foldMovieTitle(row.title)), posterByTmdb)
  ));
}

/** TMDB searches + detail fetches allowed inline on a write (import/add). */
export const INLINE_TMDB_LINK_LIMIT = 16;

/**
 * Fill missing tmdb_id via unique sibling titles, then TMDB search.
 * Never overwrites an existing tmdb_id. `search` / `details` are injected so
 * tests stay secret-free. Remaining unlinked rows are deferred (backfill).
 */
export async function linkMoviesInline(items, {
  limit = INLINE_TMDB_LINK_LIMIT,
  search,
  details,
} = {}) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return { items: [], linked: 0, cached: 0, deferred: 0 };

  const withSiblings = applyLocalArtwork(rows);
  let remaining = Math.max(0, Number(limit) || 0);
  let linked = 0;
  let cached = 0;
  const resolved = new Map();
  const fetched = new Set();

  const pending = [];
  const seen = new Set();
  for (const item of withSiblings) {
    if (item.tmdb_id) continue;
    const key = foldMovieTitle(item.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    pending.push({ key, item });
  }

  if (typeof search === 'function') {
    for (const { key, item } of pending) {
      if (remaining <= 0) break;
      remaining -= 1;
      try {
        const results = await search(item.title);
        const match = pickBestMovieMatch(results, item.title, {
          year: item.year,
          watchedOn: item.watched_on || item.watchedOn,
        });
        if (!match?.tmdb_id) continue;
        if (typeof details === 'function' && remaining > 0) {
          remaining -= 1;
          try {
            const movie = await details(match.tmdb_id);
            fetched.add(Number(match.tmdb_id));
            if (movie?.poster_path) cached += 1;
          } catch {
            // Id is still usable; cache can catch up later.
          }
        }
        resolved.set(key, Number(match.tmdb_id));
        linked += 1;
      } catch {
        // Leave this title for backfill.
      }
    }
  }

  const next = withSiblings.map((item) => {
    if (item.tmdb_id) return item;
    const id = resolved.get(foldMovieTitle(item.title));
    if (!id) return item;
    return { ...item, tmdb_id: id };
  });

  if (typeof details === 'function') {
    const ids = [...new Set(
      next.filter((item) => item.tmdb_id).map((item) => Number(item.tmdb_id)),
    )].filter((id) => !fetched.has(id));
    for (const id of ids) {
      if (remaining <= 0) break;
      remaining -= 1;
      try {
        const movie = await details(id);
        if (movie?.poster_path) cached += 1;
      } catch {
        // Poster self-heal / backfill can retry.
      }
    }
  }

  const siblingLinked = withSiblings.filter((item, i) => !rows[i].tmdb_id && item.tmdb_id).length;
  return {
    items: next,
    linked: linked + siblingLinked,
    cached,
    deferred: next.filter((item) => !item.tmdb_id).length,
  };
}
