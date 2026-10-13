/**
 * Poster / TMDB-id hydration for A-Lister.
 *
 * Safe to run on every list/profile read: only fills missing poster_path and
 * tmdb_id on the in-memory rows. Never writes theater, cost, rating, or dates.
 * Persistent linking lives in backfillMovieArtwork (explicit Settings action).
 */
import { db, ensureSchema } from './db.js';
import { getTmdbApiKey, getMovieDetails, searchMovies } from './tmdb.js';
import { applyLocalArtwork, applyCachedArtwork, uniqueExactSearchMatch } from './a-list-poster-match.js';

export {
  foldMovieTitle,
  uniqueExactSearchMatch,
  uniqueTmdbByFoldedTitle,
  applyLocalArtwork,
  applyCachedArtwork,
} from './a-list-poster-match.js';

async function loadMovieCacheFor(rows) {
  const missing = rows.filter((row) => !row.poster_path || !row.tmdb_id);
  if (!missing.length) return [];
  const ids = [...new Set(
    missing.filter((row) => row.tmdb_id).map((row) => Number(row.tmdb_id)),
  )];
  const titles = [...new Set(
    missing.map((row) => String(row.title || '').trim().toLowerCase()).filter(Boolean),
  )];
  const cache = [];
  if (ids.length) {
    cache.push(...await db()`
      SELECT tmdb_id, title, poster_path
      FROM alist_movie_cache
      WHERE tmdb_id = ANY(${ids}) AND poster_path IS NOT NULL
    `);
  }
  if (titles.length) {
    cache.push(...await db()`
      SELECT tmdb_id, title, poster_path
      FROM alist_movie_cache
      WHERE poster_path IS NOT NULL AND lower(title) = ANY(${titles})
    `);
  }
  return cache;
}

async function loadTvCacheFor(rows) {
  const missing = rows.filter((row) => !row.poster_path || !row.tmdb_id);
  if (!missing.length) return [];
  const ids = [...new Set(
    missing.filter((row) => row.tmdb_id).map((row) => Number(row.tmdb_id)),
  )];
  const titles = [...new Set(
    missing.map((row) => String(row.title || '').trim().toLowerCase()).filter(Boolean),
  )];
  const cache = [];
  if (ids.length) {
    cache.push(...await db()`
      SELECT tmdb_id, title, poster_path
      FROM alist_tv_cache
      WHERE tmdb_id = ANY(${ids}) AND poster_path IS NOT NULL
    `);
  }
  if (titles.length) {
    cache.push(...await db()`
      SELECT tmdb_id, title, poster_path
      FROM alist_tv_cache
      WHERE poster_path IS NOT NULL AND lower(title) = ANY(${titles})
    `);
  }
  return cache;
}

export async function hydrateMovieRows(rows) {
  if (!process.env.DATABASE_URL || !rows?.length) return rows || [];
  const local = applyLocalArtwork(rows);
  if (local.every((row) => row.poster_path && row.tmdb_id)) return local;
  try {
    await ensureSchema();
    return applyCachedArtwork(local, await loadMovieCacheFor(local));
  } catch {
    return local;
  }
}

export async function hydrateTvRows(rows) {
  if (!process.env.DATABASE_URL || !rows?.length) return rows || [];
  const local = applyLocalArtwork(rows);
  if (local.every((row) => row.poster_path && row.tmdb_id)) return local;
  try {
    await ensureSchema();
    return applyCachedArtwork(local, await loadTvCacheFor(local));
  } catch {
    return local;
  }
}

function emptyBackfill() {
  return { linked: 0, cached: 0, ranks: 0, remaining: 0, tmdbCalls: 0 };
}

async function linkWatchesFromKnownTitles(uid) {
  const rows = await db()`
    WITH known AS (
      SELECT lower(trim(title)) AS k, (array_agg(DISTINCT tmdb_id))[1] AS tmdb_id
      FROM (
        SELECT title, tmdb_id FROM alist_watches WHERE tmdb_id IS NOT NULL
        UNION
        SELECT title, tmdb_id FROM alist_watchlist WHERE tmdb_id IS NOT NULL
        UNION
        SELECT title, tmdb_id FROM alist_movie_cache WHERE tmdb_id IS NOT NULL
      ) src
      GROUP BY 1
      HAVING count(DISTINCT tmdb_id) = 1
    )
    UPDATE alist_watches w
    SET tmdb_id = known.tmdb_id, updated_at = now()
    FROM known
    WHERE w.tmdb_id IS NULL
      AND lower(trim(w.title)) = known.k
      AND (${uid}::text IS NULL OR w.user_id = ${uid})
    RETURNING w.id
  `;
  return rows.length;
}

async function linkWatchlistFromKnownTitles(uid) {
  const rows = await db()`
    WITH known AS (
      SELECT lower(trim(title)) AS k, (array_agg(DISTINCT tmdb_id))[1] AS tmdb_id
      FROM (
        SELECT title, tmdb_id FROM alist_watches WHERE tmdb_id IS NOT NULL
        UNION
        SELECT title, tmdb_id FROM alist_watchlist WHERE tmdb_id IS NOT NULL
        UNION
        SELECT title, tmdb_id FROM alist_movie_cache WHERE tmdb_id IS NOT NULL
      ) src
      GROUP BY 1
      HAVING count(DISTINCT tmdb_id) = 1
    )
    UPDATE alist_watchlist w
    SET tmdb_id = known.tmdb_id, updated_at = now()
    FROM known
    WHERE w.tmdb_id IS NULL
      AND lower(trim(w.title)) = known.k
      AND (${uid}::text IS NULL OR w.user_id = ${uid})
    RETURNING w.id
  `;
  return rows.length;
}

