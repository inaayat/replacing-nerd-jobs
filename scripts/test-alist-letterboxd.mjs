/**
 * Pure-function tests for the A-Lister Letterboxd import.
 * Run: node scripts/test-alist-letterboxd.mjs
 */
import { readFileSync } from 'node:fs';
import {
  normalizeLetterboxdUsername,
  letterboxdRssUrl,
  parseLetterboxdRss,
  reviewFromDescription,
  alistRatingFromLetterboxd,
  classifyLetterboxdItem,
  isReviewable,
  draftWatchFromItem,
  defaultTicketCents,
  decodeEntities,
  LETTERBOXD_SYNC_INTERVAL_MS,
} from '../amc-a-lister/engine/letterboxd.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  }
}

function eq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) console.error(`  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(actual)}`);
  assert(ok, msg);
}

// --- usernames ---
eq(normalizeLetterboxdUsername('anirooooodh'), { username: 'anirooooodh' }, 'plain username');
eq(normalizeLetterboxdUsername('  @InaayatWatched '), { username: 'inaayatwatched' }, '@ and case are stripped');
eq(normalizeLetterboxdUsername('https://letterboxd.com/anirooooodh/rss/'), { username: 'anirooooodh' }, 'RSS URL');
eq(normalizeLetterboxdUsername('letterboxd.com/inaayatwatched/film/digger-2026/'), { username: 'inaayatwatched' }, 'film URL');
eq(normalizeLetterboxdUsername(''), { username: null }, 'blank clears');
assert(normalizeLetterboxdUsername('../etc/passwd').error, 'path traversal rejected');
assert(normalizeLetterboxdUsername('evil.com/x').error, 'dots rejected (no other hosts)');
assert(normalizeLetterboxdUsername('a b').error, 'spaces rejected');
eq(letterboxdRssUrl('anirooooodh'), 'https://letterboxd.com/anirooooodh/rss/', 'feed URL');

// --- entities + reviews ---
eq(decodeEntities('You, Me &amp; Tuscany &#039;26 &#x2014; ok'), "You, Me & Tuscany '26 — ok", 'entities decode');
eq(
  reviewFromDescription('<p><img src="https://a.ltrbxd.com/x.jpg"/></p> <p>Watched on Tuesday September 22, 2026.</p>'),
  null,
  'auto "Watched on" text is not a review',
);
eq(
  reviewFromDescription('<p><img src="x"/></p> <p>line one<br />line two</p> <p>para &amp; two</p>'),
  'line one\nline two\n\npara & two',
  'breaks and paragraphs survive, tags do not',
);

// --- ratings ---
eq(alistRatingFromLetterboxd(0.5), 1, '½★ rounds up to the 1★ floor');
eq(alistRatingFromLetterboxd(4.5), 4.5, 'half stars kept');
eq(alistRatingFromLetterboxd(null), null, 'unrated stays unrated');
eq(alistRatingFromLetterboxd(0), null, 'zero is unrated');

// --- feed parse (trimmed copy of a real feed) ---
const xml = readFileSync(new URL('./fixtures/letterboxd-rss.xml', import.meta.url), 'utf8');
const items = parseLetterboxdRss(xml);
eq(items.length, 6, 'six diary entries; the list item is dropped');
assert(!items.some((i) => i.title === '2025 Ranked'), 'lists are not watches');

