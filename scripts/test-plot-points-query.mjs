import assert from 'node:assert/strict';
import {
  GROUP_BY,
  NUMERIC_FIELDS,
  decorateMovie,
  describeSpec,
  entitiesForMovie,
  fieldHasValue,
  formatMetric,
  formatMoney,
  groupByNeedsCredits,
  SHRINK_PRIOR,
  metricLabel,
  movieMatchesFilters,
  normalizeSpec,
  runQuery,
  specToHeadline,
} from '../plot-points/query-engine.js';

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

/* ── Real lib/tmdb.js payload shape ────────────────────────────── */

// Regression guard: lib/tmdb.js emits `cast_members`/`crew_members` and keeps
// `cast` as a plain name array for A-Lister. Reading `cast`/`crew` directly
// silently produced zero groups for every query.
const tmdbShaped = [
  {
    tmdb_id: 101,
    title: 'Shaped One',
    release_date: '2017-01-01',
    runtime_min: 110,
    vote_average: 8,
    genres: ['Drama'],
    cast: ['Ada Lovelace', 'Bea Smith'],
    cast_members: [
      { id: 10, name: 'Ada Lovelace', profile_path: null, order: 0 },
      { id: 11, name: 'Bea Smith', profile_path: null, order: 1 },
    ],
    crew_members: [
      { id: 90, name: 'A Director', job: 'Director', department: 'Directing' },
      { id: 91, name: 'A Composer', job: 'Original Music Composer', department: 'Sound' },
    ],
  },
  {
    tmdb_id: 102,
    title: 'Shaped Two',
    release_date: '2019-01-01',
    runtime_min: 90,
    vote_average: 6,
    genres: ['Drama'],
    cast: ['Ada Lovelace'],
    cast_members: [{ id: 10, name: 'Ada Lovelace', profile_path: null, order: 0 }],
    crew_members: [{ id: 90, name: 'A Director', job: 'Director', department: 'Directing' }],
  },
];

const shapedDecorated = decorateMovie(tmdbShaped[0]);
assert.equal(shapedDecorated.cast.length, 2, 'cast_members should populate cast');
assert.equal(shapedDecorated.crew.length, 2, 'crew_members should populate crew');
assert.equal(shapedDecorated.cast_size, 2);
assert.equal(shapedDecorated.runtime, 110, 'runtime should fall back to runtime_min');

const shapedActors = runQuery(tmdbShaped, { group_by: 'actor', metric: { agg: 'count' }, min_films: 1 });
assert.equal(shapedActors.stats.groups_found, 2);
assert.equal(shapedActors.results[0].label, 'Ada Lovelace');
assert.equal(shapedActors.results[0].film_count, 2);

const shapedComposers = runQuery(tmdbShaped, { group_by: 'composer', metric: { agg: 'count' }, min_films: 1 });
assert.equal(shapedComposers.results.length, 1);
assert.equal(shapedComposers.results[0].label, 'A Composer');

const shapedRuntime = runQuery(tmdbShaped, {
  group_by: 'director',
  metric: { agg: 'avg', field: 'runtime' },
  min_films: 1,
});
assert.equal(shapedRuntime.results[0].metric, 100, 'mean of runtime_min 110 and 90');

// A name-only cast array carries no TMDB ids, so it must not fabricate groups.
const namesOnly = runQuery(
  [{ tmdb_id: 1, title: 'Names', release_date: '2020-01-01', cast: ['Someone'] }],
  { group_by: 'actor', metric: { agg: 'count' }, min_films: 1 },
);
assert.equal(namesOnly.stats.groups_found, 0);

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
for (const [key, meta] of Object.entries(GROUP_BY)) {
  assert.ok(meta.label, `${key} needs a label`);
  assert.ok(meta.entityLabel, `${key} needs an entityLabel`);
  assert.ok(meta.plural, `${key} needs a plural for prose`);
  assert.equal(meta.plural, meta.plural.toLowerCase(), `${key} plural should be lowercase`);
}
for (const [key, meta] of Object.entries(NUMERIC_FIELDS)) {
  assert.ok(meta.short, `${key} needs a short prose label`);
  assert.ok(!/[()]/.test(meta.short), `${key} short label should not carry units in parens`);
}

