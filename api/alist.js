import { randomUUID } from 'node:crypto';
import { getAuth } from '../lib/neon-auth.js';
import { db, ensureSchema } from '../lib/db.js';
import {
  upsertUser,
  listWatches,
  listWatchlist,
  listTvWatches,
  listTvWatchlist,
  getMembership,
  watchFromRow,
  watchlistFromRow,
  tvWatchFromRow,
  tvWatchlistFromRow,
  theaterWatches,
  getLeaderboard,
  compareUsers,
  getUserPublicProfile,
  getOwnProfile,
  normalizeUsername,
  publicDisplayName,
} from '../lib/a-list.js';
import {
  computeSummary,
  theaterStats,
  formatStats,
  rewatchList,
  ratingDistribution,
  actorStats,
  normalizePriceTiers,
} from '../lib/a-list-billing.js';
import {
  getTmdbApiKey,
  getMovieDetails,
  searchMovies,
  normalizeTitle,
  pickBestMatch,
  PP_SCHEMA,
} from '../lib/tmdb.js';

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
    case 'backfill-posters':
      return handleBackfill(req, res);
    case 'movie-lookup':
      return handleMovieLookup(req, res);
    case 'movie-details':
      return handleMovieDetails(req, res);
    case 'leaderboard':
      return handleLeaderboard(req, res);
    case 'leaderboard-compare':
      return handleLeaderboardCompare(req, res);
    case 'user-profile':
      return handleUserProfile(req, res);
    case 'watchlist':
      return handleWatchlist(req, res);
    case 'tv-watches':
      return handleTvWatches(req, res);
    case 'tv-watchlist':
      return handleTvWatchlist(req, res);
    case 'tv-lookup':
      return handleTvLookup(req, res);
    case 'tv-details':
      return handleTvDetails(req, res);
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

function requireDbRead(res) {
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: 'DATABASE_URL not configured.' });
    return false;
  }
  return true;
}

