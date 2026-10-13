/**
 * Bulk edit drafts: rating plus theater, format, seat, and ticket price.
 * Run: node scripts/test-alist-bulk-edit.mjs
 */
import {
  screeningDraft,
  persistedScreening,
  screeningsMatch,
  normalizeBulkUpdate,
  ticketCentsFromInput,
} from '../amc-a-lister/engine/bulk-edit.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  }
}

const theater = {
  title: 'Digger',
  rating: 4.5,
  dnf: false,
  in_theaters: true,
  location: 'AMC Lincoln Square 13',
  format: 'IMAX',
  seat: 'J38',
  ticket_cents: 2149,
};

const draft = screeningDraft(theater);
assert(draft.ticket === '21.49', 'ticket cents render as dollars');
assert(draft.location === 'AMC Lincoln Square 13', 'theater stays on the draft');
assert(screeningsMatch(draft, screeningDraft(theater)), 'an untouched row is not a change');

const priced = { ...draft, ticket: '21.50' };
assert(!screeningsMatch(draft, priced), 'a one-cent ticket edit counts as a change');
assert(persistedScreening(priced).data.ticket_cents === 2150, 'ticket dollars become cents');

const home = screeningDraft({
  ...theater,
  in_theaters: false,
  location: 'Not in theaters',
  seat: 'J38',
  ticket_cents: 2149,
});
assert(home.location === '' && home.seat === '' && home.ticket === '', 'off-theater draft hides theater fields');
const homeSaved = persistedScreening(home).data;
assert(homeSaved.in_theaters === false, 'off-theater stays off');
assert(homeSaved.location === 'Not in theaters', 'off-theater location is the stored label');
assert(homeSaved.seat == null && homeSaved.ticket_cents == null && homeSaved.format === '', 'off-theater clears seat, price, and format');
assert(screeningsMatch(home, screeningDraft({
  in_theaters: false,
  location: 'Not in theaters',
  rating: 4.5,
})), 'a stored off-theater row matches the empty editor');

assert(ticketCentsFromInput('').cents == null, 'blank ticket is no price');
assert(ticketCentsFromInput('abc').error, 'a ticket needs a digit');
assert(persistedScreening({ ...draft, rating: 9 }).error, 'rating stays between 1 and 5');

const legacy = normalizeBulkUpdate({ id: 'w1', rating: 5, dnf: false });
assert(legacy.data.screening === false && legacy.data.rating === 5, 'rating-only updates leave theater fields alone');
assert(normalizeBulkUpdate({ rating: 5 }) == null, 'an update without an id is skipped');

const full = normalizeBulkUpdate({
  id: 'w2',
  rating: 3,
  dnf: false,
  in_theaters: true,
  location: 'AMC Empire 25',
  format: 'Dolby',
  seat: 'F12',
  ticket_cents: 1999,
});
assert(full.data.screening === true, 'theater fields mark a full screening update');
assert(full.data.location === 'AMC Empire 25' && full.data.seat === 'F12', 'theater and seat are kept');
assert(full.data.ticket_cents === 1999, 'integer cents pass through');

const cleared = normalizeBulkUpdate({
  id: 'w3',
  rating: null,
  dnf: true,
  in_theaters: false,
  location: 'AMC Empire 25',
  format: 'Dolby',
  seat: 'F12',
  ticket_cents: 1999,
});
assert(cleared.data.dnf === true && cleared.data.rating == null, 'DNF clears the rating');
assert(cleared.data.seat == null && cleared.data.ticket_cents == null, 'leaving theaters clears seat and price');
assert(normalizeBulkUpdate({ id: 'w4', rating: 0, dnf: false }).error, 'a zero rating is rejected');

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
