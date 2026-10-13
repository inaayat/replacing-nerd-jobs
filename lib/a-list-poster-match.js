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

/**
 * Auto-link only when TMDB search has exactly one folded-title match.
 * Remakes (two "Dune"s) stay unlinked rather than guessing.
 */
export function uniqueExactSearchMatch(results, title) {
  const key = foldMovieTitle(title);
  if (!key || !results?.length) return null;
  const matches = results.filter((row) => foldMovieTitle(row.title) === key);
  return matches.length === 1 ? matches[0] : null;
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
