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

console.log('tmdb helper tests passed');
