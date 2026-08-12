import assert from 'node:assert/strict';
import {
  mapCastMembers,
  movieDetailsFromTmdb,
  movieDetailsFromCacheRow,
  movieFromTmdbResult,
  cacheHasFullDetails,
  cacheHasCastMembers,
  pickBestMatch,
  normalizeTitle,
  usTheatricalReleaseDate,
  isNotableCredit,
  selectPersonCredits,
} from '../lib/tmdb.js';

const mapped = mapCastMembers([
  { id: 2, name: 'Second', order: 1, profile_path: '/b.jpg' },
  { id: 1, name: 'First', order: 0, profile_path: '/a.jpg' },
  { id: 3, name: 'Third', order: 2 },
], 2);
assert.equal(mapped.length, 2);
assert.equal(mapped[0].name, 'First');
assert.equal(mapped[1].id, 2);

const details = movieDetailsFromTmdb({
  id: 99,
  title: 'Test Film',
  release_date: '2020-05-01',
  poster_path: '/p.jpg',
  overview: 'Hello',
  runtime: 120,
  vote_average: 8.4,
  genres: [{ name: 'Drama' }],
  credits: {
    crew: [{ job: 'Director', name: 'Ada' }, { job: 'Writer', name: 'Bea' }],
    cast: [
      { id: 10, name: 'Star', order: 0, profile_path: '/s.jpg' },
      { id: 11, name: 'Co-Star', order: 1 },
    ],
  },
});
assert.equal(details.tmdb_id, 99);
assert.equal(details.director, 'Ada');
assert.deepEqual(details.cast, ['Star', 'Co-Star']);
assert.equal(details.cast_members[0].id, 10);
assert.equal(details.vote_average, 8.4);

const searchShape = movieFromTmdbResult({
  id: 1,
  title: 'Search Hit',
  release_date: '2019-01-02',
  poster_path: null,
  overview: null,
});
assert.equal(searchShape.year, 2019);
assert.equal(searchShape.release_date, null);
assert.deepEqual(searchShape.cast_members, []);

const cacheRow = {
  tmdb_id: 99,
  title: 'Test Film',
  year: 2020,
  poster_path: '/p.jpg',
  runtime_min: 120,
  genres: ['Drama'],
  release_date: '2020-05-01',
  raw: details,
};
assert.equal(cacheHasFullDetails(cacheRow), true);
assert.equal(cacheHasCastMembers(cacheRow), true);
assert.equal(movieDetailsFromCacheRow(cacheRow).cast_members[0].name, 'Star');

const legacyRow = {
  tmdb_id: 5,
  title: 'Legacy',
  year: 2010,
  poster_path: null,
  runtime_min: null,
  genres: null,
  release_date: null,
  raw: { director: 'Old', cast: ['A', 'B'] },
};
assert.equal(cacheHasFullDetails(legacyRow), true);
assert.equal(cacheHasCastMembers(legacyRow), false);
assert.deepEqual(movieDetailsFromCacheRow(legacyRow).cast, ['A', 'B']);

assert.equal(normalizeTitle('  Hello '), 'hello');
assert.equal(pickBestMatch([{ title: 'Inception' }], 'inception').title, 'Inception');

const usTheatrical = usTheatricalReleaseDate({
  results: [{
    iso_3166_1: 'US',
    release_dates: [
      { type: 4, release_date: '2020-06-01T00:00:00.000Z' },
      { type: 2, release_date: '2020-05-15T00:00:00.000Z' },
      { type: 3, release_date: '2020-05-22T00:00:00.000Z' },
    ],
  }],
});
assert.equal(usTheatrical, '2020-05-15');

assert.equal(
  usTheatricalReleaseDate({ results: [] }, { fallback: '2018-07-04' }),
  '2018-07-04',
);

const usDetails = movieDetailsFromTmdb({
  id: 42,
  title: 'Wide Release',
  release_date: '2019-01-01',
  release_dates: {
    results: [{
      iso_3166_1: 'US',
      release_dates: [{ type: 3, release_date: '2019-03-01T00:00:00.000Z' }],
    }],
  },
  genres: [],
  credits: { crew: [], cast: [] },
});
assert.equal(usDetails.release_date, '2019-03-01');
assert.equal(usDetails.year, 2019);

/* ── Credit screening ──────────────────────────────────────────── */

const feature = { id: 1, vote_count: 5000, genre_ids: [18], character: 'Chuck Noland' };
assert.equal(isNotableCredit(feature, { acting: true }), true);

