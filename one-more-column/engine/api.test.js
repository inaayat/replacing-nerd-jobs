import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, configureApiAuth } from './api.js';

test('apiFetch refreshes the JWT once on 401 and retries', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (path, opts) => {
    calls.push({ path, auth: opts.headers.Authorization });
    if (calls.length === 1) {
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'Not signed in.' }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    };
  };

  try {
    configureApiAuth({
      getToken: () => 'expired',
      refresh: async () => 'fresh',
    });
    const data = await apiFetch('/api/omc-me', { token: 'expired' });
    assert.deepEqual(data, { ok: true });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].auth, 'Bearer expired');
    assert.equal(calls[1].auth, 'Bearer fresh');
  } finally {
    globalThis.fetch = originalFetch;
    configureApiAuth({ getToken: () => null, refresh: null });
  }
});

test('apiFetch does not retry a 500', async () => {
  const originalFetch = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => {
    n += 1;
    return {
      ok: false,
      status: 500,
      json: async () => ({ error: 'Failed to load dependencies.' }),
    };
  };

  try {
    configureApiAuth({
      getToken: () => 'tok',
      refresh: async () => 'fresh',
    });
    await assert.rejects(() => apiFetch('/api/omc-dependencies', { token: 'tok' }), {
      status: 500,
      message: 'Failed to load dependencies.',
    });
    assert.equal(n, 1, 'a real 500 must not be swallowed by the refresh path');
  } finally {
    globalThis.fetch = originalFetch;
    configureApiAuth({ getToken: () => null, refresh: null });
  }
});