// Prose must not naively pluralize labels ("Studio / companys") or lowercase acronyms.
const studioSpec = normalizeSpec({
  group_by: 'company',
  metric: { agg: 'avg', field: 'vote_average' },
});
assert.ok(describeSpec(studioSpec).startsWith('Studios ranked by'), describeSpec(studioSpec));
assert.ok(describeSpec(studioSpec).includes('TMDB rating'), describeSpec(studioSpec));
assert.ok(specToHeadline(studioSpec).startsWith('Studios with the highest'), specToHeadline(studioSpec));

const countrySpec = normalizeSpec({ group_by: 'country', metric: { agg: 'count' } });
assert.ok(describeSpec(countrySpec).startsWith('Countries ranked by'), describeSpec(countrySpec));

assert.equal(metricLabel(normalizeSpec({ metric: { agg: 'avg', field: 'runtime' } })), 'avg runtime');

/* ── Scan depth, credit quality, rank mode ─────────────────────── */

const defaults = normalizeSpec({});
assert.equal(defaults.depth, 60);
assert.equal(defaults.credit_quality, 'notable');
assert.equal(defaults.rank_by, 'metric');

assert.equal(normalizeSpec({ depth: 200 }).depth, 200);
assert.equal(normalizeSpec({ depth: 137 }).depth, 60, 'off-menu depths fall back to the default');
assert.equal(normalizeSpec({ credit_quality: 'everything' }).credit_quality, 'everything');
assert.equal(normalizeSpec({ credit_quality: 'nonsense' }).credit_quality, 'notable');
assert.equal(normalizeSpec({ rank_by: 'lift' }).rank_by, 'lift');
assert.equal(normalizeSpec({ rank_by: 'nonsense' }).rank_by, 'metric');

// Counting one film is fine; averaging one film is how a leaderboard fills
// with noise, so averages start at two.
assert.equal(normalizeSpec({ metric: { agg: 'count' } }).min_films, 1);
assert.equal(normalizeSpec({ metric: { agg: 'avg', field: 'vote_average' } }).min_films, 2);
assert.equal(
  normalizeSpec({ metric: { agg: 'avg', field: 'vote_average' }, min_films: 1 }).min_films,
  1,
  'an explicit min_films still wins',
);
// A row can't hold more films than the query reads.
assert.equal(normalizeSpec({ min_films: 500, depth: 60 }).min_films, 60);
assert.equal(normalizeSpec({ min_films: 500, depth: 200 }).min_films, 200);

/* ── Pair grouping ─────────────────────────────────────────────── */

const coStars = runQuery(movies, {
  group_by: 'actor+actor',
  metric: { agg: 'count' },
  min_films: 1,
});
const adaBea = coStars.results.find((r) => r.label === 'Ada × Bea');
assert.ok(adaBea, 'co-star pairs are produced');
assert.deepEqual(adaBea.pair, [10, 11]);
assert.equal(
  coStars.results.filter((r) => r.label === 'Bea × Ada').length,
  0,
  'unordered pairs collapse into one row rather than splitting',
);
assert.equal(coStars.results.find((r) => r.label === 'Ada × Cara').film_count, 1);

const actorDirector = runQuery(movies, {
  group_by: 'actor+director',
  metric: { agg: 'count' },
  min_films: 2,
});
assert.equal(actorDirector.results[0].label, 'Ada × Nolan');
assert.equal(actorDirector.results[0].film_count, 2);
assert.ok(groupByNeedsCredits('actor+director'), 'pair dimensions need credits fetched');
assert.ok(groupByNeedsCredits('actor+actor'));

// A person who both acted in and directed the same film is not a collaboration.
const selfPair = runQuery([film({
  tmdb_id: 9,
  cast: [{ id: 50, name: 'Solo', order: 0 }],
  crew: [{ id: 50, name: 'Solo', job: 'Director' }],
})], { group_by: 'actor+director', metric: { agg: 'count' }, min_films: 1 });
assert.equal(selfPair.results.length, 0, 'self-pairs are dropped as degenerate');

