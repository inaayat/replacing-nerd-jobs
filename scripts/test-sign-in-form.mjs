/**
 * Markup tests for the shared sign-in form. The submit path calls
 * `loginViaApi` and is the same helper account.html / A-Lister already use.
 */
import assert from 'node:assert/strict';
import { signInFormMarkup, signInFormClassNames } from '../engine/sign-in-form.js';

const { html, ids, classNames } = signInFormMarkup({ id: 'pc-auth' });
assert.equal(ids.wrap, 'pc-auth');
assert.equal(ids.emailIn, 'pc-auth-signin-email');
assert.equal(ids.emailUp, 'pc-auth-signup-email');
assert.equal(ids.tabSignIn, 'pc-auth-tab-signin');
assert.match(html, /type="email"/g);
assert.match(html, /type="password"/g);
assert.match(html, /autocomplete="email"/);
assert.match(html, /autocomplete="current-password"/);
assert.match(html, /autocomplete="new-password"/);
assert.match(html, /autocomplete="name"/);
assert.match(html, /minlength="8"/);
assert.match(html, /Create account/);
assert.match(html, />Sign in</);
assert.match(html, />Sign up</);
assert.ok(html.includes(`id="${ids.formSignIn}"`));
assert.ok(html.includes(`id="${ids.formSignUp}"`));
assert.ok(html.includes('hidden'), 'sign-up form starts hidden');
assert.equal(classNames.tabActive, 'is-active');

const painted = signInFormMarkup({
  id: 'gate',
  classNames: { input: 'pc-input', submit: 'pc-btn primary', formHidden: 'hidden' },
});
assert.match(painted.html, /class="pc-input"/);
assert.match(painted.html, /class="pc-btn primary"/);
assert.match(painted.html, /class="signin-form-body hidden"/);
assert.equal(signInFormClassNames({ input: 'pc-input' }).wrap, 'signin-form');

const other = signInFormMarkup({ id: 'alist' });
assert.notEqual(other.ids.emailIn, ids.emailIn);
assert.throws(() => signInFormMarkup({ id: 'bad id' }), /simple HTML id/);
assert.throws(() => signInFormMarkup({ id: '../x' }), /simple HTML id/);

console.log('sign-in form tests passed');
