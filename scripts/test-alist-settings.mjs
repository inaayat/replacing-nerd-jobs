import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settings = readFileSync(new URL('../amc-a-lister/engine/settings.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../amc-a-lister/engine/app.css', import.meta.url), 'utf8');

for (const id of [
  'membership-form',
  'display_name',
  'price-tiers',
  'add-tier',
  'public_profile',
  'public-profile-detail',
  'username',
  'public_hide_theaters',
  'membership-status',
  'sent-invites',
  'sent-invites-list',
  'sent-invites-status',
  'letterboxd-form',
  'letterboxd-username',
  'letterboxd-save',
  'letterboxd-clear',
  'letterboxd-review',
  'letterboxd-status',
  'beta-tv',
  'beta-tv-status',
  'backfill-btn',
  'backfill-status',
  'xlsx-file',
  'xlsx-import-btn',
  'import-json',
  'import-btn',
  'import-status',
  'settings-account',
]) {
  assert.match(settings, new RegExp(`id="${id}"`), `settings still has #${id}`);
}

assert.match(settings, /al-main--settings/, 'settings uses the grouped layout');
assert.match(settings, /Name &amp; visibility/, 'profile is its own section');
assert.match(settings, /Monthly rates/, 'billing stays');
assert.match(settings, /Invites you sent/, 'sent invites stay');
assert.match(settings, /Letterboxd/, 'Letterboxd stays');
assert.match(settings, /Beta/, 'beta features stay');
assert.match(settings, /Backfill posters/, 'poster backfill stays');
assert.match(settings, /Upload spreadsheet/, 'xlsx import stays');
assert.match(settings, /Import JSON/, 'JSON import stays');
assert.match(settings, /data-nav-auth/, 'account / logout is on the page');
assert.match(settings, /href="\/account.html"/, 'Account still links to account.html');
assert.match(settings, /scope: 'all'/, 'backfill still runs for every account');
assert.match(settings, /i < 50/, 'backfill still loops batches');
assert.match(settings, /wireSentInvites/, 'sent invites still load');
assert.match(settings, /wireLetterboxdSettings/, 'Letterboxd still wires');

assert.match(css, /\.al-main--settings \{[\s\S]*max-width: 40rem/, 'desktop settings are not full-bleed');
assert.match(css, /body\[data-page="settings"\] \.page-main/, 'phone settings clear the sticky nav');
assert.match(css, /padding-bottom: calc\(108px/, 'phone settings leave room under the last card');
assert.match(css, /\.al-main--settings \.al-btn[\s\S]*min-height: 44px/, 'phone settings buttons are comfortable to tap');
assert.match(css, /#letterboxd-form \[hidden\]/, 'Letterboxd disconnect stays hidden until connected');

console.log('alist settings layout tests passed');
