const PATH = '/api/bb-book';

function asError(res, data) {
  const err = new Error(data.error || `Could not ${res.status === 409 ? 'save' : 'load'} the book (${res.status})`);
  err.status = res.status;
  err.conflict = Boolean(data.conflict) || res.status === 409;
  err.updatedAt = data.updatedAt ?? null;
  err.revision = data.revision ?? null;
  err.book = data.book;
  return err;
}

export async function loadBook(token) {
  const res = await fetch(PATH, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw asError(res, data);
  return data;
}

export async function saveBook(token, book, { keepalive = false, updatedAt = null, revision = null } = {}) {
  const res = await fetch(PATH, {
    method: 'PUT',
    keepalive,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ book, updatedAt, revision }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw asError(res, data);
  return data;
}
