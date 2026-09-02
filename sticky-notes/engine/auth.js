import { loadNeonAuth, resolveNeonJwt, readStoredToken, storeAuthToken } from '../../engine/neon-browser-auth.js';
import { mountSignInForm, focusSignInForm } from '../../engine/sign-in-form.js';

let _neonAuth = null;
let _client = null;

export { storeAuthToken } from '../../engine/neon-browser-auth.js';

export const AUTH_FORM_ID = 'sn-auth';

export const STICKY_AUTH_CLASS_NAMES = {
  wrap: 'sn-auth-form',
  tabs: 'sn-auth-tabs',
  tab: 'sn-auth-tab',
  tabActive: 'is-active',
  form: 'sn-auth-body',
  formHidden: 'is-hidden',
  field: 'sn-auth-field',
  input: 'sn-auth-input',
  submit: 'sn-btn sn-btn-primary sn-auth-submit',
  error: 'sn-auth-error',
};

function offlineAuth() {
  const token = readStoredToken();
  return token
    ? { configured: true, signedIn: true, user: null, token, client: null, offline: true }
    : { configured: false, signedIn: false, user: null, token: null, client: null, offline: true };
}

/** Fallback when auth is not configured on this deployment. */
export function loginUrl() {
  return `/account.html?next=${encodeURIComponent(location.pathname + location.search)}`;
}

export function stickySignInCardHtml({ note = '' } = {}) {
  return `
    <div class="sn-auth-intro">
      <h2 class="sn-auth-title">Save your board</h2>
      <p class="sn-auth-copy">Sign in to sync notes across devices. Notes you made on this device can come with you.</p>
      ${note}
    </div>
    <div id="${AUTH_FORM_ID}"></div>
    <p class="sn-auth-small">Forgotten your password? There's no self-serve reset yet — get in touch and it can be changed for you.</p>
    <p class="sn-auth-small"><a href="/account.html">Manage account</a> for sign-out on other devices and account deletion.</p>
  `;
}

export function mountStickyAuthForm(container, { onSuccess } = {}) {
  return mountSignInForm(container, {
    id: AUTH_FORM_ID,
    classNames: STICKY_AUTH_CLASS_NAMES,
    onSuccess: async (result) => {
      storeAuthToken(result.token);
      if (onSuccess) await onSuccess(result);
      else location.reload();
    },
  });
}

export function renderStickySignIn(root, options = {}) {
  root.innerHTML = stickySignInCardHtml(options);
  return mountStickyAuthForm(root.querySelector(`#${AUTH_FORM_ID}`), {
    onSuccess: options.onSuccess,
  });
}

export function focusStickyAuthForm() {
  const wrap = document.getElementById(AUTH_FORM_ID);
  return focusSignInForm(wrap);
}

export async function initAuth() {
  let url = null;
  try {
    const res = await fetch('/api/auth-config');
    url = (await res.json()).url;
  } catch {
    return offlineAuth();
  }
  if (!url) return { configured: false, signedIn: false, user: null, token: null };

  let data;
  try {
    _neonAuth = await loadNeonAuth(url);
    _client = _neonAuth.adapter;
    ({ data } = await _client.getSession());
  } catch {
    return offlineAuth();
  }
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

export function wireAuthLink(state, { openSignIn } = {}) {
  const links = document.querySelectorAll('[data-nav-auth]');
  links.forEach((link) => {
    const fresh = link.cloneNode(true);
    link.replaceWith(fresh);

    if (!state.configured) {
      fresh.textContent = 'Account';
      fresh.href = loginUrl();
      return;
    }
    if (state.signedIn) {
      fresh.textContent = 'Log out';
      fresh.href = '#';
      fresh.addEventListener('click', async (e) => {
        e.preventDefault();
        storeAuthToken(null);
        if (state.client) await state.client.signOut();
        location.href = '/sticky-notes/';
      });
      return;
    }

    fresh.textContent = 'Sign in';
    fresh.href = '#signin';
    fresh.addEventListener('click', (e) => {
      e.preventDefault();
      if (openSignIn) {
        openSignIn({ expired: Boolean(state.needsReauth) });
        return;
      }
      if (focusStickyAuthForm()) return;
      location.hash = 'signin';
    });
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
