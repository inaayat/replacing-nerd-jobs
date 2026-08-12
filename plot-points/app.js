/**
 * Plot Points — questions up front, the full query builder behind them.
 *
 * The control catalog is imported straight from the same module the serverless
 * API uses, so the builder can only ever offer queries the engine can run, and
 * a question template can only ever express a query the builder can rebuild.
 *
 * This module must stay importable from `/plot-points/` — `middleware.js` 404s
 * everything under `/lib/`, so the shared engine deliberately lives here.
 */
import {
  AGGREGATIONS,
  CREDIT_QUALITY,
  DEPTH_OPTIONS,
  FILTER_FIELDS,
  FILTER_OPS,
  GROUP_BY,
  NUMERIC_FIELDS,
  RANK_MODES,
  SCOPES,
  describeSpec,
  formatMetric,
  normalizeSpec,
} from './query-engine.js';

const IMG = 'https://image.tmdb.org/t/p';

const state = {
  person: null,
  collection: null,
  genres: [],
  filters: [],
  searchTimers: {},
  questions: [],
  groups: [],
  seeds: {},
  askQuestion: null,
  askPerson: null,
};

const el = (id) => document.getElementById(id);

const els = {
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
  excludeSubject: el('exclude-subject'),
  excludeSubjectField: el('exclude-subject-field'),
  creditQuality: el('credit-quality'),
  creditQualityField: el('credit-quality-field'),
  creditQualityHint: el('credit-quality-hint'),
  scanDepth: el('scan-depth'),
  groupBy: el('group-by'),
  metricAgg: el('metric-agg'),
  metricFieldWrap: el('metric-field-wrap'),
  metricField: el('metric-field'),
  rankBy: el('rank-by'),
  rankByHint: el('rank-by-hint'),
  sortDir: el('sort-dir'),
  minFilms: el('min-films'),
  filterRows: el('filter-rows'),
  addFilter: el('add-filter'),
  limit: el('result-limit'),
  run: el('run-query'),
  specPreview: el('spec-preview'),
  results: el('results-pane'),
  builder: el('builder'),
  askTemplate: el('ask-template'),
  askQuestion: el('ask-question'),
  askSearch: el('ask-search'),
  askSearchInput: el('ask-search-input'),
  askSearchSuggest: el('ask-search-suggest'),
  askRun: el('ask-run'),
  askSurprise: el('ask-surprise'),
  questionGroups: el('question-groups'),
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

/** Signed, human-readable distance from the baseline. */
function formatDelta(value, spec) {
  if (!value) return '±0';
  const text = formatMetric(Math.abs(value), spec);
  return value > 0 ? `+${text}` : `−${text}`;
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

  els.rankBy.innerHTML = Object.entries(RANK_MODES)
    .map(([key, meta]) => option(key, meta.label, key === 'metric'))
    .join('');

  els.creditQuality.innerHTML = Object.entries(CREDIT_QUALITY)
    .map(([key, meta]) => option(key, meta.label, key === 'notable'))
    .join('');

  els.scanDepth.innerHTML = DEPTH_OPTIONS
    .map((d) => option(d.value, d.label, d.value === 60))
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

/* ── Field visibility ──────────────────────────────────────────── */

function syncScopeFields() {
  const needs = SCOPES[els.scopeType.value]?.needs;
  els.scopePerson.hidden = needs !== 'person';
  els.scopeCollection.hidden = needs !== 'collection';
  els.scopeDiscover.hidden = needs !== 'discover';
  // Credit screening only has anything to act on for a person's filmography.
  els.creditQualityField.hidden = needs !== 'person';
  els.excludeSubjectField.hidden = needs !== 'person';
  els.creditQualityHint.textContent = CREDIT_QUALITY[els.creditQuality.value]?.hint || '';
}

function syncMetricFields() {
  els.metricFieldWrap.hidden = !AGGREGATIONS[els.metricAgg.value]?.needsField;
  els.rankByHint.textContent = RANK_MODES[els.rankBy.value]?.hint || '';
  // A row can never hold more films than the query reads.
  els.minFilms.max = String(els.scanDepth.value || 60);
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
    rank_by: els.rankBy.value,
    exclude_subject: els.excludeSubject.checked,
    depth: Number(els.scanDepth.value),
    credit_quality: els.creditQuality.value,
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
  els.rankBy.value = normalized.rank_by;
  els.excludeSubject.checked = normalized.exclude_subject;
  els.scanDepth.value = String(normalized.depth);
  els.creditQuality.value = normalized.credit_quality;
  els.minFilms.value = String(normalized.min_films);
  els.limit.value = String(normalized.limit);

  const scope = normalized.scope;
  if (SCOPES[scope.type]?.needs === 'person') {
    setPerson(scope.person_id
      ? {
        tmdb_id: scope.person_id,
        name: scope.person_name || `Person ${scope.person_id}`,
        // Only carry the cached photo over when it belongs to this person —
        // otherwise switching subjects shows the previous one's face until
        // the query comes back with the real one.
        profile_path: state.person?.tmdb_id === scope.person_id
          ? state.person.profile_path
          : null,
      }
      : null);
  }
  if (scope.type === 'collection' && scope.collection_id) {
    setCollection({ tmdb_id: scope.collection_id, name: scope.collection_name || 'Collection' });
  }
  if (scope.type === 'discover') {
    els.scopeGenre.value = scope.genre_id ? String(scope.genre_id) : '';
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
    els.personSearch.value = '';
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
  closeSuggest(els.personSearch, els.personSuggest);
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
  closeSuggest(els.collectionSearch, els.collectionSuggest);
  updateSpecPreview();
}

/* ── Type-ahead search (combobox pattern) ──────────────────────── */

function closeSuggest(input, suggest) {
  suggest.classList.remove('open');
  suggest.innerHTML = '';
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

function setActiveOption(input, suggest, index) {
  const options = [...suggest.querySelectorAll('[role="option"]')];
  if (!options.length) return;
  const bounded = (index + options.length) % options.length;
  options.forEach((node, i) => {
    const active = i === bounded;
    node.setAttribute('aria-selected', active ? 'true' : 'false');
    node.classList.toggle('active', active);
    if (active) {
      input.setAttribute('aria-activedescendant', node.id);
      node.scrollIntoView({ block: 'nearest' });
    }
  });
}

function activeIndex(suggest) {
  const options = [...suggest.querySelectorAll('[role="option"]')];
  return options.findIndex((node) => node.classList.contains('active'));
}

/**
 * Wires an input to a suggestion list as an ARIA combobox: arrow keys move the
 * active option, Enter picks it, Escape closes. The list is a `listbox` of
 * `option`s rather than a stack of buttons, which is what screen readers
 * expect and what makes `aria-activedescendant` mean anything.
 */
function bindSearch({ input, suggest, endpoint, render, onPick }) {
  const idBase = `${suggest.id}-opt`;
  let results = [];

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', suggest.id);

  const pick = (index) => {
    const chosen = results[index];
    if (chosen) onPick(chosen);
  };

  input.addEventListener('input', () => {
    clearTimeout(state.searchTimers[endpoint]);
    const q = input.value.trim();
    if (q.length < 2) {
      closeSuggest(input, suggest);
      return;
    }
    state.searchTimers[endpoint] = setTimeout(async () => {
      try {
        const data = await apiGet(`${endpoint}?q=${encodeURIComponent(q)}`);
        results = data.results || [];
        if (!results.length) {
          closeSuggest(input, suggest);
          return;
        }
        suggest.innerHTML = results.map((item, i) => `
          <div role="option" id="${idBase}-${i}" aria-selected="false" data-index="${i}">
            ${render(item)}
          </div>`).join('');
        suggest.classList.add('open');
        input.setAttribute('aria-expanded', 'true');
        suggest.querySelectorAll('[role="option"]').forEach((node) => {
          node.addEventListener('click', () => pick(Number(node.dataset.index)));
          node.addEventListener('mousemove', () => setActiveOption(input, suggest, Number(node.dataset.index)));
        });
        setActiveOption(input, suggest, 0);
      } catch (err) {
        results = [];
        suggest.innerHTML = `<div class="pp-suggest-error">${escapeHtml(err.message)}</div>`;
        suggest.classList.add('open');
        input.setAttribute('aria-expanded', 'true');
      }
    }, 220);
  });

  input.addEventListener('keydown', (event) => {
    if (!suggest.classList.contains('open')) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveOption(input, suggest, activeIndex(suggest) + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveOption(input, suggest, activeIndex(suggest) - 1);
    } else if (event.key === 'Enter') {
      const index = activeIndex(suggest);
      if (index >= 0) {
        event.preventDefault();
        pick(index);
      }
    } else if (event.key === 'Escape') {
      closeSuggest(input, suggest);
    }
  });

  document.addEventListener('click', (event) => {
    if (!suggest.contains(event.target) && event.target !== input) {
      closeSuggest(input, suggest);
    }
  });
}

const personSuggestion = (p) => `
  ${avatarHtml(p.profile_path, p.name)}
  <span>
    <span class="pp-suggest-name">${escapeHtml(p.name)}</span>
    <span class="pp-suggest-meta">${escapeHtml(p.known_for_department || 'Person')}${p.known_for?.length ? ` · ${escapeHtml(p.known_for.join(', '))}` : ''}</span>
  </span>`;

/* ── The question composer ─────────────────────────────────────── */

function specForQuestion(question, person) {
  const spec = JSON.parse(JSON.stringify(question.spec));
  if (question.slot?.type === 'person' && person) {
    spec.scope.person_id = person.tmdb_id;
    spec.scope.person_name = person.name;
  }
  return spec;
}

/** Renders the question sentence with its variable as an inline button. */
function renderAskQuestion() {
  const question = state.askQuestion;
  if (!question) return;

  if (!question.slot) {
    els.askQuestion.innerHTML = escapeHtml(question.question);
    els.askSearch.hidden = true;
    return;
  }

  const name = state.askPerson?.name || question.slot.default.name;
  const [before, after] = question.question.split('{person}');
  els.askQuestion.innerHTML = `${escapeHtml(before || '')}<button type="button" class="pp-slot" id="ask-slot">${escapeHtml(name)}</button>${escapeHtml(after || '')}`;

  el('ask-slot').addEventListener('click', () => {
    const opening = els.askSearch.hidden;
    els.askSearch.hidden = !opening;
    if (opening) {
      els.askSearchInput.value = '';
      els.askSearchInput.focus();
    }
  });
}

function selectAskQuestion(id, { person } = {}) {
  const question = state.questions.find((q) => q.id === id) || state.questions[0];
  if (!question) return;
  state.askQuestion = question;
  state.askPerson = person
    || (question.slot ? { ...question.slot.default } : null);
  els.askTemplate.value = question.id;
  els.askSearch.hidden = true;
  renderAskQuestion();
}

function runAskQuestion() {
  const question = state.askQuestion;
  if (!question) return;
  applySpec(specForQuestion(question, state.askPerson));
  runCurrentQuery();
}

function renderQuestionGallery() {
  els.questionGroups.innerHTML = state.groups.map((group) => {
    const items = state.questions.filter((q) => q.group === group.id);
    if (!items.length) return '';
    return `
      <div class="pp-question-group">
        <h3 class="pp-question-group-title">${escapeHtml(group.label)}</h3>
        <div class="pp-featured">
          ${items.map((item) => {
    const name = item.slot ? item.slot.default.name : '';
    const text = item.slot ? item.question.replace('{person}', name) : item.question;
    return `
            <button type="button" class="pp-feature" data-accent="${escapeHtml(group.accent)}" data-question="${escapeHtml(item.id)}">
              <div>
                <h4 class="pp-feature-title">${escapeHtml(text)}</h4>
                <p class="pp-feature-blurb">${escapeHtml(item.blurb)}</p>
              </div>
              <div class="pp-feature-meta">${escapeHtml(describeSpec(normalizeSpec(specForQuestion(item, item.slot?.default))))}</div>
            </button>`;
  }).join('')}
        </div>
      </div>`;
  }).join('');

  els.questionGroups.querySelectorAll('[data-question]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectAskQuestion(btn.dataset.question);
      runAskQuestion();
    });
  });
}

function surpriseMe() {
  const pool = state.questions;
  if (!pool.length) return;
  const question = pool[Math.floor(Math.random() * pool.length)];
  let person = null;
  if (question.slot?.type === 'person') {
    const seeds = state.seeds[question.slot.pool] || [];
    person = seeds.length ? { ...seeds[Math.floor(Math.random() * seeds.length)] } : null;
  }
  selectAskQuestion(question.id, { person });
  runAskQuestion();
}

/* ── Results rendering ─────────────────────────────────────────── */

function filmStrip(films = [], spec) {
  if (!films.length) return '';
  return `
    <div class="pp-film-strip" aria-label="Films behind this row">
      ${films.slice(0, 10).map((f) => {
    const detail = f.metric_value != null && spec.metric.agg !== 'count'
      ? (f.has_metric === false ? '—' : formatMetric(f.metric_value, spec))
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

function findingsHtml(payload) {
  if (!payload.findings?.length) return '';
  return `
    <section class="pp-findings" aria-label="What this shows">
      ${payload.findings.map((line, i) => `
        <p class="pp-finding${i === 0 ? ' pp-finding--lead' : ''}">${escapeHtml(line)}</p>
      `).join('')}
    </section>`;
}

function provenanceHtml(payload) {
  const { query, spec, stats, scope, cache } = payload;
  const selection = scope?.selection;

  const filmsScanned = scope?.sampled
    ? `${stats.films_scanned} of ${scope.sampled.matching || '?'} matching (sample)`
    : `${stats.films_scanned}${scope?.truncated ? ` of ${scope.films_available}` : ''}`;

  const rows = [
    ['Rows are', query.group_label],
    ['Ranked by', `${query.metric_label} · ${RANK_MODES[query.rank_by]?.label || query.rank_by}`],
    ['Film set', scope?.label || '—'],
    ['Films read', filmsScanned],
    ['Scan depth', String(scope?.depth ?? spec.depth)],
    ['Films after filters', String(stats.films_matched)],
    ['Film-set baseline', `${formatMetric(query.baseline, spec)} (${query.baseline_label})`],
    ['Min films per row', String(stats.min_films)],
    ['Groups found', String(stats.groups_found)],
    ['Source', `TMDB${cache ? ` · cache ${cache}` : ''}`],
  ];

  if (selection?.screened_out) {
    rows.splice(4, 0, [
      'Credits screened out',
      `${selection.screened_out} of ${selection.total_credits}`,
    ]);
  }

  const filterText = spec.filters.length
    ? spec.filters
      .map((f) => `${FILTER_FIELDS[f.field].label} ${FILTER_OPS[f.op].label} ${f.value}`)
      .join(' · ')
    : 'none';

  const notes = [];
  if (query.confidence_weighted) {
    notes.push(`Rows are ordered on a confidence-weighted value: a row built from few films is
      pulled toward the ${formatMetric(query.baseline, spec)} film-set average, so a single film
      can't top the list. The number shown on each row is the real, unweighted one.`);
  }
  if (query.sparse_metric) {
    notes.push(`TMDB reports this field for only some films — ${stats.films_with_metric} of
      ${stats.films_scanned} here. Rows are averaged over the films that report a value, and rows
      with none are left out.`);
  }
  if (scope?.sampled) {
    notes.push(`${scope.sampled.note} This read the top ${stats.films_scanned} by
      ${String(scope.sampled.order).replace('.desc', '').replace('.asc', '')}${scope.sampled.matching
      ? ` out of ${scope.sampled.matching} matching films` : ''}.`);
  }
  if (scope?.truncated && !scope?.sampled) {
    notes.push(`This film set has ${scope.films_available} films; the query read the
      ${scope.films_used} most-voted. Raise the scan depth to widen it.`);
  }
  if (selection?.relaxed) {
    notes.push('Credit screening removed every film here, so it was switched off for this query.');
  }

  return `
    <section class="pp-provenance" aria-label="Query details">
      <h3>${escapeHtml(query.headline)}</h3>
      <p class="pp-provenance-desc">${escapeHtml(query.description)}</p>
      ${notes.map((note) => `<p class="pp-provenance-note">${escapeHtml(note.replace(/\s+/g, ' ').trim())}</p>`).join('')}
      <details class="pp-prov-details">
        <summary>How this was computed</summary>
        <dl class="pp-prov-grid">
          ${rows.map(([label, value]) => `
            <div class="pp-prov-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
          `).join('')}
          <div class="pp-prov-item"><dt>Filters</dt><dd>${escapeHtml(filterText)}</dd></div>
        </dl>
      </details>
      <div class="pp-prov-actions">
        <button type="button" class="pp-btn pp-btn--ghost pp-btn--sm" id="copy-link">Copy link to this query</button>
      </div>
    </section>`;
}

