import { db, ensureSchema } from './db.js';
export { publicDisplayName, isPublicProfile, normalizeUsername } from './a-list-identity.js';
import { publicDisplayName, isPublicProfile } from './a-list-identity.js';
import {
  computeSummary,
  chargeMonth,
  foldPromoIntoTiers,
} from './a-list-billing.js';

export async function upsertUser(auth) {
  await ensureSchema();
  await db()`
    INSERT INTO users (id, email, name)
    VALUES (${auth.sub}, ${auth.email || null}, ${auth.name || null})
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email, name = EXCLUDED.name, last_seen_at = now()
  `;
  return auth.sub;
}

export async function getMembership(userId) {
  const rows = await db()`
    SELECT user_id, promo_cents, standard_cents, current_cents,
           price_bump_on::text AS price_bump_on, price_tiers, display_name,
           username, public_profile, public_hide_theaters,
           rate_setup_complete, promo_folded, updated_at
    FROM alist_membership
    WHERE user_id = ${userId}
  `;
  if (rows.length) return migrateMembership(userId, rows[0]);

  const created = await db()`
    INSERT INTO alist_membership (
      user_id, price_tiers, current_cents, standard_cents,
      promo_cents, rate_setup_complete, promo_folded
    )
    VALUES (
      ${userId}, ${JSON.stringify([])}, ${2999}, ${2999},
      ${2999}, false, true
    )
    RETURNING user_id, promo_cents, standard_cents, current_cents,
              price_bump_on::text AS price_bump_on, price_tiers, display_name,
              username, public_profile, public_hide_theaters,
              rate_setup_complete, promo_folded, updated_at
  `;
  return created[0];
}


async function migrateMembership(userId, membership) {
  if (membership.promo_folded) return membership;

  const firstWatch = await db()`
    SELECT watched_on::text AS watched_on
    FROM alist_watches
    WHERE user_id = ${userId}
      AND in_theaters IS NOT FALSE
    ORDER BY watched_on ASC
    LIMIT 1
  `;
  const firstMonth = firstWatch[0] ? chargeMonth(firstWatch[0].watched_on) : null;
  const { tiers, changed } = foldPromoIntoTiers(membership, firstMonth);
  if (!changed && membership.promo_folded) return membership;

  const latest = tiers?.length ? tiers[tiers.length - 1] : null;
  const rows = await db()`
    UPDATE alist_membership SET
      price_tiers = ${JSON.stringify(tiers)},
      standard_cents = ${tiers?.[0]?.cents ?? membership.standard_cents},
      current_cents = ${latest?.cents ?? membership.current_cents},
      price_bump_on = ${latest?.effective_on ?? membership.price_bump_on},
      promo_folded = true,
      updated_at = now()
    WHERE user_id = ${userId}
    RETURNING user_id, promo_cents, standard_cents, current_cents,
              price_bump_on::text AS price_bump_on, price_tiers, display_name,
              username, public_profile, public_hide_theaters,
              rate_setup_complete, promo_folded, updated_at
  `;
  return rows[0] || { ...membership, price_tiers: tiers, promo_folded: true };
}

export async function listWatches(userId) {
  return db()`
    SELECT w.id, w.watched_on::text AS watched_on, w.title, w.tmdb_id, w.location, w.format,
           w.saw_alone, w.auditorium, w.seat, w.ticket_cents, w.rating::float AS rating,
           w.dnf, w.notes, w.in_theaters, w.created_at, w.updated_at, c.poster_path, c.runtime_min
    FROM alist_watches w
    LEFT JOIN alist_movie_cache c ON c.tmdb_id = w.tmdb_id
    WHERE w.user_id = ${userId}
    ORDER BY w.watched_on DESC, w.created_at DESC
  `;
}

export function theaterWatches(watches) {
  return watches.filter((w) => w.in_theaters !== false);
}

