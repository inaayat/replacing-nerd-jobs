/**
 * Shared TMDB client + movie cache used by A-Lister and Plot Points.
 *
 * - Auth: process.env.TMDB_API_KEY (never exposed to the browser)
 * - Movie cache: alist_movie_cache (Neon), when DATABASE_URL is set
 * - raw.cast          → string[] of top names (A-Lister UI / actor insights)
 * - raw.cast_members  → [{id,name,profile_path,order}] for Plot Points & richer uses
 */
import { db, ensureSchema } from './db.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const DEFAULT_CAST_NAMES = 8;
const DEFAULT_CAST_MEMBERS = 15;

export function getTmdbApiKey() {
  return process.env.TMDB_API_KEY || null;
}

export async function tmdbFetch(path, params = {}, { apiKey, allowNotFound = false } = {}) {
  const key = apiKey || getTmdbApiKey();
  if (!key) {
    const err = new Error('TMDB_API_KEY not configured.');
    err.status = 503;
    throw err;
  }

  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', key);
  for (const [param, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(param, String(value));
  }

  const response = await fetch(url);
  if (response.status === 404 && allowNotFound) return null;
  if (!response.ok) {
    const err = new Error(`TMDB ${path} failed (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

function normalizeReleaseDate(value) {
  const text = value == null ? '' : String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function mapCastMembers(cast = [], limit = DEFAULT_CAST_MEMBERS) {
  return cast
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, limit)
    .filter((c) => c?.id && c?.name)
    .map((c) => ({
      id: c.id,
      name: c.name,
      profile_path: c.profile_path || null,
      order: c.order ?? null,
    }));
}

export function movieFromTmdbResult(m) {
  const releaseDate = normalizeReleaseDate(m.release_date);
  return {
    tmdb_id: m.id,
    title: m.title,
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    release_date: releaseDate,
    poster_path: m.poster_path || null,
    overview: m.overview || null,
    runtime_min: m.runtime || null,
    vote_average: Number(m.vote_average) || 0,
    genres: (m.genres || []).map((g) => g.name),
    director: null,
    cast: [],
    cast_members: [],
  };
}

export function movieDetailsFromTmdb(m, {
  castNameLimit = DEFAULT_CAST_NAMES,
  castMemberLimit = DEFAULT_CAST_MEMBERS,
} = {}) {
  const crew = m.credits?.crew || [];
  const cast = m.credits?.cast || [];
  const directors = crew.filter((c) => c.job === 'Director').map((c) => c.name);
  const releaseDate = normalizeReleaseDate(m.release_date);
  const castMembers = mapCastMembers(cast, castMemberLimit);

  return {
    tmdb_id: m.id,
    title: m.title,
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    release_date: releaseDate,
    poster_path: m.poster_path || null,
    overview: m.overview || null,
    runtime_min: m.runtime || null,
    vote_average: Number(m.vote_average) || 0,
    genres: (m.genres || []).map((g) => g.name),
    director: directors.length ? directors.join(', ') : null,
    cast: castMembers.slice(0, castNameLimit).map((c) => c.name),
    cast_members: castMembers,
  };
}

export function movieDetailsFromCacheRow(row) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  const releaseDate = row.release_date
    || normalizeReleaseDate(raw.release_date);
  const castMembers = Array.isArray(raw.cast_members)
    ? raw.cast_members
    : [];
  const castNames = raw.cast?.length
    ? raw.cast
    : castMembers.slice(0, DEFAULT_CAST_NAMES).map((c) => c.name);

  return {
    tmdb_id: row.tmdb_id,
    title: row.title,
    year: row.year,
    release_date: releaseDate,
    poster_path: row.poster_path || null,
    overview: raw.overview || null,
    runtime_min: row.runtime_min ?? raw.runtime_min ?? null,
    vote_average: Number(raw.vote_average) || 0,
    genres: row.genres?.length ? row.genres : (raw.genres || []),
    director: raw.director || null,
    cast: castNames,
    cast_members: castMembers,
  };
}

export function cacheHasFullDetails(row) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  return !!(raw.director || raw.cast?.length || raw.cast_members?.length);
}

export function cacheHasCastMembers(row) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  return Array.isArray(raw.cast_members) && raw.cast_members.length > 0;
}

export async function cacheMovieRecord(movie) {
  if (!process.env.DATABASE_URL) return;
  await ensureSchema();
  const genres = movie.genres?.length ? movie.genres : null;
  const releaseDate = normalizeReleaseDate(movie.release_date);
  await db()`
    INSERT INTO alist_movie_cache (tmdb_id, title, year, poster_path, runtime_min, genres, raw, release_date)
    VALUES (
      ${movie.tmdb_id}, ${movie.title}, ${movie.year}, ${movie.poster_path},
      ${movie.runtime_min ?? null}, ${genres}, ${JSON.stringify(movie)}, ${releaseDate}
    )
    ON CONFLICT (tmdb_id) DO UPDATE SET
      title = EXCLUDED.title,
      year = EXCLUDED.year,
      poster_path = EXCLUDED.poster_path,
      runtime_min = EXCLUDED.runtime_min,
      genres = EXCLUDED.genres,
      raw = EXCLUDED.raw,
      release_date = COALESCE(EXCLUDED.release_date, alist_movie_cache.release_date),
      fetched_at = now()
  `;
}

export async function fetchMovieDetails(tmdbId, { apiKey, castMemberLimit = DEFAULT_CAST_MEMBERS } = {}) {
  const m = await tmdbFetch(`/movie/${tmdbId}`, { append_to_response: 'credits' }, {
    apiKey,
    allowNotFound: true,
  });
  if (!m) return null;
  return movieDetailsFromTmdb(m, { castMemberLimit });
}

export async function getMovieDetails(tmdbId, { apiKey, castMemberLimit = DEFAULT_CAST_MEMBERS } = {}) {
  if (process.env.DATABASE_URL) {
    await ensureSchema();
    const rows = await db()`
      SELECT tmdb_id, title, year, poster_path, runtime_min, genres, raw, release_date
      FROM alist_movie_cache
      WHERE tmdb_id = ${tmdbId}
    `;
    if (rows.length && cacheHasFullDetails(rows[0])) {
      // A-Lister can use name-only cast rows; Plot Points uses getMovieCastMembers
      // which upgrades older cache rows that lack cast_members.
      return movieDetailsFromCacheRow(rows[0]);
    }
  }

  const movie = await fetchMovieDetails(tmdbId, { apiKey, castMemberLimit });
  if (!movie) return null;
  await cacheMovieRecord(movie);
  return movie;
}

/**
 * Cast members with TMDB ids — prefers alist_movie_cache.raw.cast_members,
 * otherwise fetches credits and upgrades the shared cache.
 */
export async function getMovieCastMembers(tmdbId, {
  apiKey,
  limit = DEFAULT_CAST_MEMBERS,
} = {}) {
  if (process.env.DATABASE_URL) {
    await ensureSchema();
    const rows = await db()`
      SELECT tmdb_id, title, year, poster_path, runtime_min, genres, raw, release_date
      FROM alist_movie_cache
      WHERE tmdb_id = ${tmdbId}
    `;
    if (rows.length && cacheHasCastMembers(rows[0])) {
      return mapCastMembers(movieDetailsFromCacheRow(rows[0]).cast_members, limit);
    }
  }

  const movie = await fetchMovieDetails(tmdbId, { apiKey, castMemberLimit: limit });
  if (!movie) return [];
  await cacheMovieRecord(movie);
  return mapCastMembers(movie.cast_members, limit);
}

export async function searchMovies(query, { apiKey, limit = 8 } = {}) {
  const data = await tmdbFetch('/search/movie', {
    query,
    include_adult: 'false',
  }, { apiKey });
  return (data.results || []).slice(0, limit).map(movieFromTmdbResult);
}

export async function searchPeople(query, { apiKey, limit = 12 } = {}) {
  const data = await tmdbFetch('/search/person', {
    query,
    include_adult: 'false',
  }, { apiKey });

  return (data.results || [])
    .slice(0, limit)
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
}

export async function getPerson(personId, { apiKey } = {}) {
  const person = await tmdbFetch(`/person/${personId}`, {}, { apiKey, allowNotFound: true });
  if (!person) return null;
  return {
    tmdb_id: person.id,
    name: person.name,
    profile_path: person.profile_path || null,
    known_for_department: person.known_for_department || null,
  };
}

export async function getPersonMovieCredits(personId, { apiKey } = {}) {
  return tmdbFetch(`/person/${personId}/movie_credits`, {}, { apiKey, allowNotFound: true });
}

export function normalizeTitle(title) {
  return String(title || '').toLowerCase().trim();
}

export function pickBestMatch(results, title) {
  if (!results?.length) return null;
  const norm = normalizeTitle(title);
  const exact = results.find((r) => normalizeTitle(r.title) === norm);
  if (exact) return exact;
  const partial = results.find((r) => {
    const rt = normalizeTitle(r.title);
    return rt.includes(norm) || norm.includes(rt);
  });
  if (partial) return partial;
  return results.length === 1 ? results[0] : null;
}