const firstMan = items.find((i) => i.title === 'First Man');
eq(
  {
    guid: firstMan.guid, tmdb_id: firstMan.tmdb_id, watched_on: firstMan.watched_on,
    rating: firstMan.rating, film_year: firstMan.film_year, rewatch: firstMan.rewatch,
  },
  {
    guid: 'letterboxd-review-1534976797', tmdb_id: 369972, watched_on: '2026-10-12',
    rating: 4, film_year: 2018, rewatch: false,
  },
  'First Man fields',
);
eq(firstMan.review, 'regret not watching this in theatres', 'review text');
assert(/^https:\/\/a\.ltrbxd\.com\//.test(firstMan.poster_url), 'poster from Letterboxd CDN only');

const best = items.find((i) => i.title === 'Best of the Best');
eq(best.review, null, 'watch-only entry has no review');
eq(best.guid, 'letterboxd-watch-1506258395', 'watch guid');

const odysseys = items.filter((i) => i.title === 'The Odyssey');
eq(odysseys.map((o) => o.rewatch), [true, false], 'rewatch flag parsed');
const odysseyRewatch = odysseys[0];
assert(odysseyRewatch.review.includes("it's sails"), 'HTML entities in CDATA decode');

const bugonia = items.find((i) => i.title === 'Bugonia');
assert(bugonia.review.split('\n').length === 4, '<br /> lines kept as separate lines');

// --- classification ---
const log = [
  { title: 'The Odyssey', tmdb_id: 1368337, watched_on: '2026-07-16' },
  { title: 'Gran Turismo', tmdb_id: 980489, watched_on: '2023-08-30' },
  { title: 'first man', tmdb_id: null, watched_on: '2026-10-13' },
];
eq(classifyLetterboxdItem(best, log), 'new', 'not in log → new');
eq(classifyLetterboxdItem(odysseys[1], log), 'duplicate', 'same film same day → duplicate');
eq(classifyLetterboxdItem(odysseyRewatch, log), 'rewatch', 'Letterboxd rewatch on another date → rewatch');
eq(classifyLetterboxdItem(firstMan, log), 'duplicate', 'title fallback when the log row has no TMDB id, ±1 day');
eq(
  classifyLetterboxdItem({ ...odysseys[1], watched_on: '2026-09-01' }, log),
  'already-logged',
  'in log on another date without the rewatch flag → ignored',
);
eq(classifyLetterboxdItem(items.find((i) => i.title === 'Gran Turismo'), log), 'rewatch', 'Gran Turismo rewatch');
eq(
  classifyLetterboxdItem({ title: 'Moana', tmdb_id: 1108427, watched_on: '2026-07-14' }, [{ title: 'Moana', tmdb_id: 277834, watched_on: '2016-11-23' }]),
  'new',
  'different TMDB id with the same title is a different film (remake)',
);
assert(isReviewable('new') && isReviewable('rewatch'), 'new and rewatch go to the inbox');
assert(!isReviewable('duplicate') && !isReviewable('already-logged'), 'duplicates do not');

// --- drafts ---
const homeDraft = draftWatchFromItem(firstMan);
eq(
  {
    in_theaters: homeDraft.in_theaters, location: homeDraft.location, rating: homeDraft.rating,
    notes: homeDraft.notes, watched_on: homeDraft.watched_on, tmdb_id: homeDraft.tmdb_id,
  },
  {
    in_theaters: false, location: 'Not in theaters', rating: 4,
    notes: 'regret not watching this in theatres', watched_on: '2026-10-12', tmdb_id: 369972,
  },
  'home draft uses Letterboxd date, rating, review',
);
const theaterDraft = draftWatchFromItem(firstMan, { mode: 'theater', includeReview: false });
eq([theaterDraft.in_theaters, theaterDraft.location, theaterDraft.notes], [true, null, null], 'theater draft, review off');
eq(draftWatchFromItem({ ...firstMan, rating: 0.5 }).rating, 1, 'draft rounds ½★');

// --- default price ---
const priced = [
  { in_theaters: true, location: 'AMC Lincoln Square 13', ticket_cents: 2499, watched_on: '2026-01-01' },
  { in_theaters: true, location: 'AMC Empire 25', ticket_cents: 1999, watched_on: '2026-05-01' },
  { in_theaters: false, location: 'Not in theaters', ticket_cents: 5000, watched_on: '2026-09-01' },
];
eq(defaultTicketCents(priced, 'amc lincoln square 13'), 2499, 'last price at that theater');
eq(defaultTicketCents(priced, 'AMC 34th Street'), 1999, 'falls back to the latest theater price');
eq(defaultTicketCents([], ''), null, 'no history → no default');

eq(LETTERBOXD_SYNC_INTERVAL_MS, 15 * 60 * 1000, 'feed refetches at most every 15 minutes per user');

// --- wiring guards ---
const api = readFileSync(new URL('../api/alist.js', import.meta.url), 'utf8');
assert(api.includes("case 'letterboxd':"), 'letterboxd route registered on api/alist.js');
assert(api.includes('letterboxdRssUrl(') && api.includes('normalizeLetterboxdUsername('), 'server builds the URL from a validated username');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert(
  vercel.rewrites.some((r) => r.source === '/api/alist-letterboxd' && r.destination === '/api/alist?route=letterboxd'),
  'rewrite for /api/alist-letterboxd',
);
const dbSrc = readFileSync(new URL('../lib/db.js', import.meta.url), 'utf8');
assert(dbSrc.includes('alist_letterboxd_items'), 'schema creates alist_letterboxd_items');
assert(dbSrc.includes('letterboxd_username'), 'schema adds letterboxd_username');
const css = readFileSync(new URL('../amc-a-lister/engine/app.css', import.meta.url), 'utf8');
assert(
  /\.al-panel--letterboxd\[hidden\][^{]*\{\s*display:\s*none/.test(css),
  'the empty Letterboxd banner stays hidden (its display:flex would otherwise beat [hidden])',
);
assert(
  /#letterboxd-form \[hidden\][^{]*\{\s*display:\s*none/.test(css),
  'Disconnect / Review inbox stay hidden before connecting (.al-btn is inline-flex)',
);
const { renderHowToUseSection } = await import('../amc-a-lister/engine/how-to-use.js');
const howTo = renderHowToUseSection();
assert(
  howTo.includes('Letterboxd') && howTo.includes('review inbox') && howTo.includes('<details')
    && howTo.includes('FAQ &amp; Set Up Instructions'),
  'FAQ & Set Up Instructions explains Letterboxd and stays collapsed',
);
assert(!/<a |<em>|<code>|<strong>/.test(howTo), 'How to use items stay plain text');
const letterboxdSrc = readFileSync(new URL('../amc-a-lister/engine/letterboxd.js', import.meta.url), 'utf8');
assert(!/^import /m.test(letterboxdSrc), 'letterboxd.js stays dependency-free');

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
