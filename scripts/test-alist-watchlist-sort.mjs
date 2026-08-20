/**
 * Pure-function tests for A-Lister watchlist release sorting.
 * Run: node scripts/test-alist-watchlist-sort.mjs
 */
import { readFileSync } from 'node:fs';
import {
  sortAlreadyOut,
  sortComingSoon,
  combinedWatchlistItems,
  isAlreadyOut,
  releaseState,
  watchlistBucket,
  isInTheaters,
  isWatchAtHome,
  sortInTheaters,
  sortWatchAtHome,
  sortComingSoonTab,
  itemsForWatchlistView,
  theatricalCutoffISO,
  watchlistMatchesLogged,
  watchlistLogTableHtml,
} from '../amc-a-lister/engine/watchlist-ui.js';
import { monthsBeforeISO } from '../amc-a-lister/engine/dates.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  }
}

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${msg}\n  expected ${e}\n  got      ${a}`);
}

const today = '2026-08-11';

const items = [
  { id: '1', title: 'Tony', release_date: '2026-08-07' },
  { id: '2', title: 'Nimrods', release_date: '2026-08-06' },
  { id: '3', title: 'I Want Your Sex', release_date: '2026-07-29' },
  { id: '4', title: 'The End of Oak Street', release_date: '2026-08-12' },
  { id: '5', title: 'The Rivals of Amziah King', release_date: '2026-08-13' },
  { id: '6', title: 'Spa Weekend', release_date: '2026-08-20' },
];

assert(isAlreadyOut(items[0], today) === true, 'Aug 7 is already out');
assert(isAlreadyOut(items[3], today) === false, 'Aug 12 is coming soon');

assertEqual(
  sortAlreadyOut(items, today).map((i) => i.title),
  ['I Want Your Sex', 'Nimrods', 'Tony'],
  'already-out is oldest first',
);

assertEqual(
  sortComingSoon(items, today).map((i) => i.title),
  ['The End of Oak Street', 'The Rivals of Amziah King', 'Spa Weekend'],
  'coming soon is soonest first',
);

// Already-playing titles lead (oldest first); upcoming follow soonest-first.
assertEqual(
  combinedWatchlistItems(items, today).map((i) => i.release_date),
  [
    '2026-07-29',
    '2026-08-06',
    '2026-08-07',
    '2026-08-12',
    '2026-08-13',
    '2026-08-20',
  ],
  'combined list leads with already-out, then soonest upcoming',
);

// Undated entries sink after already-out and dated upcoming.
const withUndated = [
  { id: 'a', title: 'Dated soon', release_date: '2026-09-01' },
  { id: 'b', title: 'Year only', year: 2027 },
  { id: 'c', title: 'No date at all' },
  { id: 'd', title: 'Old release', release_date: '2020-01-01' },
];
assertEqual(
  combinedWatchlistItems(withUndated, today).map((i) => i.title),
  ['Old release', 'Dated soon', 'Year only', 'No date at all'],
  'already-out leads; undated titles sort last',
);

// A title with no date is "unknown", not "released" — it must not be badged
// "Already out". Unlinked rows are common now that auto-linking needs an exact
// title match.
assert(releaseState({ title: 'Unlinked' }, today) === 'unknown', 'no date at all is unknown');
assert(releaseState({ release_date: '2020-01-01' }, today) === 'released', 'past date is released');
assert(releaseState({ release_date: '2027-01-01' }, today) === 'upcoming', 'future date is upcoming');
assert(releaseState({ year: 2020 }, today) === 'released', 'past year is released');
assert(releaseState({ year: 2026 }, today) === 'upcoming', 'current year is still upcoming');
assert(isAlreadyOut({ title: 'Unlinked' }, today) === false, 'unknown is not badged as already out');

assertEqual(monthsBeforeISO(2, new Date(2026, 7, 11)), '2026-06-11', '2 calendar months before Aug 11');
assertEqual(theatricalCutoffISO(today), '2026-06-11', 'theatrical cutoff is 2 months back');

const bucketItems = [
  { id: 'future', title: 'Future', release_date: '2026-09-01' },
  { id: 'recent', title: 'Recent', release_date: '2026-07-01' },
  { id: 'edge', title: 'Edge', release_date: '2026-06-11' },
  { id: 'old', title: 'Old', release_date: '2026-06-10' },
  { id: 'classic', title: 'Classic', release_date: '2020-01-01' },
  { id: 'undated', title: 'Undated' },
];

assert(watchlistBucket(bucketItems[0], today) === 'coming-soon', 'future is coming soon');
assert(watchlistBucket(bucketItems[1], today) === 'in-theaters', 'July release is in theaters');
assert(watchlistBucket(bucketItems[2], today) === 'in-theaters', 'exactly 2 months is still in theaters');
assert(watchlistBucket(bucketItems[3], today) === 'watch-at-home', 'just over 2 months is watch at home');
assert(watchlistBucket(bucketItems[4], today) === 'watch-at-home', 'classic is watch at home');
assert(watchlistBucket(bucketItems[5], today) === 'unknown', 'undated stays unknown');

assert(isInTheaters(bucketItems[1], today) === true, 'recent is in theaters');
assert(isWatchAtHome(bucketItems[4], today) === true, 'classic is watch at home');

const overriddenFuture = {
  ...bucketItems[0],
  id: 'future-home',
  watch_at_home_override: true,
};
const overriddenRecent = {
  ...bucketItems[1],
  id: 'recent-home',
  watch_at_home_override: true,
};
assert(
  watchlistBucket(overriddenFuture, today) === 'watch-at-home',
  'future release can be manually sent to watch at home',
);
assert(
  watchlistBucket(overriddenRecent, today) === 'watch-at-home',
  'recent theatrical release can be manually sent to watch at home',
);
assert(
  watchlistBucket({ ...overriddenFuture, watch_at_home_override: false }, today) === 'coming-soon',
  'clearing override restores the automatic future bucket',
);
assert(
  watchlistBucket({ ...overriddenRecent, watch_at_home_override: false }, today) === 'in-theaters',
  'clearing override restores the automatic theatrical bucket',
);

assertEqual(
  sortInTheaters(bucketItems, today).map((i) => i.title),
  ['Recent', 'Edge'],
  'in theaters is newest first',
);

assertEqual(
  sortWatchAtHome(bucketItems, today).map((i) => i.title),
  ['Old', 'Classic'],
  'watch at home is newest first',
);

assertEqual(
  itemsForWatchlistView(bucketItems, 'coming-soon', today).map((i) => i.title),
  ['Edge', 'Recent', 'Future', 'Undated'],
  'coming soon tab merges in-theaters + upcoming, oldest first',
);

assertEqual(
  sortComingSoonTab(bucketItems, today).map((i) => i.release_date || i.title),
  ['2026-06-11', '2026-07-01', '2026-09-01', 'Undated'],
  'coming soon tab sort is ascending by release',
);

assertEqual(
  itemsForWatchlistView(bucketItems, 'watch-at-home', today).map((i) => i.title),
  ['Old', 'Classic'],
  'watch at home tab',
);

const withOverrides = [...bucketItems, overriddenFuture, overriddenRecent];
assertEqual(
  itemsForWatchlistView(withOverrides, 'coming-soon', today).map((i) => i.id),
  ['edge', 'recent', 'future', 'undated'],
  'overridden titles leave Coming Soon while automatic titles keep current sorting',
);
assertEqual(
  itemsForWatchlistView(withOverrides, 'watch-at-home', today).map((i) => i.id),
  ['future-home', 'recent-home', 'old', 'classic'],
  'overridden future and theatrical titles appear on Watch at Home',
);

assert(watchlistMatchesLogged(
  { id: '1', title: 'Dune', tmdb_id: 438631 },
  { tmdb_id: 438631, title: 'Other name' },
), 'tmdb id match clears want-list row');
assert(watchlistMatchesLogged(
  { id: '1', title: 'Dune', tmdb_id: null },
  { title: 'dune' },
), 'title match clears unlinked want-list row');
assert(!watchlistMatchesLogged(
  { id: '1', title: 'Dune', tmdb_id: 1 },
  { tmdb_id: 2, title: 'Something Else' },
), 'unrelated log does not match');

function detailsState(overrides = {}) {
  return {
    expandedId: null,
    editingId: null,
    detailsCache: new Map(),
    detailsLoading: null,
    detailsError: null,
    ...overrides,
  };
}

function articleTag(html) {
  const m = html.match(/<article\b[^>]*>/);
  return m ? m[0] : '';
}

const expandItems = [
  { id: 'cs1', title: 'Future Film', release_date: '2026-09-01', notes: 'IMAX', tmdb_id: 11 },
  { id: 'home1', title: 'Old Film', release_date: '2020-01-01', tmdb_id: 22 },
];

for (const view of ['coming-soon', 'watch-at-home']) {
  const html = watchlistLogTableHtml(expandItems, detailsState(), { view });
  const row = articleTag(html);
  assert(row.includes('data-expand-row'), `${view} row is marked expandable like the watch log`);
  assert(row.includes('al-log-row--clickable'), `${view} row is clickable like the watch log`);
  assert(row.includes('data-entry-id="cs1"'), `${view} clickable row carries the entry id`);
  assert(row.includes('aria-label="Toggle details"'), `${view} row uses the log toggle label`);
  assert(!row.includes('role="button"'), `${view} row is not role=button (action buttons live inside it)`);
  assert(!html.includes('al-log-detail'), `${view} collapsed row has no detail panel`);
}

const expandedSoon = watchlistLogTableHtml(expandItems, detailsState({ expandedId: 'cs1' }), { view: 'coming-soon' });
assert(expandedSoon.includes('is-expanded'), 'Coming Soon expanded row is marked');
assert(expandedSoon.includes('al-log-detail'), 'Coming Soon expand shows the detail panel');
assert((expandedSoon.match(/is-expanded/g) || []).length >= 2, 'Coming Soon expand marks entry and row');

const expandedHome = watchlistLogTableHtml(expandItems, detailsState({ expandedId: 'home1' }), { view: 'watch-at-home' });
assert(expandedHome.includes('is-expanded'), 'Watch at Home expanded row is marked');
assert(expandedHome.includes('al-log-detail'), 'Watch at Home expand shows the detail panel');
assert(expandedHome.includes('Watch at home'), 'Watch at Home keeps its badge when expanded');

const comingSoonActions = watchlistLogTableHtml(
  [bucketItems[0]],
  detailsState(),
  { view: 'coming-soon' },
);
assert(
  comingSoonActions.includes('data-watchlist-home-override="true"'),
  'Coming Soon row has an in-place Watch at Home action',
);
assert(comingSoonActions.includes('Watch at home</button>'), 'home override action has a clear label');

const overriddenHomeActions = watchlistLogTableHtml(
  [overriddenFuture],
  detailsState(),
  { view: 'watch-at-home' },
);
assert(
  overriddenHomeActions.includes('data-watchlist-home-override="false"'),
  'overridden Watch at Home row can return to automatic sorting',
);
assert(overriddenHomeActions.includes('Use automatic</button>'), 'undo action has a clear label');

const automaticHomeActions = watchlistLogTableHtml(
  [bucketItems[4]],
  detailsState(),
  { view: 'watch-at-home' },
);
assert(
  !automaticHomeActions.includes('data-watchlist-home-override'),
  'naturally aged Watch at Home title does not show a redundant override action',
);

const collapsedAgain = watchlistLogTableHtml(expandItems, detailsState({ expandedId: null }), { view: 'coming-soon' });
assert(!collapsedAgain.includes('is-expanded'), 'clearing expandedId collapses Coming Soon again');
assert(!collapsedAgain.includes('al-log-detail'), 'collapsed Coming Soon hides the detail panel');

// The row markup above was already right; expand still did nothing because the
// Coming Soon / Watch at Home tab handler was bound with a bare [data-wtw-view]
// query that also matched the list wrapper. Every tap inside the list therefore
// ran the tab handler, which sets expandedId = null and re-renders.
const wtwSource = readFileSync(new URL('../amc-a-lister/engine/what-to-watch.js', import.meta.url), 'utf8');

const listWrapTag = wtwSource.match(/<div[^>]*id="watchlist-list"[^>]*>/)?.[0] || '';
assert(listWrapTag !== '', 'what-to-watch renders a #watchlist-list wrapper');
const wrapDataAttrs = [...listWrapTag.matchAll(/\s(data-[\w-]+)=/g)].map((m) => m[1]);

const bareAttrSelectors = [...wtwSource.matchAll(/querySelectorAll\('\[(data-[\w-]+)\]'\)/g)].map((m) => m[1]);
for (const attr of bareAttrSelectors) {
  assert(
    !wrapDataAttrs.includes(attr),
    `unscoped [${attr}] query also matches the row list wrapper, so list taps run that handler`,
  );
}

const uiSource = readFileSync(new URL('../amc-a-lister/engine/watchlist-ui.js', import.meta.url), 'utf8');
assert(
  /wireWatchlistRowExpand\(listEl, toggleExpand\);/.test(uiSource),
  'watchlist rows rebind expand after every render, like the watch log',
);

const apiSource = readFileSync(new URL('../api/alist.js', import.meta.url), 'utf8');
const listSource = readFileSync(new URL('../lib/a-list.js', import.meta.url), 'utf8');
const dbSource = readFileSync(new URL('../lib/db.js', import.meta.url), 'utf8');
assert(
  apiSource.includes('watch_at_home_override'),
  'watchlist API accepts and persists the home override',
);
assert(
  listSource.includes('watch_at_home_override'),
  'watchlist API responses expose the persisted home override',
);
assert(
  /ALTER TABLE alist_watchlist[\s\S]*ADD COLUMN IF NOT EXISTS watch_at_home_override/.test(dbSource),
  'watchlist schema migrates existing databases with the home override column',
);

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
