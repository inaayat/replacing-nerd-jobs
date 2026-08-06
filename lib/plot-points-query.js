/**
 * Plot Points — generic query engine.
 *
 * A query is a pivot over a bounded set of movies:
 *   scope (which films) → group by (row entity) → metric (the number) → filters/sort/limit
 *
 * This module is dependency-free ESM on purpose: the serverless API and the
 * browser both import it, so the field catalog can never drift between them.
 */

/* ── Scopes: how a candidate film set is assembled ─────────────── */

export const SCOPES = {
  'person-directed': {
    label: 'Films directed by',
    needs: 'person',
    describe: (s) => `films directed by ${s.person_name || 'a person'}`,
  },
  'person-acted': {
    label: 'Films acted in by',
    needs: 'person',
    describe: (s) => `films ${s.person_name || 'a person'} appeared in`,
  },
  'person-any': {
    label: 'Any credit for',
    needs: 'person',
    describe: (s) => `films with any credit for ${s.person_name || 'a person'}`,
  },
  discover: {
    label: 'Discover (browse all movies)',
    needs: 'discover',
    describe: (s) => {
      const bits = [];
      if (s.genre_name) bits.push(s.genre_name);
      if (s.year_from || s.year_to) {
        bits.push(`${s.year_from || '…'}–${s.year_to || '…'}`);
      }
      if (s.language) bits.push(`in ${s.language}`);
      if (s.company_name) bits.push(`from ${s.company_name}`);
      return bits.length ? `movies matching ${bits.join(', ')}` : 'popular movies';
    },
  },
  collection: {
    label: 'Franchise / collection',
    needs: 'collection',
    describe: (s) => `films in ${s.collection_name || 'a collection'}`,
  },
};

/* ── Group-by dimensions: what each result row represents ──────── */

const PERSON_ROLE = (label, opts) => ({
  label,
  kind: 'person',
  entityLabel: label,
  ...opts,
});

export const GROUP_BY = {
  actor: PERSON_ROLE('Actor', { from: 'cast' }),
  director: PERSON_ROLE('Director', { from: 'crew', jobs: ['Director'] }),
  writer: PERSON_ROLE('Writer', {
    from: 'crew',
    jobs: ['Writer', 'Screenplay', 'Story', 'Novel'],
  }),
  producer: PERSON_ROLE('Producer', { from: 'crew', jobs: ['Producer'] }),
  composer: PERSON_ROLE('Composer', {
    from: 'crew',
    jobs: ['Original Music Composer', 'Music'],
  }),
  cinematographer: PERSON_ROLE('Cinematographer', {
    from: 'crew',
    jobs: ['Director of Photography'],
  }),
  editor: PERSON_ROLE('Editor', { from: 'crew', jobs: ['Editor'] }),

  genre: { label: 'Genre', kind: 'list', field: 'genres', entityLabel: 'Genre' },
  company: { label: 'Studio / company', kind: 'list', field: 'companies', entityLabel: 'Studio' },
  country: { label: 'Country', kind: 'list', field: 'countries', entityLabel: 'Country' },
  language: { label: 'Original language', kind: 'scalar', field: 'language', entityLabel: 'Language' },
  collection: { label: 'Collection', kind: 'scalar', field: 'collection', entityLabel: 'Collection' },
  decade: { label: 'Decade', kind: 'scalar', field: 'decade', entityLabel: 'Decade' },
  year: { label: 'Release year', kind: 'scalar', field: 'year', entityLabel: 'Year' },
};

export function groupByNeedsCredits(groupBy) {
  return GROUP_BY[groupBy]?.kind === 'person';
}

/* ── Numeric fields usable in metrics and filters ──────────────── */

export const NUMERIC_FIELDS = {
  vote_average: { label: 'TMDB rating', format: 'rating', max: 10 },
  vote_count: { label: 'Vote count', format: 'int' },
  popularity: { label: 'Popularity', format: 'decimal' },
  runtime: { label: 'Runtime (min)', format: 'int' },
  budget: { label: 'Budget ($)', format: 'money', sparse: true },
  revenue: { label: 'Revenue ($)', format: 'money', sparse: true },
  profit: { label: 'Profit ($)', format: 'money', sparse: true },
  roi: { label: 'Return on budget (x)', format: 'decimal', sparse: true },
  year: { label: 'Release year', format: 'year' },
  cast_size: { label: 'Cast size', format: 'int' },
};

