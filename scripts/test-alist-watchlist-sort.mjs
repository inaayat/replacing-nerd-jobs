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
  sortWatchAtHomeByRelease,
  sortComingSoonTab,
  sortWantList,
  sortWantMoviesForProfile,
  itemsForWatchlistView,
  theatricalCutoffISO,
  watchlistMatchesLogged,
  watchlistLogTableHtml,
} from '../amc-a-lister/engine/watchlist-ui.js';
import {
  isWantRanked,
  sortByWantPriority,
  applyWantDragOrder,
  mergeWantPriorities,
  wantRanksPayload,
  normalizeWantRanks,
} from '../amc-a-lister/engine/want-order.js';
import { sharedWatchlistItems } from '../amc-a-lister/engine/watchlist-match.js';
import { monthsBeforeISO } from '../amc-a-lister/engine/dates.js';
import { shortDate } from '../amc-a-lister/engine/format.js';

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
  assert(html.includes('class="al-watchlist-grid"'), `${view} renders a poster grid`);
  assert(!html.includes('al-log-head'), `${view} grid has no table header`);
  const card = html.slice(html.indexOf('data-entry-id="cs1"'));
  const titleAt = card.indexOf('al-watchlist-card-title');
  const dateAt = card.indexOf('al-watchlist-card-date');
  assert(titleAt !== -1 && dateAt > titleAt, `${view} release date sits below the title`);
  assert(card.includes(shortDate('2026-09-01')), `${view} card prints the release date`);
  assert(card.includes('al-watchlist-card-poster'), `${view} card leads with the poster`);
  assert(card.indexOf('al-watchlist-card-poster') < titleAt, `${view} poster sits above the title`);
}

const tvWantHtml = watchlistLogTableHtml(expandItems, detailsState(), { logLabel: 'Log watched' });
assert(tvWantHtml.includes('class="al-watchlist-grid"'), 'TV want-list uses the same poster grid');
assert(tvWantHtml.includes('aria-label="Log watched"'), 'TV card keeps its log action');
assert(tvWantHtml.includes('al-watchlist-icon-btn'), 'TV card actions are icon buttons');
assert(tvWantHtml.includes('Already out'), 'already-aired TV titles keep their badge on the poster');
const tvCard = tvWantHtml.slice(tvWantHtml.indexOf('data-entry-id="cs1"'));
assert(
  tvCard.indexOf('al-watchlist-card-title') < tvCard.indexOf('al-watchlist-card-date'),
  'TV release date sits below the title',
);

const editingGrid = watchlistLogTableHtml(
  expandItems,
  detailsState({ editingId: 'cs1' }),
  { view: 'coming-soon' },
);
assert(editingGrid.includes('al-watchlist-grid-item--editing'), 'edit form spans the poster grid');
assert(editingGrid.includes('data-watchlist-edit-form="cs1"'), 'edit form stays wired inside the grid');

const gridCssStart = readFileSync(new URL('../amc-a-lister/engine/app.css', import.meta.url), 'utf8');
const gridCss = gridCssStart.slice(
  gridCssStart.indexOf('/* Coming Soon / Watch at Home'),
  gridCssStart.indexOf('.al-watchlist-edit-fields'),
);
assert(gridCss.includes('repeat(3, minmax(0, 1fr))'), 'phones use three poster columns');
assert(!/repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(gridCss), 'the phone grid is not two across');
assert(gridCss.includes('repeat(auto-fill, minmax(160px, 1fr))'), 'desktop poster grid fills the row');
assert(gridCss.includes('.al-watchlist-card-date'), 'release date has its own line under the title');
const titleRule = gridCss.slice(gridCss.indexOf('.al-watchlist-card-title {'), gridCss.indexOf('.al-watchlist-card-date {'));
assert(!/height:\s*2\.5em/.test(titleRule), 'title does not reserve a blank second line above the date');
const dateRule = gridCss.slice(gridCss.indexOf('.al-watchlist-card-date {'), gridCss.indexOf('.al-watchlist-card-notes'));
assert(/margin:\s*1px 0 0/.test(dateRule), 'release date sits tight under the title');
const actionRule = gridCss.slice(gridCss.indexOf('.al-watchlist-card-actions {'), gridCss.indexOf('.al-watchlist-grid .al-log-detail'));
assert(/flex-wrap:\s*nowrap/.test(actionRule), 'card actions stay on one line');

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
assert(comingSoonActions.includes('aria-label="Watch at home"'), 'home override action has a clear label');
assert(comingSoonActions.includes('aria-label="Edit"'), 'edit action keeps its name on the icon');
assert(comingSoonActions.includes('aria-label="Remove"'), 'remove action keeps its name on the icon');
assert(comingSoonActions.includes('al-watchlist-icon'), 'card actions draw icons instead of text labels');

