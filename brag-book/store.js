const PATH = '/api/bb-book';

export async function loadBook(token) {
  const res = await fetch(PATH, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Could not load the book (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function saveBook(token, book, { keepalive = false } = {}) {
  const res = await fetch(PATH, {
    method: 'PUT',
    keepalive,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ book }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Could not save the book (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