export const AGGREGATIONS = {
  count: { label: 'Number of films', needsField: false, format: 'int' },
  avg: { label: 'Average', needsField: true },
  median: { label: 'Median', needsField: true },
  sum: { label: 'Total', needsField: true },
  max: { label: 'Highest', needsField: true },
  min: { label: 'Lowest', needsField: true },
};

/* ── Filters ───────────────────────────────────────────────────── */

export const FILTER_OPS = {
  gte: { label: 'at least', numeric: true },
  lte: { label: 'at most', numeric: true },
  eq: { label: 'is', numeric: false },
  neq: { label: 'is not', numeric: false },
  includes: { label: 'includes', numeric: false },
  excludes: { label: 'excludes', numeric: false },
};

export const FILTER_FIELDS = {
  ...Object.fromEntries(
    Object.entries(NUMERIC_FIELDS).map(([key, meta]) => [
      key,
      { ...meta, numeric: true },
    ]),
  ),
  genres: { label: 'Genre', numeric: false, list: true },
  companies: { label: 'Studio', numeric: false, list: true },
  countries: { label: 'Country', numeric: false, list: true },
  language: { label: 'Original language', numeric: false },
  decade: { label: 'Decade', numeric: false },
  title: { label: 'Title', numeric: false },
};

/* ── Movie normalization ───────────────────────────────────────── */

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Derived numeric fields are computed once so metrics/filters agree. */
export function decorateMovie(movie) {
  const budget = toNumber(movie.budget);
  const revenue = toNumber(movie.revenue);
  const year = movie.year ?? (movie.release_date ? Number(movie.release_date.slice(0, 4)) : null);
  return {
    ...movie,
    year,
    decade: year ? `${Math.floor(year / 10) * 10}s` : null,
    budget,
    revenue,
    profit: budget && revenue ? revenue - budget : 0,
    roi: budget > 0 && revenue > 0 ? Math.round((revenue / budget) * 100) / 100 : 0,
    cast_size: (movie.cast || []).length,
    vote_average: toNumber(movie.vote_average),
    vote_count: toNumber(movie.vote_count),
    popularity: toNumber(movie.popularity),
    runtime: toNumber(movie.runtime),
    genres: movie.genres || [],
    companies: movie.companies || [],
    countries: movie.countries || [],
  };
}

/* ── Filtering ─────────────────────────────────────────────────── */

function valuesForField(movie, field) {
  const value = movie[field];
  if (Array.isArray(value)) return value.map((v) => String(v).toLowerCase());
  if (value == null) return [];
  return [String(value).toLowerCase()];
}

export function movieMatchesFilters(movie, filters = []) {
  for (const filter of filters) {
    const meta = FILTER_FIELDS[filter?.field];
    if (!meta || !FILTER_OPS[filter.op]) continue;

    if (meta.numeric) {
      const actual = toNumber(movie[filter.field]);
      const target = Number(filter.value);
      if (!Number.isFinite(target)) continue;
      if (filter.op === 'gte' && !(actual >= target)) return false;
      if (filter.op === 'lte' && !(actual <= target)) return false;
      if (filter.op === 'eq' && actual !== target) return false;
      if (filter.op === 'neq' && actual === target) return false;
      continue;
    }

    const needle = String(filter.value ?? '').toLowerCase().trim();
    if (!needle) continue;
    const haystack = valuesForField(movie, filter.field);
    const hit = haystack.some((v) => v === needle || v.includes(needle));
    if ((filter.op === 'eq' || filter.op === 'includes') && !hit) return false;
    if ((filter.op === 'neq' || filter.op === 'excludes') && hit) return false;
  }
  return true;
}

/* ── Grouping ──────────────────────────────────────────────────── */

function crewMatchesJobs(credit, jobs) {
  if (!jobs?.length) return true;
  const job = String(credit.job || '');
  return jobs.some((wanted) => job === wanted);
}

