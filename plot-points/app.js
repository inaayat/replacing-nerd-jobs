const IMG = 'https://image.tmdb.org/t/p';
const QUERY_META = {
  'cast-count': {
    label: 'Most frequent collaborators',
    metric: 'films',
  },
  'cast-rating': {
    label: 'Highest-rated collaborators',
    metric: 'avg rating',
  },
  reuse: {
    label: 'Cast reuse',
    metric: 'films',
  },
};

const state = {
  person: null,
  type: 'cast-count',
  minFilms: 2,
  searchTimer: null,
};

const els = {
  featured: document.getElementById('featured-grid'),
  type: document.getElementById('query-type'),
  minFilms: document.getElementById('min-films'),
  search: document.getElementById('person-search'),
  suggest: document.getElementById('person-suggest'),
  selected: document.getElementById('selected-person'),
  run: document.getElementById('run-query'),
  results: document.getElementById('results-pane'),
  explorer: document.getElementById('explorer'),
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function posterUrl(path, size = 'w92') {
  if (!path) return '';
  if (String(path).startsWith('http')) return path;
  return `${IMG}/${size}${path}`;
}

function profileHtml(path, alt = '') {
  const src = posterUrl(path, 'w185');
  if (!src) return '<span class="pp-avatar" aria-hidden="true"></span>';
  return `<img class="pp-avatar" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="36" height="54" loading="lazy">`;
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

function setSelectedPerson(person) {
  state.person = person;
  if (!person) {
    els.selected.className = 'pp-selected empty';
    els.selected.innerHTML = 'No director selected yet — search above.';
    els.run.disabled = true;
    return;
  }
  els.selected.className = 'pp-selected';
  els.selected.innerHTML = `
    ${profileHtml(person.profile_path, person.name)}
    <div>
      <strong>${escapeHtml(person.name)}</strong>
      <div class="pp-suggest-meta">${escapeHtml(person.known_for_department || 'Director')} · TMDB #${person.tmdb_id}</div>
    </div>
  `;
  els.run.disabled = false;
  els.search.value = person.name;
  els.suggest.classList.remove('open');
  els.suggest.innerHTML = '';
}

function renderSuggestions(results) {
  if (!results.length) {
    els.suggest.classList.remove('open');
    els.suggest.innerHTML = '';
    return;
  }
  els.suggest.innerHTML = results.map((p) => `
    <button type="button" data-id="${p.tmdb_id}">
      ${profileHtml(p.profile_path, p.name)}
      <span>
        <span class="pp-suggest-name">${escapeHtml(p.name)}</span>
        <span class="pp-suggest-meta">${escapeHtml(p.known_for_department || 'Person')}${p.known_for?.length ? ` · ${escapeHtml(p.known_for.join(', '))}` : ''}</span>
      </span>
    </button>
  `).join('');
  els.suggest.classList.add('open');
  els.suggest.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const person = results.find((r) => String(r.tmdb_id) === btn.dataset.id);
      if (person) setSelectedPerson(person);
    });
  });
}

async function searchPeople(q) {
  if (q.trim().length < 2) {
    renderSuggestions([]);
    return;
  }
  try {
    const { results } = await apiGet(`/api/plot-points-person-search?q=${encodeURIComponent(q.trim())}`);
    renderSuggestions(results || []);
  } catch (err) {
    els.suggest.innerHTML = `<button type="button" disabled>${escapeHtml(err.message)}</button>`;
    els.suggest.classList.add('open');
  }
}

function filmStrip(films = []) {
  if (!films.length) return '';
  return `
    <div class="pp-film-strip" aria-label="Shared films">
      ${films.slice(0, 8).map((f) => `
        <figure class="pp-film-chip" title="${escapeHtml(f.title)}${f.year ? ` (${f.year})` : ''}">
          ${f.poster_path
    ? `<img src="${escapeHtml(posterUrl(f.poster_path, 'w92'))}" alt="" width="42" height="63" loading="lazy">`
    : '<span class="pp-avatar" style="width:42px;height:63px;display:block"></span>'}
          <figcaption>${escapeHtml(f.title)}</figcaption>
        </figure>
      `).join('')}
    </div>
  `;
}