async function optionalAuthUserId(req) {
  try {
    const auth = await getAuth(req);
    return auth?.sub || null;
  } catch {
    return null;
  }
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

function normalizeRatingUpdate(entry) {
  if (!entry?.id) return null;
  const dnf = !!entry.dnf;
  const rating = dnf ? null : (entry.rating != null && entry.rating !== '' ? Number(entry.rating) : null);
  return { id: String(entry.id), rating, dnf };
}

async function applyBulkRatingUpdates(userId, rawUpdates) {
  const updates = (Array.isArray(rawUpdates) ? rawUpdates : [])
    .map(normalizeRatingUpdate)
    .filter(Boolean);
  if (!updates.length) return [];

  const updated = [];
  for (const u of updates) {
    const rows = await db()`
      UPDATE alist_watches SET
        rating = ${u.rating},
        dnf = ${u.dnf},
        updated_at = now()
      WHERE id = ${u.id} AND user_id = ${userId}
      RETURNING id, watched_on::text AS watched_on, title, tmdb_id, location, format,
                saw_alone, auditorium, seat, ticket_cents, rating::float AS rating,
                dnf, notes, in_theaters, created_at, updated_at
    `;
    if (rows.length) updated.push(watchFromRow(rows[0]));
  }
  return updated;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates before the value reaches Postgres. Without this a malformed date or
 * an out-of-range rating (the column is NUMERIC(2,1), so 500 overflows) came
 * back as a 502 with raw driver text in the UI.
 *
 * @returns {{ data: object } | { error: string }}
 */
function normalizeBody(body) {
  const watched_on = String(body.watched_on || '').slice(0, 10);
  if (!ISO_DATE.test(watched_on) || Number.isNaN(Date.parse(watched_on))) {
    return { error: 'watched_on must be a date in YYYY-MM-DD format.' };
  }

  const title = String(body.title || '').trim();
  if (!title) return { error: 'title is required.' };
  if (title.length > 300) return { error: 'title is too long.' };

  const dnf = !!body.dnf;
  let rating = null;
  if (!dnf && body.rating != null && body.rating !== '') {
    rating = Number(body.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return { error: 'rating must be between 1 and 5.' };
    }
  }

  const inTheaters = body.in_theaters !== false;
  let ticket_cents = null;
  if (inTheaters && body.ticket_cents != null && body.ticket_cents !== '') {
    ticket_cents = Number(body.ticket_cents);
    if (!Number.isInteger(ticket_cents) || ticket_cents < 0 || ticket_cents > 10_000_00) {
      return { error: 'ticket price must be a positive amount under $10,000.' };
    }
  }

  let tmdb_id = null;
  if (body.tmdb_id != null && body.tmdb_id !== '') {
    tmdb_id = Number(body.tmdb_id);
    if (!Number.isInteger(tmdb_id) || tmdb_id <= 0) {
      return { error: 'tmdb_id must be a positive integer.' };
    }
  }

  return {
    data: {
      watched_on,
      title,
      tmdb_id,
      location: body.location ? String(body.location).trim().slice(0, 200) : null,
      format: body.format ? String(body.format).trim().slice(0, 40) : '',
      saw_alone: !!body.saw_alone,
      auditorium: body.auditorium ? String(body.auditorium).trim().slice(0, 40) : null,
      seat: body.seat ? String(body.seat).trim().slice(0, 40) : null,
      ticket_cents,
      rating,
      dnf,
      notes: body.notes ? String(body.notes).trim().slice(0, 2000) : null,
      in_theaters: inTheaters,
    },
  };
}

/**
 * Fill in posters from the local cache only — one query, no network.
 *
 * This used to make up to 12 TMDB detail calls plus 10 search calls, all
 * awaited in sequence, on *every* list request. That put ~22 serial round trips
 * in the hot path of the app's most-used endpoint. The network work now lives
 * in backfillPosters(), triggered explicitly from Settings.
 */
async function enrichMissingPosters(userId, watches) {
  if (!process.env.DATABASE_URL) return watches;

  const missingIds = [...new Set(
    watches.filter((w) => w.tmdb_id && !w.poster_path).map((w) => Number(w.tmdb_id)),
  )];
  if (!missingIds.length) return watches;

  await ensureSchema();
  const rows = await db()`
    SELECT tmdb_id, poster_path
    FROM alist_movie_cache
    WHERE tmdb_id = ANY(${missingIds}) AND poster_path IS NOT NULL
  `;
  if (!rows.length) return watches;

  const posterById = new Map(rows.map((r) => [Number(r.tmdb_id), r.poster_path]));
  return watches.map((w) => ({
    ...w,
    poster_path: w.poster_path || posterById.get(Number(w.tmdb_id)) || null,
  }));
}

/**
 * Bounded, explicit backfill: link untagged titles to TMDB and cache their
 * artwork. Reports what it did so the caller can run it again for the rest.
 */
async function backfillPosters(userId, limit = 20) {
  const apiKey = getTmdbApiKey();
  if (!apiKey) return { linked: 0, cached: 0, remaining: 0 };

  await ensureSchema();
  const rows = await listWatches(userId);
  const watches = rows.map(watchFromRow);

  const uncachedIds = [...new Set(
    watches.filter((w) => w.tmdb_id && !w.poster_path).map((w) => Number(w.tmdb_id)),
  )];
  const untitled = [];
  const seenTitles = new Set();
  for (const w of watches) {
    if (w.tmdb_id) continue;
    const key = normalizeTitle(w.title);
    if (!key || seenTitles.has(key)) continue;
    seenTitles.add(key);
    untitled.push(w);
  }

  let cached = 0;
  let linked = 0;
  let budget = limit;

  for (const tmdbId of uncachedIds) {
    if (budget <= 0) break;
    budget -= 1;
    try {
      const movie = await getMovieDetails(tmdbId, { apiKey });
      if (movie?.poster_path) cached += 1;
    } catch {
      // A failed lookup just means no poster; the row still works.
    }
  }

  for (const w of untitled) {
    if (budget <= 0) break;
    budget -= 1;
    try {
      const results = await searchMovies(w.title, { apiKey });
      const match = pickBestMatch(results, w.title);
      if (!match) continue;
      await getMovieDetails(match.tmdb_id, { apiKey });
      const updated = await db()`
        UPDATE alist_watches
        SET tmdb_id = ${match.tmdb_id}, updated_at = now()
        WHERE user_id = ${userId} AND tmdb_id IS NULL AND lower(title) = ${w.title.toLowerCase()}
        RETURNING id
      `;
      linked += updated.length;
    } catch {
      // Skip failed title lookups.
    }
  }

  const remaining = Math.max(0, uncachedIds.length + untitled.length - limit);
  return { linked, cached, remaining };
}

async function handleBackfill(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;

  if (!getTmdbApiKey()) {
    res.status(503).json({ error: 'TMDB_API_KEY not configured.' });
    return;
  }

  try {
    res.status(200).json(await backfillPosters(session.userId));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
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
    const parsed = normalizeBody(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { data } = parsed;
    const id = randomUUID();
    try {
      const rows = await db()`
        INSERT INTO alist_watches (
          id, user_id, watched_on, title, tmdb_id, location, format,
          saw_alone, auditorium, seat, ticket_cents, rating, dnf, notes, in_theaters
        ) VALUES (
          ${id}, ${userId}, ${data.watched_on}, ${data.title}, ${data.tmdb_id},
          ${data.location}, ${data.format}, ${data.saw_alone}, ${data.auditorium},
          ${data.seat}, ${data.ticket_cents}, ${data.rating}, ${data.dnf}, ${data.notes},
          ${data.in_theaters}
        )
        RETURNING id, watched_on::text AS watched_on, title, tmdb_id, location, format,
                  saw_alone, auditorium, seat, ticket_cents, rating::float AS rating,
                  dnf, notes, in_theaters, created_at, updated_at
      `;
      await getMembership(userId);
      res.status(201).json({ watch: watchFromRow(rows[0]) });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PATCH') {
    if (Array.isArray(req.body?.rating_updates)) {
      if (!req.body.rating_updates.length) {
        res.status(400).json({ error: 'rating_updates must include at least one item.' });
        return;
      }
      try {
        const updated = await applyBulkRatingUpdates(userId, req.body.rating_updates);
        const watches = await enrichMissingPosters(userId, updated);
        res.status(200).json({ watches, updated: watches.length });
      } catch (err) {
        res.status(502).json({ error: err.message });
      }
      return;
    }

    const id = req.body?.id;
    if (!id) {
      res.status(400).json({ error: 'id is required.' });
      return;
    }
    const parsed = normalizeBody(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { data } = parsed;
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
          in_theaters = ${data.in_theaters},
          updated_at = now()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, watched_on::text AS watched_on, title, tmdb_id, location, format,
                  saw_alone, auditorium, seat, ticket_cents, rating::float AS rating,
                  dnf, notes, in_theaters, created_at, updated_at
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

async function enrichWatchlistRows(rows) {
  const apiKey = getTmdbApiKey();
  if (!apiKey || !process.env.DATABASE_URL || !rows?.length) return rows;

  await ensureSchema();
  let lookups = 0;
  const updated = [];

  for (const row of rows) {
    const ppv = Number(row.cache_pp_v) || 0;
    const needsEnrich = row.tmdb_id && (
      !(row.release_date || row.release_date_raw) || ppv < PP_SCHEMA
    );
    if (!needsEnrich || lookups >= 12) {
      updated.push(row);
      continue;
    }
    try {
      const movie = await getMovieDetails(row.tmdb_id);
      lookups += 1;
      if (movie?.release_date) {
        updated.push({
          ...row,
          release_date: movie.release_date,
          release_date_raw: movie.release_date,
          poster_path: row.poster_path || movie.poster_path || null,
          year: row.year ?? movie.year ?? null,
        });
      } else {
        updated.push(row);
      }
    } catch {
      updated.push(row);
    }
  }

  return updated;
}

async function handleWatchlist(req, res) {
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;
  const { userId } = session;

  if (req.method === 'GET') {
    try {
      const rows = await enrichWatchlistRows(await listWatchlist(userId));
      res.status(200).json({ items: rows.map(watchlistFromRow) });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'POST') {
    const title = String(req.body?.title || '').trim();
    if (!title) {
      res.status(400).json({ error: 'title is required.' });
      return;
    }
    const tmdbId = req.body?.tmdb_id != null ? Number(req.body.tmdb_id) : null;
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;
    const id = randomUUID();

    try {
      // Adding the same film twice produced two identical rows.
      const dupe = tmdbId
        ? await db()`
            SELECT id FROM alist_watchlist
            WHERE user_id = ${userId} AND tmdb_id = ${tmdbId}
          `
        : await db()`
            SELECT id FROM alist_watchlist
            WHERE user_id = ${userId} AND lower(title) = ${title.toLowerCase()}
          `;
      if (dupe.length) {
        res.status(409).json({ error: `${title} is already on your list.` });
        return;
      }

      if (tmdbId && getTmdbApiKey()) {
        await getMovieDetails(tmdbId);
      }
      await db()`
        INSERT INTO alist_watchlist (id, user_id, title, tmdb_id, notes)
        VALUES (${id}, ${userId}, ${title}, ${tmdbId}, ${notes})
      `;
      const rows = await enrichWatchlistRows(await db()`
        SELECT
          w.id, w.title, w.tmdb_id, w.notes, w.created_at, w.updated_at,
          c.poster_path, c.year, c.release_date,
          COALESCE(c.release_date::text, c.raw->>'release_date') AS release_date_raw,
          (c.raw->>'pp_v')::int AS cache_pp_v
        FROM alist_watchlist w
        LEFT JOIN alist_movie_cache c ON c.tmdb_id = w.tmdb_id
        WHERE w.id = ${id} AND w.user_id = ${userId}
      `);
      res.status(201).json({ item: watchlistFromRow(rows[0]) });
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
    const title = req.body?.title != null ? String(req.body.title).trim() : undefined;
    const tmdbId = req.body?.tmdb_id != null ? Number(req.body.tmdb_id) : undefined;
    const notes = req.body?.notes != null ? String(req.body.notes).trim() || null : undefined;

    try {
      const existing = await db()`
        SELECT id, title, tmdb_id, notes
        FROM alist_watchlist
        WHERE id = ${id} AND user_id = ${userId}
      `;
      if (!existing.length) {
        res.status(404).json({ error: 'Watchlist item not found.' });
        return;
      }
      const row = existing[0];
      const rows = await db()`
        UPDATE alist_watchlist SET
          title = ${title ?? row.title},
          tmdb_id = ${tmdbId !== undefined ? tmdbId : row.tmdb_id},
          notes = ${notes !== undefined ? notes : row.notes},
          updated_at = now()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, title, tmdb_id, notes, created_at, updated_at
      `;
      res.status(200).json({ item: watchlistFromRow(rows[0]) });
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
        DELETE FROM alist_watchlist
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id
      `;
      if (!rows.length) {
        res.status(404).json({ error: 'Watchlist item not found.' });
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

async function handleUserProfile(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  if (!requireDbRead(res)) return;

  const currentUserId = await optionalAuthUserId(req);
  if (!currentUserId) {
    res.status(401).json({ error: 'Sign in to view member profiles.' });
    return;
  }

  const userId = String(req.query?.user || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'user id is required.' });
    return;
  }

  try {
    // Your own profile is readable regardless of opt-in state; everyone
    // else's requires public_profile, and a private one 404s like a
    // nonexistent id so opt-out status can't be probed.
    const profile = userId === currentUserId
      ? await getOwnProfile(currentUserId)
      : await getUserPublicProfile(userId);
    if (!profile) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.status(200).json({ profile, currentUserId });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

async function handleLeaderboardCompare(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  if (!requireDbRead(res)) return;

  const withUserId = String(req.query?.with || '').trim();
  if (!withUserId) {
    res.status(400).json({ error: 'with user id is required.' });
    return;
  }

  // "You" is always the session, never a query param — otherwise anyone could
  // diff any two members' logs.
  const youId = await optionalAuthUserId(req);
  if (!youId) {
    res.status(401).json({ error: 'Sign in to compare logs.' });
    return;
  }

  try {
    const comparison = await compareUsers(youId, withUserId);
    res.status(200).json({ ...comparison, currentUserId: youId });
  } catch (err) {
    const status = err.message === 'User not found.' ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
}

async function handleLeaderboard(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  if (!requireDbRead(res)) return;

  try {
    const entries = await getLeaderboard();
    const currentUserId = await optionalAuthUserId(req);
    res.status(200).json({ entries, currentUserId });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
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
    const normalized = theaterWatches(watches).map((w) => ({
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
      // What the member would be shown as with no username set. Resolved here
      // because only the server sees users.name.
      res.status(200).json({
        membership: {
          ...membership,
          public_name_without_username: publicDisplayName({}, { name: auth.name }),
        },
      });
      return;
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const display = body.display_name != null ? String(body.display_name).trim() : undefined;
      const existing = await getMembership(userId);

      let username = existing.username;
      if (body.username !== undefined) {
        const result = normalizeUsername(body.username);
        if (result.error) {
          res.status(400).json({ error: result.error });
          return;
        }
        username = result.username;
      }

      const publicProfile = body.public_profile !== undefined
        ? body.public_profile === true
        : existing.public_profile === true;
      const hideTheaters = body.public_hide_theaters !== undefined
        ? body.public_hide_theaters === true
        : existing.public_hide_theaters === true;

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
      const rateSetupComplete = body.rate_setup_complete === false
        ? false
        : (body.price_tiers != null || existing.rate_setup_complete !== false);
      let rows;
      try {
        rows = await db()`
          UPDATE alist_membership SET
            price_tiers = ${JSON.stringify(priceTiers)},
            standard_cents = ${priceTiers?.[0]?.cents ?? existing.standard_cents},
            current_cents = ${latest?.cents ?? existing.current_cents},
            price_bump_on = ${latest?.effective_on ?? existing.price_bump_on},
            display_name = ${display ?? existing.display_name},
            username = ${username},
            public_profile = ${publicProfile},
            public_hide_theaters = ${hideTheaters},
            rate_setup_complete = ${rateSetupComplete},
            promo_folded = true,
            updated_at = now()
          WHERE user_id = ${userId}
          RETURNING user_id, promo_cents, standard_cents, current_cents,
                    price_bump_on::text AS price_bump_on, price_tiers, display_name,
                    username, public_profile, public_hide_theaters,
                    rate_setup_complete, promo_folded, updated_at
        `;
      } catch (err) {
        if (err.message?.includes('alist_membership_username_lower')) {
          res.status(409).json({ error: 'That username is taken.' });
          return;
        }
        throw err;
      }
      res.status(200).json({ membership: rows[0] });
      return;
    }

    res.status(405).json({ error: 'Use GET or PUT.' });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

const MAX_IMPORT_ROWS = 2000;
const IMPORT_BATCH_SIZE = 100;

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
  if (watches.length > MAX_IMPORT_ROWS) {
    res.status(413).json({
      error: `That's ${watches.length} rows — import at most ${MAX_IMPORT_ROWS} at a time.`,
    });
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

    let skipped = 0;
    const pending = [];

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
      pending.push(data);
    }

    // Batched rather than one awaited INSERT per row: a 100-row sheet was 100
    // sequential round trips inside a single function invocation.
    let inserted = 0;
    for (let i = 0; i < pending.length; i += IMPORT_BATCH_SIZE) {
      const batch = pending.slice(i, i + IMPORT_BATCH_SIZE);
      await db()`
        INSERT INTO alist_watches (
          id, user_id, watched_on, title, tmdb_id, location, format,
          saw_alone, auditorium, seat, ticket_cents, rating, dnf, notes
        )
        SELECT
          gen_random_uuid()::text, ${userId}, r.watched_on::date, r.title,
          r.tmdb_id::int, r.location, r.format, r.saw_alone::boolean,
          r.auditorium, r.seat, r.ticket_cents::int, r.rating::numeric(2,1),
          r.dnf::boolean, r.notes
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS r(
          watched_on text, title text, tmdb_id int, location text, format text,
          saw_alone boolean, auditorium text, seat text, ticket_cents int,
          rating numeric, dnf boolean, notes text
        )
      `;
      inserted += batch.length;
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

  if (!getTmdbApiKey()) {
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

  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    res.status(503).json({ error: 'TMDB_API_KEY not configured.' });
    return;
  }

  try {
    const results = await searchMovies(q, { apiKey });
    res.status(200).json({ results });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

// --- TV routes (watched + want-to-watch) ---
// TV data lives in alist_tv_* tables and is never mixed into summary,
// leaderboard, insights, or billing — those only read alist_watches.

function tvFromTmdbResult(s) {
  const firstAirDate = s.first_air_date && /^\d{4}-\d{2}-\d{2}$/.test(s.first_air_date)
    ? s.first_air_date
    : null;
  return {
    tmdb_id: s.id,
    title: s.name,
    year: firstAirDate ? Number(firstAirDate.slice(0, 4)) : null,
    first_air_date: firstAirDate,
    poster_path: s.poster_path || null,
    overview: s.overview || null,
    genres: (s.genres || []).map((g) => g.name),
    status: s.status || null,
    creator: null,
    cast: [],
  };
}

function tvDetailsFromTmdb(s) {
  const crew = s.credits?.crew || [];
  const cast = s.credits?.cast || [];
  const creators = crew.filter((c) => c.job === 'Creator' || c.department === 'Creator').map((c) => c.name);
  const firstAirDate = s.first_air_date && /^\d{4}-\d{2}-\d{2}$/.test(s.first_air_date)
    ? s.first_air_date
    : null;

  return {
    tmdb_id: s.id,
    title: s.name,
    year: firstAirDate ? Number(firstAirDate.slice(0, 4)) : null,
    first_air_date: firstAirDate,
    poster_path: s.poster_path || null,
    overview: s.overview || null,
    genres: (s.genres || []).map((g) => g.name),
    status: s.status || null,
    number_of_seasons: s.number_of_seasons ?? null,
    number_of_episodes: s.number_of_episodes ?? null,
    creator: creators.length ? creators.join(', ') : null,
    cast: cast.slice(0, 8).map((c) => c.name),
  };
}

function tvDetailsFromCacheRow(row) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  const firstAirDate = row.first_air_date
    || (raw.first_air_date && /^\d{4}-\d{2}-\d{2}$/.test(String(raw.first_air_date).slice(0, 10))
      ? String(raw.first_air_date).slice(0, 10)
      : null);
  return {
    tmdb_id: row.tmdb_id,
    title: row.title,
    year: row.year,
    first_air_date: firstAirDate,
    poster_path: row.poster_path || null,
    overview: raw.overview || null,
    genres: row.genres?.length ? row.genres : (raw.genres || []),
    status: row.status || raw.status || null,
    number_of_seasons: raw.number_of_seasons ?? null,
    number_of_episodes: raw.number_of_episodes ?? null,
    creator: raw.creator || null,
    cast: raw.cast?.length ? raw.cast : [],
  };
}

function tvCacheHasFullDetails(row) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  return !!(raw.creator || raw.cast?.length);
}

async function cacheTvRecord(show) {
  const genres = show.genres?.length ? show.genres : null;
  const firstAirDate = show.first_air_date && /^\d{4}-\d{2}-\d{2}$/.test(show.first_air_date)
    ? show.first_air_date
    : null;
  await db()`
    INSERT INTO alist_tv_cache (tmdb_id, title, year, poster_path, genres, first_air_date, status, raw)
    VALUES (
      ${show.tmdb_id}, ${show.title}, ${show.year}, ${show.poster_path},
      ${genres}, ${firstAirDate}, ${show.status || null}, ${JSON.stringify(show)}
    )
    ON CONFLICT (tmdb_id) DO UPDATE SET
      title = EXCLUDED.title,
      year = EXCLUDED.year,
      poster_path = EXCLUDED.poster_path,
      genres = EXCLUDED.genres,
      first_air_date = COALESCE(EXCLUDED.first_air_date, alist_tv_cache.first_air_date),
      status = EXCLUDED.status,
      raw = EXCLUDED.raw,
      fetched_at = now()
  `;
}

async function fetchTvDetails(apiKey, tmdbId) {
  const url = new URL(`https://api.themoviedb.org/3/tv/${tmdbId}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('append_to_response', 'credits');
  const tmdbRes = await fetch(url);
  if (!tmdbRes.ok) return null;
  const s = await tmdbRes.json();
  return tvDetailsFromTmdb(s);
}

async function getTvDetails(tmdbId) {
  if (process.env.DATABASE_URL) {
    await ensureSchema();
    const rows = await db()`
      SELECT tmdb_id, title, year, poster_path, genres, first_air_date, status, raw
      FROM alist_tv_cache
      WHERE tmdb_id = ${tmdbId}
    `;
    if (rows.length && tvCacheHasFullDetails(rows[0])) {
      return tvDetailsFromCacheRow(rows[0]);
    }
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const show = await fetchTvDetails(apiKey, tmdbId);
  if (!show) return null;

  if (process.env.DATABASE_URL) {
    await cacheTvRecord(show);
  }
  return show;
}

async function searchTvShows(apiKey, query) {
  const url = new URL('https://api.themoviedb.org/3/search/tv');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('include_adult', 'false');
  const tmdbRes = await fetch(url);
  if (!tmdbRes.ok) return [];
  const data = await tmdbRes.json();
  return (data.results || []).slice(0, 8).map(tvFromTmdbResult);
}

function normalizeTvBody(body) {
  const rating = body.dnf ? null : (body.rating != null ? Number(body.rating) : null);
  return {
    watched_on: body.watched_on,
    title: String(body.title || '').trim(),
    tmdb_id: body.tmdb_id != null ? Number(body.tmdb_id) : null,
    season: body.season != null && body.season !== '' ? Number(body.season) : null,
    episode: body.episode != null && body.episode !== '' ? Number(body.episode) : null,
    rating,
    dnf: !!body.dnf,
    notes: body.notes ? String(body.notes).trim() : null,
  };
}

async function enrichTvMissingPosters(userId, watches) {
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
      const show = await fetchTvDetails(apiKey, tmdbId);
      if (!show) continue;
      await cacheTvRecord(show);
      if (show.poster_path) posterById.set(tmdbId, show.poster_path);
    } catch {
      // Skip failed lookups.
    }
  }

  return updated.map((w) => ({
    ...w,
    poster_path: w.poster_path || (w.tmdb_id ? posterById.get(w.tmdb_id) : null) || null,
  }));
}

async function enrichTvWatchlistRows(rows) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey || !process.env.DATABASE_URL || !rows?.length) return rows;

  await ensureSchema();
  let lookups = 0;
  const updated = [];

  for (const row of rows) {
    const hasDate = row.first_air_date || row.first_air_date_raw;
    if (hasDate || !row.tmdb_id || lookups >= 12) {
      updated.push(row);
      continue;
    }
    try {
      const show = await getTvDetails(row.tmdb_id);
      lookups += 1;
      if (show?.first_air_date) {
        updated.push({
          ...row,
          first_air_date: show.first_air_date,
          first_air_date_raw: show.first_air_date,
          poster_path: row.poster_path || show.poster_path || null,
          year: row.year ?? show.year ?? null,
        });
      } else {
        updated.push(row);
      }
    } catch {
      updated.push(row);
    }
  }

  return updated;
}

async function handleTvWatches(req, res) {
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;
  const { userId } = session;

  if (req.method === 'GET') {
    try {
      let rows = await listTvWatches(userId);
      let watches = rows.map(tvWatchFromRow);
      watches = await enrichTvMissingPosters(userId, watches);
      res.status(200).json({ watches });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'POST') {
    const data = normalizeTvBody(req.body || {});
    if (!data.watched_on || !data.title) {
      res.status(400).json({ error: 'watched_on and title are required.' });
      return;
    }
    const id = randomUUID();
    try {
      const rows = await db()`
        INSERT INTO alist_tv_watches (
          id, user_id, watched_on, title, tmdb_id, season, episode, rating, dnf, notes
        ) VALUES (
          ${id}, ${userId}, ${data.watched_on}, ${data.title}, ${data.tmdb_id},
          ${data.season}, ${data.episode}, ${data.rating}, ${data.dnf}, ${data.notes}
        )
        RETURNING id, watched_on::text AS watched_on, title, tmdb_id, season, episode,
                  rating::float AS rating, dnf, notes, created_at, updated_at
      `;
      res.status(201).json({ watch: tvWatchFromRow(rows[0]) });
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
    const data = normalizeTvBody(req.body || {});
    if (!data.watched_on || !data.title) {
      res.status(400).json({ error: 'watched_on and title are required.' });
      return;
    }
    try {
      const rows = await db()`
        UPDATE alist_tv_watches SET
          watched_on = ${data.watched_on},
          title = ${data.title},
          tmdb_id = ${data.tmdb_id},
          season = ${data.season},
          episode = ${data.episode},
          rating = ${data.rating},
          dnf = ${data.dnf},
          notes = ${data.notes},
          updated_at = now()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, watched_on::text AS watched_on, title, tmdb_id, season, episode,
                  rating::float AS rating, dnf, notes, created_at, updated_at
      `;
      if (!rows.length) {
        res.status(404).json({ error: 'Watch not found.' });
        return;
      }
      res.status(200).json({ watch: tvWatchFromRow(rows[0]) });
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
        DELETE FROM alist_tv_watches
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

async function handleTvWatchlist(req, res) {
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;
  const { userId } = session;

  if (req.method === 'GET') {
    try {
      const rows = await enrichTvWatchlistRows(await listTvWatchlist(userId));
      res.status(200).json({ items: rows.map(tvWatchlistFromRow) });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'POST') {
    const title = String(req.body?.title || '').trim();
    if (!title) {
      res.status(400).json({ error: 'title is required.' });
      return;
    }
    const tmdbId = req.body?.tmdb_id != null ? Number(req.body.tmdb_id) : null;
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;
    const id = randomUUID();

    try {
      if (tmdbId && process.env.TMDB_API_KEY) {
        await getTvDetails(tmdbId);
      }
      await db()`
        INSERT INTO alist_tv_watchlist (id, user_id, title, tmdb_id, notes)
        VALUES (${id}, ${userId}, ${title}, ${tmdbId}, ${notes})
      `;
      const rows = await enrichTvWatchlistRows(await db()`
        SELECT
          w.id, w.title, w.tmdb_id, w.notes, w.created_at, w.updated_at,
          c.poster_path, c.year, c.first_air_date,
          COALESCE(c.first_air_date::text, c.raw->>'first_air_date') AS first_air_date_raw
        FROM alist_tv_watchlist w
        LEFT JOIN alist_tv_cache c ON c.tmdb_id = w.tmdb_id
        WHERE w.id = ${id} AND w.user_id = ${userId}
      `);
      res.status(201).json({ item: tvWatchlistFromRow(rows[0]) });
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
    const title = req.body?.title != null ? String(req.body.title).trim() : undefined;
    const tmdbId = req.body?.tmdb_id != null ? Number(req.body.tmdb_id) : undefined;
    const notes = req.body?.notes != null ? String(req.body.notes).trim() || null : undefined;

    try {
      const existing = await db()`
        SELECT id, title, tmdb_id, notes
        FROM alist_tv_watchlist
        WHERE id = ${id} AND user_id = ${userId}
      `;
      if (!existing.length) {
        res.status(404).json({ error: 'Watchlist item not found.' });
        return;
      }
      const row = existing[0];
      const rows = await db()`
        UPDATE alist_tv_watchlist SET
          title = ${title ?? row.title},
          tmdb_id = ${tmdbId !== undefined ? tmdbId : row.tmdb_id},
          notes = ${notes !== undefined ? notes : row.notes},
          updated_at = now()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, title, tmdb_id, notes, created_at, updated_at
      `;
      res.status(200).json({ item: tvWatchlistFromRow(rows[0]) });
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
        DELETE FROM alist_tv_watchlist
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id
      `;
      if (!rows.length) {
        res.status(404).json({ error: 'Watchlist item not found.' });
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

async function handleTvDetails(req, res) {
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
    const show = await getTvDetails(tmdbId);
    if (!show) {
      res.status(404).json({ error: 'TV show not found on TMDB.' });
      return;
    }
    res.status(200).json({ show });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

async function handleTvLookup(req, res) {
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
    const results = await searchTvShows(apiKey, q);

    if (process.env.DATABASE_URL) {
      await ensureSchema();
      for (const s of results) {
        await cacheTvRecord(s);
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
