import { loadNeonAuth, resolveNeonJwt } from '../../engine/neon-browser-auth.js';
import { storeAuthToken } from './auth.js';

function nextUrl() {
  const next = new URLSearchParams(location.search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/amc-a-lister/';
  return next;
}

function showError(message) {
  const errEl = document.getElementById('signin-error');
  if (!errEl) return;
  errEl.textContent = message;
  errEl.hidden = false;
}

async function waitForToken(neonAuth, client) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = await resolveNeonJwt(neonAuth, client);
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

async function goAfterAuth(neonAuth, client) {
  const token = await waitForToken(neonAuth, client);
  if (!token) {
    showError('Signed in, but could not start a session. Try again.');
    return;
  }
  storeAuthToken(token);
  location.replace(nextUrl());
}

async function init() {
  const root = document.getElementById('app-root');
  let authUrl = null;

  try {
    const res = await fetch('/api/auth-config');
    authUrl = (await res.json()).url;
  } catch {
    // handled below
  }

  if (!authUrl) {
    root.innerHTML = `
      <main class="al-signin-page">
        <section class="al-panel al-signin-panel">
          <h1 class="al-signin-title serif">Sign in unavailable</h1>
          <p class="al-muted">Neon Auth is not configured in this environment.</p>
          <p><a class="al-btn" href="/amc-a-lister/">← Back to A-Lister</a></p>
        </section>
      </main>
    `;
    return;
  }

  const neonAuth = await loadNeonAuth(authUrl);
  const client = neonAuth.adapter;
  const { data } = await client.getSession();

  if (data?.user) {
    await goAfterAuth(neonAuth, client);
    return;
  }

  root.innerHTML = `
    <main class="al-signin-page">
      <section class="al-panel al-signin-panel">
        <p class="al-signin-kicker brand-mono">AMC A-Lister</p>
        <h1 class="al-signin-title serif">Sign in</h1>
        <p class="al-signin-sub al-muted">Track screenings, savings, and theater habits.</p>
        <div class="al-signin-tabs" role="tablist" aria-label="Account">
          <button type="button" class="al-signin-tab is-active" id="tab-signin" role="tab" aria-selected="true">Sign in</button>
          <button type="button" class="al-signin-tab" id="tab-signup" role="tab" aria-selected="false">Sign up</button>
        </div>
        <form id="form-signin" class="al-signin-form">
          <label class="al-field">
            <span>Email</span>
            <input class="al-input" id="signin-email" type="email" autocomplete="email" required />
          </label>
          <label class="al-field">
            <span>Password</span>
            <input class="al-input" id="signin-password" type="password" autocomplete="current-password" required />
          </label>
          <button type="submit" class="al-btn al-btn-primary al-signin-submit">Sign in</button>
        </form>
        <form id="form-signup" class="al-signin-form" hidden>
          <label class="al-field">
            <span>Name</span>
            <input class="al-input" id="signup-name" type="text" autocomplete="name" required />
          </label>
          <label class="al-field">
            <span>Email</span>
            <input class="al-input" id="signup-email" type="email" autocomplete="email" required />
          </label>
          <label class="al-field">
            <span>Password</span>
            <input class="al-input" id="signup-password" type="password" autocomplete="new-password" minlength="8" required />
          </label>
          <button type="submit" class="al-btn al-btn-primary al-signin-submit">Create account</button>
        </form>
        <p id="signin-error" class="al-error al-signin-error" hidden></p>
        <p class="al-signin-back"><a href="/amc-a-lister/">← Back without signing in</a></p>
      </section>
    </main>
  `;

  const tabIn = document.getElementById('tab-signin');
  const tabUp = document.getElementById('tab-signup');
  const formIn = document.getElementById('form-signin');
  const formUp = document.getElementById('form-signup');

  tabIn.addEventListener('click', () => {
    tabIn.classList.add('is-active');
    tabUp.classList.remove('is-active');
    tabIn.setAttribute('aria-selected', 'true');
    tabUp.setAttribute('aria-selected', 'false');
    formIn.hidden = false;
    formUp.hidden = true;
  });

  tabUp.addEventListener('click', () => {
    tabUp.classList.add('is-active');
    tabIn.classList.remove('is-active');
    tabUp.setAttribute('aria-selected', 'true');
    tabIn.setAttribute('aria-selected', 'false');
    formUp.hidden = false;
    formIn.hidden = true;
  });

  formIn.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('signin-error').hidden = true;
    const { error } = await client.signIn.email({
      email: document.getElementById('signin-email').value,
      password: document.getElementById('signin-password').value,
    });
    if (error) showError(error.message || 'Sign-in failed.');
    else await goAfterAuth(neonAuth, client);
  });

  formUp.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('signin-error').hidden = true;
    const { error } = await client.signUp.email({
      name: document.getElementById('signup-name').value,
      email: document.getElementById('signup-email').value,
      password: document.getElementById('signup-password').value,
    });
    if (error) showError(error.message || 'Sign-up failed.');
    else await goAfterAuth(neonAuth, client);
  });
}

init().catch((err) => {
  console.error(err);
  const root = document.getElementById('app-root');
  if (root) {
    root.innerHTML = `<main class="al-signin-page"><section class="al-panel"><p class="al-error">${err.message || 'Could not load sign-in.'}</p></section></main>`;
  }
});
