import { randomUUID } from 'node:crypto';
import { getAuth } from '../lib/neon-auth.js';
import { db, ensureSchema } from '../lib/db.js';
import { upsertUser, listWatches, getMembership, watchFromRow } from '../lib/a-list.js';
import {
  computeSummary,
  theaterStats,
  formatStats,
  rewatchList,
  ratingDistribution,
  actorStats,
  normalizePriceTiers,
} from '../lib/a-list-billing.js';

export default async function handler(req, res) {
  const route = String(req.query?.route || '').trim();
  switch (route) {
    case 'watches':
      return handleWatches(req, res);
    case 'summary':
      return handleSummary(req, res);
    case 'membership':
      return handleMembership(req, res);
    case 'import':
      return handleImport(req, res);
    case 'movie-lookup':
      return handleMovieLookup(req, res);
    case 'movie-details':
      return handleMovieDetails(req, res);
    default:
      res.status(404).json({ error: 'Unknown A-List route.' });
  }
}

function requireDb(res) {
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: 'DATABASE_URL not configured.' });
    return false;
  }
  if (!process.env.NEON_AUTH_BASE_URL) {
    res.status(503).json({ error: 'NEON_AUTH_BASE_URL not configured.' });
    return false;
  }
  return true;
}

async function requireUser(req, res) {
  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return null;
  }
  try {
    const userId = await upsertUser(auth);
    return { auth, userId };
  } catch (err) {
    res.status(502).json({ error: err.message });
    return null;
  }
}

function normalizeBody(body) {
  const rating = body.dnf ? null : (body.rating != null ? Number(body.rating) : null);
  return {
    watched_on: body.watched_on,
    title: String(body.title || '').trim(),
    tmdb_id: body.tmdb_id != null ? Number(body.tmdb_id) : null,
    location: body.location ? String(body.location).trim() : null,
    format: body.format ? String(body.format).trim() : '',
    saw_alone: !!body.saw_alone,
    auditorium: body.auditorium ? String(body.auditorium).trim() : null,
    seat: body.seat ? String(body.seat).trim() : null,
    ticket_cents: body.ticket_cents != null ? Number(body.ticket_cents) : null,
    rating,
    dnf: !!body.dnf,
    notes: body.notes ? String(body.notes).trim() : null,
  };
}

function normalizeTitle(title) {
  return String(title || '').toLowerCase().trim();
}

function movieFromTmdbResult(m) {
  return {
    tmdb_id: m.id,
    title: m.title,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    poster_path: m.poster_path || null,
    overview: m.overview || null,
    runtime_min: m.runtime || null,
    genres: (m.genres || []).map((g) => g.name),
    director: null,
    cast: [],
  };
}

function movieDetailsFromTmdb(m) {
  const crew = m.credits?.crew || [];
  const cast = m.credits?.cast || [];
  const directors = crew.filter((c) => c.job === 'Director').map((c) => c.name);

  return {
    tmdb_id: m.id,
    title: m.title,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    poster_path: m.poster_path || null,
    overview: m.overview || null,
    runtime_min: m.runtime || null,
    genres: (m.genres || []).map((g) => g.name),
    director: directors.length ? directors.join(', ') : null,
    cast: cast.slice(0, 8).map((c) => c.name),
  };
}

function movieDetailsFromCacheRow(row) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  return {
    tmdb_id: row.tmdb_id,
    title: row.title,
    year: row.year,
    poster_path: row.poster_path || null,
    overview: raw.overview || null,
    runtime_min: row.runtime_min ?? raw.runtime_min ?? null,
    genres: row.genres?.length ? row.genres : (raw.genres || []),
    director: raw.director || null,
    cast: raw.cast?.length ? raw.cast : [],
  };
}

function cacheHasFullDetails(row) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  return !!(raw.director || raw.cast?.length);
}