// The padding that crowded out Tom Hanks' real filmography.
assert.equal(
  isNotableCredit({ id: 2, vote_count: 4, genre_ids: [18], character: 'Host' }, { acting: true }),
  false,
  'low-vote credits are screened out',
);
assert.equal(
  isNotableCredit({ id: 3, vote_count: 900, genre_ids: [99], character: 'Narrator' }, { acting: true }),
  false,
  'documentaries are screened out of acting credits',
);
assert.equal(
  isNotableCredit({ id: 4, vote_count: 900, genre_ids: [18], character: 'Self' }, { acting: true }),
  false,
  '"as themselves" appearances are screened out',
);
assert.equal(
  isNotableCredit({ id: 5, vote_count: 900, genre_ids: [18], character: 'Man (archive footage)' }, { acting: true }),
  false,
  'archive footage is screened out',
);

// …but a documentary filmmaker's own directing credits must survive, or the
// documentary screen would empty their filmography entirely.
assert.equal(
  isNotableCredit({ id: 6, vote_count: 900, genre_ids: [99] }, { acting: false }),
  true,
  'documentary directing credits are kept',
);
assert.equal(isNotableCredit(null, { acting: true }), false);
assert.equal(isNotableCredit({ vote_count: 900 }, { acting: false }), false, 'credits need an id');

/* ── Film-set selection ────────────────────────────────────────── */

// Shaped like the failure this replaced: TMDB returns credits oldest-first,
// so taking the first N kept the padding and dropped the famous work.
const hanksish = {
  cast: [
    { id: 1, title: 'Early Obscure Comedy', vote_count: 900, genre_ids: [35], character: 'Rick', popularity: 4 },
    { id: 2, title: 'Talking-Head Doc', vote_count: 60, genre_ids: [99], character: 'Self', popularity: 2 },
    { id: 3, title: 'Awards Special', vote_count: 3, genre_ids: [10770], character: 'Self', popularity: 1 },
    { id: 4, title: 'The Famous One', vote_count: 26000, genre_ids: [18], character: 'Captain', popularity: 60 },
    { id: 5, title: 'The Other Famous One', vote_count: 18000, genre_ids: [18], character: 'Pilot', popularity: 40 },
  ],
  crew: [],
};

const acted = selectPersonCredits(hanksish, 'person-acted');
assert.deepEqual(
  acted.ids,
  [4, 5, 1],
  'films come back most-voted first, with documentary and awards padding screened out',
);
assert.equal(acted.totalRaw, 5);
assert.equal(acted.totalEligible, 3);
assert.equal(acted.relaxed, false);

// The specific regression: capping to a scan depth must keep the famous films.
assert.deepEqual(acted.ids.slice(0, 2), [4, 5], 'a shallow scan keeps the best-known films');

const everything = selectPersonCredits(hanksish, 'person-acted', 'everything');
assert.equal(everything.totalEligible, 5, 'opting out of screening keeps every credit');
assert.deepEqual(everything.ids.slice(0, 2), [4, 5], 'ranking still applies without screening');

// Directing credits ignore the acting screens entirely.
const docDirector = {
  cast: [],
  crew: [
    { id: 10, job: 'Director', vote_count: 400, genre_ids: [99], popularity: 5 },
    { id: 11, job: 'Producer', vote_count: 900, genre_ids: [18], popularity: 9 },
  ],
};
assert.deepEqual(
  selectPersonCredits(docDirector, 'person-directed').ids,
  [10],
  'a documentary director keeps their documentaries, and only directing credits count',
);

// One film, one entry, even when a person holds several credits on it.
const dual = {
  cast: [{ id: 20, vote_count: 5000, genre_ids: [18], character: 'Self', popularity: 8 }],
  crew: [{ id: 20, job: 'Director', vote_count: 5000, genre_ids: [18], popularity: 8 }],
};
const anyRole = selectPersonCredits(dual, 'person-any');
assert.deepEqual(anyRole.ids, [20], 'a film held under two credits appears once');
assert.equal(anyRole.totalRaw, 1);

// An entirely obscure filmography degrades to the unscreened list rather than
// returning nothing at all.
const obscure = { cast: [{ id: 30, vote_count: 2, genre_ids: [18], character: 'Man' }], crew: [] };
const relaxed = selectPersonCredits(obscure, 'person-acted');
assert.deepEqual(relaxed.ids, [30]);
assert.equal(relaxed.relaxed, true, 'screening is relaxed rather than returning an empty set');

assert.deepEqual(selectPersonCredits(null, 'person-acted').ids, [], 'a missing payload is not fatal');

console.log('tmdb helper tests passed');