export async function listWatchlist(userId) {
  return db()`
    SELECT
      w.id, w.title, w.tmdb_id, w.notes, w.created_at, w.updated_at,
      c.poster_path, c.year, c.release_date,
      COALESCE(c.release_date::text, c.raw->>'release_date') AS release_date_raw,
      (c.raw->>'pp_v')::int AS cache_pp_v
    FROM alist_watchlist w
    LEFT JOIN alist_movie_cache c ON c.tmdb_id = w.tmdb_id
    WHERE w.user_id = ${userId}
    ORDER BY w.created_at DESC
  `;
}


function watchForSummary(row) {
  if (row.in_theaters === false) return null;
  return {
    watched_on: row.watched_on,
    title: row.title,
    tmdb_id: row.tmdb_id,
    location: row.location,
    format: row.format || '',
    saw_alone: !!row.saw_alone,
    ticket_cents: row.ticket_cents,
    runtime_min: row.runtime_min != null ? Number(row.runtime_min) : null,
    rating: row.rating != null ? Number(row.rating) : null,
    dnf: !!row.dnf,
  };
}

function membershipForBilling(membership, watches) {
  if (membership?.promo_folded) return membership;
  const sorted = [...watches].sort((a, b) => String(a.watched_on).localeCompare(String(b.watched_on)));
  const firstMonth = sorted[0] ? chargeMonth(sorted[0].watched_on) : null;
  const { tiers } = foldPromoIntoTiers(membership, firstMonth);
  return { ...membership, price_tiers: tiers, promo_folded: true };
}

function defaultMembership(userId) {
  return {
    user_id: userId,
    promo_cents: 2999,
    standard_cents: 2495,
    current_cents: 2999,
    price_bump_on: null,
    price_tiers: [],
    display_name: null,
    username: null,
    public_profile: false,
    public_hide_theaters: false,
    rate_setup_complete: false,
    promo_folded: true,
  };
}

function movieKey(row) {
  if (row.tmdb_id) return `tmdb:${row.tmdb_id}`;
  return `title:${String(row.title || '').toLowerCase().trim()}`;
}

function averageRating(ratings) {
  if (!ratings.length) return null;
  return Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10;
}

function aggregateMovies(watchRows) {
  const map = new Map();
  for (const row of watchRows) {
    const key = movieKey(row);
    if (!map.has(key)) {
      map.set(key, {
        title: row.title,
        tmdb_id: row.tmdb_id,
        poster_path: row.poster_path || null,
        ratings: [],
      });
    }
    const movie = map.get(key);
    if (row.poster_path && !movie.poster_path) movie.poster_path = row.poster_path;
    if (row.tmdb_id && !movie.tmdb_id) movie.tmdb_id = row.tmdb_id;
    if (!row.dnf && row.rating != null) movie.ratings.push(Number(row.rating));
  }
  return map;
}

function movieFromAggregate(entry, ratings) {
  return {
    title: entry.title,
    tmdb_id: entry.tmdb_id,
    poster_path: entry.poster_path,
    rating: averageRating(ratings),
  };
}

/**
 * @param {boolean} requirePublic false only for the signed-in requester's own
 *   side of a comparison — they may always see themselves.
 */
async function getUserProfile(userId, { requirePublic = true } = {}) {
  const rows = await db()`
    SELECT u.id, u.name, m.username, m.public_profile
    FROM users u
    LEFT JOIN alist_membership m ON m.user_id = u.id
    WHERE u.id = ${userId}
  `;
  if (!rows.length) return null;
  if (requirePublic && !isPublicProfile(rows[0])) return null;
  return {
    userId: rows[0].id,
    displayName: publicDisplayName(rows[0], rows[0]),
  };
}