function renderProvenance(query, stats, cache) {
  const filters = query.filters || {};
  return `
    <section class="pp-provenance" aria-label="Query details">
      <h3>${escapeHtml(query.headline)}</h3>
      <p class="pp-provenance-desc">${escapeHtml(query.description)}</p>
      <dl class="pp-prov-grid">
        <div class="pp-prov-item"><dt>Query type</dt><dd>${escapeHtml(query.type_label)}</dd></div>
        <div class="pp-prov-item"><dt>Subject</dt><dd>${escapeHtml(query.subject?.name || '—')} (director)</dd></div>
        <div class="pp-prov-item"><dt>Media</dt><dd>${escapeHtml(filters.media || 'movies')}</dd></div>
        <div class="pp-prov-item"><dt>Min shared films</dt><dd>${escapeHtml(filters.min_shared_films)}</dd></div>
        <div class="pp-prov-item"><dt>Films scanned</dt><dd>${escapeHtml(filters.directed_films_scanned)} directed titles</dd></div>
        <div class="pp-prov-item"><dt>Cast window</dt><dd>Top ${escapeHtml(filters.top_cast_per_film)} billed per film</dd></div>
        <div class="pp-prov-item"><dt>Ranking</dt><dd>${escapeHtml(query.ranking)}</dd></div>
        <div class="pp-prov-item"><dt>Source</dt><dd>TMDB · ${escapeHtml(query.source)}${cache ? ` · cache ${escapeHtml(cache)}` : ''}</dd></div>
      </dl>
    </section>
    <div class="pp-stats">
      <div class="pp-stat"><strong>${stats.film_count}</strong> films</div>
      <div class="pp-stat"><strong>${stats.unique_actors}</strong> unique actors</div>
      <div class="pp-stat"><strong>${stats.repeat_actors}</strong> reused</div>
      <div class="pp-stat"><strong>${stats.reuse_rate}%</strong> reuse rate</div>
    </div>
  `;
}

function renderResults(payload) {
  const { query, stats, results, cache } = payload;
  const metricLabel = QUERY_META[query.type]?.metric || 'score';

  if (!results?.length) {
    els.results.innerHTML = `
      ${renderProvenance(query, stats, cache)}
      <p class="pp-status">No actors matched these filters. Try lowering the minimum shared films.</p>
    `;
    return;
  }

  els.results.innerHTML = `
    ${renderProvenance(query, stats, cache)}
    <ol class="pp-rank-list">
      ${results.map((row) => `
        <li class="pp-rank-item">
          <div class="pp-rank-num">${row.rank}</div>
          ${profileHtml(row.profile_path, row.name)}
          <div>
            <p class="pp-rank-name">${escapeHtml(row.name)}</p>
            <div class="pp-rank-meta">${row.film_count} shared · avg TMDB ${row.avg_rating.toFixed(1)}</div>
            ${filmStrip(row.films)}
          </div>
          <div class="pp-metric">
            ${query.type === 'cast-rating' ? row.avg_rating.toFixed(1) : row.film_count}
            <span>${metricLabel}</span>
          </div>
        </li>
      `).join('')}
    </ol>
  `;
}

function renderStatus(message, isError = false) {
  els.results.innerHTML = `<p class="pp-status${isError ? ' error' : ''}">${escapeHtml(message)}</p>`;
}