function renderResults(payload) {
  const { query, spec, results } = payload;

  if (!results?.length) {
    els.results.innerHTML = `${provenanceHtml(payload)}
      <p class="pp-status">No rows matched. Try lowering “Min films”, raising the scan depth, or widening the film set.</p>`;
    bindCopyLink();
    return;
  }

  // Deltas are only comparable within one result set, so the bar is scaled to
  // the largest gap present rather than to any absolute range.
  const widest = Math.max(...results.map((row) => Math.abs(row.delta || 0)), 0);
  // Rows sort on the confidence-weighted value but display the real one, so
  // without showing both the list reads as though it were sorted wrongly.
  const weightedOrder = query.confidence_weighted && query.rank_by !== 'lift';

  els.results.innerHTML = `
    ${provenanceHtml(payload)}
    ${findingsHtml(payload)}
    <ol class="pp-rank-list">
      ${results.map((row) => {
    const share = widest ? Math.round((Math.abs(row.delta) / widest) * 100) : 0;
    const sign = row.delta > 0 ? 'up' : (row.delta < 0 ? 'down' : 'flat');
    return `
        <li class="pp-rank-item">
          <div class="pp-rank-num">${row.rank}</div>
          ${avatarHtml(row.image, row.label)}
          <div class="pp-rank-body">
            <p class="pp-rank-name">${escapeHtml(row.label)}</p>
            <div class="pp-rank-meta">${row.film_count} film${row.film_count === 1 ? '' : 's'} · avg TMDB ${row.avg_rating.toFixed(1)}</div>
            <div class="pp-delta" title="Compared with the ${formatMetric(row.baseline, spec)} film-set average">
              <span class="pp-delta-track"><span class="pp-delta-bar" data-sign="${sign}" style="width:${share}%"></span></span>
              <span class="pp-delta-label">${escapeHtml(formatDelta(row.delta, spec))} vs average</span>
            </div>
          </div>
          <div class="pp-metric">
            ${escapeHtml(formatMetric(row.metric, spec))}
            <span>${escapeHtml(query.metric_label)}</span>
            ${weightedOrder && row.adjusted !== row.metric
    ? `<span class="pp-metric-weighted">ranked on ${escapeHtml(formatMetric(row.adjusted, spec))}</span>`
    : ''}
          </div>
          ${filmStrip(row.films, spec)}
        </li>`;
  }).join('')}
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

  // On a wide screen the rail and the results are on screen together, so
  // scrolling would move the answer away from the question that asked it.
  // Only the stacked layout needs to travel.
  if (scroll && window.matchMedia('(max-width: 860px)').matches) {
    els.builder.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  els.run.disabled = true;
  els.results.setAttribute('aria-busy', 'true');
  renderStatus(spec.depth > 60
    ? `Querying TMDB for up to ${spec.depth} films… a cold cache can take a few seconds.`
    : 'Querying TMDB… a cold cache can take a few seconds.');

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
    els.results.setAttribute('aria-busy', 'false');
  }
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
  els.rankBy.addEventListener('change', () => {
    syncMetricFields();
    updateSpecPreview();
  });
  els.excludeSubject.addEventListener('change', updateSpecPreview);
  els.creditQuality.addEventListener('change', () => {
    syncScopeFields();
    updateSpecPreview();
  });
  els.scanDepth.addEventListener('change', () => {
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
    runCurrentQuery({ scroll: false });
  });

  bindSearch({
    input: els.personSearch,
    suggest: els.personSuggest,
    endpoint: '/api/plot-points-person-search',
    render: personSuggestion,
    onPick: setPerson,
  });

  bindSearch({
    input: els.collectionSearch,
    suggest: els.collectionSuggest,
    endpoint: '/api/plot-points-collection-search',
    render: (c) => `
      ${avatarHtml(c.poster_path, c.name, 'w92')}
      <span><span class="pp-suggest-name">${escapeHtml(c.name)}</span></span>`,
    onPick: setCollection,
  });

  bindSearch({
    input: els.askSearchInput,
    suggest: els.askSearchSuggest,
    endpoint: '/api/plot-points-person-search',
    render: personSuggestion,
    onPick: (person) => {
      state.askPerson = { tmdb_id: person.tmdb_id, name: person.name };
      els.askSearch.hidden = true;
      renderAskQuestion();
    },
  });

  els.askTemplate.addEventListener('change', () => selectAskQuestion(els.askTemplate.value));
  els.askRun.addEventListener('click', runAskQuestion);
  els.askSurprise.addEventListener('click', surpriseMe);
}

async function loadQuestions() {
  try {
    const data = await fetch('./questions.json').then((r) => r.json());
    state.questions = data.questions || [];
    state.groups = data.groups || [];
    state.seeds = data.seeds || {};
  } catch {
    state.questions = [];
  }

  if (!state.questions.length) {
    els.questionGroups.innerHTML = '<p class="pp-status">Could not load the question list. The builder below still works.</p>';
    els.askTemplate.disabled = true;
    els.askRun.disabled = true;
    els.askSurprise.disabled = true;
    return;
  }

  els.askTemplate.innerHTML = state.questions
    .map((q) => option(q.id, q.slot ? q.question.replace('{person}', '…') : q.question))
    .join('');
  selectAskQuestion(state.questions[0].id);
  renderQuestionGallery();
}

async function init() {
  populateControls();
  bindControls();
  renderFilters();
  syncScopeFields();
  syncMetricFields();
  updateSpecPreview();
  renderStatus('Pick a question above, or build a query on the left.');

  loadGenres();
  await loadQuestions();

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
