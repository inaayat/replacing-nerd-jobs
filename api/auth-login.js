// Server-side Neon Auth sign-in/sign-up that returns a JWT for the browser.
// Mobile PWAs often block third-party auth cookies, so client-side sign-in can
// succeed without ever yielding a usable Bearer token. This route performs the
// Neon Auth exchange on the server (where Set-Cookie → /token works) and hands
// the JWT back to the client for sessionStorage + API calls.
const AUTH_BASE = () => process.env.NEON_AUTH_BASE_URL?.replace(/\/$/, '') || '';

function cookieHeader(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
  }
  return response.headers.get('set-cookie') || '';
}

function isJwt(value) {
  return typeof value === 'string' && value.split('.').length === 3;
}

async function fetchJwt(base, cookies) {
  const tokenRes = await fetch(`${base}/token`, {
    headers: cookies ? { Cookie: cookies } : undefined,
  });
  if (tokenRes.ok) {
    const data = await tokenRes.json().catch(() => ({}));
    if (isJwt(data.token)) return data.token;
  }

  const sessionRes = await fetch(`${base}/get-session`, {
    headers: cookies ? { Cookie: cookies } : undefined,
  });
  const headerJwt = sessionRes.headers.get('set-auth-jwt');
  if (isJwt(headerJwt)) return headerJwt;
  if (sessionRes.ok) {
    const data = await sessionRes.json().catch(() => ({}));
    const bodyJwt = data?.session?.token;
    if (isJwt(bodyJwt)) return bodyJwt;
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }

  const base = AUTH_BASE();
  if (!base) {
    res.status(503).json({ error: 'NEON_AUTH_BASE_URL not configured.' });
    return;
  }

  const { email, password, name, mode } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const isSignup = mode === 'signup';
  const endpoint = isSignup ? `${base}/sign-up/email` : `${base}/sign-in/email`;
  const payload = isSignup
    ? { email, password, name: name || String(email).split('@')[0] }
    : { email, password };

  let signRes;
  try {
    signRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not reach auth service.' });
    return;
  }

  const cookies = cookieHeader(signRes);
  const body = await signRes.json().catch(() => ({}));

  if (!signRes.ok) {
    res.status(signRes.status).json({ error: body.message || 'Authentication failed.' });
    return;
  }

  let token = signRes.headers.get('set-auth-jwt');
  if (!isJwt(token)) token = isJwt(body.token) ? body.token : null;
  if (!isJwt(token)) token = await fetchJwt(base, cookies);

  if (!isJwt(token)) {
    res.status(502).json({ error: 'Signed in, but could not start a session. Try again.' });
    return;
  }

  res.status(200).json({
    token,
    user: body.user || null,
  });
}
