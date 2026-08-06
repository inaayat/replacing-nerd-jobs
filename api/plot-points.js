/**
 * Plot Points — public TMDB query explorer API (no auth).
 *
 * Uses the shared A-Lister TMDB client (`lib/tmdb.js`) and movie cache
 * (`alist_movie_cache`), plus a result cache for full query payloads.
 *
 * All Plot Points routes live in this one file: Vercel's Hobby plan caps a
 * deployment at 12 serverless functions and the site is at that ceiling, so
 * new endpoints must be added as `?route=` branches rather than new files.
 *
 * Routes (via vercel.json rewrites → ?route=):
 *   GET person-search?q=        → director-leaning person search
 *   GET collection-search?q=    → franchise/collection search
 *   GET genres                  → TMDB movie genre list (for the builder UI)
 *   GET build?spec=<json>       → generic pivot query
 *   GET query?type=&person_id=  → legacy preset queries (kept for old links)
 */
import { createHash } from 'node:crypto';
import { db, ensureSchema } from '../lib/db.js';
import {
  QUERY_TYPES,
  normalizeMinFilms,
} from '../lib/plot-points.js';
import {
  normalizeSpec,
  runQuery,
  groupByNeedsCredits,
  SCOPES,
} from '../lib/plot-points-query.js';
import {
  getTmdbApiKey,
  searchPeople,
  searchCollections,
  getMovieGenres,
  getPerson,
  getPersonFilmIds,
  discoverMovieIds,
  getCollectionMovieIds,
  getMoviesForQuery,
} from '../lib/tmdb.js';

const MAX_FILMS = 60;
const DISCOVER_PAGES = 3;
const FETCH_CONCURRENCY = 8;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
// Bump to invalidate cached payloads whenever the engine's output changes.
// v4 discards the empty results cached while the engine read the wrong
// credit fields (`cast`/`crew` instead of `cast_members`/`crew_members`).
const CACHE_VERSION = 4;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }

  const route = String(req.query?.route || '').trim();
  if (route === 'person-search') return handlePersonSearch(req, res);
  if (route === 'collection-search') return handleCollectionSearch(req, res);
  if (route === 'genres') return handleGenres(req, res);
  if (route === 'build') return handleBuild(req, res);
  if (route === 'query') return handleLegacyQuery(req, res);

  res.status(404).json({
    error: 'Unknown Plot Points route.',
    routes: ['person-search', 'collection-search', 'genres', 'build', 'query'],
  });
}

function requireTmdb(res) {
  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    res.status(503).json({ error: 'TMDB_API_KEY not configured.' });
    return null;
  }
  return apiKey;
}

function failureStatus(err) {
  if (err.status === 404) return 404;
  if (err.status === 503) return 503;
  return 502;
}

/* ── Lookup routes ─────────────────────────────────────────────── */

async function handlePersonSearch(req, res) {
  const apiKey = requireTmdb(res);
  if (!apiKey) return;

  const q = String(req.query?.q || '').trim();
  if (q.length < 2) {
    res.status(400).json({ error: 'Query q must be at least 2 characters.' });
    return;
  }

  try {
    res.status(200).json({ results: await searchPeople(q, { apiKey, limit: 12 }) });
  } catch (err) {
    res.status(failureStatus(err)).json({ error: err.message });
  }
}

async function handleCollectionSearch(req, res) {
  const apiKey = requireTmdb(res);
  if (!apiKey) return;

  const q = String(req.query?.q || '').trim();
  if (q.length < 2) {
    res.status(400).json({ error: 'Query q must be at least 2 characters.' });
    return;
  }

  try {
    res.status(200).json({ results: await searchCollections(q, { apiKey }) });
  } catch (err) {
    res.status(failureStatus(err)).json({ error: err.message });
  }
}

async function handleGenres(req, res) {
  const apiKey = requireTmdb(res);
  if (!apiKey) return;

  try {
    res.status(200).json({ genres: await getMovieGenres({ apiKey }) });
  } catch (err) {
    res.status(failureStatus(err)).json({ error: err.message });
  }
}

/* ── Result cache ──────────────────────────────────────────────── */

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
    if (Date.now() - new Date(rows[0].fetched_at).getTime() > CACHE_TTL_MS) return null;
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

/* ── Scope resolution ──────────────────────────────────────────── */

