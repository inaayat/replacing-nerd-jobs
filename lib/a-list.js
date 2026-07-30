import { db, ensureSchema } from './db.js';
import { computeSummary, DEFAULT_PRICE_TIERS } from './a-list-billing.js';

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
           price_bump_on::text AS price_bump_on, price_tiers, display_name, updated_at
    FROM alist_membership
    WHERE user_id = ${userId}
  `;
  if (rows.length) return rows[0];

  const created = await db()`
    INSERT INTO alist_membership (user_id, price_tiers, current_cents)
    VALUES (${userId}, ${JSON.stringify(DEFAULT_PRICE_TIERS)}, ${2999})
    RETURNING user_id, promo_cents, standard_cents, current_cents,
              price_bump_on::text AS price_bump_on, price_tiers, display_name, updated_at
  `;
  return created[0];
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
    SELECT w.id, w.title, w.tmdb_id, w.notes, w.created_at, w.updated_at, c.poster_path, c.year
    FROM alist_watchlist w
    LEFT JOIN alist_movie_cache c ON c.tmdb_id = w.tmdb_id
    WHERE w.user_id = ${userId}
    ORDER BY w.created_at DESC
  `;
}

function displayNameForUser(user, membership) {
  const fromMembership = membership?.display_name?.trim();
  if (fromMembership) return fromMembership;
  const fromUser = user.name?.trim();
  if (fromUser) return fromUser;
  const email = user.email?.trim();
  if (email) return email.split('@')[0];
  return 'Member';
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

function defaultMembership(userId) {
  return {
    user_id: userId,
    promo_cents: 99,
    standard_cents: 2495,
    current_cents: 2999,
    price_bump_on: null,
    price_tiers: DEFAULT_PRICE_TIERS,
    display_name: null,
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

async function getUserProfile(userId) {
  const rows = await db()`
    SELECT u.id, u.email, u.name, m.display_name
    FROM users u
    LEFT JOIN alist_membership m ON m.user_id = u.id
    WHERE u.id = ${userId}
  `;
  if (!rows.length) return null;
  return {
    userId: rows[0].id,
    displayName: displayNameForUser(rows[0], rows[0]),
  };
}

export async function compareUsers(youId, themId) {
  await ensureSchema();
  if (youId === themId) {
    throw new Error('Pick someone else to compare with.');
  }

  const [youProfile, themProfile, yourRows, theirRows] = await Promise.all([
    getUserProfile(youId),
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

export async function getLeaderboard() {
  await ensureSchema();

  const [users, memberships, watchRows] = await Promise.all([
    db()`
      SELECT id, email, name
      FROM users
      ORDER BY created_at ASC
    `,
    db()`
      SELECT user_id, promo_cents, standard_cents, current_cents,
             price_bump_on::text AS price_bump_on, price_tiers, display_name
      FROM alist_membership
    `,
    db()`
      SELECT w.user_id, w.watched_on::text AS watched_on, w.title, w.tmdb_id, w.location,
             w.format, w.saw_alone, w.ticket_cents, w.rating::float AS rating, w.dnf,
             w.in_theaters, c.runtime_min
      FROM alist_watches w
      LEFT JOIN alist_movie_cache c ON c.tmdb_id = w.tmdb_id
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
    const membership = membershipByUser.get(user.id) || defaultMembership(user.id);
    const watches = watchesByUser.get(user.id) || [];
    const summary = computeSummary(watches, membership);
    const rated = watches.filter((w) => !w.dnf && w.rating != null);
    const dnfCount = watches.filter((w) => w.dnf).length;
    const avgRating = rated.length
      ? Math.round((rated.reduce((sum, w) => sum + w.rating, 0) / rated.length) * 10) / 10
      : null;

    return {
      userId: user.id,
      displayName: displayNameForUser(user, membership),
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
  });
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
  return {
    id: row.id,
    title: row.title,
    tmdb_id: row.tmdb_id,
    poster_path: row.poster_path || null,
    year: row.year != null ? Number(row.year) : null,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
