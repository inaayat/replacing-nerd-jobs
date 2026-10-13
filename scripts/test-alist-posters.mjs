/**
 * Poster hydration + write-time TMDB linking: fill missing artwork/tmdb_id,
 * never user-entered fields. Run: node scripts/test-alist-posters.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  foldMovieTitle,
  uniqueExactSearchMatch,
  uniqueTmdbByFoldedTitle,
  applyLocalArtwork,
  applyCachedArtwork,
  pickBestMovieMatch,
  linkMoviesInline,
  INLINE_TMDB_LINK_LIMIT,
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

const duneResults = [
  { title: 'Dune', tmdb_id: 841, release_date: '1984-12-14' },
  { title: 'Dune', tmdb_id: 438631, release_date: '2021-10-22' },
];
const itResults = [
  { title: 'It', tmdb_id: 377, release_date: '1990-11-18' },
  { title: 'It', tmdb_id: 346364, release_date: '2017-09-08' },
  { title: 'Titanic', tmdb_id: 597, release_date: '1997-12-19' },
];
assert.equal(
  pickBestMovieMatch([{ title: 'Digger', tmdb_id: 55, year: 2024 }], 'The Digger').tmdb_id,
  55,
  'unique exact title wins without a year',
);
assert.equal(
  pickBestMovieMatch(duneResults, 'Dune', { watchedOn: '2026-10-06' }).tmdb_id,
  438631,
  'remake nearest the screening year wins',
);
assert.equal(
  pickBestMovieMatch(duneResults, 'Dune', { year: 1984 }).tmdb_id,
  841,
  'explicit year picks that remake',
);
assert.equal(
  pickBestMovieMatch(duneResults, 'Dune'),
  null,
  'remakes without a year hint stay unlinked',
);
assert.equal(
  pickBestMovieMatch(itResults, 'It', { watchedOn: '2024-06-01' }).tmdb_id,
  346364,
  'It 2017 is closer to a 2024 screening than 1990',
);
assert.equal(
  pickBestMovieMatch(itResults, 'Titanic').tmdb_id,
  597,
  'Titanic is exact, not a substring of It',
);
assert.equal(
  pickBestMovieMatch(itResults, 'It'),
  null,
  'It remakes without a year stay unlinked rather than claiming Titanic',
);
assert.equal(
  pickBestMovieMatch(
    [
      { title: 'Dune', tmdb_id: 1, year: 2021 },
      { title: 'Dune', tmdb_id: 2, year: 2021 },
    ],
    'Dune',
    { year: 2021 },
  ),
  null,
  'equal-year remake tie stays unlinked',
);
assert.equal(INLINE_TMDB_LINK_LIMIT, 16, 'inline TMDB budget is capped');

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

{
  const searches = [];
  const details = [];
  const search = async (title) => {
    searches.push(title);
    if (foldMovieTitle(title) === 'dune') return duneResults;
    if (foldMovieTitle(title) === 'digger') return [{ title: 'Digger', tmdb_id: 55, year: 2024 }];
    return [];
  };
  const detailsFn = async (id) => {
    details.push(id);
    return { tmdb_id: id, poster_path: `/${id}.jpg` };
  };

  const sibling = await linkMoviesInline([
    { title: 'Digger', tmdb_id: 55, poster_path: '/digger.jpg', location: 'AMC' },
    { title: 'Digger', tmdb_id: null, poster_path: null, location: null, ticket_cents: 1999 },
  ], { search, details: detailsFn, limit: 16 });
  assert.equal(sibling.items[1].tmdb_id, 55, 'inline copy from unique sibling title');
  assert.equal(sibling.items[1].location, null, 'inline sibling copy does not invent theater');
  assert.equal(sibling.items[1].ticket_cents, 1999, 'inline sibling copy leaves cost alone');
  assert.equal(sibling.linked, 1);

  const keep = await linkMoviesInline([
    { title: 'Digger', tmdb_id: 99, poster_path: null },
  ], { search, details: detailsFn, limit: 16 });
  assert.equal(keep.items[0].tmdb_id, 99, 'inline never overwrites an existing tmdb_id');

  const remake = await linkMoviesInline([
    { title: 'Dune', tmdb_id: null, watched_on: '2026-10-06' },
  ], { search, details: detailsFn, limit: 16 });
  assert.equal(remake.items[0].tmdb_id, 438631, 'inline remake uses year near screening date');
  assert.ok(details.includes(438631), 'inline caches poster/metadata for the match');

  const deferred = await linkMoviesInline(
    Array.from({ length: 20 }, (_, i) => ({ title: `Film ${i}`, tmdb_id: null })),
    {
      limit: 4,
      search: async (title) => [{ title, tmdb_id: Number(title.replace(/\D/g, '')) + 1, year: 2024 }],
      details: async (id) => ({ tmdb_id: id, poster_path: `/${id}.jpg` }),
    },
  );
  assert.ok(deferred.linked > 0 && deferred.linked < 20, 'inline links a budgeted prefix');
  assert.ok(deferred.deferred > 0, 'titles past the inline budget stay null for backfill');
  assert.equal(
    deferred.items.filter((item) => item.tmdb_id).length + deferred.deferred,
    20,
  );
}

const api = readFileSync(new URL('../api/alist.js', import.meta.url), 'utf8');
assert.match(api, /scope === 'user' \? userId : null/, 'backfill defaults to every account');
assert.match(api, /uniqueExactSearchMatch/, 'title linking is exact-unique, not substring');
assert.equal(api.includes('pickBestMatch(results'), false, 'old substring matcher is gone from backfill');
assert.match(api, /resolveMovieTmdbId/, 'single writes resolve TMDB at save time');
assert.match(api, /resolveAndCacheMovies\(pending\)/, 'CSV/AMC import resolves a batched prefix');
assert.match(api, /async function createWatch/, 'manual add / Letterboxd share createWatch');
assert.match(api, /incomingTmdb && incomingTmdb !== tmdbId/, 'watch edit keeps an existing tmdb_id unless the client picks a new one');
assert.match(api, /resolvedTmdb = await resolveMovieTmdbId/, 'watchlist POST resolves');
assert.match(api, /nextTmdbId = await resolveMovieTmdbId/, 'watchlist title edit resolves when unlinked');
assert.match(api, /fillRankMovie/, 'rank writes cache poster/metadata when tmdb_id is already known');

const settings = readFileSync(new URL('../amc-a-lister/engine/settings.js', import.meta.url), 'utf8');
assert.match(settings, /scope: 'all'/, 'Settings button runs the all-accounts backfill');
assert.match(settings, /i < 50/, 'Settings keeps looping batches until remaining is 0');

const listWatches = readFileSync(new URL('../lib/a-list.js', import.meta.url), 'utf8');
assert.match(listWatches, /hydrateMovieRows/, 'watch lists self-heal posters on load');
assert.match(listWatches, /COALESCE\(NULLIF\(r\.poster_path, ''\), c\.poster_path\)/, 'public ranks join the movie cache');
assert.match(listWatches, /resolveMovieTmdbId/, 'showing-invite accept resolves TMDB before insert');
assert.match(
  listWatches,
  /tmdbId = await resolveMovieTmdbId\(\{[\s\S]*title: invite\.title[\s\S]*tmdbId: invite\.tmdb_id[\s\S]*watchedOn: invite\.watched_on/,
  'invite snapshot insert uses the same matcher as other writes',
);

const posters = readFileSync(new URL('../lib/a-list-posters.js', import.meta.url), 'utf8');
assert.match(posters, /pickBestMovieMatch\(results, row\.title, \{ watchedOn: row\.watched_on \}\)/, 'backfill uses year-aware exact match');
assert.match(posters, /searchMovies\(title, \{ apiKey \}\)/, 'write-time search is the shared TMDB client');

console.log('alist posters: all assertions passed');