export async function compareUsers(youId, themId) {
  await ensureSchema();
  if (youId === themId) {
    throw new Error('Pick someone else to compare with.');
  }

  const [youProfile, themProfile, yourRows, theirRows] = await Promise.all([
    // youId always comes from the caller's own session token.
    getUserProfile(youId, { requirePublic: false }),
    getUserProfile(themId),
    listWatches(youId),
    listWatches(themId),
  ]);

  if (!youProfile || !themProfile) {
    throw new Error('User not found.');
  }

  const yourMovies = aggregateMovies(theaterWatches(yourRows));
  const theirMovies = aggregateMovies(theaterWatches(theirRows));
  const allKeys = new Set([...yourMovies.keys(), ...theirMovies.keys()]);

  const bothSeen = [];
  const onlyYou = [];
  const onlyThem = [];
  const disagreed = [];
  const bothLoved = [];

  for (const key of allKeys) {
    const yours = yourMovies.get(key);
    const theirs = theirMovies.get(key);
    const base = yours || theirs;
    const yourRating = yours ? averageRating(yours.ratings) : null;
    const theirRating = theirs ? averageRating(theirs.ratings) : null;
    const movie = {
      title: base.title,
      tmdb_id: base.tmdb_id,
      poster_path: base.poster_path,
      yourRating,
      theirRating,
    };

    if (yours && theirs) {
      bothSeen.push(movie);
      if (yourRating != null && theirRating != null) {
        const ratingDiff = Math.abs(yourRating - theirRating);
        if (ratingDiff >= 1) {
          disagreed.push({ ...movie, ratingDiff });
        }
        if (yourRating >= 4 && theirRating >= 4) {
          bothLoved.push(movie);
        }
      }
    } else if (yours) {
      onlyYou.push(movieFromAggregate(yours, yours.ratings));
    } else if (theirs) {
      onlyThem.push(movieFromAggregate(theirs, theirs.ratings));
    }
  }

  const byTitle = (a, b) => a.title.localeCompare(b.title);
  const byRatingDiff = (a, b) => b.ratingDiff - a.ratingDiff || byTitle(a, b);

  bothSeen.sort(byTitle);
  onlyYou.sort(byTitle);
  onlyThem.sort(byTitle);
  disagreed.sort(byRatingDiff);
  bothLoved.sort(byTitle);

  return {
    you: youProfile,
    them: themProfile,
    bothSeen,
    onlyYou,
    onlyThem,
    disagreed,
    bothLoved,
  };
}

/**
 * Public shape of a watch. `seat` and `auditorium` are never included at any
 * privacy setting — seat + auditorium + timestamp is a physical-location trail
 * and has no purpose on a leaderboard.
 */
export function publicWatchFromRow(row, { hideTheaters = false } = {}) {
  return {
    id: row.id,
    watched_on: row.watched_on,
    title: row.title,
    tmdb_id: row.tmdb_id,
    poster_path: row.poster_path || null,
    location: hideTheaters ? null : row.location,
    format: row.format || '',
    ticket_cents: row.ticket_cents,
    rating: row.rating != null ? Number(row.rating) : null,
    dnf: !!row.dnf,
  };
}

/** Your own profile, readable whether or not you're opted in. */
export function getOwnProfile(userId) {
  return getUserPublicProfile(userId, { requirePublic: false });
}

