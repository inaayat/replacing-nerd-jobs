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
assert.match(settings, /Letterboxd username/, 'Letterboxd stays in profile');
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
assert.match(settings, /closest\('\.tier-remove'\)/, 'remove still works when the icon is clicked');
assert.match(settings, /al-tier-price-prefix/, 'price inputs show a $ prefix');
assert.match(settings, /al-tier-remove-spacer/, 'every rate row keeps a remove column');
assert.match(settings, /form="membership-form"/, 'profile fields still submit with membership');

{
  const letterboxd = settings.indexOf('id="letterboxd-form"');
  const membership = settings.indexOf('id="membership-form"');
  const howTo = settings.lastIndexOf('renderHowToUseSection');
  const library = settings.indexOf('id="settings-data"');
  const account = settings.indexOf('id="settings-account"');
  assert.ok(letterboxd > -1 && letterboxd < membership, 'Letterboxd sits in the top profile card');
  assert.ok(howTo > library && howTo < account, 'How to use sits below settings, above account');
}

assert.match(css, /\.al-main--settings \{[\s\S]*max-width: 40rem/, 'desktop settings are not full-bleed');
assert.match(css, /body\[data-page="settings"\] \.page-main/, 'phone settings clear the sticky nav');
assert.match(css, /padding-bottom: calc\(120px/, 'phone settings leave room under the last card');
assert.match(css, /\.al-main--settings \.al-btn[\s\S]*min-height: 44px/, 'phone settings buttons are comfortable to tap');
assert.match(css, /#letterboxd-form \[hidden\]/, 'Letterboxd disconnect stays hidden until connected');
assert.match(css, /\.al-main--settings \.al-btn-primary \{[\s\S]*var\(--al-burgundy\)/, 'Save membership uses site maroon');
assert.match(css, /\.al-main--settings \.al-tier-row[\s\S]*minmax\(0, 1\.15fr\) minmax\(0, 1fr\) 44px/, 'rate rows stay a 3-column grid');

const howToSrc = readFileSync(new URL('../amc-a-lister/engine/how-to-use.js', import.meta.url), 'utf8');
assert.match(howToSrc, /al-howto-item-title/, 'how-to uses one heading style per item');
assert.doesNotMatch(howToSrc, /<a |<em>|<code>|<strong>/, 'how-to copy is not mixed links/italics/code');
assert.doesNotMatch(howToSrc, /<details[^>]*\sopen/, 'how-to stays collapsed by default');

console.log('alist settings layout tests passed');
