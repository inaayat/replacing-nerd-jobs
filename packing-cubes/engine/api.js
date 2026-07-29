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
    err.data = data;
    throw err;
  }
  return data;
}

export const cubesApi = {
  list: (token) => apiFetch('/api/pc-cubes', { token }),
  get: (token, id) => apiFetch(`/api/pc-cubes?id=${encodeURIComponent(id)}`, { token }),
  create: (token, cube) => apiFetch('/api/pc-cubes', { method: 'POST', body: cube, token }),
  update: (token, cube) => apiFetch('/api/pc-cubes', { method: 'PATCH', body: cube, token }),
  remove: (token, id) => apiFetch('/api/pc-cubes', { method: 'DELETE', body: { id }, token }),
  publish: (token, id) => apiFetch('/api/pc-publish', { method: 'POST', body: { id }, token }),
};

export const suitcasesApi = {
  get: (token) => apiFetch('/api/pc-suitcases', { token }),
  put: (token, state) => apiFetch('/api/pc-suitcases', { method: 'PUT', body: state, token }),
};
