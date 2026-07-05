// Shared auth check for the site's password gate. Used by middleware.js
// (Edge runtime) and any api/*.js route that needs to verify the same
// __auth cookie outside of a middleware-matched path. Only relies on
// crypto.subtle so it works in both runtimes.
export async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function isAuthed(cookieHeader) {
  const cookie = cookieHeader || '';
  const match = cookie.match(/__auth=([^;]+)/);
  if (!match) return false;
  const expected = await sha256(process.env.SITE_PASSWORD || '');
  return match[1] === expected;
}
