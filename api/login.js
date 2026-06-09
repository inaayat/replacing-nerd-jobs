async function sha256(str) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(str)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).end();
    return;
  }

  let password = '';

  let redirect = '/private/';

  const contentType = request.headers['content-type'] || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const body =
      typeof request.body === 'string'
        ? request.body
        : new URLSearchParams(request.body).toString();
    const params = new URLSearchParams(body);
    password = params.get('password') || '';
    redirect = params.get('redirect') || '/private/';
  }

  if (!redirect.startsWith('/private/')) {
    redirect = '/private/';
  }

  const expected = process.env.SITE_PASSWORD || '';

  if (password === expected) {
    const hash = await sha256(password);
    response.setHeader(
      'Set-Cookie',
      `__auth=${hash}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
    );
    response.redirect(302, redirect);
  } else {
    response.redirect(302, redirect + (redirect.includes('?') ? '&' : '?') + 'error=1');
  }
}
