/**
 * Plot Points query builder.
 *
 * The control catalog is imported straight from the same module the serverless
 * API uses, so the builder can only ever offer queries the engine can run.
 */
import {
  AGGREGATIONS,
  FILTER_FIELDS,
  FILTER_OPS,
  GROUP_BY,
  NUMERIC_FIELDS,
  SCOPES,
  describeSpec,
  formatMetric,
  normalizeSpec,
} from '../lib/plot-points-query.js';

const IMG = 'https://image.tmdb.org/t/p';

const state = {
  person: null,
  collection: null,
  genres: [],
  filters: [],
  searchTimers: {},
};

const el = (id) => document.getElementById(id);

const els = {
  featured: el('featured-grid'),
  form: el('builder-form'),
  scopeType: el('scope-type'),
  scopePerson: el('scope-person-field'),
  scopeCollection: el('scope-collection-field'),
  scopeDiscover: el('scope-discover-fields'),
  personSearch: el('person-search'),
  personSuggest: el('person-suggest'),
  selectedPerson: el('selected-person'),
  collectionSearch: el('collection-search'),
  collectionSuggest: el('collection-suggest'),
  selectedCollection: el('selected-collection'),
  scopeGenre: el('scope-genre'),
  yearFrom: el('scope-year-from'),
  yearTo: el('scope-year-to'),
  minVotes: el('scope-min-votes'),
  groupBy: el('group-by'),
  metricAgg: el('metric-agg'),
  metricFieldWrap: el('metric-field-wrap'),
  metricField: el('metric-field'),
  sortDir: el('sort-dir'),
  minFilms: el('min-films'),
  filterRows: el('filter-rows'),
  addFilter: el('add-filter'),
  limit: el('result-limit'),
  run: el('run-query'),
  specPreview: el('spec-preview'),
  results: el('results-pane'),
  builder: el('builder'),
};

/* ── Helpers ───────────────────────────────────────────────────── */

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function imageUrl(path, size = 'w185') {
  if (!path) return '';
  return String(path).startsWith('http') ? path : `${IMG}/${size}${path}`;
}

function avatarHtml(path, alt = '', size = 'w185') {
  const src = imageUrl(path, size);
  if (!src) return '<span class="pp-avatar" aria-hidden="true"></span>';
  return `<img class="pp-avatar" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="36" height="54" loading="lazy">`;
}

