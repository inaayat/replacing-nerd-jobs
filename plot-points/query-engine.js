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

const PERSON_ROLE = (label, plural, opts) => ({
  label,
  plural,
  kind: 'person',
  entityLabel: label,
  ...opts,
});

/**
 * A row keyed on two people at once. `castCap` tightens the per-film cast
 * depth for same-role pairs, where the pair count grows quadratically: 15
 * actors is 105 pairs per film, 10 is a more manageable 45.
 */
const PAIR = (label, plural, roleA, roleB, opts) => ({
  label,
  plural,
  kind: 'pair',
  roles: [roleA, roleB],
  entityLabel: label,
  ...opts,
});

export const GROUP_BY = {
  actor: PERSON_ROLE('Actor', 'actors', { from: 'cast' }),
  director: PERSON_ROLE('Director', 'directors', { from: 'crew', jobs: ['Director'] }),
  writer: PERSON_ROLE('Writer', 'writers', {
    from: 'crew',
    jobs: ['Writer', 'Screenplay', 'Story', 'Novel'],
  }),
  producer: PERSON_ROLE('Producer', 'producers', { from: 'crew', jobs: ['Producer'] }),
  composer: PERSON_ROLE('Composer', 'composers', {
    from: 'crew',
    jobs: ['Original Music Composer', 'Music'],
  }),
  cinematographer: PERSON_ROLE('Cinematographer', 'cinematographers', {
    from: 'crew',
    jobs: ['Director of Photography'],
  }),
  editor: PERSON_ROLE('Editor', 'editors', { from: 'crew', jobs: ['Editor'] }),

  // Pairs are where the interesting questions live: a leaderboard tells you
  // who worked most, a pair tells you who worked most *together*.
  'actor+director': PAIR('Actor × director', 'actor–director pairs', 'actor', 'director'),
  'actor+actor': PAIR('Co-stars', 'co-star pairs', 'actor', 'actor', { castCap: 10 }),
  'director+composer': PAIR('Director × composer', 'director–composer pairs', 'director', 'composer'),
  'director+cinematographer': PAIR(
    'Director × cinematographer',
    'director–cinematographer pairs',
    'director',
    'cinematographer',
  ),

  genre: { label: 'Genre', plural: 'genres', kind: 'list', field: 'genres', entityLabel: 'Genre' },
  company: { label: 'Studio / company', plural: 'studios', kind: 'list', field: 'companies', entityLabel: 'Studio' },
  country: { label: 'Country', plural: 'countries', kind: 'list', field: 'countries', entityLabel: 'Country' },
  language: { label: 'Original language', plural: 'languages', kind: 'scalar', field: 'language', entityLabel: 'Language' },
  collection: { label: 'Collection', plural: 'collections', kind: 'scalar', field: 'collection', entityLabel: 'Collection' },
  decade: { label: 'Decade', plural: 'decades', kind: 'scalar', field: 'decade', entityLabel: 'Decade' },
  year: { label: 'Release year', plural: 'release years', kind: 'scalar', field: 'year', entityLabel: 'Year' },
};

export function groupByNeedsCredits(groupBy) {
  const kind = GROUP_BY[groupBy]?.kind;
  return kind === 'person' || kind === 'pair';
}

/* ── Numeric fields usable in metrics and filters ──────────────── */

// `short` is the form used in prose; `label` is the form used in form controls.
export const NUMERIC_FIELDS = {
  vote_average: { label: 'TMDB rating', short: 'TMDB rating', format: 'rating', max: 10 },
  vote_count: { label: 'Vote count', short: 'vote count', format: 'int' },
  popularity: { label: 'Popularity', short: 'popularity', format: 'decimal' },
  runtime: { label: 'Runtime (min)', short: 'runtime', format: 'int' },
  budget: { label: 'Budget ($)', short: 'budget', format: 'money', sparse: true },
  revenue: { label: 'Revenue ($)', short: 'revenue', format: 'money', sparse: true },
  profit: { label: 'Profit ($)', short: 'profit', format: 'money', sparse: true },
  // Revenue ÷ budget, so 1.0 is break-even, not zero return. The old
  // "return on budget" label read like ROI, which is this minus one.
  roi: { label: 'Revenue ÷ budget (×)', short: 'revenue-to-budget ratio', format: 'decimal', sparse: true },
  year: { label: 'Release year', short: 'release year', format: 'year' },
  cast_size: { label: 'Cast size', short: 'cast size', format: 'int' },
};

