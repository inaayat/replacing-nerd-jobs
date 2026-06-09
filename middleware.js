export const config = {
  matcher: '/private/:path*',
};

async function sha256(str) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(str)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function loginPage(error, returnTo) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login — Replacing Nerd Jobs</title>
  <link rel="icon" type="image/png" href="/ugly-dog-images/dog-3.png">
  <link rel="stylesheet" href="/site.css">
  <style>
    .login-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      gap: 20px;
    }
    .login-box {
      border: var(--border);
      padding: 32px;
      max-width: 320px;
      width: 100%;
    }
    .login-box h2 {
      font-size: 0.82rem;
      margin-bottom: 16px;
      font-weight: 500;
    }
    .login-box input[type="password"] {
      font-family: 'DM Mono', monospace;
      font-size: 0.72rem;
      width: 100%;
      padding: 8px 10px;
      border: var(--border);
      background: var(--bg);
      margin-bottom: 12px;
    }
    .login-box input[type="password"]:focus {
      outline: 2px solid var(--ink);
      outline-offset: 1px;
    }
    .login-box button {
      font-family: 'DM Mono', monospace;
      font-size: 0.68rem;
      padding: 8px 18px;
      border: var(--border);
      background: var(--ink);
      color: var(--bg);
      cursor: pointer;
      width: 100%;
    }
    .login-box button:hover {
      background: var(--mid);
    }
    .login-error {
      font-size: 0.62rem;
      color: #b05858;
      margin-bottom: 10px;
    }
    .login-dog {
      width: 64px;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <header class="site-header">
    <div>
      <h1>private</h1>
      <p>this section requires a password</p>
    </div>
    <a class="back-link" href="/">&#8592; home</a>
  </header>
  <div class="main">
    <div class="login-wrap">
      <img src="/ugly-dog-images/dog-2.png" alt="" class="login-dog" />
      <div class="login-box">
        <h2>enter password</h2>
        ${error ? '<p class="login-error">wrong password, try again</p>' : ''}
        <form method="POST" action="/api/login">
          <input type="hidden" name="redirect" value="${returnTo}" />
          <input type="password" name="password" placeholder="password" autofocus required />
          <button type="submit">enter</button>
        </form>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const cookie = request.headers.get('cookie') || '';
  const authMatch = cookie.match(/__auth=([^;]+)/);

  if (authMatch) {
    const expected = await sha256(process.env.SITE_PASSWORD || '');
    if (authMatch[1] === expected) {
      return;
    }
  }

  const error = url.searchParams.has('error');
  const returnTo = url.pathname + url.search.replace(/[?&]error=1/, '');
  return new Response(loginPage(error, returnTo), {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