function option(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

async function apiGet(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 503 && /TMDB_API_KEY/i.test(data.error || '')) {
      throw new Error('TMDB_API_KEY is not configured on the server yet.');
    }
    if (res.status === 404 && !data.error) {
      throw new Error('Plot Points API is not available on this server (needs Vercel + TMDB_API_KEY).');
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

/* ── Populate controls from the shared catalog ─────────────────── */

function populateControls() {
  els.scopeType.innerHTML = Object.entries(SCOPES)
    .map(([key, meta]) => option(key, meta.label, key === 'person-directed'))
    .join('');

  els.groupBy.innerHTML = Object.entries(GROUP_BY)
    .map(([key, meta]) => option(key, meta.label, key === 'actor'))
    .join('');

  els.metricAgg.innerHTML = Object.entries(AGGREGATIONS)
    .map(([key, meta]) => option(key, meta.label, key === 'count'))
    .join('');

  els.metricField.innerHTML = Object.entries(NUMERIC_FIELDS)
    .map(([key, meta]) => option(key, meta.sparse ? `${meta.label} — often missing` : meta.label, key === 'vote_average'))
    .join('');
}

async function loadGenres() {
  try {
    const { genres } = await apiGet('/api/plot-points-genres');
    state.genres = genres || [];
    els.scopeGenre.innerHTML = '<option value="">Any genre</option>'
      + state.genres.map((g) => option(g.id, g.name)).join('');
  } catch {
    // Discover scope still works without the genre dropdown.
  }
}

/* ── Scope visibility ──────────────────────────────────────────── */

function syncScopeFields() {
  const needs = SCOPES[els.scopeType.value]?.needs;
  els.scopePerson.hidden = needs !== 'person';
  els.scopeCollection.hidden = needs !== 'collection';
  els.scopeDiscover.hidden = needs !== 'discover';
}

function syncMetricFields() {
  els.metricFieldWrap.hidden = !AGGREGATIONS[els.metricAgg.value]?.needsField;
}

/* ── Filters ───────────────────────────────────────────────────── */

function opsForField(field) {
  const meta = FILTER_FIELDS[field];
  const keys = meta?.numeric
    ? ['gte', 'lte', 'eq', 'neq']
    : (meta?.list ? ['includes', 'excludes'] : ['eq', 'neq', 'includes']);
  return keys.map((key) => ({ key, label: FILTER_OPS[key].label }));
}

function renderFilters() {
  if (!state.filters.length) {
    els.filterRows.innerHTML = '<p class="pp-filter-empty">No filters — all films in the set count.</p>';
    return;
  }

  els.filterRows.innerHTML = state.filters.map((filter, index) => `
    <div class="pp-filter-row" data-index="${index}">
      <select data-role="field" aria-label="Filter field">
        ${Object.entries(FILTER_FIELDS).map(([key, meta]) => option(key, meta.label, key === filter.field)).join('')}
      </select>
      <select data-role="op" aria-label="Filter comparison">
        ${opsForField(filter.field).map((op) => option(op.key, op.label, op.key === filter.op)).join('')}
      </select>
      <input data-role="value" value="${escapeHtml(filter.value)}"
        type="${FILTER_FIELDS[filter.field]?.numeric ? 'number' : 'text'}"
        placeholder="value" aria-label="Filter value" />
      <button type="button" data-role="remove" aria-label="Remove filter">×</button>
    </div>
  `).join('');

  els.filterRows.querySelectorAll('.pp-filter-row').forEach((row) => {
    const index = Number(row.dataset.index);
    row.querySelector('[data-role="field"]').addEventListener('change', (event) => {
      state.filters[index].field = event.target.value;
      const [first] = opsForField(event.target.value);
      state.filters[index].op = first.key;
      state.filters[index].value = '';
      renderFilters();
      updateSpecPreview();
    });
    row.querySelector('[data-role="op"]').addEventListener('change', (event) => {
      state.filters[index].op = event.target.value;
      updateSpecPreview();
    });
    row.querySelector('[data-role="value"]').addEventListener('input', (event) => {
      state.filters[index].value = event.target.value;
      updateSpecPreview();
    });
    row.querySelector('[data-role="remove"]').addEventListener('click', () => {
      state.filters.splice(index, 1);
      renderFilters();
      updateSpecPreview();
    });
  });
}

/* ── Spec <-> form ─────────────────────────────────────────────── */

function currentSpec() {
  const type = els.scopeType.value;
  const scope = { type };

  if (SCOPES[type]?.needs === 'person') {
    scope.person_id = state.person?.tmdb_id ?? null;
    scope.person_name = state.person?.name ?? null;
  } else if (type === 'collection') {
    scope.collection_id = state.collection?.tmdb_id ?? null;
    scope.collection_name = state.collection?.name ?? null;
  } else {
    const genre = state.genres.find((g) => String(g.id) === els.scopeGenre.value);
    if (genre) {
      scope.genre_id = genre.id;
      scope.genre_name = genre.name;
    }
    if (els.yearFrom.value) scope.year_from = Number(els.yearFrom.value);
    if (els.yearTo.value) scope.year_to = Number(els.yearTo.value);
    if (els.minVotes.value) scope.min_votes = Number(els.minVotes.value);
  }

  return normalizeSpec({
    scope,
    group_by: els.groupBy.value,
    metric: { agg: els.metricAgg.value, field: els.metricField.value },
    filters: state.filters,
    min_films: Number(els.minFilms.value),
    sort: els.sortDir.value,
    limit: Number(els.limit.value),
  });
}

function applySpec(spec) {
  const normalized = normalizeSpec(spec);

  els.scopeType.value = normalized.scope.type;
  els.groupBy.value = normalized.group_by;
  els.metricAgg.value = normalized.metric.agg;
  if (normalized.metric.field) els.metricField.value = normalized.metric.field;
  els.sortDir.value = normalized.sort;
  els.minFilms.value = String(normalized.min_films);
  els.limit.value = String(normalized.limit);

  const scope = normalized.scope;
  if (SCOPES[scope.type]?.needs === 'person' && scope.person_id) {
    setPerson({
      tmdb_id: scope.person_id,
      name: scope.person_name || `Person ${scope.person_id}`,
      profile_path: state.person?.profile_path || null,
    });
  }
  if (scope.type === 'collection' && scope.collection_id) {
    setCollection({ tmdb_id: scope.collection_id, name: scope.collection_name || 'Collection' });
  }
  if (scope.type === 'discover') {
    if (scope.genre_id) els.scopeGenre.value = String(scope.genre_id);
    els.yearFrom.value = scope.year_from || '';
    els.yearTo.value = scope.year_to || '';
    els.minVotes.value = scope.min_votes ?? '';
  }

  state.filters = normalized.filters.map((f) => ({ ...f }));

  syncScopeFields();
  syncMetricFields();
  renderFilters();
  updateSpecPreview();
}

function updateSpecPreview() {
  const spec = currentSpec();
  els.specPreview.textContent = describeSpec(spec);
  els.run.disabled = !scopeIsReady(spec);
}

function scopeIsReady(spec) {
  const needs = SCOPES[spec.scope.type]?.needs;
  if (needs === 'person') return !!spec.scope.person_id;
  if (needs === 'collection') return !!spec.scope.collection_id;
  return true;
}

/* ── Entity pickers ────────────────────────────────────────────── */

function setPerson(person) {
  state.person = person;
  if (!person) {
    els.selectedPerson.className = 'pp-selected empty';
    els.selectedPerson.textContent = 'No person selected yet.';
  } else {
    els.selectedPerson.className = 'pp-selected';
    els.selectedPerson.innerHTML = `
      ${avatarHtml(person.profile_path, person.name)}
      <div>
        <strong>${escapeHtml(person.name)}</strong>
        <div class="pp-suggest-meta">${escapeHtml(person.known_for_department || 'Person')} · TMDB #${person.tmdb_id}</div>
      </div>`;
    els.personSearch.value = person.name;
  }
  els.personSuggest.classList.remove('open');
  updateSpecPreview();
}

function setCollection(collection) {
  state.collection = collection;
  if (!collection) {
    els.selectedCollection.className = 'pp-selected empty';
    els.selectedCollection.textContent = 'No collection selected yet.';
  } else {
    els.selectedCollection.className = 'pp-selected';
    els.selectedCollection.innerHTML = `
      ${avatarHtml(collection.poster_path, collection.name, 'w92')}
      <div>
        <strong>${escapeHtml(collection.name)}</strong>
        <div class="pp-suggest-meta">TMDB #${collection.tmdb_id}</div>
      </div>`;
    els.collectionSearch.value = collection.name;
  }
  els.collectionSuggest.classList.remove('open');
  updateSpecPreview();
}

function bindSearch({ input, suggest, endpoint, render, onPick }) {
  input.addEventListener('input', () => {
    clearTimeout(state.searchTimers[endpoint]);
    const q = input.value.trim();
    if (q.length < 2) {
      suggest.classList.remove('open');
      return;
    }
    state.searchTimers[endpoint] = setTimeout(async () => {
      try {
        const { results } = await apiGet(`${endpoint}?q=${encodeURIComponent(q)}`);
        if (!results?.length) {
          suggest.classList.remove('open');
          return;
        }
        suggest.innerHTML = results.map(render).join('');
        suggest.classList.add('open');
        suggest.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', () => {
            onPick(results.find((r) => String(r.tmdb_id) === btn.dataset.id));
          });
        });
      } catch (err) {
        suggest.innerHTML = `<button type="button" disabled>${escapeHtml(err.message)}</button>`;
        suggest.classList.add('open');
      }
    }, 220);
  });

  document.addEventListener('click', (event) => {
    if (!suggest.contains(event.target) && event.target !== input) {
      suggest.classList.remove('open');
    }
  });
}

