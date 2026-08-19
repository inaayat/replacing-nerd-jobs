const PATH = '/api/tm-sheet';

export async function loadSheet(token) {
  const res = await fetch(PATH, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Could not load sheet (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function saveSheet(token, sheet, { keepalive = false } = {}) {
  const res = await fetch(PATH, {
    method: 'PUT',
    keepalive,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sheet }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Could not save sheet (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function debounceSave(fn, wait = 700) {
  let timer = null;
  let pending = null;
  const run = async (opts) => {
    timer = null;
    const job = pending;
    pending = null;
    if (job) await fn(job, opts);
  };
  const wrapped = (payload) => {
    pending = payload;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => run(), wait);
  };
  wrapped.flush = async (opts) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending) {
      const job = pending;
      pending = null;
      await fn(job, opts);
    }
  };
  return wrapped;
}
