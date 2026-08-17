/**
 * Pure-function tests for A-Lister watchlist release sorting.
 * Run: node scripts/test-alist-watchlist-sort.mjs
 */
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
  itemsForWatchlistView,
  theatricalCutoffISO,
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

assertEqual(monthsBeforeISO(3, new Date(2026, 7, 11)), '2026-05-11', '3 calendar months before Aug 11');
assertEqual(theatricalCutoffISO(today), '2026-05-11', 'theatrical cutoff is 3 months back');

const bucketItems = [
  { id: 'future', title: 'Future', release_date: '2026-09-01' },
  { id: 'recent', title: 'Recent', release_date: '2026-07-01' },
  { id: 'edge', title: 'Edge', release_date: '2026-05-11' },
  { id: 'old', title: 'Old', release_date: '2026-05-10' },
  { id: 'classic', title: 'Classic', release_date: '2020-01-01' },
  { id: 'undated', title: 'Undated' },
];

assert(watchlistBucket(bucketItems[0], today) === 'coming-soon', 'future is coming soon');
assert(watchlistBucket(bucketItems[1], today) === 'in-theaters', 'July release is in theaters');
assert(watchlistBucket(bucketItems[2], today) === 'in-theaters', 'exactly 3 months is still in theaters');
assert(watchlistBucket(bucketItems[3], today) === 'watch-at-home', 'just over 3 months is watch at home');
assert(watchlistBucket(bucketItems[4], today) === 'watch-at-home', 'classic is watch at home');
assert(watchlistBucket(bucketItems[5], today) === 'unknown', 'undated stays unknown');

assert(isInTheaters(bucketItems[1], today) === true, 'recent is in theaters');
assert(isWatchAtHome(bucketItems[4], today) === true, 'classic is watch at home');

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
  ['Future', 'Undated'],
  'coming soon tab has upcoming plus unknown',
);

assertEqual(
  itemsForWatchlistView(bucketItems, 'in-theaters', today).map((i) => i.title),
  ['Recent', 'Edge'],
  'in theaters tab',
);

assertEqual(
  itemsForWatchlistView(bucketItems, 'watch-at-home', today).map((i) => i.title),
  ['Old', 'Classic'],
  'watch at home tab',
);

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