/* ── Results rendering ─────────────────────────────────────────── */

function filmStrip(films = [], spec) {
  if (!films.length) return '';
  return `
    <div class="pp-film-strip" aria-label="Films behind this row">
      ${films.slice(0, 10).map((f) => {
    const detail = f.metric_value != null && spec.metric.agg !== 'count'
      ? formatMetric(f.metric_value, spec)
      : (f.year || '');
    return `
        <figure class="pp-film-chip" title="${escapeHtml(f.title)}${f.year ? ` (${f.year})` : ''}">
          ${f.poster_path
      ? `<img src="${escapeHtml(imageUrl(f.poster_path, 'w92'))}" alt="" width="42" height="63" loading="lazy">`
      : '<span class="pp-avatar" style="width:42px;height:63px;display:block"></span>'}
          <figcaption>${escapeHtml(detail)}</figcaption>
        </figure>`;
  }).join('')}
    </div>`;
}

function provenanceHtml(payload) {
  const { query, spec, stats, scope, cache } = payload;
  const rows = [
    ['Rows are', query.group_label],
    ['Ranked by', query.metric_label],
    ['Film set', scope?.label || '—'],
    ['Films scanned', `${stats.films_scanned}${scope?.truncated ? ` of ${scope.films_available} (capped)` : ''}`],
    ['Films after filters', String(stats.films_matched)],
    ['Min films per row', String(stats.min_films)],
    ['Groups found', String(stats.groups_found)],
    ['Source', `TMDB${cache ? ` · cache ${cache}` : ''}`],
  ];

  const filterText = spec.filters.length
    ? spec.filters
      .map((f) => `${FILTER_FIELDS[f.field].label} ${FILTER_OPS[f.op].label} ${f.value}`)
      .join(' · ')
    : 'none';

  return `
    <section class="pp-provenance" aria-label="Query details">
      <h3>${escapeHtml(query.headline)}</h3>
      <p class="pp-provenance-desc">${escapeHtml(query.description)}</p>
      <dl class="pp-prov-grid">
        ${rows.map(([label, value]) => `
          <div class="pp-prov-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
        `).join('')}
        <div class="pp-prov-item"><dt>Filters</dt><dd>${escapeHtml(filterText)}</dd></div>
      </dl>
      ${query.sparse_metric ? `
        <p class="pp-provenance-note">
          Heads up: TMDB reports this field for only some films. Rows are averaged over the
          films that actually have a value, and rows with none are omitted.
        </p>` : ''}
      <div class="pp-prov-actions">
        <button type="button" class="pp-btn pp-btn--ghost pp-btn--sm" id="copy-link">Copy link to this query</button>
      </div>
    </section>`;
}