/** Entities a single movie contributes to a given group-by dimension. */
export function entitiesForMovie(movie, groupBy, { topCastPerFilm = 15 } = {}) {
  const meta = GROUP_BY[groupBy];
  if (!meta) return [];

  if (meta.kind === 'person') {
    const source = meta.from === 'cast'
      ? (movie.cast || [])
        .slice()
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
        .slice(0, topCastPerFilm)
      : (movie.crew || []).filter((c) => crewMatchesJobs(c, meta.jobs));

    const seen = new Set();
    const out = [];
    for (const person of source) {
      if (!person?.id || !person.name || seen.has(person.id)) continue;
      seen.add(person.id);
      out.push({
        key: `person:${person.id}`,
        tmdb_id: person.id,
        label: person.name,
        image: person.profile_path || null,
      });
    }
    return out;
  }

  if (meta.kind === 'list') {
    const seen = new Set();
    return (movie[meta.field] || [])
      .filter((value) => {
        const key = String(value).toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((value) => ({ key: `${meta.field}:${value}`, label: String(value), image: null }));
  }

  const value = movie[meta.field];
  if (value == null || value === '') return [];
  return [{ key: `${meta.field}:${value}`, label: String(value), image: null }];
}

/* ── Aggregation ───────────────────────────────────────────────── */

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function aggregate(values, agg) {
  if (!values.length) return 0;
  switch (agg) {
    case 'avg': return round(values.reduce((a, b) => a + b, 0) / values.length);
    case 'median': return round(median(values));
    case 'sum': return round(values.reduce((a, b) => a + b, 0));
    case 'max': return round(Math.max(...values));
    case 'min': return round(Math.min(...values));
    default: return values.length;
  }
}

export const MAX_LIMIT = 100;

export function normalizeSpec(input = {}) {
  const scope = SCOPES[input.scope?.type] ? input.scope : { type: 'person-directed' };
  const groupBy = GROUP_BY[input.group_by] ? input.group_by : 'actor';

  const aggType = AGGREGATIONS[input.metric?.agg] ? input.metric.agg : 'count';
  const needsField = AGGREGATIONS[aggType].needsField;
  const field = NUMERIC_FIELDS[input.metric?.field] ? input.metric.field : 'vote_average';

  const minFilmsRaw = Number(input.min_films);
  const limitRaw = Number(input.limit);

  return {
    scope: { ...scope, type: scope.type },
    group_by: groupBy,
    metric: { agg: aggType, field: needsField ? field : null },
    filters: (Array.isArray(input.filters) ? input.filters : [])
      .filter((f) => FILTER_FIELDS[f?.field] && FILTER_OPS[f?.op] && f.value !== '' && f.value != null)
      .slice(0, 8)
      .map((f) => ({ field: f.field, op: f.op, value: f.value })),
    min_films: Number.isFinite(minFilmsRaw) && minFilmsRaw >= 1
      ? Math.min(Math.floor(minFilmsRaw), 50)
      : 1,
    sort: input.sort === 'asc' ? 'asc' : 'desc',
    limit: Number.isFinite(limitRaw) && limitRaw >= 1
      ? Math.min(Math.floor(limitRaw), MAX_LIMIT)
      : 25,
    top_cast_per_film: Math.min(Math.max(Number(input.top_cast_per_film) || 15, 1), 30),
  };
}

/** Human-readable one-liner describing exactly what was computed. */
export function describeSpec(spec) {
  const groupMeta = GROUP_BY[spec.group_by];
  const aggMeta = AGGREGATIONS[spec.metric.agg];
  const scopeMeta = SCOPES[spec.scope.type];

  const measure = spec.metric.agg === 'count'
    ? 'number of films'
    : `${aggMeta.label.toLowerCase()} ${NUMERIC_FIELDS[spec.metric.field].label.toLowerCase()}`;

  const parts = [
    `${groupMeta.label.toLowerCase()}s`,
    `ranked by ${measure}`,
    `across ${scopeMeta.describe(spec.scope)}`,
  ];
  if (spec.min_films > 1) parts.push(`with at least ${spec.min_films} films`);

  const filterText = spec.filters
    .map((f) => `${FILTER_FIELDS[f.field].label} ${FILTER_OPS[f.op].label} ${f.value}`)
    .join(', ');
  if (filterText) parts.push(`filtered to ${filterText}`);

  const sentence = parts.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function specToHeadline(spec) {
  const groupMeta = GROUP_BY[spec.group_by];
  const scopeMeta = SCOPES[spec.scope.type];
  const subject = scopeMeta.describe(spec.scope);

  if (spec.metric.agg === 'count') {
    return `${groupMeta.entityLabel}s in the most ${subject}`;
  }
  const fieldMeta = NUMERIC_FIELDS[spec.metric.field];
  const direction = spec.sort === 'asc' ? 'lowest' : 'highest';
  return `${groupMeta.entityLabel}s with the ${direction} ${AGGREGATIONS[spec.metric.agg].label.toLowerCase()} ${fieldMeta.label.toLowerCase()} across ${subject}`;
}

/**
 * Run a normalized spec against a decorated movie set.
 * Pure: no network, no database — this is what the unit tests exercise.
 */
export function runQuery(movies, rawSpec) {
  const spec = normalizeSpec(rawSpec);
  const decorated = movies.map(decorateMovie);
  const scanned = decorated.length;
  const eligible = decorated.filter((m) => movieMatchesFilters(m, spec.filters));

  const groups = new Map();
  for (const movie of eligible) {
    const entities = entitiesForMovie(movie, spec.group_by, {
      topCastPerFilm: spec.top_cast_per_film,
    });
    for (const entity of entities) {
      if (!groups.has(entity.key)) {
        groups.set(entity.key, { ...entity, films: [] });
      }
      const group = groups.get(entity.key);
      if (!group.image && entity.image) group.image = entity.image;
      if (!group.films.some((f) => f.tmdb_id === movie.tmdb_id)) {
        group.films.push(movie);
      }
    }
  }

  const metricField = spec.metric.field;
  const sparseField = metricField ? !!NUMERIC_FIELDS[metricField]?.sparse : false;

  let rows = [...groups.values()].map((group) => {
    const films = group.films;
    // Sparse money fields would drag averages to zero, so only count films that report a value.
    const sampleFilms = spec.metric.agg === 'count'
      ? films
      : films.filter((f) => !sparseField || toNumber(f[metricField]) > 0);
    const values = metricField ? sampleFilms.map((f) => toNumber(f[metricField])) : [];

    return {
      key: group.key,
      tmdb_id: group.tmdb_id ?? null,
      label: group.label,
      image: group.image,
      film_count: films.length,
      metric: spec.metric.agg === 'count' ? films.length : aggregate(values, spec.metric.agg),
      metric_sample: spec.metric.agg === 'count' ? films.length : values.length,
      avg_rating: round(
        films.reduce((sum, f) => sum + toNumber(f.vote_average), 0) / (films.length || 1),
      ),
      films: films
        .slice()
        .sort((a, b) => (b.year || 0) - (a.year || 0))
        .map((f) => ({
          tmdb_id: f.tmdb_id,
          title: f.title,
          year: f.year,
          poster_path: f.poster_path || null,
          vote_average: f.vote_average,
          metric_value: metricField ? toNumber(f[metricField]) : null,
        })),
    };
  });

  rows = rows.filter((row) => row.film_count >= spec.min_films);
  // A metric with no usable samples is noise, not a zero.
  if (spec.metric.agg !== 'count') {
    rows = rows.filter((row) => row.metric_sample > 0);
  }

  rows.sort((a, b) => {
    const delta = spec.sort === 'asc' ? a.metric - b.metric : b.metric - a.metric;
    return delta || b.film_count - a.film_count || a.label.localeCompare(b.label);
  });

  const limited = rows.slice(0, spec.limit).map((row, index) => ({ rank: index + 1, ...row }));

  return {
    spec,
    query: {
      headline: specToHeadline(spec),
      description: describeSpec(spec),
      group_by: spec.group_by,
      group_label: GROUP_BY[spec.group_by].entityLabel,
      metric_label: metricLabel(spec),
      scope_label: SCOPES[spec.scope.type].describe(spec.scope),
      sparse_metric: sparseField,
      attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    },
    stats: {
      films_scanned: scanned,
      films_matched: eligible.length,
      groups_found: groups.size,
      groups_returned: limited.length,
      min_films: spec.min_films,
    },
    results: limited,
  };
}

export function metricLabel(spec) {
  if (spec.metric.agg === 'count') return 'films';
  const field = NUMERIC_FIELDS[spec.metric.field];
  const shortLabel = field.label.replace(/\s*\(.*\)$/, '').toLowerCase();
  return `${spec.metric.agg} ${shortLabel}`;
}

export function formatMetric(value, spec) {
  if (spec.metric.agg === 'count') return String(value);
  const format = NUMERIC_FIELDS[spec.metric.field]?.format;
  if (format === 'money') {
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (Math.abs(value) >= 1e3) return `$${Math.round(value / 1e3)}K`;
    return `$${Math.round(value)}`;
  }
  if (format === 'rating') return value.toFixed(1);
  if (format === 'int' || format === 'year') return String(Math.round(value));
  return String(value);
}
