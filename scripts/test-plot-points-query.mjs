import assert from 'node:assert/strict';
import {
  GROUP_BY,
  NUMERIC_FIELDS,
  decorateMovie,
  describeSpec,
  entitiesForMovie,
  formatMetric,
  groupByNeedsCredits,
  movieMatchesFilters,
  normalizeSpec,
  runQuery,
} from '../lib/plot-points-query.js';

/* ── Fixtures ──────────────────────────────────────────────────── */

const film = (over) => ({
  tmdb_id: 1,
  title: 'Film',
  release_date: '2010-01-01',
  poster_path: null,
  vote_average: 7,
  vote_count: 1000,
  popularity: 10,
  runtime: 120,
  budget: 0,
  revenue: 0,
  genres: [],
  companies: [],
  countries: [],
  language: 'en',
  collection: null,
  cast: [],
  crew: [],
  ...over,
});

const movies = [
  film({
    tmdb_id: 1,
    title: 'Alpha',
    release_date: '2008-05-01',
    vote_average: 8,
    runtime: 130,
    budget: 100,
    revenue: 400,
    genres: ['Thriller', 'Drama'],
    companies: ['Studio A'],
    cast: [
      { id: 10, name: 'Ada', order: 0 },
      { id: 11, name: 'Bea', order: 1 },
    ],
    crew: [
      { id: 90, name: 'Nolan', job: 'Director' },
      { id: 91, name: 'Zimmer', job: 'Original Music Composer' },
    ],
  }),
  film({
    tmdb_id: 2,
    title: 'Beta',
    release_date: '2014-06-01',
    vote_average: 6,
    runtime: 100,
    budget: 200,
    revenue: 200,
    genres: ['Drama'],
    companies: ['Studio A', 'Studio B'],
    cast: [
      { id: 10, name: 'Ada', order: 0 },
      { id: 12, name: 'Cara', order: 1 },
    ],
    crew: [
      { id: 90, name: 'Nolan', job: 'Director' },
      { id: 91, name: 'Zimmer', job: 'Original Music Composer' },
    ],
  }),
  film({
    tmdb_id: 3,
    title: 'Gamma',
    release_date: '2021-07-01',
    vote_average: 9,
    runtime: 90,
    genres: ['Comedy'],
    companies: ['Studio B'],
    cast: [{ id: 12, name: 'Cara', order: 0 }],
    crew: [{ id: 92, name: 'Other', job: 'Director' }],
  }),
];

/* ── Normalization + derived fields ────────────────────────────── */

const decorated = decorateMovie(movies[0]);
assert.equal(decorated.year, 2008);
assert.equal(decorated.decade, '2000s');
assert.equal(decorated.profit, 300);
assert.equal(decorated.roi, 4);
assert.equal(decorated.cast_size, 2);

const spec = normalizeSpec({});
assert.equal(spec.scope.type, 'person-directed');
assert.equal(spec.group_by, 'actor');
assert.equal(spec.metric.agg, 'count');
assert.equal(spec.metric.field, null, 'count metric should not carry a field');
assert.equal(spec.limit, 25);

const clamped = normalizeSpec({ limit: 9999, min_films: 0, group_by: 'nope', sort: 'weird' });
assert.equal(clamped.limit, 100);
assert.equal(clamped.min_films, 1);
assert.equal(clamped.group_by, 'actor');
assert.equal(clamped.sort, 'desc');

/* ── Group-by dimensions ───────────────────────────────────────── */

assert.equal(groupByNeedsCredits('actor'), true);
assert.equal(groupByNeedsCredits('composer'), true);
assert.equal(groupByNeedsCredits('genre'), false);

const actors = entitiesForMovie(decorateMovie(movies[0]), 'actor');
assert.deepEqual(actors.map((a) => a.label), ['Ada', 'Bea']);

const composers = entitiesForMovie(decorateMovie(movies[0]), 'composer');
assert.deepEqual(composers.map((c) => c.label), ['Zimmer']);

const genres = entitiesForMovie(decorateMovie(movies[0]), 'genre');
assert.deepEqual(genres.map((g) => g.label), ['Thriller', 'Drama']);

const decades = entitiesForMovie(decorateMovie(movies[2]), 'decade');
assert.deepEqual(decades.map((d) => d.label), ['2020s']);

/* ── Filters ───────────────────────────────────────────────────── */

assert.equal(
  movieMatchesFilters(decorateMovie(movies[0]), [{ field: 'vote_average', op: 'gte', value: 7.5 }]),
  true,
);
assert.equal(
  movieMatchesFilters(decorateMovie(movies[1]), [{ field: 'vote_average', op: 'gte', value: 7.5 }]),
  false,
);
assert.equal(
  movieMatchesFilters(decorateMovie(movies[0]), [{ field: 'genres', op: 'includes', value: 'drama' }]),
  true,
);
assert.equal(
  movieMatchesFilters(decorateMovie(movies[0]), [{ field: 'genres', op: 'excludes', value: 'drama' }]),
  false,
);

