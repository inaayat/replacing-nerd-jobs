/**
 * Poster hydration: fill missing artwork/tmdb_id, never user-entered fields.
 * Run: node scripts/test-alist-posters.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  foldMovieTitle,
  uniqueExactSearchMatch,
  uniqueTmdbByFoldedTitle,
  applyLocalArtwork,
  applyCachedArtwork,
} from '../lib/a-list-poster-match.js';

function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
}

check('fold drops articles and punctuation', foldMovieTitle('The Odyssey!'), 'odyssey');
check('fold trims', foldMovieTitle('  Digger  '), 'digger');

const remakes = [
  { tmdb_id: 1, title: 'Dune', poster_path: '/a.jpg' },
  { tmdb_id: 2, title: 'Dune', poster_path: '/b.jpg' },
];
assert.equal(uniqueTmdbByFoldedTitle(remakes).has('dune'), false, 'ambiguous remake stays unlinked');

const unique = uniqueTmdbByFoldedTitle([
  { tmdb_id: 10, title: 'Digger', poster_path: '/d.jpg' },
  { tmdb_id: 10, title: 'Digger' },
]);
assert.equal(unique.get('digger').tmdb_id, 10);
assert.equal(unique.get('digger').poster_path, '/d.jpg');

assert.equal(
  uniqueExactSearchMatch([{ title: 'It', tmdb_id: 1 }, { title: 'Titanic', tmdb_id: 2 }], 'Titanic').tmdb_id,
  2,
);
assert.equal(
  uniqueExactSearchMatch([{ title: 'It', tmdb_id: 1 }], 'Titanic'),
  null,
  'substring must not steal a longer title',
);
assert.equal(
  uniqueExactSearchMatch(
    [{ title: 'Dune', tmdb_id: 1 }, { title: 'Dune', tmdb_id: 2 }],
    'Dune',
  ),
  null,
  'two exact remakes stay unlinked',
);

const siblingRows = [
  {
    id: 'a',
    title: 'Digger',
    tmdb_id: 55,
    poster_path: '/digger.jpg',
    location: 'AMC Lincoln Square 13',
    ticket_cents: 2149,
    rating: 4,
    watched_on: '2026-10-06',
  },
  {
    id: 'b',
    title: 'Digger',
    tmdb_id: null,
    poster_path: null,
    location: null,
    ticket_cents: null,
    rating: 4.5,
    watched_on: '2026-10-09',
  },
];
const hydrated = applyLocalArtwork(siblingRows);
assert.equal(hydrated[1].poster_path, '/digger.jpg', 'same-title sibling copies poster');
assert.equal(hydrated[1].tmdb_id, 55, 'same-title sibling copies tmdb_id');
assert.equal(hydrated[1].location, null, 'does not invent theater');
assert.equal(hydrated[1].ticket_cents, null, 'does not invent cost');
assert.equal(hydrated[1].rating, 4.5, 'leaves rating alone');
assert.equal(hydrated[1].watched_on, '2026-10-09', 'leaves date alone');
assert.equal(hydrated[0].location, 'AMC Lincoln Square 13', 'does not rewrite filled theater');

const withExistingId = applyLocalArtwork([
  { title: 'Digger', tmdb_id: 99, poster_path: null },
  { title: 'Digger', tmdb_id: 55, poster_path: '/digger.jpg' },
]);
assert.equal(withExistingId[0].tmdb_id, 99, 'never overwrites an existing tmdb_id');
assert.equal(
  withExistingId[0].poster_path,
  null,
  'does not copy a poster from a different tmdb_id just because the title matches',
);

const fromCache = applyCachedArtwork(
  [
    { title: 'Verity', tmdb_id: null, poster_path: null, location: null, ticket_cents: null },
    { title: 'Primetime', tmdb_id: 7, poster_path: null },
  ],
  [
    { title: 'Verity', tmdb_id: 3, poster_path: '/verity.jpg' },
    { title: 'Primetime', tmdb_id: 7, poster_path: '/prime.jpg' },
    { title: 'Some Other', tmdb_id: 8, poster_path: '/nope.jpg' },
  ],
);
assert.equal(fromCache[0].poster_path, '/verity.jpg');
assert.equal(fromCache[0].tmdb_id, 3);
assert.equal(fromCache[0].location, null);
assert.equal(fromCache[1].poster_path, '/prime.jpg');
assert.equal(fromCache[1].tmdb_id, 7);

const skipAmbiguousCache = applyCachedArtwork(
  [{ title: 'Dune', tmdb_id: null, poster_path: null }],
  [
    { title: 'Dune', tmdb_id: 1, poster_path: '/old.jpg' },
    { title: 'Dune', tmdb_id: 2, poster_path: '/new.jpg' },
  ],
);
assert.equal(skipAmbiguousCache[0].tmdb_id, null, 'ambiguous cache title is left alone');
assert.equal(skipAmbiguousCache[0].poster_path, null);

const api = readFileSync(new URL('../api/alist.js', import.meta.url), 'utf8');
assert.match(api, /scope === 'user' \? userId : null/, 'backfill defaults to every account');
assert.match(api, /uniqueExactSearchMatch/, 'title linking is exact-unique, not substring');
assert.equal(api.includes('pickBestMatch(results'), false, 'old substring matcher is gone from backfill');

const settings = readFileSync(new URL('../amc-a-lister/engine/settings.js', import.meta.url), 'utf8');
assert.match(settings, /scope: 'all'/, 'Settings button runs the all-accounts backfill');
assert.match(settings, /i < 50/, 'Settings keeps looping batches until remaining is 0');

const listWatches = readFileSync(new URL('../lib/a-list.js', import.meta.url), 'utf8');
assert.match(listWatches, /hydrateMovieRows/, 'watch lists self-heal posters on load');
assert.match(listWatches, /COALESCE\(NULLIF\(r\.poster_path, ''\), c\.poster_path\)/, 'public ranks join the movie cache');

console.log('alist posters: all assertions passed');