function pickBestMatch(results, title) {
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

async function cacheMovieRecord(movie) {
  const genres = movie.genres?.length ? movie.genres : null;
  await db()`
    INSERT INTO alist_movie_cache (tmdb_id, title, year, poster_path, runtime_min, genres, raw)
    VALUES (
      ${movie.tmdb_id}, ${movie.title}, ${movie.year}, ${movie.poster_path},
      ${movie.runtime_min ?? null}, ${genres}, ${JSON.stringify(movie)}
    )
    ON CONFLICT (tmdb_id) DO UPDATE SET
      title = EXCLUDED.title,
      year = EXCLUDED.year,
      poster_path = EXCLUDED.poster_path,
      runtime_min = EXCLUDED.runtime_min,
      genres = EXCLUDED.genres,
      raw = EXCLUDED.raw,
      fetched_at = now()
  `;
}

async function fetchMovieDetails(apiKey, tmdbId) {
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('append_to_response', 'credits');
  const tmdbRes = await fetch(url);
  if (!tmdbRes.ok) return null;
  const m = await tmdbRes.json();
  return movieDetailsFromTmdb(m);
}

async function getMovieDetails(tmdbId) {
  if (process.env.DATABASE_URL) {
    await ensureSchema();
    const rows = await db()`
      SELECT tmdb_id, title, year, poster_path, runtime_min, genres, raw
      FROM alist_movie_cache
      WHERE tmdb_id = ${tmdbId}
    `;
    if (rows.length && cacheHasFullDetails(rows[0])) {
      return movieDetailsFromCacheRow(rows[0]);
    }
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const movie = await fetchMovieDetails(apiKey, tmdbId);
  if (!movie) return null;

  if (process.env.DATABASE_URL) {
    await cacheMovieRecord(movie);
  }
  return movie;
}

async function fetchMovieById(apiKey, tmdbId) {
  return fetchMovieDetails(apiKey, tmdbId);
}

async function searchMovies(apiKey, query) {
  const url = new URL('https://api.themoviedb.org/3/search/movie');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('include_adult', 'false');
  const tmdbRes = await fetch(url);
  if (!tmdbRes.ok) return [];
  const data = await tmdbRes.json();
  return (data.results || []).slice(0, 8).map(movieFromTmdbResult);
}

async function enrichMissingPosters(userId, watches) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey || !process.env.DATABASE_URL) return watches;

  await ensureSchema();
  let updated = watches.map((w) => ({ ...w }));
  const posterById = new Map();

  const missingIds = [...new Set(
    updated.filter((w) => w.tmdb_id && !w.poster_path).map((w) => w.tmdb_id),
  )];
  for (const tmdbId of missingIds.slice(0, 12)) {
    try {
      const movie = await fetchMovieById(apiKey, tmdbId);
      if (!movie) continue;
      await cacheMovieRecord(movie);
      if (movie.poster_path) posterById.set(tmdbId, movie.poster_path);
    } catch {
      // Skip failed lookups; list still works without posters.
    }
  }

  updated = updated.map((w) => ({
    ...w,
    poster_path: w.poster_path || (w.tmdb_id ? posterById.get(w.tmdb_id) : null) || null,
  }));

  const needsTitleLookup = updated.filter((w) => !w.poster_path && w.title);
  const titleToWatches = new Map();
  for (const w of needsTitleLookup) {
    const key = normalizeTitle(w.title);
    if (!titleToWatches.has(key)) titleToWatches.set(key, []);
    titleToWatches.get(key).push(w);
  }

  const titleMatches = new Map();
  let titleLookups = 0;

  for (const [titleKey, group] of titleToWatches) {
    if (titleLookups >= 10) break;
    const sampleTitle = group[0].title;
    try {
      const results = await searchMovies(apiKey, sampleTitle);
      const match = pickBestMatch(results, sampleTitle);
      if (!match?.poster_path) continue;
      await cacheMovieRecord(match);
      titleMatches.set(titleKey, match);
      titleLookups += 1;

      for (const w of group) {
        if (!w.tmdb_id) {
          await db()`
            UPDATE alist_watches
            SET tmdb_id = ${match.tmdb_id}, updated_at = now()
            WHERE id = ${w.id} AND user_id = ${userId} AND tmdb_id IS NULL
          `;
        }
      }
    } catch {
      // Skip failed title lookups.
    }
  }

  return updated.map((w) => {
    const match = titleMatches.get(normalizeTitle(w.title));
    if (!match) {
      return {
        ...w,
        poster_path: w.poster_path || (w.tmdb_id ? posterById.get(w.tmdb_id) : null) || null,
      };
    }
    return {
      ...w,
      tmdb_id: w.tmdb_id || match.tmdb_id,
      poster_path: w.poster_path || match.poster_path || null,
    };
  });
}

