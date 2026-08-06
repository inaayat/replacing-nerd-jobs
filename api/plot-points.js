/**
 * Plot Points — public TMDB query explorer API (no auth).
 *
 * Routes (via vercel.json rewrite → ?route=):
 *   GET person-search?q=           → director-leaning person search
 *   GET query?type=&person_id=     → cast-count | cast-rating | reuse
 */
import { createHash } from 'node:crypto';
import { db, ensureSchema } from '../lib/db.js';
import {
  QUERY_TYPES,
  buildQueryResult,
  directorMoviesFromCredits,
  normalizeMinFilms,
} from '../lib/plot-points.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const MAX_FILMS = 40;
const TOP_CAST = 15;
const CAST_CONCURRENCY = 5;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }

  const route = String(req.query?.route || '').trim();
  if (route === 'person-search') return handlePersonSearch(req, res);
  if (route === 'query') return handleQuery(req, res);

  res.status(404).json({
    error: 'Unknown Plot Points route.',
    routes: ['person-search', 'query'],
  });
}

function requireTmdb(res) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'TMDB_API_KEY not configured.' });
    return null;
  }
  return apiKey;
}

async function tmdbFetch(apiKey, path, params = {}) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url);
  if (!response.ok) {
    const err = new Error(`TMDB ${path} failed (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

async function handlePersonSearch(req, res) {
  const apiKey = requireTmdb(res);
  if (!apiKey) return;

  const q = String(req.query?.q || '').trim();
  if (q.length < 2) {
    res.status(400).json({ error: 'Query q must be at least 2 characters.' });
    return;
  }

  try {
    const data = await tmdbFetch(apiKey, '/search/person', {
      query: q,
      include_adult: 'false',
    });
    const results = (data.results || [])
      .slice(0, 12)
      .map((p) => ({
        tmdb_id: p.id,
        name: p.name,
        profile_path: p.profile_path || null,
        known_for_department: p.known_for_department || null,
        known_for: (p.known_for || [])
          .filter((k) => k.media_type === 'movie')
          .slice(0, 3)
          .map((k) => k.title)
          .filter(Boolean),
      }))
      .sort((a, b) => {
        const aDir = a.known_for_department === 'Directing' ? 0 : 1;
        const bDir = b.known_for_department === 'Directing' ? 0 : 1;
        return aDir - bDir || a.name.localeCompare(b.name);
      });

    res.status(200).json({ results });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

async function ensurePlotPointsCache() {
  if (!process.env.DATABASE_URL) return false;
  await ensureSchema();
  await db()`
    CREATE TABLE IF NOT EXISTS plot_points_cache (
      cache_key   TEXT PRIMARY KEY,
      payload     JSONB NOT NULL,
      fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  return true;
}

async function readCache(cacheKey) {
  if (!process.env.DATABASE_URL) return null;
  try {
    await ensurePlotPointsCache();
    const rows = await db()`
      SELECT payload, fetched_at
      FROM plot_points_cache
      WHERE cache_key = ${cacheKey}
    `;
    if (!rows.length) return null;
    const age = Date.now() - new Date(rows[0].fetched_at).getTime();
    if (age > CACHE_TTL_MS) return null;
    return rows[0].payload;
  } catch {
    return null;
  }
}

async function writeCache(cacheKey, payload) {
  if (!process.env.DATABASE_URL) return;
  try {
    await ensurePlotPointsCache();
    await db()`
      INSERT INTO plot_points_cache (cache_key, payload, fetched_at)
      VALUES (${cacheKey}, ${JSON.stringify(payload)}, now())
      ON CONFLICT (cache_key) DO UPDATE SET
        payload = EXCLUDED.payload,
        fetched_at = now()
    `;
  } catch {
    // Cache is best-effort.
  }
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function loadDirectorFilmography(apiKey, personId) {
  const credits = await tmdbFetch(apiKey, `/person/${personId}/movie_credits`);
  const movies = directorMoviesFromCredits(credits.crew || []).slice(0, MAX_FILMS);

  const withCast = await mapPool(movies, CAST_CONCURRENCY, async (movie) => {
    try {
      const creditData = await tmdbFetch(apiKey, `/movie/${movie.tmdb_id}/credits`);
      const cast = (creditData.cast || []).slice(0, TOP_CAST).map((c) => ({
        id: c.id,
        name: c.name,
        profile_path: c.profile_path || null,
        order: c.order,
      }));
      return { ...movie, cast };
    } catch {
      return { ...movie, cast: [] };
    }
  });

  return withCast.filter((m) => m.cast.length);
}

async function handleQuery(req, res) {
  const apiKey = requireTmdb(res);
  if (!apiKey) return;

  const type = String(req.query?.type || 'cast-count').trim();
  if (!QUERY_TYPES[type]) {
    res.status(400).json({
      error: `Unknown query type. Use one of: ${Object.keys(QUERY_TYPES).join(', ')}`,
    });
    return;
  }

  const personId = Number(req.query?.person_id);
  if (!personId) {
    res.status(400).json({ error: 'person_id is required.' });
    return;
  }

  const minFilms = normalizeMinFilms(req.query?.min_films, 2);
  const cacheKey = createHash('sha256')
    .update(JSON.stringify({ type, personId, minFilms, MAX_FILMS, TOP_CAST, v: 1 }))
    .digest('hex');

  try {
    const cached = await readCache(cacheKey);
    if (cached) {
      res.status(200).json({ ...cached, cache: 'hit' });
      return;
    }

    const person = await tmdbFetch(apiKey, `/person/${personId}`);
    const movies = await loadDirectorFilmography(apiKey, personId);
    if (!movies.length) {
      res.status(404).json({
        error: 'No directed movies with cast data found for this person on TMDB.',
      });
      return;
    }

    const payload = buildQueryResult({
      type,
      person: {
        tmdb_id: person.id,
        name: person.name,
        profile_path: person.profile_path || null,
      },
      movies,
      minFilms,
      topCastPerFilm: TOP_CAST,
      source: 'live',
    });

    await writeCache(cacheKey, payload);
    res.status(200).json({ ...payload, cache: 'miss' });
  } catch (err) {
    const status = err.status === 404 ? 404 : 502;
    res.status(status).json({ error: err.message });
  }
}
