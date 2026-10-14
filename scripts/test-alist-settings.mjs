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
  'template-download-btn',
  'export-log-btn',
  'xlsx-file',
  'xlsx-import-btn',
  'import-json',
  'import-json-example',
  'import-btn',
  'import-status',
  'settings-account',
  'bug-report',
  'bug-report-form',
  'bug-kind',
  'bug-note',
  'bug-report-submit',
  'bug-report-status',
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
assert.match(settings, /Download import template/, 'template download stays');
assert.match(settings, /Upload filled template/, 'xlsx upload stays');
assert.match(settings, /Export my watch log/, 'watch log export stays');
assert.match(settings, /Import JSON/, 'JSON import stays');
assert.doesNotMatch(settings, /A-List Tracking/, 'legacy tracking spreadsheet UI is gone');
assert.doesNotMatch(settings, /Upload spreadsheet/, 'legacy upload label is gone');
assert.match(settings, /data-nav-auth/, 'account / logout is on the page');
assert.match(settings, /bugReportApi\.create/, 'bug reports still post through the authenticated API');
assert.match(settings, /wireBugReport/, 'bug report form still wires');
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
  const howTo = settings.indexOf('renderHowToUseSection');
  const profile = settings.indexOf('al-settings-profile');
  const letterboxd = settings.indexOf('id="letterboxd-form"');
  const membership = settings.indexOf('id="membership-form"');
  const library = settings.indexOf('id="settings-data"');
  const bug = settings.indexOf('id="bug-report"');
  const account = settings.indexOf('id="settings-account"');
  assert.ok(howTo > -1 && howTo < profile, 'FAQ sits at the top of Settings');
  assert.ok(letterboxd > -1 && letterboxd < membership, 'Letterboxd sits in the top profile card');
  assert.ok(bug > library && bug < account, 'Report a bug or suggestion sits above account');
}

