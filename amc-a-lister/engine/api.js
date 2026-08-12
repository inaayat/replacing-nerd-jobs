export async function apiFetch(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * In-flight/settled cache for the two expensive reads, scoped to one page load.
 *
 * Every page used to fetch the full watch list twice — once for the page itself
 * and again inside loadUserTheaters(), which downloads 100+ rows only to pull
 * out distinct theater names — and the summary twice, for the page and for the
 * sidebar. Both are server-side expensive, so dedupe them here rather than
 * threading the data through every call site.
 */
const readCache = new Map();

function cachedGet(key, fetcher) {
  if (!readCache.has(key)) {
    readCache.set(key, fetcher().catch((err) => {
      readCache.delete(key);
      throw err;
    }));
  }
  return readCache.get(key);
}

/** Drop cached reads after anything that changes the underlying data. */
export function invalidateReadCache() {
  readCache.clear();
}

async function mutate(promise) {
  const result = await promise;
  invalidateReadCache();
  return result;
}

export const watchlistApi = {
  list: (token) => cachedGet('watchlist', () => apiFetch('/api/alist-watchlist', { token })),
  create: (token, item) => mutate(apiFetch('/api/alist-watchlist', { method: 'POST', body: item, token })),
  update: (token, item) => mutate(apiFetch('/api/alist-watchlist', { method: 'PATCH', body: item, token })),
  remove: (token, id) => mutate(apiFetch('/api/alist-watchlist', { method: 'DELETE', body: { id }, token })),
};

export const watchesApi = {
  list: (token) => cachedGet('watches', () => apiFetch('/api/alist-watches', { token })),
  create: (token, watch) => mutate(apiFetch('/api/alist-watches', { method: 'POST', body: watch, token })),
  update: (token, watch) => mutate(apiFetch('/api/alist-watches', { method: 'PATCH', body: watch, token })),
  bulkUpdateRatings: (token, rating_updates) => mutate(apiFetch('/api/alist-watches', { method: 'PATCH', body: { rating_updates }, token })),
  remove: (token, id) => mutate(apiFetch('/api/alist-watches', { method: 'DELETE', body: { id }, token })),
};

export const summaryApi = {
  get: (token) => cachedGet('summary', () => apiFetch('/api/alist-summary', { token })),
};

export const leaderboardApi = {
  get: (token) => apiFetch('/api/alist-leaderboard', { token }),
  profile: (userId, token) => {
    const params = new URLSearchParams({ user: userId });
    return apiFetch(`/api/alist-user-profile?${params}`, { token });
  },
  // "you" is taken from the session server-side and is no longer accepted as a
  // parameter — passing it let anyone compare any two members.
  compare: ({ token, withUserId }) => {
    const params = new URLSearchParams({ with: withUserId });
    return apiFetch(`/api/alist-leaderboard-compare?${params}`, { token });
  },
};

export const membershipApi = {
  get: (token) => cachedGet('membership', () => apiFetch('/api/alist-membership', { token })),
  update: (token, membership) => mutate(apiFetch('/api/alist-membership', { method: 'PUT', body: membership, token })),
};

export const backfillApi = {
  run: (token) => mutate(apiFetch('/api/alist-backfill-posters', { method: 'POST', token })),
};

export const importApi = {
  run: (token, watches) => mutate(apiFetch('/api/alist-import', { method: 'POST', body: { watches }, token })),
};

/** Trim, casefold, and drop punctuation/articles so "The Odyssey" == "odyssey". */
function normalizeTitle(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Only ever auto-links an exact title match.
 *
 * The old version fell back to two-way substring matching, so `norm.includes(rt)`
 * let a short result title ("It") claim any longer query containing it
 * ("Titanic"). A wrong tmdb_id silently drives the poster, runtime, genres, cast
 * and rewatch grouping, so an unlinked row is much cheaper than a wrong one —
 * the user can always pick from the dropdown.
 */
async function resolveExact(api, token, title) {
  const query = String(title || '').trim();
  if (query.length < 2) return null;
  try {
    const { results } = await api.search(token, query);
    const norm = normalizeTitle(query);
    const matches = results.filter((r) => normalizeTitle(r.title) === norm);
    // Ambiguous (a remake, say) — leave it unlinked rather than guess.
    return matches.length === 1 ? matches[0].tmdb_id : null;
  } catch {
    return null;
  }
}

export const movieApi = {
  search: (token, q) => apiFetch(`/api/alist-movie-lookup?q=${encodeURIComponent(q)}`, { token }),
  details: (token, tmdbId) => apiFetch(`/api/alist-movie-details?tmdb_id=${encodeURIComponent(tmdbId)}`, { token }),
  resolve: (token, title) => resolveExact(movieApi, token, title),
};

export const showingInvitesApi = {
  list: (token) => apiFetch('/api/alist-showing-invites', { token }),
  create: (token, body) => mutate(apiFetch('/api/alist-showing-invites', { method: 'POST', body, token })),
  bulkCreate: (token, body) => mutate(apiFetch('/api/alist-showing-invites', { method: 'POST', body, token })),
  respond: (token, body) => mutate(apiFetch('/api/alist-showing-invites', { method: 'PATCH', body, token })),
};

export const tvWatchesApi = {
  list: (token) => cachedGet('tv-watches', () => apiFetch('/api/alist-tv-watches', { token })),
  create: (token, watch) => mutate(apiFetch('/api/alist-tv-watches', { method: 'POST', body: watch, token })),
  update: (token, watch) => mutate(apiFetch('/api/alist-tv-watches', { method: 'PATCH', body: watch, token })),
  remove: (token, id) => mutate(apiFetch('/api/alist-tv-watches', { method: 'DELETE', body: { id }, token })),
};

export const tvWatchlistApi = {
  list: (token) => cachedGet('tv-watchlist', () => apiFetch('/api/alist-tv-watchlist', { token })),
  create: (token, item) => mutate(apiFetch('/api/alist-tv-watchlist', { method: 'POST', body: item, token })),
  update: (token, item) => mutate(apiFetch('/api/alist-tv-watchlist', { method: 'PATCH', body: item, token })),
  remove: (token, id) => mutate(apiFetch('/api/alist-tv-watchlist', { method: 'DELETE', body: { id }, token })),
};

export const tvApi = {
  search: (token, q) => apiFetch(`/api/alist-tv-lookup?q=${encodeURIComponent(q)}`, { token }),
  details: (token, tmdbId) => apiFetch(`/api/alist-tv-details?tmdb_id=${encodeURIComponent(tmdbId)}`, { token }),
  resolve: (token, title) => resolveExact(tvApi, token, title),
};