async function runQuery({ type, personId, personName, minFilms, scroll = true }) {
  state.type = type || state.type;
  state.minFilms = Number(minFilms) || state.minFilms;
  els.type.value = state.type;
  els.minFilms.value = String(state.minFilms);

  if (personId && (!state.person || state.person.tmdb_id !== personId)) {
    setSelectedPerson({
      tmdb_id: personId,
      name: personName || `Person ${personId}`,
      profile_path: state.person?.profile_path || null,
      known_for_department: 'Directing',
    });
  }

  if (!state.person?.tmdb_id) {
    renderStatus('Pick a director first.', true);
    return;
  }

  if (scroll) {
    els.explorer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  els.run.disabled = true;
  renderStatus('Pulling filmography and cast from TMDB… this can take a few seconds on a cold cache.');

  const params = new URLSearchParams({
    type: state.type,
    person_id: String(state.person.tmdb_id),
    min_films: String(state.minFilms),
  });

  try {
    const payload = await apiGet(`/api/plot-points-query?${params}`);
    if (payload.query?.subject) {
      setSelectedPerson({
        tmdb_id: payload.query.subject.tmdb_id,
        name: payload.query.subject.name,
        profile_path: payload.query.subject.profile_path,
        known_for_department: 'Directing',
      });
    }
    renderResults(payload);
    const url = new URL(window.location.href);
    url.searchParams.set('type', state.type);
    url.searchParams.set('person_id', String(state.person.tmdb_id));
    url.searchParams.set('min_films', String(state.minFilms));
    if (state.person.name) url.searchParams.set('person_name', state.person.name);
    history.replaceState({}, '', url);
  } catch (err) {
    renderStatus(err.message, true);
  } finally {
    els.run.disabled = !state.person;
  }
}

function renderFeatured(items) {
  els.featured.innerHTML = items.map((item) => `
    <button type="button" class="pp-feature" data-accent="${escapeHtml(item.accent || 'orange')}" data-id="${escapeHtml(item.id)}">
      <div>
        <h3 class="pp-feature-title">${escapeHtml(item.title)}</h3>
        <p class="pp-feature-blurb">${escapeHtml(item.blurb)}</p>
      </div>
      <div class="pp-feature-meta">${escapeHtml(QUERY_META[item.query.type]?.label || item.query.type)} · min ${item.query.min_films} films</div>
    </button>
  `).join('');

  els.featured.querySelectorAll('.pp-feature').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = items.find((f) => f.id === btn.dataset.id);
      if (!item) return;
      runQuery({
        type: item.query.type,
        personId: item.query.person_id,
        personName: item.query.person_name,
        minFilms: item.query.min_films,
      });
    });
  });
}

function bindControls() {
  els.type.addEventListener('change', () => {
    state.type = els.type.value;
  });
  els.minFilms.addEventListener('change', () => {
    state.minFilms = Number(els.minFilms.value) || 2;
  });
  els.search.addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => searchPeople(els.search.value), 220);
  });
  els.search.addEventListener('focus', () => {
    if (els.suggest.innerHTML) els.suggest.classList.add('open');
  });
  document.addEventListener('click', (event) => {
    if (!els.suggest.contains(event.target) && event.target !== els.search) {
      els.suggest.classList.remove('open');
    }
  });
  els.run.addEventListener('click', () => {
    runQuery({
      type: state.type,
      personId: state.person?.tmdb_id,
      personName: state.person?.name,
      minFilms: state.minFilms,
    });
  });
  document.getElementById('cta-explorer')?.addEventListener('click', (event) => {
    event.preventDefault();
    els.explorer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    els.search.focus();
  });
}

async function bootFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const personId = Number(params.get('person_id'));
  if (!personId) return;
  await runQuery({
    type: params.get('type') || 'cast-count',
    personId,
    personName: params.get('person_name') || undefined,
    minFilms: params.get('min_films') || 2,
    scroll: true,
  });
}

async function init() {
  bindControls();
  setSelectedPerson(null);
  renderStatus('Choose a featured query or search for a director to generate a list.');

  try {
    const featured = await fetch('./featured.json').then((r) => r.json());
    renderFeatured(featured.featured || []);
  } catch {
    els.featured.innerHTML = '<p class="pp-status">Could not load featured queries.</p>';
  }

  await bootFromUrl();
}

init();