const overriddenHomeActions = watchlistLogTableHtml(
  [overriddenFuture],
  detailsState(),
  { view: 'watch-at-home' },
);
assert(
  overriddenHomeActions.includes('data-watchlist-home-override="false"'),
  'overridden Watch at Home row can return to automatic sorting',
);
assert(overriddenHomeActions.includes('aria-label="Use automatic"'), 'undo action has a clear label');

const automaticHomeActions = watchlistLogTableHtml(
  [bucketItems[4]],
  detailsState(),
  { view: 'watch-at-home' },
);
assert(
  !automaticHomeActions.includes('data-watchlist-home-override'),
  'naturally aged Watch at Home title does not show a redundant override action',
);

const readonlyWant = watchlistLogTableHtml(expandItems, detailsState(), { readonly: true });
assert(!readonlyWant.includes('data-edit-watchlist'), 'readonly want grid hides edit');
assert(!readonlyWant.includes('data-remove-watchlist'), 'readonly want grid hides remove');
assert(!readonlyWant.includes('data-log-watchlist'), 'readonly want grid hides log');
assert(readonlyWant.includes('al-watchlist-card-title'), 'readonly want grid still shows titles');
assert(!readonlyWant.includes('data-save-watchlist'), 'readonly want hides save until the viewer can add');

const saveWant = watchlistLogTableHtml(expandItems, detailsState(), {
  readonly: true,
  saveWatchlist: true,
  isSaved: () => false,
});
assert(saveWant.includes('data-save-watchlist'), 'another member’s Want list can save to yours');
assert(saveWant.includes('aria-label="Want to watch"'), 'unsaved Want titles use the same overlay label as the log');
assert(!saveWant.includes('data-edit-watchlist'), 'saving from a Want list does not expose edit');
const savedWant = watchlistLogTableHtml(expandItems, detailsState(), {
  readonly: true,
  saveWatchlist: true,
  isSaved: () => true,
});
assert(savedWant.includes('aria-label="On your list"'), 'a Want title already on your list is labeled that way');
assert(savedWant.includes('disabled'), 'a Want title already on your list cannot be added again');

assertEqual(
  sharedWatchlistItems(
    [{ id: 'a', title: 'Dune', tmdb_id: 1, poster_path: '/you.jpg' }],
    [{ id: 'b', title: 'Dune', tmdb_id: 1, poster_path: '/them.jpg' }, { id: 'c', title: 'Heat' }],
  ).map((item) => item.title),
  ['Dune'],
  'shared want lists match on TMDB id',
);
assertEqual(
  sharedWatchlistItems(
    [{ title: 'The Guest' }, { title: 'Dune' }],
    [{ title: 'the guest', poster_path: '/g.jpg' }],
  ).map((item) => item.title),
  ['the guest'],
  'shared want lists fall back to exact title',
);
assertEqual(
  sharedWatchlistItems([{ title: 'Dune' }], [{ title: 'Dune Part Two' }]).length,
  0,
  'shared want lists do not substring-match titles',
);

const collapsedAgain = watchlistLogTableHtml(expandItems, detailsState({ expandedId: null }), { view: 'coming-soon' });
assert(!collapsedAgain.includes('is-expanded'), 'clearing expandedId collapses Coming Soon again');
assert(!collapsedAgain.includes('al-log-detail'), 'collapsed Coming Soon hides the detail panel');

