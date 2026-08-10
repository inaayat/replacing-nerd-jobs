import { bootPage, renderShell, requireSignIn } from './nav.js';
import { tvWatchesApi, tvWatchlistApi, tvApi } from './api.js';
import {
  sortAlreadyOut,
  sortComingSoon,
  combinedWatchlistItems,
  todayISO,
  wireWatchlistLogList,
  wireWatchlistAddForm,
} from './watchlist-ui.js';
import { escapeHtml, posterHtml, shortDate, ratingLabel } from './format.js';

const VIEWS = {
  watched: { label: 'Watched', segment: 'Watched' },
  want: { label: 'Want to watch', segment: 'Want to watch' },
};

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'TV shows',
    subtitle: 'Track watched and want-to-watch series.',
    body: `<main class="al-main" id="tv-main"><p class="al-muted">Loading…</p></main>`,
    hideLogBar: true,
    signedIn: true,
  });

  await loadPage(auth);
});

async function loadPage(auth) {
  const main = document.getElementById('tv-main');
  if (!main) return;

  const [{ watches }, { items: watchlist }] = await Promise.all([
    tvWatchesApi.list(auth.token),
    tvWatchlistApi.list(auth.token),
  ]);

  main.innerHTML = `
    <section class="al-panel al-panel--log al-panel--tv">
      <p class="al-muted al-tv-stats-note">TV shows are not counted in A-List savings, insights, or leaderboard — only theater movie screenings are.</p>
      <div class="al-watchlist-header al-watchlist-header--compact">
        <h2 class="al-section-title" id="tv-section-title">${VIEWS.watched.label}</h2>
        <span class="al-muted" id="tv-count"></span>
      </div>
      <div class="al-segment al-watchlist-segment" role="tablist" aria-label="TV view">
        <button type="button" class="al-segment-btn is-active" data-tv-view="watched" role="tab" aria-selected="true">
          Watched <span class="al-segment-count" id="tv-watched-count">${watches.length}</span>
        </button>
        <button type="button" class="al-segment-btn" data-tv-view="want" role="tab" aria-selected="false">
          Want to watch <span class="al-segment-count" id="tv-want-count">${watchlist.length}</span>
        </button>
      </div>

      <div id="tv-watched-panel">
        <form class="al-tv-add" id="tv-add-form" autocomplete="off">
          <div class="al-tv-add-row">
            <div class="al-search-wrap al-tv-add-field">
              <input class="al-input" id="tv-add-title" type="text" placeholder="Show title…" required />
              <div class="al-search-results" id="tv-add-results" hidden></div>
            </div>
            <input class="al-input al-tv-add-date" id="tv-add-date" type="date" required value="${todayISO()}" />
            <input class="al-input al-tv-add-season" id="tv-add-season" type="number" min="1" placeholder="Season" inputmode="numeric" />
            <input class="al-input al-tv-add-episode" id="tv-add-episode" type="number" min="1" placeholder="Episode" inputmode="numeric" />
            <select class="al-select al-tv-add-rating" id="tv-add-rating" aria-label="Rating">
              <option value="">Rating</option>
              <option value="5">5★</option>
              <option value="4">4★</option>
              <option value="3">3★</option>
              <option value="2">2★</option>
              <option value="1">1★</option>
              <option value="dnf">DNF</option>
            </select>
            <button class="al-btn al-btn-primary" type="submit">Add</button>
          </div>
          <input type="hidden" id="tv-add-tmdb_id" value="" />
        </form>
        <p class="al-muted al-watchlist-status" id="tv-watched-status" aria-live="polite"></p>
        <div class="al-toolbar al-toolbar--log">
          <input class="al-input al-toolbar-search" id="tv-watched-search" type="search" placeholder="Search title…" />
          <span class="al-muted" id="tv-watched-filter-count"></span>
        </div>
        <div class="al-log-list-wrap" id="tv-watched-list"></div>
      </div>

      <div id="tv-want-panel" hidden>
        <form class="al-watchlist-add" id="tv-watchlist-add-form" autocomplete="off">
          <div class="al-watchlist-add-field al-search-wrap">
            <input class="al-input" id="tv-watchlist-title" type="text" placeholder="Add a show…" required />
            <div class="al-search-results" id="tv-watchlist-title-results" hidden></div>
          </div>
          <button class="al-btn al-btn-primary" type="submit">Add</button>
          <input type="hidden" id="tv-watchlist-tmdb_id" value="" />
        </form>
        <p class="al-muted al-watchlist-status" id="tv-watchlist-status" aria-live="polite"></p>
        <p class="al-muted al-watchlist-summary" id="tv-watchlist-summary"></p>
        <div class="al-toolbar al-toolbar--log">
          <input class="al-input al-toolbar-search" id="tv-watchlist-search" type="search" placeholder="Search title or notes…" />
          <span class="al-muted" id="tv-watchlist-filter-count"></span>
        </div>
        <div class="al-log-list-wrap" id="tv-watchlist-list"></div>
      </div>
    </section>
  `;

  const state = {
    watches,
    watchlist,
    view: 'watched',
    watchlistSearch: '',
    watchedSearch: '',
    watchedEditingId: null,
    watchedExpandedId: null,
    watchedDetailsCache: new Map(),
    watchedDetailsLoading: null,
    watchedDetailsError: null,
    editingId: null,
    expandedId: null,
    detailsCache: new Map(),
    detailsLoading: null,
    detailsError: null,
  };

  const watchedPanel = document.getElementById('tv-watched-panel');
  const wantPanel = document.getElementById('tv-want-panel');
  const sectionTitle = document.getElementById('tv-section-title');
  const countEl = document.getElementById('tv-count');
  const watchedCountEl = document.getElementById('tv-watched-count');
  const wantCountEl = document.getElementById('tv-want-count');
  const watchedStatusEl = document.getElementById('tv-watched-status');
  const watchedFilterCountEl = document.getElementById('tv-watched-filter-count');
  const watchlistSummaryEl = document.getElementById('tv-watchlist-summary');
  const watchlistFilterCountEl = document.getElementById('tv-watchlist-filter-count');

  const getFilteredWatches = () => {
    const q = state.watchedSearch.trim().toLowerCase();
    if (!q) return state.watches;
    return state.watches.filter((w) => `${w.title} ${episodeLabel(w)}`.toLowerCase().includes(q));
  };

  const getAllWatchlistItems = () => combinedWatchlistItems(state.watchlist);

  const getFilteredWatchlistItems = () => {
    const q = state.watchlistSearch.trim().toLowerCase();
    const items = getAllWatchlistItems();
    if (!q) return items;
    return items.filter((item) => `${item.title} ${item.notes || ''}`.toLowerCase().includes(q));
  };

  const refreshHeader = () => {
    const cfg = VIEWS[state.view];
    if (sectionTitle) sectionTitle.textContent = cfg.label;
    if (watchedCountEl) watchedCountEl.textContent = String(state.watches.length);
    if (wantCountEl) wantCountEl.textContent = String(state.watchlist.length);

    const soon = sortComingSoon(state.watchlist);
    const out = sortAlreadyOut(state.watchlist);
    if (watchlistSummaryEl) {
      const parts = [];
      if (out.length) parts.push(`${out.length} already aired`);
      if (soon.length) parts.push(`${soon.length} coming soon`);
      watchlistSummaryEl.textContent = parts.join(' · ');
      watchlistSummaryEl.hidden = state.view !== 'want';
    }

    if (state.view === 'watched') {
      if (countEl) countEl.textContent = String(state.watches.length);
      watchedPanel.hidden = false;
      wantPanel.hidden = true;
    } else {
      if (countEl) countEl.textContent = String(state.watchlist.length);
      watchedPanel.hidden = true;
      wantPanel.hidden = false;
      if (watchlistFilterCountEl) {
        const filtered = getFilteredWatchlistItems();
        const total = state.watchlist.length;
        watchlistFilterCountEl.textContent = filtered.length === total
          ? `${total} show${total === 1 ? '' : 's'}`
          : `${filtered.length} of ${total}`;
      }
    }
  };

  const renderWatchedList = () => {
    const listEl = document.getElementById('tv-watched-list');
    const filtered = getFilteredWatches();
    const total = state.watches.length;

    if (watchedFilterCountEl) {
      watchedFilterCountEl.textContent = filtered.length === total
        ? `${total} show${total === 1 ? '' : 's'}`
        : `${filtered.length} of ${total}`;
    }

    if (!filtered.length) {
      listEl.innerHTML = state.watchedSearch.trim()
        ? '<div class="al-empty">No matches.</div>'
        : '<div class="al-empty">No shows logged yet. Add one above.</div>';
      refreshHeader();
      return;
    }

    listEl.innerHTML = `
      <div class="al-log-list al-log-list--tv">
        <div class="al-log-head al-log-head--tv" aria-hidden="true">
          <span class="al-log-col al-col-poster"></span>
          <span class="al-log-col">Date</span>
          <span class="al-log-col">Title</span>
          <span class="al-log-col">Episode</span>
          <span class="al-log-col">Rating</span>
          <span class="al-log-col">Actions</span>
        </div>
        ${filtered.map((w) => (
          w.id === state.watchedEditingId ? tvEditRowHtml(w) : tvViewRowHtml(w, state)
        )).join('')}
      </div>
    `;

    wireWatchedActions(auth, state, renderWatchedList);
    refreshHeader();
  };

  const renderWatchlist = wireWatchlistLogList(auth, state, {
    listEl: document.getElementById('tv-watchlist-list'),
    statusEl: document.getElementById('tv-watchlist-status'),
    watchlistApi: tvWatchlistApi,
    detailsApi: tvApi,
    detailsKind: 'tv',
    logLabel: 'Log watched',
    shadeComingSoon: true,
    getItems: getFilteredWatchlistItems,
    emptyMessage: () => (state.watchlistSearch.trim()
      ? 'No matches.'
      : 'Nothing on your list yet. Add a show above.'),
    onLogItem: (item) => {
      state.view = 'watched';
      state.expandedId = null;
      state.editingId = null;
      document.querySelectorAll('[data-tv-view]').forEach((b) => {
        const active = b.dataset.tvView === 'watched';
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      document.getElementById('tv-add-title').value = item.title;
      document.getElementById('tv-add-tmdb_id').value = item.tmdb_id ? String(item.tmdb_id) : '';
      document.getElementById('tv-add-date').focus();
      refreshHeader();
      renderWatchedList();
    },
    onChange: refreshHeader,
  });

  document.getElementById('tv-watchlist-search').addEventListener('input', (e) => {
    state.watchlistSearch = e.target.value;
    renderWatchlist();
  });

  document.getElementById('tv-watched-search').addEventListener('input', (e) => {
    state.watchedSearch = e.target.value;
    renderWatchedList();
  });

  wireWatchlistAddForm(auth, state, {
    form: document.getElementById('tv-watchlist-add-form'),
    titleInput: document.getElementById('tv-watchlist-title'),
    resultsEl: document.getElementById('tv-watchlist-title-results'),
    tmdbInput: document.getElementById('tv-watchlist-tmdb_id'),
    statusEl: document.getElementById('tv-watchlist-status'),
    searchApi: tvApi,
    watchlistApi: tvWatchlistApi,
    onAdded: renderWatchlist,
  });

  wireTvAddForm(auth, state, {
    form: document.getElementById('tv-add-form'),
    titleInput: document.getElementById('tv-add-title'),
    resultsEl: document.getElementById('tv-add-results'),
    tmdbInput: document.getElementById('tv-add-tmdb_id'),
    dateInput: document.getElementById('tv-add-date'),
    seasonInput: document.getElementById('tv-add-season'),
    episodeInput: document.getElementById('tv-add-episode'),
    ratingInput: document.getElementById('tv-add-rating'),
    statusEl: watchedStatusEl,
    onAdded: renderWatchedList,
  });

  document.querySelectorAll('[data-tv-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.tvView;
      if (state.view === 'watched') {
        state.expandedId = null;
        state.editingId = null;
      } else {
        state.watchedEditingId = null;
        state.watchedExpandedId = null;
        state.watchedDetailsError = null;
      }
      document.querySelectorAll('[data-tv-view]').forEach((b) => {
        const active = b.dataset.tvView === state.view;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      refreshHeader();
      if (state.view === 'watched') renderWatchedList();
      else renderWatchlist();
    });
  });

  refreshHeader();
  renderWatchedList();
}

function episodeLabel(w) {
  if (w.season != null && w.episode != null) return `S${w.season}E${w.episode}`;
  if (w.season != null) return `Season ${w.season}`;
  return '—';
}

function mobileTvMeta(w) {
  const primary = [
    shortDate(w.watched_on),
    episodeLabel(w) !== '—' ? episodeLabel(w) : null,
    ratingLabel(w),
  ].filter(Boolean).map((part) => escapeHtml(String(part))).join(' · ');
  return `<span class="al-log-meta-primary">${primary}</span>`;
}

function tvDetailPanelHtml(watch, state) {
  const wrap = (content) => `
    <div class="al-log-detail">
      <div class="al-log-detail-inner">${content}</div>
    </div>
  `;

  if (!watch.tmdb_id) {
    return wrap('<p class="al-muted">No TMDB match for this title.</p>');
  }

  if (state.watchedDetailsLoading === watch.id) {
    return wrap('<p class="al-muted">Loading show details…</p>');
  }

  if (state.watchedDetailsError && state.watchedExpandedId === watch.id) {
    return wrap(`<p class="al-error">${escapeHtml(state.watchedDetailsError)}</p>`);
  }

  const show = state.watchedDetailsCache.get(watch.id);
  if (!show) {
    return wrap('<p class="al-muted">Loading show details…</p>');
  }

  const genres = show.genres?.length ? show.genres.join(', ') : '—';
  const seasons = show.number_of_seasons != null ? `${show.number_of_seasons} season${show.number_of_seasons === 1 ? '' : 's'}` : '—';
  const episodes = show.number_of_episodes != null ? `${show.number_of_episodes} episodes` : '—';
  const creator = show.creator || '—';
  const cast = show.cast?.length ? show.cast.join(', ') : '—';
  const titleLine = `${escapeHtml(show.title)}${show.year ? ` <span class="al-muted">(${show.year})</span>` : ''}`;

  return wrap(`
    <h3 class="al-log-detail-title serif">${titleLine}</h3>
    <div class="al-log-detail-body">
      ${show.poster_path ? posterHtml(show, { size: 'w185', width: 88, height: 132, className: 'al-poster al-poster--detail' }) : ''}
      <div class="al-log-detail-meta">
        <dl class="al-log-detail-facts">
          <div class="al-log-detail-fact"><dt>Seasons</dt><dd>${escapeHtml(seasons)}</dd></div>
          <div class="al-log-detail-fact"><dt>Episodes</dt><dd>${escapeHtml(episodes)}</dd></div>
          <div class="al-log-detail-fact"><dt>Genre</dt><dd>${escapeHtml(genres)}</dd></div>
          <div class="al-log-detail-fact"><dt>Creator</dt><dd>${escapeHtml(creator)}</dd></div>
          <div class="al-log-detail-fact"><dt>Cast</dt><dd>${escapeHtml(cast)}</dd></div>
          <div class="al-log-detail-fact"><dt>Status</dt><dd>${escapeHtml(show.status || '—')}</dd></div>
        </dl>
      </div>
    </div>
    <section class="al-log-detail-overview-wrap">
      <h4 class="al-log-detail-subhead">Overview</h4>
      ${show.overview
    ? `<p class="al-log-detail-overview">${escapeHtml(show.overview)}</p>`
    : '<p class="al-muted">No overview available.</p>'}
    </section>
  `);
}

function tvViewRowHtml(w, state) {
  const expanded = w.id === state.watchedExpandedId;
  return `
    <div class="al-log-entry ${expanded ? 'is-expanded' : ''}" data-entry-id="${w.id}">
      <article class="al-log-row al-log-row--tv al-log-row--clickable ${expanded ? 'is-expanded' : ''}" data-tv-expand-row tabindex="0" role="button" aria-expanded="${expanded}">
        <div class="al-log-col al-col-poster">${posterHtml(w, { size: 'w92', width: 28, height: 42 })}</div>
        <div class="al-log-col al-log-col--desktop">${shortDate(w.watched_on)}</div>
        <div class="al-log-col--body">
          <div class="al-log-col al-log-col--title">${escapeHtml(w.title)}</div>
          <div class="al-log-col al-log-col--mobile-meta al-only-mobile">${mobileTvMeta(w)}</div>
        </div>
        <div class="al-log-col al-log-col--desktop al-muted">${escapeHtml(episodeLabel(w))}</div>
        <div class="al-log-col al-log-col--desktop">${ratingLabel(w)}</div>
        <div class="al-log-col al-row-actions">
          <button type="button" class="al-link-btn" data-tv-edit="${w.id}">Edit</button>
          <button type="button" class="al-link-btn" data-tv-delete="${w.id}">Delete</button>
        </div>
      </article>
      ${expanded ? tvDetailPanelHtml(w, state) : ''}
    </div>
  `;
}

function tvEditRowHtml(w) {
  const ratingVal = w.dnf ? 'dnf' : (w.rating != null ? String(w.rating) : '');
  return `
    <div class="al-log-entry al-log-entry--editing" data-entry-id="${w.id}">
      <article class="al-log-row al-log-row--tv al-log-row--editing" data-tv-id="${w.id}">
        <form class="al-tv-edit-form" data-tv-edit-form="${w.id}">
          <div class="al-tv-add-row">
            <input class="al-input" name="title" type="text" value="${escapeHtml(w.title)}" required />
            <input class="al-input al-tv-add-date" name="watched_on" type="date" value="${w.watched_on}" required />
            <input class="al-input al-tv-add-season" name="season" type="number" min="1" placeholder="Season" value="${w.season ?? ''}" inputmode="numeric" />
            <input class="al-input al-tv-add-episode" name="episode" type="number" min="1" placeholder="Episode" value="${w.episode ?? ''}" inputmode="numeric" />
            <select class="al-select al-tv-add-rating" name="rating">
              <option value="">Rating</option>
              <option value="5" ${ratingVal === '5' ? 'selected' : ''}>5★</option>
              <option value="4" ${ratingVal === '4' ? 'selected' : ''}>4★</option>
              <option value="3" ${ratingVal === '3' ? 'selected' : ''}>3★</option>
              <option value="2" ${ratingVal === '2' ? 'selected' : ''}>2★</option>
              <option value="1" ${ratingVal === '1' ? 'selected' : ''}>1★</option>
              <option value="dnf" ${ratingVal === 'dnf' ? 'selected' : ''}>DNF</option>
            </select>
            <button class="al-btn al-btn-primary" type="submit">Save</button>
            <button class="al-btn" type="button" data-tv-cancel="${w.id}">Cancel</button>
          </div>
          <input type="hidden" name="tmdb_id" value="${w.tmdb_id ?? ''}" />
        </form>
      </article>
    </div>
  `;
}

async function loadTvWatchDetails(auth, state, watchId, render) {
  const watch = state.watches.find((w) => w.id === watchId);
  if (!watch?.tmdb_id) return;

  if (state.watchedDetailsCache.has(watchId)) return;

  state.watchedDetailsLoading = watchId;
  state.watchedDetailsError = null;
  render();

  try {
    const { show } = await tvApi.details(auth.token, watch.tmdb_id);
    state.watchedDetailsCache.set(watchId, show);
    if (show?.poster_path && !watch.poster_path) {
      const withPoster = { ...watch, poster_path: show.poster_path };
      state.watches = state.watches.map((w) => (w.id === watchId ? withPoster : w));
    }
  } catch (err) {
    state.watchedDetailsError = err.message || 'Could not load show details.';
  } finally {
    state.watchedDetailsLoading = null;
    render();
  }
}

function wireWatchedActions(auth, state, render) {
  document.querySelectorAll('[data-tv-expand-row]').forEach((row) => {
    const toggle = (e) => {
      if (e.target.closest('.al-row-actions')) return;
      const entry = row.closest('.al-log-entry');
      const id = entry?.dataset.entryId;
      if (!id) return;

      if (state.watchedExpandedId === id) {
        state.watchedExpandedId = null;
        state.watchedDetailsError = null;
        render();
        return;
      }

      state.watchedExpandedId = id;
      state.watchedEditingId = null;
      state.watchedDetailsError = null;

      const watch = state.watches.find((w) => w.id === id);
      if (watch?.tmdb_id && !state.watchedDetailsCache.has(id)) {
        loadTvWatchDetails(auth, state, id, render);
      } else {
        render();
      }
    };

    row.addEventListener('click', toggle);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle(e);
      }
    });
  });

  document.querySelectorAll('[data-tv-edit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.watchedEditingId = btn.dataset.tvEdit;
      state.watchedExpandedId = null;
      render();
    });
  });

  document.querySelectorAll('[data-tv-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.watchedEditingId = null;
      render();
    });
  });

  document.querySelectorAll('[data-tv-delete]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this entry?')) return;
      await tvWatchesApi.remove(auth.token, btn.dataset.tvDelete);
      state.watches = state.watches.filter((w) => w.id !== btn.dataset.tvDelete);
      if (state.watchedEditingId === btn.dataset.tvDelete) state.watchedEditingId = null;
      if (state.watchedExpandedId === btn.dataset.tvDelete) state.watchedExpandedId = null;
      state.watchedDetailsCache.delete(btn.dataset.tvDelete);
      render();
    });
  });

  document.querySelectorAll('[data-tv-edit-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = form.dataset.tvEditForm;
      const fd = new FormData(form);
      const ratingRaw = fd.get('rating');
      const dnf = ratingRaw === 'dnf';
      const payload = {
        id,
        title: String(fd.get('title') || '').trim(),
        watched_on: String(fd.get('watched_on') || ''),
        tmdb_id: fd.get('tmdb_id') ? Number(fd.get('tmdb_id')) : null,
        season: fd.get('season') ? Number(fd.get('season')) : null,
        episode: fd.get('episode') ? Number(fd.get('episode')) : null,
        rating: dnf || !ratingRaw ? null : Number(ratingRaw),
        dnf,
      };
      const { watch } = await tvWatchesApi.update(auth.token, payload);
      const prev = state.watches.find((w) => w.id === id);
      state.watches = state.watches.map((w) => (w.id === id ? { ...watch, poster_path: watch.poster_path || prev?.poster_path } : w));
      state.watchedEditingId = null;
      render();
    });
  });
}

