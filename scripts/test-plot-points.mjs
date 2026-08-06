import assert from 'node:assert/strict';
import {
  aggregateDirectorCast,
  buildQueryResult,
  directorMoviesFromCredits,
  normalizeMinFilms,
  rankActors,
} from '../lib/plot-points.js';

assert.equal(normalizeMinFilms('3'), 3);
assert.equal(normalizeMinFilms(0), 2);
assert.equal(normalizeMinFilms(99), 20);

const movies = directorMoviesFromCredits([
  { id: 1, title: 'One', job: 'Director', release_date: '2010-01-01', vote_average: 8, poster_path: '/a.jpg' },
  { id: 1, title: 'One', job: 'Director', release_date: '2010-01-01', vote_average: 8 },
  { id: 2, title: 'Two', job: 'Writer', release_date: '2011-01-01', vote_average: 7 },
  { id: 3, title: 'Three', job: 'Director', release_date: '2012-06-01', vote_average: 9, poster_path: '/c.jpg' },
]);
assert.equal(movies.length, 2);
assert.equal(movies[0].tmdb_id, 3);

const filmData = [
  {
    tmdb_id: 1,
    title: 'One',
    year: 2010,
    vote_average: 8,
    poster_path: '/a.jpg',
    cast: [
      { id: 10, name: 'Ada', order: 0 },
      { id: 11, name: 'Bea', order: 1 },
    ],
  },
  {
    tmdb_id: 3,
    title: 'Three',
    year: 2012,
    vote_average: 9,
    poster_path: '/c.jpg',
    cast: [
      { id: 10, name: 'Ada', order: 0 },
      { id: 12, name: 'Cara', order: 1 },
    ],
  },
];

const { actors, stats } = aggregateDirectorCast(filmData, { minFilms: 2 });
assert.equal(stats.film_count, 2);
assert.equal(stats.unique_actors, 3);
assert.equal(stats.repeat_actors, 1);

const byCount = rankActors(actors, 'cast-count', 2);
assert.equal(byCount[0].name, 'Ada');
assert.equal(byCount[0].film_count, 2);

const byRating = rankActors(actors, 'cast-rating', 1);
assert.equal(byRating[0].name, 'Cara');
assert.equal(byRating[0].avg_rating, 9);

const reuse = rankActors(actors, 'reuse', 2);
assert.equal(reuse.length, 1);

const result = buildQueryResult({
  type: 'cast-count',
  person: { tmdb_id: 525, name: 'Test Director' },
  movies: filmData,
  minFilms: 1,
});
assert.equal(result.query.headline.includes('Test Director'), true);
assert.equal(result.query.filters.media, 'movies');
assert.equal(result.results[0].name, 'Ada');
assert.ok(result.query.attribution.includes('TMDB'));

console.log('plot-points tests passed');
