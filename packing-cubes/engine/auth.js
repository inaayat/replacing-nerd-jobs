import { loadNeonAuth, resolveNeonJwt, readStoredToken, storeAuthToken } from '../../engine/neon-browser-auth.js';
import { mountSignInForm, focusSignInForm } from '../../engine/sign-in-form.js';

let _neonAuth = null;
let _client = null;

export { storeAuthToken } from '../../engine/neon-browser-auth.js';

const AUTH_FORM_ID = 'pc-auth';

export const PACKING_AUTH_CLASS_NAMES = {
  wrap: 'pc-auth',
  tabs: 'pc-auth-tabs',
  tab: 'pc-auth-tab',
  tabActive: 'is-active',
  form: 'pc-auth-form',
  formHidden: 'hidden',
  field: 'pc-auth-field',
  input: 'pc-input',
  submit: 'pc-btn primary pc-gate-btn',
  error: 'pc-auth-error',
};

export function packingSignInCardHtml({ title, copy, note = '', art = '' } = {}) {
  return `
    <div class="pc-gate">
      <div class="pc-gate-card">
        ${art}
        <h1 class="pc-gate-title">${title}</h1>
        <p class="pc-gate-copy">${copy}</p>
        ${note}
        <div id="${AUTH_FORM_ID}"></div>
        <p class="pc-gate-small">Forgotten your password? There's no self-serve reset yet — get in touch and it can be changed for you.</p>
        <p class="pc-gate-small"><a href="/account.html">Manage account</a> for sign-out on other devices and account deletion.</p>
      </div>
    </div>
  `;
}

export function mountPackingAuthForm(container, { onSuccess } = {}) {
  return mountSignInForm(container, {
    id: AUTH_FORM_ID,
    classNames: PACKING_AUTH_CLASS_NAMES,
    onSuccess: async (result) => {
      storeAuthToken(result.token);
      if (onSuccess) await onSuccess(result);
      else location.reload();
    },
  });
}

export function renderPackingSignIn(root, options = {}) {
  root.innerHTML = packingSignInCardHtml(options);
  return mountPackingAuthForm(root.querySelector(`#${AUTH_FORM_ID}`), {
    onSuccess: options.onSuccess,
  });
}

export function focusPackingAuthForm() {
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

  const { data } = await clientSession();
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

async function clientSession() {
  return _client.getSession();
}

export function wireAuthLink(state) {
  const link = document.getElementById('nav-auth-link');
  if (!link) return;
  // boot() and the gate both call this; replace the node so click handlers
  // cannot stack.
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
      await state.client.signOut();
      location.href = '/packing-cubes/';
    });
    return;
  }

  fresh.textContent = 'Log in';
  fresh.href = `#${AUTH_FORM_ID}`;
  fresh.addEventListener('click', (e) => {
    if (focusPackingAuthForm()) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    location.href = '/packing-cubes/';
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
