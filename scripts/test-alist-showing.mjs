/**
 * Pure-function tests for A-Lister watched-together matching.
 * Run: node scripts/test-alist-showing.mjs
 */
import {
  watchesMatchForTogether,
  normalizeLocation,
  normalizeMovieTitle,
  inviteFromRow,
  summarizeBulkInviteResults,
} from '../lib/a-list-showing.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  }
}

function assertDeep(actual, expected, msg) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${msg}\n  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(actual)}`,
  );
}

assert(normalizeLocation('  AMC Lincoln Square 13 ') === 'amc lincoln square 13', 'location normalizes');
assert(normalizeMovieTitle('The Odyssey') === 'odyssey', 'title drops article');

const base = {
  watched_on: '2026-08-10',
  title: 'Weapons',
  tmdb_id: 123,
  location: 'AMC Lincoln Square 13',
};

assert(
  watchesMatchForTogether(base, {
    ...base,
    location: 'amc lincoln square 13',
    title: 'Something Else',
  }),
  'same tmdb_id + date + theater matches even if titles differ',
);

assert(
  !watchesMatchForTogether(base, { ...base, watched_on: '2026-08-11' }),
  'different date does not match',
);

assert(
  !watchesMatchForTogether(base, { ...base, location: 'AMC Empire 25' }),
  'different theater does not match',
);

assert(
  watchesMatchForTogether(
    { watched_on: '2026-08-10', title: 'The Odyssey', location: 'AMC 34th Street 14' },
    { watched_on: '2026-08-10', title: 'Odyssey', location: 'amc 34th street 14' },
  ),
  'title fallback matches when neither side has tmdb_id',
);

assert(
  !watchesMatchForTogether(
    { watched_on: '2026-08-10', title: 'Weapons', tmdb_id: 1, location: 'AMC' },
    { watched_on: '2026-08-10', title: 'Weapons', tmdb_id: 2, location: 'AMC' },
  ),
  'conflicting tmdb ids do not match',
);

assert(
  !watchesMatchForTogether(
    { watched_on: '2026-08-10', title: 'Weapons', tmdb_id: 1, location: '' },
    { watched_on: '2026-08-10', title: 'Weapons', tmdb_id: 1, location: '' },
  ),
  'empty theater does not count as a shared outing',
);

const invite = inviteFromRow({
  id: 'i1',
  from_user_id: 'a',
  to_user_id: 'b',
  source_watch_id: 'w1',
  status: 'pending',
  watched_on: '2026-08-10',
  title: 'Weapons',
  tmdb_id: '55',
  location: 'AMC',
  format: 'IMAX',
  ticket_cents: '2495',
  in_theaters: true,
  created_watch_id: null,
  from_username: 'inaayat',
  to_username: 'karan',
  poster_path: '/x.jpg',
  created_at: 't',
  updated_at: 't',
});
assert(invite.tmdb_id === 55 && invite.ticket_cents === 2495, 'inviteFromRow coerces numbers');
assert(invite.from_username === 'inaayat', 'invite keeps usernames');

assertDeep(
  summarizeBulkInviteResults([
    { linked: true },
    { linked: true, already: true },
    { invited: true },
    { invited: true },
    { already_pending: true },
    { error: 'nope' },
  ]),
  { linked: 1, already: 2, invited: 2, failed: 1, total: 6 },
  'bulk summary counts outcomes',
);

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