export async function getUserPublicProfile(userId, { requirePublic = true } = {}) {
  await ensureSchema();

  const rows = await db()`
    SELECT u.id, u.name,
           m.promo_cents, m.standard_cents, m.current_cents,
           m.price_bump_on::text AS price_bump_on, m.price_tiers, m.display_name,
           m.username, m.public_profile, m.public_hide_theaters,
           m.rate_setup_complete, m.promo_folded
    FROM users u
    LEFT JOIN alist_membership m ON m.user_id = u.id
    WHERE u.id = ${userId}
  `;
  if (!rows.length) return null;

  const user = rows[0];
  // Indistinguishable from a nonexistent id, so opt-out status isn't probeable.
  if (requirePublic && !isPublicProfile(user)) return null;
  const membership = user.promo_cents != null
    ? {
      user_id: user.id,
      promo_cents: user.promo_cents,
      standard_cents: user.standard_cents,
      current_cents: user.current_cents,
      price_bump_on: user.price_bump_on,
      price_tiers: user.price_tiers,
      display_name: user.display_name,
      username: user.username,
      public_profile: user.public_profile,
      public_hide_theaters: user.public_hide_theaters,
      rate_setup_complete: user.rate_setup_complete !== false,
      promo_folded: !!user.promo_folded,
    }
    : defaultMembership(user.id);

  const watchRows = await listWatches(userId);
  const theaterRows = theaterWatches(watchRows);
  const summaryWatches = theaterRows.map((row) => ({
    watched_on: row.watched_on,
    title: row.title,
    tmdb_id: row.tmdb_id,
    location: row.location,
    format: row.format || '',
    saw_alone: !!row.saw_alone,
    ticket_cents: row.ticket_cents,
    runtime_min: row.runtime_min != null ? Number(row.runtime_min) : null,
    rating: row.rating != null ? Number(row.rating) : null,
    dnf: !!row.dnf,
  }));

  const summary = computeSummary(summaryWatches, membershipForBilling(membership, summaryWatches));
  const rated = summaryWatches.filter((w) => !w.dnf && w.rating != null);
  const dnfCount = summaryWatches.filter((w) => w.dnf).length;
  const avgRating = rated.length
    ? Math.round((rated.reduce((sum, w) => sum + w.rating, 0) / rated.length) * 10) / 10
    : null;

  const hideTheaters = membership.public_hide_theaters === true;

  return {
    userId: user.id,
    displayName: publicDisplayName(membership, user),
    isPublic: isPublicProfile(membership),
    hideTheaters,
    stats: {
      totalSeen: summary.totalSeen,
      totalSavings: summary.totalSavings,
      totalCharged: summary.totalCharged,
      totalBilled: summary.totalBilled,
      costPerMovie: summary.costPerMovie,
      avgTicket: summary.avgTicket,
      avgRuntimeMin: summary.avgRuntimeMin,
      avgRating,
      dnfCount,
      periodMovies: summary.currentPeriod.movies,
      periodSavings: summary.currentPeriod.savings,
      periodMonth: summary.currentPeriod.month,
    },
    // theaterRows, not watchRows: home watches stay out of the public log.
    watches: theaterRows.map((row) => publicWatchFromRow(row, { hideTheaters })),
  };
}

export async function getLeaderboard() {
  await ensureSchema();

  // Opted-in members only — which also keeps this from loading every watch row
  // of every account into memory on each request.
  const [users, memberships, watchRows] = await Promise.all([
    db()`
      SELECT u.id, u.name
      FROM users u
      JOIN alist_membership m ON m.user_id = u.id
      WHERE m.public_profile = true
      ORDER BY u.created_at ASC
    `,
    db()`
      SELECT user_id, promo_cents, standard_cents, current_cents,
             price_bump_on::text AS price_bump_on, price_tiers, display_name,
             username, public_profile, public_hide_theaters,
             rate_setup_complete, promo_folded
      FROM alist_membership
      WHERE public_profile = true
    `,
    db()`
      SELECT w.user_id, w.watched_on::text AS watched_on, w.title, w.tmdb_id, w.location,
             w.format, w.saw_alone, w.ticket_cents, w.rating::float AS rating, w.dnf,
             w.in_theaters, c.runtime_min
      FROM alist_watches w
      JOIN alist_membership m ON m.user_id = w.user_id
      LEFT JOIN alist_movie_cache c ON c.tmdb_id = w.tmdb_id
      WHERE m.public_profile = true
    `,
  ]);

  const membershipByUser = new Map(memberships.map((m) => [m.user_id, m]));
  const watchesByUser = new Map();
  for (const row of watchRows) {
    const watch = watchForSummary(row);
    if (!watch) continue;
    if (!watchesByUser.has(row.user_id)) watchesByUser.set(row.user_id, []);
    watchesByUser.get(row.user_id).push(watch);
  }

  return users.map((user) => {
    const membership = membershipByUser.get(user.id);
    if (!membership) return null;
    const watches = watchesByUser.get(user.id) || [];
    const summary = computeSummary(watches, membershipForBilling(membership, watches));
    const rated = watches.filter((w) => !w.dnf && w.rating != null);
    const dnfCount = watches.filter((w) => w.dnf).length;
    const avgRating = rated.length
      ? Math.round((rated.reduce((sum, w) => sum + w.rating, 0) / rated.length) * 10) / 10
      : null;

    return {
      userId: user.id,
      displayName: publicDisplayName(membership, user),
      totalSeen: summary.totalSeen,
      totalSavings: summary.totalSavings,
      totalCharged: summary.totalCharged,
      totalBilled: summary.totalBilled,
      costPerMovie: summary.costPerMovie,
      avgTicket: summary.avgTicket,
      avgRuntimeMin: summary.avgRuntimeMin,
      avgRating,
      dnfCount,
      periodMovies: summary.currentPeriod.movies,
      periodSavings: summary.currentPeriod.savings,
    };
  }).filter(Boolean);
}