assert.match(css, /\.al-main--settings \{[\s\S]*max-width: 40rem/, 'desktop settings are not full-bleed');
assert.match(css, /body\[data-page="settings"\] \.page-main/, 'phone settings clear the sticky nav');
assert.match(css, /padding-bottom: calc\(120px/, 'phone settings leave room under the last card');
assert.match(css, /\.al-main--settings \.al-btn[\s\S]*min-height: 44px/, 'phone settings buttons are comfortable to tap');
assert.match(css, /#letterboxd-form \[hidden\]/, 'Letterboxd disconnect stays hidden until connected');
assert.match(css, /\.al-main--settings \.al-btn-primary \{[\s\S]*var\(--al-burgundy\)/, 'Save membership uses site maroon');
assert.match(css, /\.al-main--settings \.al-tier-row[\s\S]*minmax\(0, 1\.15fr\) minmax\(0, 1fr\) 44px/, 'rate rows stay a 3-column grid');
assert.match(css, /\.al-faq-q/, 'FAQ questions are styled');
assert.match(css, /\.al-faq-section-title/, 'FAQ section headings match how-to titles');
assert.match(css, /\.al-import-example/, 'JSON example uses the page font, not a code block');

const howToSrc = readFileSync(new URL('../amc-a-lister/engine/how-to-use.js', import.meta.url), 'utf8');
assert.match(howToSrc, /id="how-to-use"/, 'FAQ section keeps its anchor');
assert.match(howToSrc, /FAQ &amp; Set Up Instructions/, 'FAQ section uses the new title');
assert.match(howToSrc, /al-faq-section-title/, 'FAQ groups questions into sections');
assert.match(howToSrc, /al-faq-q/, 'FAQ questions are expandable');
assert.match(howToSrc, /Getting started/, 'FAQ has Getting started');
assert.match(howToSrc, /Can I use A-Lister like an app/, 'FAQ covers home-screen install');
assert.match(howToSrc, /Add to Home Screen/, 'FAQ has iPhone Safari steps');
assert.match(howToSrc, /iOS 26/, 'FAQ mentions the iOS 26 Share menu');
assert.match(howToSrc, /Add to Home screen/, 'FAQ has Android Chrome steps');
assert.match(howToSrc, /install icon in the address bar/, 'FAQ has desktop Chrome\/Edge steps');
assert.match(howToSrc, /Report a bug or suggestion/, 'FAQ points at the feedback form');
assert.match(howToSrc, /Logging &amp; watch log/, 'FAQ has Logging');
assert.match(howToSrc, /Membership pricing/, 'FAQ has pricing');
assert.match(howToSrc, /Import \/ export/, 'FAQ has import/export');
assert.match(howToSrc, /Sharing &amp; friends/, 'FAQ has sharing');
assert.match(howToSrc, /Leaderboard &amp; privacy/, 'FAQ has leaderboard');
assert.match(howToSrc, /Letterboxd/, 'FAQ has Letterboxd');
assert.match(howToSrc, /faqSection\('TV'/, 'FAQ has TV');
assert.match(howToSrc, /report a bug/, 'FAQ has troubleshooting');
assert.match(howToSrc, /\$0 row/, 'FAQ explains pause with a $0 row');
assert.match(howToSrc, /falsely high/, 'FAQ warns that pausing with logged movies inflates savings');
assert.match(howToSrc, /every calendar month from your first theater screening/, 'FAQ describes billed months as the code does');
assert.match(howToSrc, /do not go on the movie Rank stack/, 'FAQ does not put at-home watches on movie Rank');
assert.match(howToSrc, /Where do I see savings and habits/, 'FAQ covers Stats');
assert.match(howToSrc, /on or before the last day of that month/, 'FAQ matches monthlyRateForMonth');
assert.doesNotMatch(howToSrc, /<a |<em>|<code>|<strong>/, 'how-to copy is not mixed links/italics/code');
assert.doesNotMatch(howToSrc, /<details[^>]*\sopen/, 'how-to stays collapsed by default');

const dbSrc = readFileSync(new URL('../lib/db.js', import.meta.url), 'utf8');
assert.match(dbSrc, /CREATE TABLE IF NOT EXISTS alist_bug_reports/, 'schema creates alist_bug_reports safely');
assert.match(dbSrc, /ADD COLUMN IF NOT EXISTS kind/, 'existing bug-report tables gain kind');
const api = readFileSync(new URL('../api/alist.js', import.meta.url), 'utf8');
assert.match(api, /case 'bug-reports':/, 'bug-reports route is on api/alist.js');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.ok(
  vercel.rewrites.some((r) => r.source === '/api/alist-bug-reports' && r.destination === '/api/alist?route=bug-reports'),
  'rewrite for /api/alist-bug-reports',
);

const manifest = JSON.parse(readFileSync(new URL('../amc-a-lister/manifest.webmanifest', import.meta.url), 'utf8'));
assert.equal(manifest.display, 'standalone', 'installed A-Lister opens full-screen');
assert.equal(manifest.short_name, 'A-Lister');
assert.equal(manifest.theme_color, '#830f10');
assert.ok(manifest.icons.some((i) => i.sizes === '192x192'), 'manifest has a 192 icon');
assert.ok(manifest.icons.some((i) => i.sizes === '512x512'), 'manifest has a 512 icon');

for (const page of [
  'index.html',
  'tv.html',
  'settings.html',
  'sign-in.html',
  'rank.html',
  'what-to-watch.html',
  'statistics.html',
  'leaderboard.html',
  'member.html',
  'letterboxd.html',
  'bulk-add.html',
  'bulk-ratings.html',
]) {
  const html = readFileSync(new URL(`../amc-a-lister/${page}`, import.meta.url), 'utf8');
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/, `${page} links the manifest`);
  assert.match(html, /rel="apple-touch-icon" href="\.\/icons\/icon-192\.png"/, `${page} has an apple-touch-icon`);
  assert.match(html, /apple-mobile-web-app-title" content="A-Lister"/, `${page} names the home-screen app A-Lister`);
  assert.match(html, /apple-mobile-web-app-capable" content="yes"/, `${page} can open full-screen on iOS`);
}

console.log('alist settings layout tests passed');