// The row markup above was already right; expand still did nothing because the
// Coming Soon / Watch at Home tab handler was bound with a bare [data-wtw-view]
// query that also matched the list wrapper. Every tap inside the list therefore
// ran the tab handler, which sets expandedId = null and re-renders.
const wtwSource = readFileSync(new URL('../amc-a-lister/engine/what-to-watch.js', import.meta.url), 'utf8');
const navSource = readFileSync(new URL('../amc-a-lister/engine/nav.js', import.meta.url), 'utf8');
assert(wtwSource.includes("label: 'Watch',"), 'watchlist page title/tab is Watch');
assert(wtwSource.includes('Watch <span class="al-segment-count"'), 'in-page tab is labeled Watch');
assert(!/label: 'Coming Soon'/.test(wtwSource), 'Coming Soon is no longer the watchlist tab label');
assert(!/label: 'To watch'/.test(wtwSource), 'To watch is no longer the watchlist tab label');
assert(navSource.includes("label: 'Watch',"), 'nav tab is labeled Watch');
assert(!/label: 'Coming Soon'/.test(navSource), 'Coming Soon is no longer the nav tab label');
assert(!/label: 'To watch'/.test(navSource), 'To watch is no longer the nav tab label');

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
const apiSource = readFileSync(new URL('../api/alist.js', import.meta.url), 'utf8');
const listSource = readFileSync(new URL('../lib/a-list.js', import.meta.url), 'utf8');
const dbSource = readFileSync(new URL('../lib/db.js', import.meta.url), 'utf8');
assert(
  /wireWatchlistRowExpand\(listEl, toggleExpand\);/.test(uiSource),
  'watchlist rows rebind expand after every render, like the watch log',
);

assert(isWantRanked({ priority: 0 }) === true, 'priority 0 is ranked');
assert(isWantRanked({ priority: null }) === false, 'null priority is unranked');
assert(isWantRanked({ title: 'x' }) === false, 'missing priority is unranked');

assertEqual(
  sortByWantPriority(
    [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B', priority: 1 },
      { id: 'c', title: 'C', priority: 0 },
    ],
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  ).map((i) => i.id),
  ['c', 'b', 'a'],
  'ranked titles lead; unranked stay at the bottom',
);

const homeRanked = [
  { id: 'old', title: 'Old', release_date: '2026-06-10', priority: 1 },
  { id: 'classic', title: 'Classic', release_date: '2020-01-01', priority: 0 },
];
assertEqual(
  sortWatchAtHome(homeRanked, today).map((i) => i.id),
  ['classic', 'old'],
  'Watch at Home shows drag order instead of release date once ranked',
);

const unrankedNew = { id: 'new-home', title: 'New home', release_date: '2010-01-01' };
assertEqual(
  sortWatchAtHome([...homeRanked, unrankedNew], today).map((i) => i.id),
  ['classic', 'old', 'new-home'],
  'a new unranked at-home title sits at the bottom',
);

assertEqual(
  sortWatchAtHomeByRelease(bucketItems, today).map((i) => i.title),
  ['Old', 'Classic'],
  'unranked Watch at Home fallback is still newest first',
);

const comingSoonWithPriority = [
  { id: 'edge', title: 'Edge', release_date: '2026-06-11', priority: 0 },
  { id: 'recent', title: 'Recent', release_date: '2026-07-01', priority: 99 },
  { id: 'future', title: 'Future', release_date: '2026-09-01', priority: 1 },
  { id: 'undated', title: 'Undated', priority: 2 },
  { id: 'old', title: 'Old', release_date: '2026-06-10', priority: 0 },
];
assertEqual(
  itemsForWatchlistView(comingSoonWithPriority, 'coming-soon', today).map((i) => i.id),
  ['edge', 'recent', 'future', 'undated'],
  'in-theater / coming soon order ignores want priority',
);

assertEqual(
  sortWantMoviesForProfile(comingSoonWithPriority, today).map((i) => i.id),
  ['edge', 'recent', 'future', 'undated', 'old'],
  'member Want tab keeps in-theater release order, then at-home priority',
);

const tvWant = [
  { id: 'aired', title: 'Aired', release_date: '2020-01-01' },
  { id: 'soon', title: 'Soon', release_date: '2027-01-01' },
  { id: 'fav', title: 'Fav', release_date: '2018-01-01', priority: 0 },
];
assertEqual(
  sortWantList(tvWant, today).map((i) => i.id),
  ['fav', 'aired', 'soon'],
  'TV want list ranks dragged shows above unranked release order',
);