/* ── Excluding the scope subject ───────────────────────────────── */

// "Who does X co-star with" is "who is in X's films" minus X, who is in all
// of them and would otherwise be a trivial #1.
const withSubject = runQuery(movies, {
  scope: { type: 'person-acted', person_id: 10, person_name: 'Ada' },
  group_by: 'actor',
  metric: { agg: 'count' },
  min_films: 1,
});
assert.equal(withSubject.results[0].label, 'Ada', 'by default the subject tops their own filmography');

const withoutSubject = runQuery(movies, {
  scope: { type: 'person-acted', person_id: 10, person_name: 'Ada' },
  group_by: 'actor',
  metric: { agg: 'count' },
  exclude_subject: true,
  min_films: 1,
});
assert.ok(
  !withoutSubject.results.some((r) => r.label === 'Ada'),
  'the subject is dropped from the rows when excluded',
);
assert.ok(withoutSubject.results.length, 'their co-stars still come back');
assert.ok(
  describeSpec(normalizeSpec({
    scope: { type: 'person-acted', person_id: 10, person_name: 'Ada' },
    group_by: 'actor',
    metric: { agg: 'count' },
    exclude_subject: true,
  })).includes('excluding Ada'),
  'provenance says who was left out',
);

// Pairs containing the subject go too, so co-star pairs stay about other people.
const pairsWithoutSubject = runQuery(movies, {
  scope: { type: 'person-acted', person_id: 10, person_name: 'Ada' },
  group_by: 'actor+actor',
  metric: { agg: 'count' },
  exclude_subject: true,
  min_films: 1,
});
assert.ok(
  !pairsWithoutSubject.results.some((r) => r.label.includes('Ada')),
  'pairs involving the excluded subject are dropped too',
);

assert.equal(normalizeSpec({}).exclude_subject, false, 'off by default');
assert.equal(normalizeSpec({ exclude_subject: true }).exclude_subject, true);

// "Who is in the most of their films" and "who turns up alongside them" are
// different questions and must not share a headline.
assert.ok(
  specToHeadline(normalizeSpec({
    scope: { type: 'person-acted', person_id: 10, person_name: 'Ada' },
    group_by: 'actor',
    metric: { agg: 'count' },
    exclude_subject: true,
  })).includes('alongside Ada'),
  'excluding the subject changes the headline',
);

// Group nouns come from data, so the article has to agree with them.
assert.ok(
  withSubject.findings[0].includes('an actor'),
  `article agrees with the group noun: ${withSubject.findings[0]}`,
);
assert.ok(
  runQuery(movies, { group_by: 'company', metric: { agg: 'count' }, min_films: 1 })
    .findings[0].includes('a studio'),
);

/* ── Baselines, confidence weighting, lift ─────────────────────── */

const rated = runQuery(movies, {
  group_by: 'actor',
  metric: { agg: 'avg', field: 'vote_average' },
  min_films: 1,
});
const setAverage = (8 + 6 + 9) / 3;
assert.equal(rated.query.baseline, Math.round(setAverage * 100) / 100);
for (const row of rated.results) {
  assert.equal(row.baseline, rated.query.baseline);
  assert.equal(row.delta, Math.round((row.metric - row.baseline) * 100) / 100);
}

// Bea has a single 8.0; Ada has 8.0 and 6.0. Raw ranking puts the one-film row
// on top, confidence weighting pulls it back toward the film-set average.
const thinRow = rated.results.find((r) => r.label === 'Bea');
const thickRow = rated.results.find((r) => r.label === 'Ada');
assert.equal(thinRow.metric, 8);
assert.ok(thinRow.adjusted < thinRow.metric, 'a thin row is pulled toward the baseline');

