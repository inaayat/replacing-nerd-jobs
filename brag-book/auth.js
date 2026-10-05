import { loadNeonAuth, resolveNeonJwt, readStoredToken, storeAuthToken } from '../engine/neon-browser-auth.js';
import { mountSignInForm, focusSignInForm } from '../engine/sign-in-form.js';

let _neonAuth = null;
let _client = null;

export { storeAuthToken } from '../engine/neon-browser-auth.js';

const AUTH_FORM_ID = 'bb-auth';

export const BRAG_AUTH_CLASS_NAMES = {
  wrap: 'bb-auth',
  tabs: 'bb-auth-tabs',
  tab: 'bb-auth-tab',
  tabActive: 'is-active',
  form: 'bb-auth-form',
  formHidden: 'hidden',
  field: 'bb-auth-field',
  input: 'bb-input',
  submit: 'btn bb-gate-btn',
  error: 'bb-auth-error',
};

export function bragSignInCardHtml({ title, copy, note = '', art = '' } = {}) {
  return `
    <div class="bb-gate">
      <div class="bb-gate-card">
        ${art}
        <h1 class="bb-gate-title">${title}</h1>
        <p class="bb-gate-copy">${copy}</p>
        ${note}
        <div id="${AUTH_FORM_ID}"></div>
        <p class="bb-gate-small">Forgotten your password? There's no self-serve reset yet — get in touch and it can be changed for you.</p>
        <p class="bb-gate-small"><a href="/account.html">Manage account</a> for sign-out on other devices and account deletion.</p>
      </div>
    </div>
  `;
}

export function mountBragAuthForm(container, { onSuccess } = {}) {
  return mountSignInForm(container, {
    id: AUTH_FORM_ID,
    classNames: BRAG_AUTH_CLASS_NAMES,
    onSuccess: async (result) => {
      storeAuthToken(result.token);
      if (onSuccess) await onSuccess(result);
      else location.reload();
    },
  });
}

export function renderBragSignIn(root, options = {}) {
  root.innerHTML = bragSignInCardHtml(options);
  return mountBragAuthForm(root.querySelector(`#${AUTH_FORM_ID}`), {
    onSuccess: options.onSuccess,
  });
}

export function focusBragAuthForm() {
  const wrap = document.getElementById(AUTH_FORM_ID);
  return focusSignInForm(wrap);
}

export async function initAuth() {
  let url = null;
  try {
    const res = await fetch('/api/auth-config');
    url = (await res.json()).url;
  } catch {
    return { configured: false, signedIn: false, user: null, token: null };
  }
  if (!url) return { configured: false, signedIn: false, user: null, token: null };

  _neonAuth = await loadNeonAuth(url);
  _client = _neonAuth.adapter;

  const { data } = await _client.getSession();
  let user = data?.user || null;
  let token = user ? await resolveNeonJwt(_neonAuth, _client) : null;
  if (!token && user) token = readStoredToken();

  if (!user) {
    const stored = readStoredToken();
    if (stored) {
      try {
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${stored}` } });
        if (res.ok) {
          const { user: profile } = await res.json();
          user = { id: profile.id, email: profile.email, name: profile.name };
          token = stored;
        } else {
          storeAuthToken(null);
        }
      } catch {
        storeAuthToken(null);
      }
    }
  }

  if (token) storeAuthToken(token);

  return {
    configured: true,
    signedIn: !!user && !!token,
    needsReauth: !!user && !token,
    user,
    token,
    client: _client,
  };
}

export function wireAuthLink(state) {
  const link = document.getElementById('nav-auth-link');
  if (!link) return;
  const fresh = link.cloneNode(true);
  link.replaceWith(fresh);

  if (!state.configured) {
    fresh.textContent = 'Account';
    fresh.href = '/account.html';
    return;
  }

  if (state.signedIn) {
    fresh.textContent = 'Log out';
    fresh.href = '#';
    fresh.addEventListener('click', async (e) => {
      e.preventDefault();
      storeAuthToken(null);
      if (state.client) await state.client.signOut();
      location.href = '/brag-book/';
    });
    return;
  }

  fresh.textContent = 'Log in';
  fresh.href = `#${AUTH_FORM_ID}`;
  fresh.addEventListener('click', (e) => {
    if (focusBragAuthForm()) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    location.href = '/brag-book/';
  });
}

export async function refreshToken(state) {
  if (!_neonAuth || !state.user) return null;
  state.token = await resolveNeonJwt(_neonAuth, _client);
  if (!state.token) state.token = readStoredToken();
  state.signedIn = !!state.user && !!state.token;
  state.needsReauth = !!state.user && !state.token;
  storeAuthToken(state.token);
  return state.token;
}