const dragVisual = [
  { id: 'a', title: 'A' },
  { id: 'b', title: 'B' },
  { id: 'c', title: 'C' },
];
assertEqual(
  applyWantDragOrder([dragVisual[2], dragVisual[0], dragVisual[1]], 'c').map((i) => ({
    id: i.id,
    priority: i.priority,
  })),
  [{ id: 'c', priority: 0 }, { id: 'a', priority: null }, { id: 'b', priority: null }],
  'dragging an unranked title to the top ranks only that title',
);

const rankedThenUnrank = applyWantDragOrder(
  [
    { id: 'a', priority: 0 },
    { id: 'c' },
    { id: 'b', priority: 1 },
  ],
  'b',
);
assertEqual(
  rankedThenUnrank.map((i) => ({ id: i.id, priority: i.priority })),
  [{ id: 'a', priority: 0 }, { id: 'c', priority: null }, { id: 'b', priority: null }],
  'dragging a ranked title below the ranked block unranks it',
);

const reranked = applyWantDragOrder(
  [
    { id: 'b', priority: 1 },
    { id: 'a', priority: 0 },
    { id: 'c' },
  ],
  'b',
);
assertEqual(
  reranked.map((i) => ({ id: i.id, priority: i.priority })),
  [{ id: 'b', priority: 0 }, { id: 'a', priority: 1 }, { id: 'c', priority: null }],
  'dragging among ranked titles rewrites dense order and leaves the rest unranked',
);

assertEqual(
  mergeWantPriorities(
    [{ id: 'a', priority: null }, { id: 'keep', priority: 9 }],
    [{ id: 'a', priority: 0 }],
  ).map((i) => i.priority),
  [0, 9],
  'saving an at-home order does not rewrite unrelated rows',
);

assertEqual(
  wantRanksPayload([{ id: 'a', priority: 0 }, { id: 'b' }]),
  [{ id: 'a', priority: 0 }, { id: 'b', priority: null }],
  'PATCH payload sends null for unranked rows',
);
assertEqual(
  normalizeWantRanks([{ id: 'a', priority: 0 }, { id: 'a', priority: 2 }, { id: '', priority: 1 }]),
  [{ id: 'a', priority: 0 }],
  'rank payloads drop blanks and duplicate ids',
);

const homeGridHtml = watchlistLogTableHtml(
  [{ id: 'home1', title: 'Old Film', release_date: '2020-01-01' }],
  detailsState(),
  { view: 'watch-at-home' },
);
assert(!homeGridHtml.includes('data-want-drag'), 'the default Watch at Home grid has no drag handle');
assert(!homeGridHtml.includes('al-want-drag-handle'), 'the default Watch at Home grid keeps its existing card chrome');
assert(homeGridHtml.includes('class="al-watchlist-grid"'), 'Watch at Home still uses the same poster grid');
assert(!homeGridHtml.includes('al-watchlist-grid--reorder'), 'reorder mode does not swap in a different grid class');

const homeReorderHtml = watchlistLogTableHtml(
  [{ id: 'home1', title: 'Old Film', release_date: '2020-01-01' }],
  detailsState(),
  { view: 'watch-at-home', reorderable: true },
);
assert(homeReorderHtml.includes('data-want-drag="home1"'), 'Reorder mode adds a drag handle on the existing posters');
assert(homeReorderHtml.includes('al-want-drag-handle'), 'the handle uses the grab control class');
assert(homeReorderHtml.includes('Drag to rank'), 'unranked at-home titles explain that dragging ranks them');
assert(homeReorderHtml.includes('class="al-watchlist-grid"'), 'Reorder mode keeps the same poster grid');
assert(!homeReorderHtml.includes('Which do you like'), 'want ranking is not the pairwise compare flow');

const comingSoonNoDrag = watchlistLogTableHtml(
  [{ id: 'cs1', title: 'Future Film', release_date: '2026-09-01' }],
  detailsState(),
  { view: 'coming-soon', reorderable: false },
);
assert(!comingSoonNoDrag.includes('data-want-drag'), 'in-theater Watch cards have no drag handle');