export function watchFromRow(row) {
  return {
    id: row.id,
    watched_on: row.watched_on,
    title: row.title,
    tmdb_id: row.tmdb_id,
    poster_path: row.poster_path || null,
    location: row.location,
    format: row.format || '',
    saw_alone: !!row.saw_alone,
    auditorium: row.auditorium,
    seat: row.seat,
    ticket_cents: row.ticket_cents,
    rating: row.rating != null ? Number(row.rating) : null,
    dnf: !!row.dnf,
    notes: row.notes,
    in_theaters: row.in_theaters !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function watchlistFromRow(row) {
  const releaseDate = normalizeReleaseDate(row.release_date || row.release_date_raw || null);
  return {
    id: row.id,
    title: row.title,
    tmdb_id: row.tmdb_id,
    poster_path: row.poster_path || null,
    year: row.year != null ? Number(row.year) : null,
    release_date: releaseDate,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeReleaseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function listTvWatches(userId) {
  // TV watches are intentionally excluded from A-List billing, insights,
  // leaderboard, and sidebar stats — only alist_watches feeds those.
  return db()`
    SELECT w.id, w.watched_on::text AS watched_on, w.title, w.tmdb_id,
           w.season, w.episode, w.rating::float AS rating, w.dnf, w.notes,
           w.created_at, w.updated_at, c.poster_path
    FROM alist_tv_watches w
    LEFT JOIN alist_tv_cache c ON c.tmdb_id = w.tmdb_id
    WHERE w.user_id = ${userId}
    ORDER BY w.watched_on DESC, w.created_at DESC
  `;
}

export async function listTvWatchlist(userId) {
  return db()`
    SELECT
      w.id, w.title, w.tmdb_id, w.notes, w.created_at, w.updated_at,
      c.poster_path, c.year, c.first_air_date,
      COALESCE(c.first_air_date::text, c.raw->>'first_air_date') AS first_air_date_raw
    FROM alist_tv_watchlist w
    LEFT JOIN alist_tv_cache c ON c.tmdb_id = w.tmdb_id
    WHERE w.user_id = ${userId}
    ORDER BY w.created_at DESC
  `;
}

export function tvWatchFromRow(row) {
  return {
    id: row.id,
    watched_on: row.watched_on,
    title: row.title,
    tmdb_id: row.tmdb_id,
    poster_path: row.poster_path || null,
    season: row.season != null ? Number(row.season) : null,
    episode: row.episode != null ? Number(row.episode) : null,
    rating: row.rating != null ? Number(row.rating) : null,
    dnf: !!row.dnf,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function tvWatchlistFromRow(row) {
  const firstAirDate = normalizeReleaseDate(row.first_air_date || row.first_air_date_raw || null);
  return {
    id: row.id,
    title: row.title,
    tmdb_id: row.tmdb_id,
    poster_path: row.poster_path || null,
    year: row.year != null ? Number(row.year) : null,
    first_air_date: firstAirDate,
    release_date: firstAirDate,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