// Shrinkage closes a fixed *fraction* of a row's gap to the baseline —
// SHRINK_PRIOR / (films + SHRINK_PRIOR) — so the comparison that matters is
// the share of the gap closed, not how far the value moved.
const gapClosed = (row) => Math.abs(row.adjusted - row.metric) / Math.abs(row.metric - row.baseline);
assert.ok(
  Math.abs(gapClosed(thinRow) - (SHRINK_PRIOR / (1 + SHRINK_PRIOR))) < 0.02,
  'a one-film row is pulled three quarters of the way to the baseline',
);
assert.ok(
  gapClosed(thickRow) < gapClosed(thinRow),
  'the row with more films keeps more of its own value',
);
assert.equal(rated.query.confidence_weighted, true);

const rawRanked = runQuery(movies, {
  group_by: 'actor',
  metric: { agg: 'avg', field: 'vote_average' },
  min_films: 1,
  rank_by: 'raw',
});
assert.equal(rawRanked.query.confidence_weighted, false);
assert.equal(rawRanked.results[0].adjusted, rawRanked.results[0].metric, 'raw mode does not shrink');

// Sums are not central tendencies — shrinking one would report a different
// statistic than the one asked for.
const summed = runQuery(movies, {
  group_by: 'actor',
  metric: { agg: 'sum', field: 'runtime' },
  min_films: 1,
});
assert.equal(summed.query.confidence_weighted, false);
assert.equal(summed.results[0].adjusted, summed.results[0].metric);

// For a count, the meaningful comparison is against the typical row size.
const counted = runQuery(movies, { group_by: 'actor', metric: { agg: 'count' }, min_films: 1 });
assert.ok(counted.query.baseline > 0, 'counts get a rows-per-group baseline');
assert.equal(counted.query.baseline_label, 'average films per actor');

/* ── Sparse money fields include losses ────────────────────────── */

const moneyMovies = [
  film({ tmdb_id: 1, budget: 200, revenue: 50, cast: [{ id: 1, name: 'Flop', order: 0 }] }),
  film({ tmdb_id: 2, budget: 100, revenue: 900, cast: [{ id: 2, name: 'Hit', order: 0 }] }),
  film({ tmdb_id: 3, cast: [{ id: 3, name: 'Unknown', order: 0 }] }),
];
const profits = runQuery(moneyMovies, {
  group_by: 'actor',
  metric: { agg: 'avg', field: 'profit' },
  min_films: 1,
  sort: 'asc',
  rank_by: 'raw',
});
assert.equal(profits.results[0].label, 'Flop', 'a money-loser can rank lowest on profit');
assert.equal(profits.results[0].metric, -150, 'losses are kept, not zeroed out');
assert.ok(
  !profits.results.some((r) => r.label === 'Unknown'),
  'films with no budget/revenue reported are excluded rather than counted as zero',
);
assert.equal(profits.stats.films_with_metric, 2);

assert.equal(fieldHasValue({ budget: 200, revenue: 50 }, 'profit'), true);
assert.equal(fieldHasValue({ budget: 0, revenue: 50 }, 'profit'), false);
assert.equal(fieldHasValue({ vote_average: 0 }, 'vote_average'), true, 'dense fields always count');

/* ── Money formatting ──────────────────────────────────────────── */

assert.equal(formatMoney(-150e6), '−$150.0M');
assert.equal(formatMoney(1.25e9), '$1.25B');
assert.equal(formatMoney(-2500), '−$3K');
assert.equal(formatMoney(0), '$0');

/* ── Findings ──────────────────────────────────────────────────── */

assert.ok(counted.findings.length, 'a result set produces findings');
assert.ok(
  counted.findings[0].includes('Ada'),
  `top finding names the leading row: ${counted.findings[0]}`,
);
assert.ok(
  coStars.findings.some((f) => f.includes('pair')),
  `pair queries report how many pairs recur: ${JSON.stringify(coStars.findings)}`,
);
assert.deepEqual(
  runQuery([], { group_by: 'actor', metric: { agg: 'count' } }).findings,
  [],
  'an empty result set produces no findings',
);
assert.equal(
  runQuery(movies, { group_by: 'actor', metric: { agg: 'count' }, min_films: 99 }).results.length,
  0,
  'an impossible min_films yields no rows rather than throwing',
);

console.log('plot-points query engine tests passed');