const tvReorderHtml = watchlistLogTableHtml(
  [{ id: 'show1', title: 'The Pitt', release_date: '2025-01-01', priority: 0 }],
  detailsState(),
  { reorderable: true, logLabel: 'Log watched' },
);
assert(tvReorderHtml.includes('data-want-drag="show1"'), 'TV want cards get a drag handle');
assert(tvReorderHtml.includes('Drag to reorder'), 'ranked TV titles keep a drag handle');
assert(tvReorderHtml.includes('aria-label="Log watched"'), 'TV drag does not drop the log action');

const readonlyNoDrag = watchlistLogTableHtml(expandItems, detailsState(), {
  readonly: true,
  reorderable: true,
});
assert(!readonlyNoDrag.includes('data-want-drag'), 'someone else’s Want tab is not editable');

assert(uiSource.includes('wireWantReorder'), 'want lists bind pointer drag, not stack compare');
assert(uiSource.includes("addEventListener('pointerdown'"), 'drag starts on pointerdown for mouse and touch');
assert(uiSource.includes('setPointerCapture'), 'drag captures the pointer so iOS does not scroll the page');
assert(!uiSource.includes('Which do you like'), 'watchlist UI does not use pairwise compare copy');
assert(!/draggable\s*=\s*['"]true['"]/.test(uiSource), 'want ranking does not use HTML5 drag-and-drop');

const wtwReorder = readFileSync(new URL('../amc-a-lister/engine/what-to-watch.js', import.meta.url), 'utf8');
assert(wtwReorder.includes('id="wtw-reorder"'), 'Watch at Home has a Reorder control outside the grid');
assert(wtwReorder.includes('state.reordering'), 'Watch at Home drag lives in a Reorder mode');
assert(
  wtwReorder.includes("state.view === 'watch-at-home'") && wtwReorder.includes('reorderable:'),
  'Watch at Home is the only movie want list that enables drag',
);
assert(!wtwReorder.includes('rank-view'), 'Watch page does not load the liked-movie compare UI');

const tvWantSource = readFileSync(new URL('../amc-a-lister/engine/tv.js', import.meta.url), 'utf8');
assert(tvWantSource.includes('sortWantList'), 'TV want list uses want priority order');
assert(tvWantSource.includes('id="tv-watchlist-reorder"'), 'TV want list has a Reorder control outside the grid');
assert(tvWantSource.includes('state.reordering'), 'TV drag lives in a Reorder mode');
assert(tvWantSource.includes('reorderable:'), 'TV want list enables drag-to-rank');
assert(!tvWantSource.includes('combinedWatchlistItems'), 'TV want list is no longer release-date-only');

const memberWantSource = readFileSync(new URL('../amc-a-lister/engine/member.js', import.meta.url), 'utf8');
assert(memberWantSource.includes('sortWantMoviesForProfile'), 'other people see your want priority');

const gridCssAfter = readFileSync(new URL('../amc-a-lister/engine/app.css', import.meta.url), 'utf8');
assert(gridCssAfter.includes('.al-want-drag-handle'), 'drag handle has styles');
assert(gridCssAfter.includes('touch-action: none'), 'the handle opts out of page scroll on touch');
assert(gridCssAfter.includes('width: 44px'), 'the handle is 44px on coarse pointers');
assert(gridCssAfter.includes('html.al-reordering'), 'dragging locks page scroll and cursor');

assert(
  apiSource.includes('req.body?.ranks') && apiSource.includes('saveWatchlistRanks'),
  'movie watchlist PATCH accepts a drag-order ranks array',
);
assert(
  apiSource.includes('saveTvWatchlistRanks'),
  'TV watchlist PATCH accepts a drag-order ranks array',
);
assert(
  listSource.includes('saveWatchlistRanks') && listSource.includes('saveTvWatchlistRanks'),
  'rank writes stay on the existing watchlist tables',
);
assert(
  /ALTER TABLE alist_watchlist[\s\S]*ADD COLUMN IF NOT EXISTS priority INT/.test(dbSource),
  'movie want list migrates a nullable priority column',
);
assert(
  /ALTER TABLE alist_tv_watchlist[\s\S]*ADD COLUMN IF NOT EXISTS priority INT/.test(dbSource),
  'TV want list migrates a nullable priority column',
);
assert(listSource.includes('priority: row.priority != null ? Number(row.priority) : null'), 'API rows expose priority');
assert(listSource.includes('watch_at_home_override: row.watch_at_home_override === true'), 'public Want tab still knows at-home overrides');

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