function renderResults(payload) {
  const { query, spec, results } = payload;

  if (!results?.length) {
    els.results.innerHTML = `${provenanceHtml(payload)}
      <p class="pp-status">No rows matched. Try lowering “Min films” or widening the film set.</p>`;
    bindCopyLink();
    return;
  }

  els.results.innerHTML = `
    ${provenanceHtml(payload)}
    <ol class="pp-rank-list">
      ${results.map((row) => `
        <li class="pp-rank-item">
          <div class="pp-rank-num">${row.rank}</div>
          ${avatarHtml(row.image, row.label)}
          <div class="pp-rank-body">
            <p class="pp-rank-name">${escapeHtml(row.label)}</p>
            <div class="pp-rank-meta">${row.film_count} film${row.film_count === 1 ? '' : 's'} · avg TMDB ${row.avg_rating.toFixed(1)}</div>
          </div>
          <div class="pp-metric">
            ${escapeHtml(formatMetric(row.metric, spec))}
            <span>${escapeHtml(query.metric_label)}</span>
          </div>
          ${filmStrip(row.films, spec)}
        </li>`).join('')}
    </ol>`;
  bindCopyLink();
}

function bindCopyLink() {
  el('copy-link')?.addEventListener('click', async (event) => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      event.target.textContent = 'Link copied';
      setTimeout(() => { event.target.textContent = 'Copy link to this query'; }, 1800);
    } catch {
      event.target.textContent = 'Copy failed — use the address bar';
    }
  });
}

function renderStatus(message, isError = false) {
  els.results.innerHTML = `<p class="pp-status${isError ? ' error' : ''}">${escapeHtml(message)}</p>`;
}

/* ── Running a query ───────────────────────────────────────────── */