export const AGGREGATIONS = {
  count: { label: 'Number of films', needsField: false, format: 'int' },
  avg: { label: 'Average', needsField: true, central: true },
  median: { label: 'Median', needsField: true, central: true },
  sum: { label: 'Total', needsField: true },
  max: { label: 'Highest', needsField: true },
  min: { label: 'Lowest', needsField: true },
};

/* ── Ranking ───────────────────────────────────────────────────── */

/**
 * How rows are ordered. The displayed number is always the raw metric — these
 * only decide the sort, and the query's provenance states which was used.
 */
export const RANK_MODES = {
  metric: {
    label: 'Value (confidence-weighted)',
    hint: 'Pulls thin rows toward the film-set average so a single film can’t top the list.',
  },
  raw: {
    label: 'Value (raw)',
    hint: 'Straight ranking on the number, however few films it came from.',
  },
  lift: {
    label: 'Difference vs. film-set average',
    hint: 'Ranks by how far above or below the whole film set a row sits.',
  },
};

// Films' worth of the film-set average mixed into a thin row. Three is enough
// to stop one-film rows winning without burying genuine two-film standouts.
export const SHRINK_PRIOR = 3;

/* ── Filters ───────────────────────────────────────────────────── */

export const FILTER_OPS = {
  gte: { label: 'at least', numeric: true },
  lte: { label: 'at most', numeric: true },
  eq: { label: 'is', numeric: false },
  neq: { label: 'is not', numeric: false },
  includes: { label: 'includes', numeric: false },
  excludes: { label: 'excludes', numeric: false },
};

/* ── Scan depth & credit quality ───────────────────────────────── */

// How many films a query reads. Every film past the cache is a TMDB round
// trip, so this is the one knob that trades latency for completeness.
export const DEPTH_OPTIONS = [
  { value: 60, label: '60 films · fast' },
  { value: 120, label: '120 films · slower first run' },
  { value: 200, label: '200 films · covers most filmographies' },
];
export const DEFAULT_DEPTH = 60;