async function fillRankPostersFromCache(uid) {
  const movie = await db()`
    UPDATE alist_movie_ranks r
    SET poster_path = c.poster_path, updated_at = now()
    FROM alist_movie_cache c
    WHERE r.tmdb_id = c.tmdb_id
      AND c.poster_path IS NOT NULL
      AND (r.poster_path IS NULL OR r.poster_path = '')
      AND (${uid}::text IS NULL OR r.user_id = ${uid})
    RETURNING r.user_id, r.tmdb_id
  `;
  const tv = await db()`
    UPDATE alist_tv_ranks r
    SET poster_path = c.poster_path, updated_at = now()
    FROM alist_tv_cache c
    WHERE r.tmdb_id = c.tmdb_id
      AND c.poster_path IS NOT NULL
      AND (r.poster_path IS NULL OR r.poster_path = '')
      AND (${uid}::text IS NULL OR r.user_id = ${uid})
    RETURNING r.user_id, r.tmdb_id
  `;
  return movie.length + tv.length;
}

async function missingMovieCacheIds(uid) {
  return db()`
    SELECT DISTINCT src.tmdb_id
    FROM (
      SELECT tmdb_id FROM alist_watches
        WHERE tmdb_id IS NOT NULL AND (${uid}::text IS NULL OR user_id = ${uid})
      UNION
      SELECT tmdb_id FROM alist_watchlist
        WHERE tmdb_id IS NOT NULL AND (${uid}::text IS NULL OR user_id = ${uid})
      UNION
      SELECT tmdb_id FROM alist_movie_ranks
        WHERE tmdb_id IS NOT NULL AND (${uid}::text IS NULL OR user_id = ${uid})
    ) src
    LEFT JOIN alist_movie_cache c ON c.tmdb_id = src.tmdb_id
    WHERE c.tmdb_id IS NULL OR c.poster_path IS NULL
  `;
}

async function unlinkedMovieTitles(uid) {
  return db()`
    SELECT MIN(id)::text AS id, MIN(title) AS title
    FROM alist_watches
    WHERE tmdb_id IS NULL
      AND (${uid}::text IS NULL OR user_id = ${uid})
    GROUP BY lower(trim(title))
  `;
}

async function countRemainingMovieWork(uid) {
  const [cacheRows, titleRows] = await Promise.all([
    missingMovieCacheIds(uid),
    unlinkedMovieTitles(uid),
  ]);
  return cacheRows.length + titleRows.length;
}

/**
 * Idempotent TMDB backfill for movies (watches, watchlist, ranks, cache).
 * Only writes tmdb_id where it is NULL, and poster_path on cache/ranks where
 * it is NULL. Theater, cost, rating, and dates are never touched.
 */
export async function backfillMovieArtwork({ userId = null, limit = 30 } = {}) {
  const apiKey = getTmdbApiKey();
  if (!apiKey) return emptyBackfill();

  await ensureSchema();
  const uid = userId || null;
  const cap = Math.max(1, Math.min(50, Number(limit) || 30));

  let linked = 0;
  linked += await linkWatchesFromKnownTitles(uid);
  linked += await linkWatchlistFromKnownTitles(uid);
  const ranks = await fillRankPostersFromCache(uid);

  const uncached = await missingMovieCacheIds(uid);
  const untitled = await unlinkedMovieTitles(uid);

  let cached = 0;
  let tmdbCalls = 0;
  let budget = cap;

  for (const row of uncached) {
    if (budget <= 0) break;
    budget -= 1;
    tmdbCalls += 1;
    try {
      const movie = await getMovieDetails(Number(row.tmdb_id), { apiKey });
      if (movie?.poster_path) cached += 1;
    } catch {
      // Leave the row uncached; a later pass can retry.
    }
  }

  for (const row of untitled) {
    if (budget <= 0) break;
    budget -= 1;
    tmdbCalls += 1;
    try {
      const results = await searchMovies(row.title, { apiKey });
      const match = uniqueExactSearchMatch(results, row.title);
      if (!match?.tmdb_id) continue;
      await getMovieDetails(match.tmdb_id, { apiKey });
      tmdbCalls += 1;
      const updated = await db()`
        UPDATE alist_watches
        SET tmdb_id = ${match.tmdb_id}, updated_at = now()
        WHERE tmdb_id IS NULL
          AND lower(trim(title)) = ${String(row.title).trim().toLowerCase()}
          AND (${uid}::text IS NULL OR user_id = ${uid})
        RETURNING id
      `;
      linked += updated.length;
      const watchlist = await db()`
        UPDATE alist_watchlist
        SET tmdb_id = ${match.tmdb_id}, updated_at = now()
        WHERE tmdb_id IS NULL
          AND lower(trim(title)) = ${String(row.title).trim().toLowerCase()}
          AND (${uid}::text IS NULL OR user_id = ${uid})
        RETURNING id
      `;
      linked += watchlist.length;
    } catch {
      // Skip failed title lookups.
    }
  }

  const remaining = await countRemainingMovieWork(uid);
  return { linked, cached, ranks, remaining, tmdbCalls };
}