async function runCurrentQuery({ scroll = true } = {}) {
  const spec = currentSpec();
  if (!scopeIsReady(spec)) {
    renderStatus('Pick a person or collection for this film set first.', true);
    return;
  }

  if (scroll && window.matchMedia('(max-width: 860px)').matches) {
    els.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  els.run.disabled = true;
  renderStatus('Querying TMDB… a cold cache can take a few seconds.');

  const url = new URL(window.location.href);
  url.searchParams.set('spec', JSON.stringify(spec));
  history.replaceState({}, '', url);

  try {
    const payload = await apiGet(`/api/plot-points-build?spec=${encodeURIComponent(JSON.stringify(spec))}`);
    if (payload.scope?.subject?.name && SCOPES[spec.scope.type]?.needs === 'person') {
      setPerson({
        tmdb_id: payload.scope.subject.tmdb_id,
        name: payload.scope.subject.name,
        profile_path: payload.scope.subject.profile_path,
        known_for_department: payload.scope.subject.known_for_department,
      });
    }
    renderResults(payload);
  } catch (err) {
    renderStatus(err.message, true);
  } finally {
    els.run.disabled = false;
  }
}

/* ── Featured presets ──────────────────────────────────────────── */

function renderFeatured(items) {
  els.featured.innerHTML = items.map((item, index) => `
    <button type="button" class="pp-feature" data-accent="${escapeHtml(item.accent || 'orange')}" data-index="${index}">
      <div>
        <h3 class="pp-feature-title">${escapeHtml(item.title)}</h3>
        <p class="pp-feature-blurb">${escapeHtml(item.blurb)}</p>
      </div>
      <div class="pp-feature-meta">${escapeHtml(describeSpec(normalizeSpec(item.spec)))}</div>
    </button>`).join('');

  els.featured.querySelectorAll('.pp-feature').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = items[Number(btn.dataset.index)];
      if (!item) return;
      applySpec(item.spec);
      runCurrentQuery();
    });
  });
}

/* ── Init ──────────────────────────────────────────────────────── */

function bindControls() {
  els.scopeType.addEventListener('change', () => {
    syncScopeFields();
    updateSpecPreview();
  });
  els.metricAgg.addEventListener('change', () => {
    syncMetricFields();
    updateSpecPreview();
  });
  [els.groupBy, els.metricField, els.sortDir, els.minFilms, els.limit,
    els.scopeGenre, els.yearFrom, els.yearTo, els.minVotes].forEach((node) => {
    node.addEventListener('change', updateSpecPreview);
  });

  els.addFilter.addEventListener('click', () => {
    state.filters.push({ field: 'vote_average', op: 'gte', value: '' });
    renderFilters();
    updateSpecPreview();
  });

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    runCurrentQuery();
  });

  bindSearch({
    input: els.personSearch,
    suggest: els.personSuggest,
    endpoint: '/api/plot-points-person-search',
    render: (p) => `
      <button type="button" data-id="${p.tmdb_id}">
        ${avatarHtml(p.profile_path, p.name)}
        <span>
          <span class="pp-suggest-name">${escapeHtml(p.name)}</span>
          <span class="pp-suggest-meta">${escapeHtml(p.known_for_department || 'Person')}${p.known_for?.length ? ` · ${escapeHtml(p.known_for.join(', '))}` : ''}</span>
        </span>
      </button>`,
    onPick: setPerson,
  });

  bindSearch({
    input: els.collectionSearch,
    suggest: els.collectionSuggest,
    endpoint: '/api/plot-points-collection-search',
    render: (c) => `
      <button type="button" data-id="${c.tmdb_id}">
        ${avatarHtml(c.poster_path, c.name, 'w92')}
        <span><span class="pp-suggest-name">${escapeHtml(c.name)}</span></span>
      </button>`,
    onPick: setCollection,
  });

  el('cta-builder')?.addEventListener('click', (event) => {
    event.preventDefault();
    els.builder.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function init() {
  populateControls();
  bindControls();
  renderFilters();
  syncScopeFields();
  syncMetricFields();
  updateSpecPreview();
  renderStatus('Build a query on the left, or start from a featured card above.');

  loadGenres();

  let featured = [];
  try {
    const data = await fetch('./featured.json').then((r) => r.json());
    featured = data.featured || [];
    renderFeatured(featured);
  } catch {
    els.featured.innerHTML = '<p class="pp-status">Could not load featured queries.</p>';
  }

  const params = new URLSearchParams(window.location.search);
  const rawSpec = params.get('spec');
  if (rawSpec) {
    try {
      applySpec(JSON.parse(rawSpec));
      await runCurrentQuery({ scroll: false });
      return;
    } catch {
      renderStatus('That shared query link could not be read.', true);
    }
  }

  // Legacy links: /plot-points/?type=cast-count&person_id=525
  const legacyPerson = Number(params.get('person_id'));
  if (legacyPerson) {
    applySpec({
      scope: {
        type: 'person-directed',
        person_id: legacyPerson,
        person_name: params.get('person_name') || undefined,
      },
      group_by: 'actor',
      metric: params.get('type') === 'cast-rating'
        ? { agg: 'avg', field: 'vote_average' }
        : { agg: 'count' },
      min_films: Number(params.get('min_films')) || 2,
    });
    await runCurrentQuery({ scroll: false });
  }
}

init();