async function resolveScope(spec, apiKey) {
  const scope = spec.scope;

  if (SCOPES[scope.type]?.needs === 'person') {
    const personId = Number(scope.person_id);
    if (!personId) {
      const err = new Error('scope.person_id is required for person scopes.');
      err.status = 400;
      throw err;
    }
    const person = await getPerson(personId, { apiKey });
    if (!person) {
      const err = new Error('Person not found on TMDB.');
      err.status = 404;
      throw err;
    }
    const ids = await getPersonFilmIds(personId, scope.type, { apiKey });
    return { ids, subject: person, label: person.name };
  }

  if (scope.type === 'collection') {
    const collectionId = Number(scope.collection_id);
    if (!collectionId) {
      const err = new Error('scope.collection_id is required for collection scope.');
      err.status = 400;
      throw err;
    }
    const ids = await getCollectionMovieIds(collectionId, { apiKey });
    return { ids, subject: null, label: scope.collection_name || `Collection ${collectionId}` };
  }

  const ids = await discoverMovieIds({
    with_genres: scope.genre_id || undefined,
    with_companies: scope.company_id || undefined,
    with_original_language: scope.language || undefined,
    year_from: scope.year_from || undefined,
    year_to: scope.year_to || undefined,
    min_votes: scope.min_votes,
    sort_by: scope.sort_by,
  }, { apiKey, pages: DISCOVER_PAGES });

  return { ids, subject: null, label: SCOPES.discover.describe(scope) };
}

function parseSpecParam(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('spec must be valid JSON.');
    err.status = 400;
    throw err;
  }
}

/* ── Generic query ─────────────────────────────────────────────── */

async function runSpec(spec, apiKey) {
  const { ids, subject, label } = await resolveScope(spec, apiKey);
  if (!ids.length) {
    const err = new Error('No films found for this scope. Try widening the filters.');
    err.status = 404;
    throw err;
  }

  const capped = ids.slice(0, MAX_FILMS);
  const movies = await getMoviesForQuery(capped, { apiKey, concurrency: FETCH_CONCURRENCY });
  if (!movies.length) {
    const err = new Error('TMDB returned no usable film data for this scope.');
    err.status = 404;
    throw err;
  }

  const payload = runQuery(movies, spec);
  payload.scope = {
    label,
    subject,
    films_available: ids.length,
    films_used: capped.length,
    truncated: ids.length > capped.length,
  };
  payload.query.source = 'TMDB (shared movie cache)';
  payload.query.generated_at = new Date().toISOString();
  payload.query.needs_credits = groupByNeedsCredits(spec.group_by);
  return payload;
}

async function handleBuild(req, res) {
  const apiKey = requireTmdb(res);
  if (!apiKey) return;

  try {
    const spec = normalizeSpec(parseSpecParam(req.query?.spec));
    const cacheKey = createHash('sha256')
      .update(JSON.stringify({ spec, MAX_FILMS, v: CACHE_VERSION }))
      .digest('hex');

    const cached = await readCache(cacheKey);
    if (cached) {
      res.status(200).json({ ...cached, cache: 'hit' });
      return;
    }

    const payload = await runSpec(spec, apiKey);
    await writeCache(cacheKey, payload);
    res.status(200).json({ ...payload, cache: 'miss' });
  } catch (err) {
    const status = err.status === 400 ? 400 : failureStatus(err);
    res.status(status).json({ error: err.message });
  }
}

/* ── Legacy preset routes ──────────────────────────────────────── */

/** Old preset ids map onto the generic engine so shared links keep working. */
function specFromLegacyType(type, personId, minFilms) {
  const base = {
    scope: { type: 'person-directed', person_id: personId },
    group_by: 'actor',
    min_films: normalizeMinFilms(minFilms, 2),
    limit: 25,
  };
  if (type === 'cast-rating') {
    return { ...base, metric: { agg: 'avg', field: 'vote_average' }, sort: 'desc' };
  }
  return { ...base, metric: { agg: 'count' }, sort: 'desc' };
}

async function handleLegacyQuery(req, res) {
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

  const minFilms = type === 'reuse'
    ? Math.max(normalizeMinFilms(req.query?.min_films, 2), 2)
    : normalizeMinFilms(req.query?.min_films, 2);

  try {
    const spec = normalizeSpec(specFromLegacyType(type, personId, minFilms));
    const cacheKey = createHash('sha256')
      .update(JSON.stringify({ spec, MAX_FILMS, v: CACHE_VERSION }))
      .digest('hex');

    const cached = await readCache(cacheKey);
    if (cached) {
      res.status(200).json({ ...cached, cache: 'hit' });
      return;
    }

    const payload = await runSpec(spec, apiKey);
    await writeCache(cacheKey, payload);
    res.status(200).json({ ...payload, cache: 'miss' });
  } catch (err) {
    res.status(failureStatus(err)).json({ error: err.message });
  }
}