function wireTvAddForm(auth, state, {
  form,
  titleInput,
  resultsEl,
  tmdbInput,
  dateInput,
  seasonInput,
  episodeInput,
  ratingInput,
  statusEl,
  onAdded,
}) {
  let searchTimer = null;

  titleInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = titleInput.value.trim();
    if (q.length < 2) {
      resultsEl.hidden = true;
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const { results } = await tvApi.search(auth.token, q);
        if (!results.length) {
          resultsEl.hidden = true;
          return;
        }
        resultsEl.hidden = false;
        resultsEl.innerHTML = results.map((s) => `
          <button type="button" data-id="${s.tmdb_id}" data-title="${escapeHtml(s.title)}">
            ${s.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${s.poster_path}" alt="" width="28" height="42" style="border-radius:4px;object-fit:cover">` : '<span style="width:28px"></span>'}
            <span>${escapeHtml(s.title)}${s.year ? ` <span class="al-muted">(${s.year})</span>` : ''}</span>
          </button>
        `).join('');
        resultsEl.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', () => {
            titleInput.value = btn.dataset.title;
            tmdbInput.value = btn.dataset.id;
            resultsEl.hidden = true;
          });
        });
      } catch {
        resultsEl.hidden = true;
      }
    }, 300);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest(`#${form.id} .al-search-wrap`)) resultsEl.hidden = true;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusEl.textContent = 'Adding…';
    const title = titleInput.value.trim();
    let tmdbId = tmdbInput.value ? Number(tmdbInput.value) : null;
    if (!tmdbId && title) {
      tmdbId = await tvApi.resolve(auth.token, title);
    }
    const ratingRaw = ratingInput.value;
    const dnf = ratingRaw === 'dnf';
    const payload = {
      title,
      watched_on: dateInput.value,
      tmdb_id: tmdbId,
      season: seasonInput.value ? Number(seasonInput.value) : null,
      episode: episodeInput.value ? Number(episodeInput.value) : null,
      rating: dnf || !ratingRaw ? null : Number(ratingRaw),
      dnf,
    };
    try {
      const { watch } = await tvWatchesApi.create(auth.token, payload);
      state.watches = [watch, ...state.watches];
      form.reset();
      tmdbInput.value = '';
      dateInput.value = todayISO();
      statusEl.textContent = `Added ${title}`;
      onAdded?.();
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    } catch (err) {
      statusEl.textContent = err.message || 'Could not add.';
    }
  });
}
