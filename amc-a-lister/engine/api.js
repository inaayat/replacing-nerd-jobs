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

export const watchlistApi = {
  list: (token) => apiFetch('/api/alist-watchlist', { token }),
  create: (token, item) => apiFetch('/api/alist-watchlist', { method: 'POST', body: item, token }),
  update: (token, item) => apiFetch('/api/alist-watchlist', { method: 'PATCH', body: item, token }),
  remove: (token, id) => apiFetch('/api/alist-watchlist', { method: 'DELETE', body: { id }, token }),
};

export const watchesApi = {
  list: (token) => apiFetch('/api/alist-watches', { token }),
  create: (token, watch) => apiFetch('/api/alist-watches', { method: 'POST', body: watch, token }),
  update: (token, watch) => apiFetch('/api/alist-watches', { method: 'PATCH', body: watch, token }),
  remove: (token, id) => apiFetch('/api/alist-watches', { method: 'DELETE', body: { id }, token }),
};

export const summaryApi = {
  get: (token) => apiFetch('/api/alist-summary', { token }),
};

export const leaderboardApi = {
  get: (token) => apiFetch('/api/alist-leaderboard', { token }),
  profile: (userId, token) => {
    const params = new URLSearchParams({ user: userId });
    return apiFetch(`/api/alist-user-profile?${params}`, { token });
  },
  compare: ({ token, youId, withUserId }) => {
    const params = new URLSearchParams({ with: withUserId });
    if (youId) params.set('you', youId);
    return apiFetch(`/api/alist-leaderboard-compare?${params}`, { token });
  },
};

export const membershipApi = {
  get: (token) => apiFetch('/api/alist-membership', { token }),
  update: (token, membership) => apiFetch('/api/alist-membership', { method: 'PUT', body: membership, token }),
};

export const importApi = {
  run: (token, watches) => apiFetch('/api/alist-import', { method: 'POST', body: { watches }, token }),
};

export const movieApi = {
  search: (token, q) => apiFetch(`/api/alist-movie-lookup?q=${encodeURIComponent(q)}`, { token }),
  details: (token, tmdbId) => apiFetch(`/api/alist-movie-details?tmdb_id=${encodeURIComponent(tmdbId)}`, { token }),
  resolve: async (token, title) => {
    if (!title || title.trim().length < 2) return null;
    try {
      const { results } = await movieApi.search(token, title.trim());
      const norm = title.trim().toLowerCase();
      const exact = results.find((r) => r.title.toLowerCase() === norm);
      if (exact) return exact.tmdb_id;
      const partial = results.find((r) => {
        const rt = r.title.toLowerCase();
        return rt.includes(norm) || norm.includes(rt);
      });
      if (partial) return partial.tmdb_id;
      return results.length === 1 ? results[0].tmdb_id : null;
    } catch {
      return null;
    }
  },
};

export const tvWatchesApi = {
  list: (token) => apiFetch('/api/alist-tv-watches', { token }),
  create: (token, watch) => apiFetch('/api/alist-tv-watches', { method: 'POST', body: watch, token }),
  update: (token, watch) => apiFetch('/api/alist-tv-watches', { method: 'PATCH', body: watch, token }),
  remove: (token, id) => apiFetch('/api/alist-tv-watches', { method: 'DELETE', body: { id }, token }),
};

export const tvWatchlistApi = {
  list: (token) => apiFetch('/api/alist-tv-watchlist', { token }),
  create: (token, item) => apiFetch('/api/alist-tv-watchlist', { method: 'POST', body: item, token }),
  update: (token, item) => apiFetch('/api/alist-tv-watchlist', { method: 'PATCH', body: item, token }),
  remove: (token, id) => apiFetch('/api/alist-tv-watchlist', { method: 'DELETE', body: { id }, token }),
};

export const tvApi = {
  search: (token, q) => apiFetch(`/api/alist-tv-lookup?q=${encodeURIComponent(q)}`, { token }),
  details: (token, tmdbId) => apiFetch(`/api/alist-tv-details?tmdb_id=${encodeURIComponent(tmdbId)}`, { token }),
  resolve: async (token, title) => {
    if (!title || title.trim().length < 2) return null;
    try {
      const { results } = await tvApi.search(token, title.trim());
      const norm = title.trim().toLowerCase();
      const exact = results.find((r) => r.title.toLowerCase() === norm);
      if (exact) return exact.tmdb_id;
      const partial = results.find((r) => {
        const rt = r.title.toLowerCase();
        return rt.includes(norm) || norm.includes(rt);
      });
      if (partial) return partial.tmdb_id;
      return results.length === 1 ? results[0].tmdb_id : null;
    } catch {
      return null;
    }
  },
};
