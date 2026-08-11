/**
 * Pure-function tests for the A-Lister public-identity rules.
 * Run: node scripts/test-alist-privacy.mjs
 */
import { publicDisplayName, isPublicProfile, normalizeUsername, firstNameOf } from '../lib/a-list-identity.js';
import { todayISO, toLocalISO, currentMonthISO } from '../amc-a-lister/engine/dates.js';

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
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${msg}\n  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(actual)}`,
  );
}

// --- public display name: username, else first name, never email ------------

assertEqual(publicDisplayName({ username: 'reel_lurker' }), 'reel_lurker', 'username wins');
assertEqual(publicDisplayName({ username: '  spaced  ' }), 'spaced', 'username is trimmed');

// Username is optional: an opted-in member with no handle shows as their first
// name. The opt-in is the gate; the handle is a nicety.
assertEqual(
  publicDisplayName({ username: null }, { name: 'Inaayat Gill' }),
  'Inaayat',
  'falls back to first name only',
);
assertEqual(
  publicDisplayName({ username: 'handle' }, { name: 'Inaayat Gill' }),
  'handle',
  'a set username still beats the real name',
);

// Email must never reach the public name by any route.
assertEqual(
  publicDisplayName({ username: null }, { name: null, email: 'me@example.com' }),
  'Member',
  'no name at all yields Member, never the email',
);
assertEqual(
  publicDisplayName({ username: null }, { name: 'me@example.com' }),
  'Member',
  'an email sitting in the name field is not published',
);
assertEqual(publicDisplayName({}, {}), 'Member', 'empty everything yields Member');

assertEqual(firstNameOf('Inaayat Gill'), 'Inaayat', 'surname is dropped');
assertEqual(firstNameOf('  Karan  Narula '), 'Karan', 'extra whitespace handled');
assertEqual(firstNameOf('Aditi'), 'Aditi', 'single-word name works');
assertEqual(firstNameOf(''), null, 'empty name has no first name');
assertEqual(firstNameOf('a@b.com'), null, 'an email is never a first name');

// --- opt-in gate -------------------------------------------------------------

assert(isPublicProfile({ public_profile: true, username: 'someone' }), 'opted in is public');
assert(isPublicProfile({ public_profile: true, username: null }), 'opted in without a handle is still public');
assert(!isPublicProfile({ public_profile: false, username: 'someone' }), 'opted out is private');
assert(!isPublicProfile({}), 'default (no membership row) is private');
assert(!isPublicProfile({ public_profile: 'true' }), 'only a real boolean counts as opted in');

// --- username validation -----------------------------------------------------

assertEqual(normalizeUsername('ReelLurker').username, 'reellurker', 'usernames casefold');
assertEqual(normalizeUsername('  Spaced  ').username, 'spaced', 'usernames trim');
assertEqual(normalizeUsername('').username, null, 'empty is valid and clears the username');
assert(normalizeUsername('ab').error, 'too short is rejected');
assert(normalizeUsername('a'.repeat(25)).error, 'too long is rejected');
assert(normalizeUsername('has space').error, 'spaces are rejected');
assert(normalizeUsername('has-dash').error, 'dashes are rejected');
assert(normalizeUsername('emoji🎬').error, 'non-ascii is rejected');
assert(!normalizeUsername('ok_name_9').error, 'letters, digits and underscores are allowed');

// --- local dates, not UTC ----------------------------------------------------

// 8pm on Aug 10 in a UTC-4 zone is Aug 11 in UTC. The old
// `toISOString().slice(0, 10)` returned tomorrow's date for evening screenings.
const evening = new Date(2026, 7, 10, 20, 30, 0);
assertEqual(toLocalISO(evening), '2026-08-10', 'evening local date does not roll forward');
assertEqual(todayISO(evening), '2026-08-10', 'todayISO uses local calendar parts');

const lateMonthEnd = new Date(2026, 7, 31, 23, 15, 0);
assertEqual(currentMonthISO(lateMonthEnd), '2026-08-01', 'current month holds on the last evening of the month');

const earlyMorning = new Date(2026, 0, 1, 0, 5, 0);
assertEqual(toLocalISO(earlyMorning), '2026-01-01', 'just after midnight stays on the new day');

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
