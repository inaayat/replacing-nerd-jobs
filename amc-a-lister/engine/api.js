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

export const watchesApi = {
  list: (token) => apiFetch('/api/a-list/watches', { token }),
  create: (token, watch) => apiFetch('/api/a-list/watches', { method: 'POST', body: watch, token }),
  update: (token, watch) => apiFetch('/api/a-list/watches', { method: 'PATCH', body: watch, token }),
  remove: (token, id) => apiFetch('/api/a-list/watches', { method: 'DELETE', body: { id }, token }),
};

export const summaryApi = {
  get: (token) => apiFetch('/api/a-list/summary', { token }),
};

export const membershipApi = {
  get: (token) => apiFetch('/api/a-list/membership', { token }),
  update: (token, membership) => apiFetch('/api/a-list/membership', { method: 'PUT', body: membership, token }),
};

export const importApi = {
  run: (token, watches) => apiFetch('/api/a-list/import', { method: 'POST', body: { watches }, token }),
};

export const movieApi = {
  search: (token, q) => apiFetch(`/api/a-list/movie-lookup?q=${encodeURIComponent(q)}`, { token }),
};