async function handleWatches(req, res) {
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;
  const { userId } = session;

  if (req.method === 'GET') {
    try {
      let rows = await listWatches(userId);
      let watches = rows.map(watchFromRow);
      watches = await enrichMissingPosters(userId, watches);
      res.status(200).json({ watches });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'POST') {
    const data = normalizeBody(req.body || {});
    if (!data.watched_on || !data.title) {
      res.status(400).json({ error: 'watched_on and title are required.' });
      return;
    }
    const id = randomUUID();
    try {
      const rows = await db()`
        INSERT INTO alist_watches (
          id, user_id, watched_on, title, tmdb_id, location, format,
          saw_alone, auditorium, seat, ticket_cents, rating, dnf, notes
        ) VALUES (
          ${id}, ${userId}, ${data.watched_on}, ${data.title}, ${data.tmdb_id},
          ${data.location}, ${data.format}, ${data.saw_alone}, ${data.auditorium},
          ${data.seat}, ${data.ticket_cents}, ${data.rating}, ${data.dnf}, ${data.notes}
        )
        RETURNING id, watched_on::text AS watched_on, title, tmdb_id, location, format,
                  saw_alone, auditorium, seat, ticket_cents, rating::float AS rating,
                  dnf, notes, created_at, updated_at
      `;
      await getMembership(userId);
      res.status(201).json({ watch: watchFromRow(rows[0]) });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const id = req.body?.id;
    if (!id) {
      res.status(400).json({ error: 'id is required.' });
      return;
    }
    const data = normalizeBody(req.body || {});
    if (!data.watched_on || !data.title) {
      res.status(400).json({ error: 'watched_on and title are required.' });
      return;
    }
    try {
      const rows = await db()`
        UPDATE alist_watches SET
          watched_on = ${data.watched_on},
          title = ${data.title},
          tmdb_id = ${data.tmdb_id},
          location = ${data.location},
          format = ${data.format},
          saw_alone = ${data.saw_alone},
          auditorium = ${data.auditorium},
          seat = ${data.seat},
          ticket_cents = ${data.ticket_cents},
          rating = ${data.rating},
          dnf = ${data.dnf},
          notes = ${data.notes},
          updated_at = now()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, watched_on::text AS watched_on, title, tmdb_id, location, format,
                  saw_alone, auditorium, seat, ticket_cents, rating::float AS rating,
                  dnf, notes, created_at, updated_at
      `;
      if (!rows.length) {
        res.status(404).json({ error: 'Watch not found.' });
        return;
      }
      res.status(200).json({ watch: watchFromRow(rows[0]) });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const id = req.body?.id || req.query?.id;
    if (!id) {
      res.status(400).json({ error: 'id is required.' });
      return;
    }
    try {
      const rows = await db()`
        DELETE FROM alist_watches
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id
      `;
      if (!rows.length) {
        res.status(404).json({ error: 'Watch not found.' });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed.' });
}

async function getCastMapForTmdbIds(tmdbIds) {
  const castMap = new Map();
  const uniqueIds = [...new Set(tmdbIds.filter(Boolean).map(Number))];
  if (!uniqueIds.length) return castMap;

  if (process.env.DATABASE_URL) {
    await ensureSchema();
    const rows = await db()`
      SELECT tmdb_id, raw
      FROM alist_movie_cache
      WHERE tmdb_id = ANY(${uniqueIds})
    `;
    for (const row of rows) {
      const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
      if (raw.cast?.length) castMap.set(Number(row.tmdb_id), raw.cast);
    }
  }

  const missing = uniqueIds.filter((id) => !castMap.has(id));
  for (const id of missing.slice(0, 20)) {
    try {
      const movie = await getMovieDetails(id);
      if (movie?.cast?.length) castMap.set(id, movie.cast);
    } catch {
      // Skip failed cast lookups; insight still works for cached titles.
    }
  }

  return castMap;
}

async function handleSummary(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  if (!requireDb(res)) return;

  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }

  try {
    const userId = await upsertUser(auth);
    const [watches, membership] = await Promise.all([
      listWatches(userId),
      getMembership(userId),
    ]);
    const normalized = watches.map((w) => ({
      watched_on: w.watched_on,
      title: w.title,
      tmdb_id: w.tmdb_id,
      location: w.location,
      format: w.format || '',
      saw_alone: !!w.saw_alone,
      ticket_cents: w.ticket_cents,
      runtime_min: w.runtime_min != null ? Number(w.runtime_min) : null,
      rating: w.rating != null ? Number(w.rating) : null,
      dnf: !!w.dnf,
    }));

    const summary = computeSummary(normalized, membership);
    const tmdbIds = normalized.map((w) => w.tmdb_id).filter(Boolean);
    const castByTmdbId = await getCastMapForTmdbIds(tmdbIds);
    res.status(200).json({
      summary,
      theaters: theaterStats(normalized),
      formats: formatStats(normalized),
      rewatches: rewatchList(normalized),
      ratings: ratingDistribution(normalized),
      actors: actorStats(normalized, castByTmdbId),
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

async function handleMembership(req, res) {
  if (!requireDb(res)) return;

  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }

  try {
    const userId = await upsertUser(auth);

    if (req.method === 'GET') {
      const membership = await getMembership(userId);
      res.status(200).json({ membership });
      return;
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const promo = body.promo_cents != null ? Number(body.promo_cents) : undefined;
      const display = body.display_name != null ? String(body.display_name).trim() : undefined;
      const existing = await getMembership(userId);

      let priceTiers = existing.price_tiers;
      if (body.price_tiers != null) {
        const normalized = normalizePriceTiers(body.price_tiers);
        if (!normalized?.length) {
          res.status(400).json({ error: 'At least one price tier is required.' });
          return;
        }
        priceTiers = normalized;
      }

      const latest = priceTiers?.length ? priceTiers[priceTiers.length - 1] : null;
      const rows = await db()`
        UPDATE alist_membership SET
          promo_cents = ${promo ?? existing.promo_cents},
          price_tiers = ${JSON.stringify(priceTiers)},
          standard_cents = ${priceTiers?.[0]?.cents ?? existing.standard_cents},
          current_cents = ${latest?.cents ?? existing.current_cents},
          price_bump_on = ${latest?.effective_on ?? existing.price_bump_on},
          display_name = ${display ?? existing.display_name},
          updated_at = now()
        WHERE user_id = ${userId}
        RETURNING user_id, promo_cents, standard_cents, current_cents,
                  price_bump_on::text AS price_bump_on, price_tiers, display_name, updated_at
      `;
      res.status(200).json({ membership: rows[0] });
      return;
    }

    res.status(405).json({ error: 'Use GET or PUT.' });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

function watchKey(w) {
  return `${w.watched_on}|${(w.title || '').toLowerCase()}|${(w.location || '').toLowerCase()}`;
}

async function handleImport(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }
  if (!requireDb(res)) return;

  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }

  const watches = Array.isArray(req.body?.watches) ? req.body.watches : null;
  if (!watches?.length) {
    res.status(400).json({ error: 'watches array is required.' });
    return;
  }

  try {
    const userId = await upsertUser(auth);
    await getMembership(userId);

    const existing = await db()`
      SELECT watched_on::text AS watched_on, title, location
      FROM alist_watches WHERE user_id = ${userId}
    `;
    const seen = new Set(existing.map(watchKey));

    let inserted = 0;
    let skipped = 0;

    for (const raw of watches) {
      const data = {
        watched_on: String(raw.watched_on || raw.date || '').slice(0, 10),
        title: String(raw.title || raw.movie || '').trim(),
        location: raw.location ? String(raw.location).trim() : null,
        format: raw.format ? String(raw.format).trim() : '',
        saw_alone: raw.saw_alone === true || raw.saw_alone === 'X' || raw.saw_alone === 'x',
        auditorium: raw.auditorium ? String(raw.auditorium).trim() : null,
        seat: raw.seat ? String(raw.seat).trim() : null,
        ticket_cents: raw.ticket_cents != null
          ? Number(raw.ticket_cents)
          : parseMoney(raw.charge ?? raw.ticket),
        rating: raw.dnf ? null : parseRating(raw.rating ?? raw.personal_rating),
        dnf: raw.dnf === true || String(raw.rating || raw.personal_rating || '').toUpperCase() === 'DNF',
        notes: raw.notes ? String(raw.notes).trim() : null,
        tmdb_id: raw.tmdb_id != null ? Number(raw.tmdb_id) : null,
      };

      if (!data.watched_on || !data.title) {
        skipped += 1;
        continue;
      }

      const key = watchKey(data);
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);

      await db()`
        INSERT INTO alist_watches (
          id, user_id, watched_on, title, tmdb_id, location, format,
          saw_alone, auditorium, seat, ticket_cents, rating, dnf, notes
        ) VALUES (
          ${randomUUID()}, ${userId}, ${data.watched_on}, ${data.title},
          ${data.tmdb_id}, ${data.location}, ${data.format}, ${data.saw_alone},
          ${data.auditorium}, ${data.seat}, ${data.ticket_cents}, ${data.rating},
          ${data.dnf}, ${data.notes}
        )
      `;
      inserted += 1;
    }

    res.status(200).json({ inserted, skipped, total: watches.length });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

async function handleMovieDetails(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }

  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }

  const tmdbId = Number(req.query?.tmdb_id);
  if (!tmdbId) {
    res.status(400).json({ error: 'tmdb_id is required.' });
    return;
  }

  if (!process.env.TMDB_API_KEY) {
    res.status(503).json({ error: 'TMDB_API_KEY not configured.' });
    return;
  }

  try {
    const movie = await getMovieDetails(tmdbId);
    if (!movie) {
      res.status(404).json({ error: 'Movie not found on TMDB.' });
      return;
    }
    res.status(200).json({ movie });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

async function handleMovieLookup(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }

  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }

  const q = String(req.query?.q || '').trim();
  if (q.length < 2) {
    res.status(400).json({ error: 'Query q must be at least 2 characters.' });
    return;
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'TMDB_API_KEY not configured.' });
    return;
  }

  try {
    const results = await searchMovies(apiKey, q);

    if (process.env.DATABASE_URL) {
      await ensureSchema();
      for (const m of results) {
        await cacheMovieRecord(m);
      }
    }

    res.status(200).json({ results });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

function parseMoney(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isNaN(n) ? null : Math.round(n * 100);
}

function parseRating(value) {
  if (value == null || value === '') return null;
  const s = String(value).toUpperCase();
  if (s === 'DNF') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
