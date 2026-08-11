/**
 * Pure-function tests for A-Lister watchlist release sorting.
 * Run: node scripts/test-alist-watchlist-sort.mjs
 */
import {
  sortAlreadyOut,
  sortComingSoon,
  combinedWatchlistItems,
  isAlreadyOut,
} from '../amc-a-lister/engine/watchlist-ui.js';

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
  'already-out is chronological ascending',
);

assertEqual(
  sortComingSoon(items, today).map((i) => i.title),
  ['The End of Oak Street', 'The Rivals of Amziah King', 'Spa Weekend'],
  'coming soon is soonest first',
);

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
  'combined list reads as chronological release order',
);

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