/* ── Count metric ──────────────────────────────────────────────── */

const byCount = runQuery(movies, {
  scope: { type: 'person-directed', person_id: 1 },
  group_by: 'actor',
  metric: { agg: 'count' },
  min_films: 2,
});
assert.equal(byCount.results.length, 2, 'Ada and Cara each appear twice');
assert.deepEqual(byCount.results.map((r) => r.label), ['Ada', 'Cara']);
assert.equal(byCount.results[0].rank, 1);
assert.equal(byCount.stats.films_scanned, 3);

/* ── Average metric ────────────────────────────────────────────── */

const byRating = runQuery(movies, {
  group_by: 'actor',
  metric: { agg: 'avg', field: 'vote_average' },
  min_films: 1,
});
// Bea only has Alpha (8.0), so she outranks Ada's (8+6)/2 = 7.0
assert.equal(byRating.results[0].label, 'Bea');
assert.equal(byRating.results[0].metric, 8);
const ada = byRating.results.find((r) => r.label === 'Ada');
assert.equal(ada.metric, 7);

const ascending = runQuery(movies, {
  group_by: 'actor',
  metric: { agg: 'avg', field: 'vote_average' },
  min_films: 1,
  sort: 'asc',
});
assert.equal(ascending.results[0].label, 'Ada', 'asc sort should surface the lowest average');

/* ── Non-person group-by ───────────────────────────────────────── */

const byGenre = runQuery(movies, {
  group_by: 'genre',
  metric: { agg: 'count' },
  min_films: 1,
});
const drama = byGenre.results.find((r) => r.label === 'Drama');
assert.equal(drama.film_count, 2);

const byStudio = runQuery(movies, {
  group_by: 'company',
  metric: { agg: 'median', field: 'runtime' },
  min_films: 2,
});
assert.equal(byStudio.results.length, 2);
assert.equal(byStudio.results.find((r) => r.label === 'Studio A').metric, 115);

/* ── Sparse money fields ───────────────────────────────────────── */

// Gamma reports no budget/revenue, so it must not drag ROI averages to zero.
const byRoi = runQuery(movies, {
  group_by: 'director',
  metric: { agg: 'avg', field: 'roi' },
  min_films: 1,
});
assert.equal(byRoi.results[0].label, 'Nolan');
assert.equal(byRoi.results[0].metric, 2.5, 'mean of ROI 4 and 1, ignoring the film with no budget');
assert.equal(
  byRoi.results.some((r) => r.label === 'Other'),
  false,
  'a group with no reported values should be dropped, not shown as zero',
);
assert.equal(byRoi.query.sparse_metric, true);

/* ── Filters applied inside a query ────────────────────────────── */

const filtered = runQuery(movies, {
  group_by: 'actor',
  metric: { agg: 'count' },
  min_films: 1,
  filters: [{ field: 'genres', op: 'includes', value: 'Drama' }],
});
assert.equal(filtered.stats.films_matched, 2);
assert.equal(filtered.results.some((r) => r.label === 'Bea'), true);

const limited = runQuery(movies, { group_by: 'actor', metric: { agg: 'count' }, limit: 1, min_films: 1 });
assert.equal(limited.results.length, 1);

/* ── Provenance + formatting ───────────────────────────────────── */

const described = describeSpec(normalizeSpec({
  scope: { type: 'person-directed', person_name: 'Christopher Nolan', person_id: 525 },
  group_by: 'composer',
  metric: { agg: 'avg', field: 'vote_average' },
  min_films: 2,
}));
assert.ok(/composer/i.test(described), described);
assert.ok(described.includes('Christopher Nolan'), described);
assert.ok(described.includes('at least 2 films'), described);

assert.equal(byCount.query.metric_label, 'films');
assert.equal(byRating.query.group_label, 'Actor');
assert.ok(byCount.query.headline.length > 0);

const moneySpec = normalizeSpec({ metric: { agg: 'sum', field: 'revenue' } });
assert.equal(formatMetric(2_500_000_000, moneySpec), '$2.50B');
assert.equal(formatMetric(4_100_000, moneySpec), '$4.1M');
assert.equal(formatMetric(7.46, normalizeSpec({ metric: { agg: 'avg', field: 'vote_average' } })), '7.5');

/* ── Catalog sanity ────────────────────────────────────────────── */

assert.ok(Object.keys(GROUP_BY).length >= 10);
assert.ok(NUMERIC_FIELDS.vote_average);
for (const [key, meta] of Object.entries(GROUP_BY)) {
  assert.ok(meta.label, `${key} needs a label`);
  assert.ok(meta.entityLabel, `${key} needs an entityLabel`);
}

console.log('plot-points query engine tests passed');
