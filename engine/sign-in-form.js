/**
 * Shared email/password sign-in + sign-up form for static pages.
 *
 * Markup is class-prefixed so each app paints it; the submit path is always
 * `loginViaApi` → `onSuccess({ token, user, mode })`. Account delete and other
 * settings stay on `/account.html`.
 */
import { loginViaApi } from './neon-browser-auth.js';

const DEFAULT_CLASS_NAMES = {
  wrap: 'signin-form',
  tabs: 'signin-tabs',
  tab: 'signin-tab',
  tabActive: 'is-active',
  form: 'signin-form-body',
  formHidden: 'is-hidden',
  field: 'signin-field',
  input: 'signin-input',
  submit: 'signin-submit',
  error: 'signin-error',
};

export function signInFormClassNames(overrides = {}) {
  return { ...DEFAULT_CLASS_NAMES, ...overrides };
}

export function signInFormMarkup({ id = 'signin', classNames = {} } = {}) {
  if (!/^[A-Za-z][\w-]*$/.test(id)) {
    throw new Error('sign-in form id must be a simple HTML id');
  }
  const c = signInFormClassNames(classNames);
  const ids = {
    wrap: id,
    tablist: `${id}-tabs`,
    tabSignIn: `${id}-tab-signin`,
    tabSignUp: `${id}-tab-signup`,
    formSignIn: `${id}-form-signin`,
    formSignUp: `${id}-form-signup`,
    emailIn: `${id}-signin-email`,
    passwordIn: `${id}-signin-password`,
    nameUp: `${id}-signup-name`,
    emailUp: `${id}-signup-email`,
    passwordUp: `${id}-signup-password`,
    error: `${id}-error`,
  };

  const html = `
    <div class="${c.wrap}" data-signin-form="${id}">
      <div class="${c.tabs}" id="${ids.tablist}" role="tablist" aria-label="Account">
        <button type="button" class="${c.tab} ${c.tabActive}" id="${ids.tabSignIn}" role="tab" aria-selected="true" aria-controls="${ids.formSignIn}">Sign in</button>
        <button type="button" class="${c.tab}" id="${ids.tabSignUp}" role="tab" aria-selected="false" aria-controls="${ids.formSignUp}">Sign up</button>
      </div>
      <form id="${ids.formSignIn}" class="${c.form}" data-mode="signin">
        <label class="${c.field}">
          <span>Email</span>
          <input class="${c.input}" id="${ids.emailIn}" type="email" autocomplete="email" required />
        </label>
        <label class="${c.field}">
          <span>Password</span>
          <input class="${c.input}" id="${ids.passwordIn}" type="password" autocomplete="current-password" required />
        </label>
        <button type="submit" class="${c.submit}">Sign in</button>
      </form>
      <form id="${ids.formSignUp}" class="${c.form} ${c.formHidden}" data-mode="signup" hidden>
        <label class="${c.field}">
          <span>Name</span>
          <input class="${c.input}" id="${ids.nameUp}" type="text" autocomplete="name" required />
        </label>
        <label class="${c.field}">
          <span>Email</span>
          <input class="${c.input}" id="${ids.emailUp}" type="email" autocomplete="email" required />
        </label>
        <label class="${c.field}">
          <span>Password</span>
          <input class="${c.input}" id="${ids.passwordUp}" type="password" autocomplete="new-password" minlength="8" required />
        </label>
        <button type="submit" class="${c.submit}">Create account</button>
      </form>
      <p id="${ids.error}" class="${c.error}" hidden></p>
    </div>
  `;

  return { html, ids, classNames: c };
}

function setMode(container, ids, classNames, mode) {
  const isSignIn = mode === 'signin';
  const tabIn = container.querySelector(`#${ids.tabSignIn}`);
  const tabUp = container.querySelector(`#${ids.tabSignUp}`);
  const formIn = container.querySelector(`#${ids.formSignIn}`);
  const formUp = container.querySelector(`#${ids.formSignUp}`);
  tabIn.classList.toggle(classNames.tabActive, isSignIn);
  tabUp.classList.toggle(classNames.tabActive, !isSignIn);
  tabIn.setAttribute('aria-selected', String(isSignIn));
  tabUp.setAttribute('aria-selected', String(!isSignIn));
  formIn.classList.toggle(classNames.formHidden, !isSignIn);
  formUp.classList.toggle(classNames.formHidden, isSignIn);
  formIn.hidden = !isSignIn;
  formUp.hidden = isSignIn;
  hideError(container, ids);
}

function hideError(container, ids) {
  const err = container.querySelector(`#${ids.error}`);
  if (!err) return;
  err.hidden = true;
  err.textContent = '';
}

function showError(container, ids, message) {
  const err = container.querySelector(`#${ids.error}`);
  if (!err) return;
  err.textContent = message;
  err.hidden = false;
}

export function focusSignInForm(container) {
  if (!container) return false;
  const visible = container.querySelector('form:not([hidden]) input[type="email"]')
    || container.querySelector('input[type="email"]');
  container.scrollIntoView({ block: 'center', behavior: 'smooth' });
  visible?.focus();
  return true;
}

/**
 * Paint the form into `container` and wire tabs + submit.
 * `login` is injectable so tests can exercise the submit path without Neon.
 */
export function mountSignInForm(container, {
  id = 'signin',
  classNames,
  login = loginViaApi,
  onSuccess,
} = {}) {
  if (!container) throw new Error('mountSignInForm needs a container');
  const { html, ids, classNames: resolved } = signInFormMarkup({ id, classNames });
  container.innerHTML = html;

  const tabIn = container.querySelector(`#${ids.tabSignIn}`);
  const tabUp = container.querySelector(`#${ids.tabSignUp}`);
  const formIn = container.querySelector(`#${ids.formSignIn}`);
  const formUp = container.querySelector(`#${ids.formSignUp}`);

  tabIn.addEventListener('click', () => setMode(container, ids, resolved, 'signin'));
  tabUp.addEventListener('click', () => setMode(container, ids, resolved, 'signup'));

  async function submit(event, mode) {
    event.preventDefault();
    hideError(container, ids);
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const payload = mode === 'signup'
        ? {
          name: container.querySelector(`#${ids.nameUp}`).value,
          email: container.querySelector(`#${ids.emailUp}`).value,
          password: container.querySelector(`#${ids.passwordUp}`).value,
          mode: 'signup',
        }
        : {
          email: container.querySelector(`#${ids.emailIn}`).value,
          password: container.querySelector(`#${ids.passwordIn}`).value,
          mode: 'signin',
        };
      const { error, token, user } = await login(payload);
      if (error) {
        showError(container, ids, error.message || (mode === 'signup' ? 'Sign-up failed.' : 'Sign-in failed.'));
        return;
      }
      if (!token) {
        showError(container, ids, mode === 'signup'
          ? 'Account created, but could not start a session. Try signing in.'
          : 'Signed in, but could not start a session. Try again.');
        if (mode === 'signup') setMode(container, ids, resolved, 'signin');
        return;
      }
      if (onSuccess) await onSuccess({ token, user, mode });
    } finally {
      submitBtn.disabled = false;
    }
  }

  formIn.addEventListener('submit', (e) => submit(e, 'signin'));
  formUp.addEventListener('submit', (e) => submit(e, 'signup'));

  return {
    ids,
    setMode: (mode) => setMode(container, ids, resolved, mode),
    focus: () => focusSignInForm(container),
  };
}