export const CREDIT_QUALITY = {
  notable: {
    label: 'Notable credits only',
    hint: 'Skips documentaries, awards specials and “as themselves” cameos.',
  },
  everything: {
    label: 'Every credit',
    hint: 'Includes documentary appearances, shorts and cameos.',
  },
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

/**
 * Credit lists arrive either as `cast_members`/`crew_members` (the shared
 * `lib/tmdb.js` shape, where `cast` is a plain name array kept for A-Lister)
 * or already as objects under `cast`/`crew`. Only entries with a TMDB id are
 * usable for grouping, so name-only arrays are dropped rather than half-read.
 */
function peopleList(primary, fallback) {
  const list = Array.isArray(primary) && primary.length ? primary : fallback;
  if (!Array.isArray(list)) return [];
  return list.filter((person) => person && typeof person === 'object' && person.id);
}

/** Derived numeric fields are computed once so metrics/filters agree. */
export function decorateMovie(movie) {
  const budget = toNumber(movie.budget);
  const revenue = toNumber(movie.revenue);
  const year = movie.year ?? (movie.release_date ? Number(movie.release_date.slice(0, 4)) : null);
  const cast = peopleList(movie.cast_members, movie.cast);
  const crew = peopleList(movie.crew_members, movie.crew);
  return {
    ...movie,
    cast,
    crew,
    year,
    decade: year ? `${Math.floor(year / 10) * 10}s` : null,
    budget,
    revenue,
    profit: budget && revenue ? revenue - budget : 0,
    roi: budget > 0 && revenue > 0 ? Math.round((revenue / budget) * 100) / 100 : 0,
    cast_size: cast.length,
    vote_average: toNumber(movie.vote_average),
    vote_count: toNumber(movie.vote_count),
    popularity: toNumber(movie.popularity),
    runtime: toNumber(movie.runtime ?? movie.runtime_min),
    genres: movie.genres || [],
    companies: movie.companies || [],
    countries: movie.countries || [],
  };
}

/**
 * Whether TMDB actually reports a field for a film.
 *
 * This has to be separate from "the value is positive": a film that lost money
 * has a real, negative profit, and testing `> 0` silently dropped every flop
 * from money metrics — biasing averages upward and making "lowest profit"
 * queries impossible to answer.
 */
const HAS_VALUE = {
  budget: (m) => toNumber(m.budget) > 0,
  revenue: (m) => toNumber(m.revenue) > 0,
  profit: (m) => toNumber(m.budget) > 0 && toNumber(m.revenue) > 0,
  roi: (m) => toNumber(m.budget) > 0 && toNumber(m.revenue) > 0,
};

export function fieldHasValue(movie, field) {
  const check = HAS_VALUE[field];
  return check ? check(movie) : true;
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

/** Entities a movie contributes for one single-role dimension. */
function singleRoleEntities(movie, meta, topCastPerFilm) {
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

/**
 * Entities a movie contributes for a two-person dimension.
 *
 * Same-role pairs (co-stars) are unordered, so the key sorts its two ids —
 * otherwise "A × B" and "B × A" would split one collaboration across two rows.
 * A person paired with themselves (an actor who directed the film) is dropped
 * as degenerate.
 */
function pairEntities(movie, meta, topCastPerFilm) {
  const [roleA, roleB] = meta.roles;
  const cap = meta.castCap ?? topCastPerFilm;
  const left = singleRoleEntities(movie, GROUP_BY[roleA], cap);
  const right = roleA === roleB ? left : singleRoleEntities(movie, GROUP_BY[roleB], cap);

  const seen = new Set();
  const out = [];
  for (const a of left) {
    for (const b of right) {
      if (a.tmdb_id === b.tmdb_id) continue;
      const [first, second] = roleA === roleB && a.tmdb_id > b.tmdb_id ? [b, a] : [a, b];
      const key = `pair:${roleA}:${first.tmdb_id}|${roleB}:${second.tmdb_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        tmdb_id: null,
        pair: [first.tmdb_id, second.tmdb_id],
        label: `${first.label} × ${second.label}`,
        image: first.image || second.image || null,
      });
    }
  }
  return out;
}

/** Entities a single movie contributes to a given group-by dimension. */
export function entitiesForMovie(movie, groupBy, { topCastPerFilm = 15 } = {}) {
  const meta = GROUP_BY[groupBy];
  if (!meta) return [];
  if (meta.kind === 'pair') return pairEntities(movie, meta, topCastPerFilm);
  return singleRoleEntities(movie, meta, topCastPerFilm);
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
  const depthRaw = Number(input.depth);

  // One film is a fine unit to count, but a terrible one to average: a single
  // 8.0 outranks a six-film 7.9 and the leaderboard fills with noise.
  const defaultMinFilms = aggType === 'count' ? 1 : 2;
  // No row can hold more films than the query reads, so the ceiling is the
  // scan depth rather than a fixed number that contradicts it.
  const depth = DEPTH_OPTIONS.some((d) => d.value === depthRaw) ? depthRaw : DEFAULT_DEPTH;

  return {
    scope: { ...scope, type: scope.type },
    group_by: groupBy,
    metric: { agg: aggType, field: needsField ? field : null },
    filters: (Array.isArray(input.filters) ? input.filters : [])
      .filter((f) => FILTER_FIELDS[f?.field] && FILTER_OPS[f?.op] && f.value !== '' && f.value != null)
      .slice(0, 8)
      .map((f) => ({ field: f.field, op: f.op, value: f.value })),
    min_films: Number.isFinite(minFilmsRaw) && minFilmsRaw >= 1
      ? Math.min(Math.floor(minFilmsRaw), depth)
      : defaultMinFilms,
    depth,
    credit_quality: CREDIT_QUALITY[input.credit_quality] ? input.credit_quality : 'notable',
    rank_by: RANK_MODES[input.rank_by] ? input.rank_by : 'metric',
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
    : `${aggMeta.label.toLowerCase()} ${NUMERIC_FIELDS[spec.metric.field].short}`;

  const parts = [
    groupMeta.plural,
    `ranked by ${measure}`,
    `across ${scopeMeta.describe(spec.scope)}`,
  ];
  if (spec.min_films > 1) parts.push(`with at least ${spec.min_films} films`);
  if (spec.rank_by === 'lift') parts.push('ordered by distance from the film-set average');

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

  const plural = groupMeta.plural.charAt(0).toUpperCase() + groupMeta.plural.slice(1);

  if (spec.metric.agg === 'count') {
    return `${plural} in the most ${subject}`;
  }
  const fieldMeta = NUMERIC_FIELDS[spec.metric.field];
  const direction = spec.sort === 'asc' ? 'lowest' : 'highest';
  return `${plural} with the ${direction} ${AGGREGATIONS[spec.metric.agg].label.toLowerCase()} ${fieldMeta.short} across ${subject}`;
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
  const isCount = spec.metric.agg === 'count';

  // The film set's own average is what makes a row interesting or unremarkable:
  // "8.2" means nothing until you know the surrounding films average 7.6.
  const baselineFilms = metricField
    ? eligible.filter((f) => fieldHasValue(f, metricField))
    : [];
  const setBaseline = metricField
    ? aggregate(baselineFilms.map((f) => toNumber(f[metricField])), spec.metric.agg)
    : 0;

  let rows = [...groups.values()].map((group) => {
    const films = group.films;
    const sampleFilms = isCount ? films : films.filter((f) => fieldHasValue(f, metricField));
    const values = metricField ? sampleFilms.map((f) => toNumber(f[metricField])) : [];

    return {
      key: group.key,
      tmdb_id: group.tmdb_id ?? null,
      pair: group.pair || null,
      label: group.label,
      image: group.image,
      film_count: films.length,
      metric: isCount ? films.length : aggregate(values, spec.metric.agg),
      metric_sample: isCount ? films.length : values.length,
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
          has_metric: metricField ? fieldHasValue(f, metricField) : true,
        })),
    };
  });

  rows = rows.filter((row) => row.film_count >= spec.min_films);
  // A metric with no usable samples is noise, not a zero.
  if (!isCount) rows = rows.filter((row) => row.metric_sample > 0);

  // For a count, the comparison that means something is "more films than the
  // typical row here", so the baseline is the mean row size.
  const baseline = isCount
    ? round(rows.reduce((sum, row) => sum + row.film_count, 0) / (rows.length || 1))
    : setBaseline;

  // Shrink only averages and medians: pulling a sum or a maximum toward a
  // mean would describe something that isn't the statistic asked for. And
  // never in raw mode — that mode exists precisely to opt out.
  const weighted = !!AGGREGATIONS[spec.metric.agg].central && spec.rank_by !== 'raw';
  for (const row of rows) {
    row.baseline = baseline;
    row.delta = round(row.metric - baseline);
    row.lift = baseline ? round(row.metric / baseline) : null;
    row.adjusted = weighted
      ? round(
        ((row.metric_sample * row.metric) + (SHRINK_PRIOR * baseline))
        / (row.metric_sample + SHRINK_PRIOR),
      )
      : row.metric;
  }

  const sortValue = (row) => {
    if (spec.rank_by === 'raw') return row.metric;
    if (spec.rank_by === 'lift') return row.adjusted - baseline;
    return row.adjusted;
  };

  rows.sort((a, b) => {
    const delta = spec.sort === 'asc'
      ? sortValue(a) - sortValue(b)
      : sortValue(b) - sortValue(a);
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
      baseline,
      baseline_label: isCount
        ? `average films per ${GROUP_BY[spec.group_by].entityLabel.toLowerCase()}`
        : `film-set ${metricLabel(spec)}`,
      rank_by: spec.rank_by,
      confidence_weighted: weighted,
      attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    },
    findings: buildFindings(limited, spec, { baseline, isCount, eligible: eligible.length }),
    stats: {
      films_scanned: scanned,
      films_matched: eligible.length,
      films_with_metric: metricField ? baselineFilms.length : scanned,
      groups_found: groups.size,
      groups_returned: limited.length,
      min_films: spec.min_films,
      baseline,
    },
    results: limited,
  };
}

/* ── Findings ──────────────────────────────────────────────────── */

/**
 * Short, literally-true sentences about the finished result set.
 *
 * A ranked table makes the reader do the comparison; these state the one or
 * two comparisons actually worth making, so a query reads as an answer.
 */
export function buildFindings(rows, spec, { baseline, isCount, eligible }) {
  if (!rows.length) return [];

  const out = [];
  const [top, second] = rows;
  const meta = GROUP_BY[spec.group_by];
  const isPair = meta.kind === 'pair';
  // "average per co-stars" doesn't parse; pairs need a singular noun.
  const groupNoun = isPair ? 'pair' : meta.entityLabel.toLowerCase();
  const value = (v) => formatMetric(v, spec);
  const films = (n) => `${n} film${n === 1 ? '' : 's'}`;

  if (isCount) {
    const verb = isPair ? 'share' : 'appears in';
    const times = baseline ? `, ${round(top.film_count / baseline)}× the ${baseline} typical for a ${groupNoun} here` : '';
    out.push(`${top.label} ${verb} ${films(top.film_count)} of the ${eligible} scanned${times}.`);
  } else if (baseline) {
    const direction = top.metric >= baseline ? 'above' : 'below';
    out.push(
      `${top.label} averages ${value(top.metric)} over ${films(top.film_count)} — `
      + `${value(Math.abs(top.delta))} ${direction} the ${value(baseline)} film-set average.`,
    );
  }

  if (second && top.metric !== second.metric) {
    const gap = Math.abs(round(top.metric - second.metric));
    out.push(`${top.label} leads ${second.label} by ${value(gap)}.`);
  }

  // Whether "who keeps turning up" has a real answer or is a flat field of
  // one-offs is itself the finding, for pairs especially.
  if (isPair) {
    const repeat = rows.filter((row) => row.film_count > 1).length;
    out.push(repeat
      ? `${repeat} of the ${rows.length} pairs shown worked together more than once.`
      : 'No pair here worked together more than once.');
  }

  return out.slice(0, 3);
}

export function metricLabel(spec) {
  if (spec.metric.agg === 'count') return 'films';
  return `${spec.metric.agg} ${NUMERIC_FIELDS[spec.metric.field].short}`;
}

export function formatMoney(value) {
  // Losses are real results, so the sign belongs outside the currency symbol:
  // "−$150M", never "$-150.0M".
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`;
  return `${sign}$${Math.round(abs)}`;
}

export function formatMetric(value, spec) {
  if (spec.metric.agg === 'count') return String(value);
  const format = NUMERIC_FIELDS[spec.metric.field]?.format;
  if (format === 'money') return formatMoney(value);
  if (format === 'rating') return value.toFixed(1);
  if (format === 'int' || format === 'year') return String(Math.round(value));
  return String(value);
}
