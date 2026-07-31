import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { watchesApi, watchlistApi, movieApi } from './api.js';
import { money, shortDate, ratingLabel, escapeHtml, posterHtml } from './format.js';
import { renderWatchEditForm, wireWatchEditForm } from './watch-form.js';
import {
  sortComingSoon,
  sortAlreadyOut,
  wireWatchlistList,
  wireWatchlistAddForm,
} from './watchlist-ui.js';

let reloadLog;

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Watch log',
    subtitle: 'Search and filter every screening.',
    body: `<main class="al-main" id="log-main"><p class="al-muted">Loading…</p></main>`,
  });

  reloadLog = () => loadLog(auth);
  await loadLog(auth);
}, { quickLogOnSuccess: async (auth) => {
  await Promise.all([reloadLog?.(), populateSidebarStats(auth)]);
}});

async function loadLog(auth) {
  const main = document.getElementById('log-main');
  if (!main) return;

  const [{ watches }, { items: watchlist }] = await Promise.all([
    watchesApi.list(auth.token),
    watchlistApi.list(auth.token),
  ]);
  const theaters = [...new Set(watches.map((w) => w.location).filter(Boolean))].sort();
  const formats = [...new Set(watches.map((w) => w.format).filter(Boolean))].sort();
  const comingSoon = sortComingSoon(watchlist);
  const alreadyOut = sortAlreadyOut(watchlist);

  main.innerHTML = `
    <section class="al-panel al-panel--watchlist" id="watchlist-panel">
      <div class="al-watchlist-header al-watchlist-header--compact">
        <h2 class="al-section-title">Want to watch</h2>
        <div class="al-watchlist-header-actions">
          ${alreadyOut.length ? `
            <a class="al-already-out-btn" href="/amc-a-lister/what-to-watch.html">
              Already out <span class="al-already-out-count">${alreadyOut.length}</span>
            </a>
          ` : `
            <a class="al-already-out-btn al-already-out-btn--empty" href="/amc-a-lister/what-to-watch.html">What to watch</a>
          `}
          <span class="al-muted" id="watchlist-count">${comingSoon.length}</span>
        </div>
      </div>
      <form class="al-watchlist-add" id="watchlist-add-form" autocomplete="off">
        <div class="al-watchlist-add-field al-search-wrap">
          <input class="al-input" id="watchlist-title" type="text" placeholder="Add upcoming…" required />
          <div class="al-search-results" id="watchlist-title-results" hidden></div>
        </div>
        <button class="al-btn al-btn-primary" type="submit">Add</button>
        <input type="hidden" id="watchlist-tmdb_id" value="" />
      </form>
      <p class="al-muted al-watchlist-status" id="watchlist-status" aria-live="polite"></p>
      <p class="al-muted al-watchlist-scroll-hint">
        <span class="al-hint-hover">Hover a poster for details.</span>
        <span class="al-hint-touch">Tap a poster for details.</span>
      </p>
      <div class="al-watchlist-list" id="watchlist-list"></div>
    </section>

    <section class="al-panel al-panel--log">
      <div class="al-toolbar al-toolbar--log">
        <input class="al-input al-toolbar-search" id="log-search" type="search" placeholder="Search title or theater…" />
        <select class="al-select al-toolbar-filter" id="log-theater">
          <option value="">All theaters</option>
          ${theaters.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
        </select>
        <select class="al-select al-toolbar-filter al-toolbar-filter--format" id="log-format">
          <option value="">All formats</option>
          ${formats.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
        </select>
        <label class="al-check"><input type="checkbox" id="log-alone" /> Alone</label>
        <label class="al-check"><input type="checkbox" id="log-dnf" /> DNF only</label>
        <label class="al-check"><input type="checkbox" id="log-off-theater" /> Off-theater only</label>
        <span class="al-muted" id="log-count"></span>
      </div>
      <div class="al-log-list-wrap" id="log-table"></div>
    </section>
  `;

  const state = {
    watches,
    watchlist,
    filtered: watches,
    editingId: null,
    expandedId: null,
    detailsCache: new Map(),
    detailsLoading: null,
    detailsError: null,
  };

  const render = () => {
    document.getElementById('log-count').textContent = `${state.filtered.length} of ${state.watches.length}`;
    document.getElementById('log-table').innerHTML = tableHtml(state);
    wireRowActions(auth, state, render);
  };

  const applyFilters = () => {
    const q = document.getElementById('log-search').value.trim().toLowerCase();
    const theater = document.getElementById('log-theater').value;
    const format = document.getElementById('log-format').value;
    const alone = document.getElementById('log-alone').checked;
    const dnfOnly = document.getElementById('log-dnf').checked;
    const offTheaterOnly = document.getElementById('log-off-theater').checked;

    state.filtered = state.watches.filter((w) => {
      if (q && !`${w.title} ${w.location || ''}`.toLowerCase().includes(q)) return false;
      if (theater && w.location !== theater) return false;
      if (format && w.format !== format) return false;
      if (alone && !w.saw_alone) return false;
      if (dnfOnly && !w.dnf) return false;
      if (offTheaterOnly && w.in_theaters !== false) return false;
      return true;
    });
    render();
  };

  ['log-search', 'log-theater', 'log-format', 'log-alone', 'log-dnf', 'log-off-theater'].forEach((id) => {
    document.getElementById(id).addEventListener('input', applyFilters);
    document.getElementById(id).addEventListener('change', applyFilters);
  });

  wireWatchlistPanel(auth, state);
  render();
}

function wireWatchlistPanel(auth, state) {
  const form = document.getElementById('watchlist-add-form');
  const titleInput = document.getElementById('watchlist-title');
  const resultsEl = document.getElementById('watchlist-title-results');
  const tmdbInput = document.getElementById('watchlist-tmdb_id');
  const statusEl = document.getElementById('watchlist-status');
  const listEl = document.getElementById('watchlist-list');
  const headerActions = document.querySelector('.al-watchlist-header-actions');

  const refreshHeader = () => {
    if (!headerActions) return;
    const comingSoon = sortComingSoon(state.watchlist);
    const alreadyOut = sortAlreadyOut(state.watchlist);
    const linkHtml = alreadyOut.length
      ? `<a class="al-already-out-btn" href="/amc-a-lister/what-to-watch.html">Already out <span class="al-already-out-count">${alreadyOut.length}</span></a>`
      : `<a class="al-already-out-btn al-already-out-btn--empty" href="/amc-a-lister/what-to-watch.html">What to watch</a>`;
    headerActions.innerHTML = `${linkHtml}<span class="al-muted" id="watchlist-count">${comingSoon.length}</span>`;
  };

  const renderList = wireWatchlistList(auth, state, {
    listEl,
    statusEl,
    layout: 'strip',
    getItems: () => sortComingSoon(state.watchlist),
    emptyMessage: 'No upcoming titles. Add one above, or check Already out.',
    onChange: refreshHeader,
  });

  wireWatchlistAddForm(auth, state, {
    form,
    titleInput,
    resultsEl,
    tmdbInput,
    statusEl,
    onAdded: renderList,
  });
}

function tableHtml(state) {
  const { filtered, editingId, expandedId } = state;
  if (!filtered.length) return '<div class="al-empty">No matches.</div>';
  return `
    <div class="al-log-list">
      <div class="al-log-head" aria-hidden="true">
        <span class="al-log-col al-col-poster"></span>
        <span class="al-log-col">Date</span>
        <span class="al-log-col">Title</span>
        <span class="al-log-col">Location</span>
        <span class="al-log-col">Format</span>
        <span class="al-log-col">Seat</span>
        <span class="al-log-col">Charge</span>
        <span class="al-log-col">Rating</span>
        <span class="al-log-col">Actions</span>
      </div>
      ${filtered.map((w) => (
        w.id === editingId ? editRowHtml(w) : viewEntryHtml(w, state)
      )).join('')}
    </div>
  `;
}

function mobileLogMeta(w) {
  const primary = [
    shortDate(w.watched_on),
    w.in_theaters === false ? 'Off-theater' : (w.format || 'Standard'),
    w.in_theaters === false ? null : money(w.ticket_cents),
    ratingLabel(w),
  ].filter(Boolean).map((part) => escapeHtml(String(part))).join(' · ');
  const location = escapeHtml(w.in_theaters === false ? 'Not in theaters' : (w.location || '—'));
  return `<span class="al-log-meta-primary">${primary}</span><span class="al-log-meta-location">${location}</span>`;
}

function viewEntryHtml(w, state) {
  const expanded = w.id === state.expandedId;
  return `
    <div class="al-log-entry ${expanded ? 'is-expanded' : ''}" data-entry-id="${w.id}">
      <article class="al-log-row al-log-row--clickable ${expanded ? 'is-expanded' : ''}" data-expand-row tabindex="0" role="button" aria-expanded="${expanded}">
        <div class="al-log-col al-col-poster">${posterHtml(w)}</div>
        <div class="al-log-col al-log-col--desktop">${shortDate(w.watched_on)}</div>
        <div class="al-log-col--body">
          <div class="al-log-col al-log-col--title">
            ${escapeHtml(w.title)}
            ${w.in_theaters === false ? '<span class="al-badge al-badge--muted">Off-theater</span>' : ''}
          </div>
          <div class="al-log-col al-log-col--mobile-meta al-only-mobile">${mobileLogMeta(w)}</div>
        </div>
        <div class="al-log-col al-log-col--desktop al-muted">${escapeHtml(w.in_theaters === false ? 'Not in theaters' : (w.location || '—'))}</div>
        <div class="al-log-col al-log-col--desktop">${w.in_theaters === false ? '—' : (w.format ? escapeHtml(w.format) : '—')}</div>
        <div class="al-log-col al-log-col--desktop al-muted">${w.in_theaters === false ? '—' : escapeHtml([w.auditorium, w.seat].filter(Boolean).join(' · ') || '—')}</div>
        <div class="al-log-col al-log-col--desktop al-log-col--num">${w.in_theaters === false ? '—' : money(w.ticket_cents)}</div>
        <div class="al-log-col al-log-col--desktop">${ratingLabel(w)}</div>
        <div class="al-log-col al-row-actions">
          <button type="button" class="al-link-btn" data-edit="${w.id}">Edit</button>
          <button type="button" class="al-link-btn" data-delete="${w.id}">Delete</button>
        </div>
      </article>
      ${expanded ? detailPanelHtml(w, state) : ''}
    </div>
  `;
}

function detailPanelHtml(watch, state) {
  const wrap = (content) => `
    <div class="al-log-detail">
      <div class="al-log-detail-inner">${content}</div>
    </div>
  `;

  if (!watch.tmdb_id) {
    return wrap('<p class="al-muted">No TMDB match for this title. Use <strong>Edit</strong> and pick the movie from search to load details.</p>');
  }

  if (state.detailsLoading === watch.id) {
    return wrap('<p class="al-muted">Loading movie details…</p>');
  }

  if (state.detailsError && state.expandedId === watch.id) {
    return wrap(`<p class="al-error">${escapeHtml(state.detailsError)}</p>`);
  }

  const movie = state.detailsCache.get(watch.id);
  if (!movie) {
    return wrap('<p class="al-muted">Loading movie details…</p>');
  }

  const genres = movie.genres?.length ? movie.genres.join(', ') : '—';
  const runtime = movie.runtime_min ? `${movie.runtime_min} min` : '—';
  const director = movie.director || '—';
  const cast = movie.cast?.length ? movie.cast.join(', ') : '—';
  const titleLine = `${escapeHtml(movie.title)}${movie.year ? ` <span class="al-muted">(${movie.year})</span>` : ''}`;

  return wrap(`
    <h3 class="al-log-detail-title serif">${titleLine}</h3>
    <div class="al-log-detail-body">
      ${movie.poster_path ? posterHtml(movie, { size: 'w185', width: 88, height: 132, className: 'al-poster al-poster--detail' }) : ''}
      <div class="al-log-detail-meta">
        <dl class="al-log-detail-facts">
          <div class="al-log-detail-fact"><dt>Runtime</dt><dd>${escapeHtml(runtime)}</dd></div>
          <div class="al-log-detail-fact"><dt>Genre</dt><dd>${escapeHtml(genres)}</dd></div>
          <div class="al-log-detail-fact"><dt>Director</dt><dd>${escapeHtml(director)}</dd></div>
          <div class="al-log-detail-fact"><dt>Cast</dt><dd>${escapeHtml(cast)}</dd></div>
        </dl>
      </div>
    </div>
    <section class="al-log-detail-overview-wrap">
      <h4 class="al-log-detail-subhead">Overview</h4>
      ${movie.overview
    ? `<p class="al-log-detail-overview">${escapeHtml(movie.overview)}</p>`
    : '<p class="al-muted">No overview available.</p>'}
    </section>
  `);
}

function editRowHtml(w) {
  return `
    <div class="al-log-entry al-log-entry--editing" data-entry-id="${w.id}">
      <article class="al-log-row al-log-row--editing" data-id="${w.id}">
        ${renderWatchEditForm(w, `edit-${w.id}`)}
      </article>
    </div>
  `;
}

async function loadMovieDetails(auth, state, watchId, render) {
  const watch = state.watches.find((w) => w.id === watchId);
  if (!watch?.tmdb_id) return;

  if (state.detailsCache.has(watchId)) return;

  state.detailsLoading = watchId;
  state.detailsError = null;
  render();

  try {
    const { movie } = await movieApi.details(auth.token, watch.tmdb_id);
    state.detailsCache.set(watchId, movie);
    if (movie.poster_path && !watch.poster_path) {
      const withPoster = { ...watch, poster_path: movie.poster_path };
      state.watches = state.watches.map((w) => (w.id === watchId ? withPoster : w));
      state.filtered = state.filtered.map((w) => (w.id === watchId ? withPoster : w));
    }
  } catch (err) {
    state.detailsError = err.message || 'Could not load movie details.';
  } finally {
    state.detailsLoading = null;
    render();
  }
}

function wireRowActions(auth, state, render) {
  document.querySelectorAll('[data-expand-row]').forEach((row) => {
    const toggle = (e) => {
      if (e.target.closest('.al-row-actions')) return;
      const entry = row.closest('.al-log-entry');
      const id = entry?.dataset.entryId;
      if (!id) return;

      if (state.expandedId === id) {
        state.expandedId = null;
        state.detailsError = null;
        render();
        return;
      }

      state.expandedId = id;
      state.editingId = null;
      state.detailsError = null;

      const watch = state.watches.find((w) => w.id === id);
      if (watch?.tmdb_id && !state.detailsCache.has(id)) {
        loadMovieDetails(auth, state, id, render);
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

  document.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.editingId = btn.dataset.edit;
      state.expandedId = null;
      render();
    });
  });

  document.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this screening?')) return;
      await watchesApi.remove(auth.token, btn.dataset.delete);
      state.watches = state.watches.filter((w) => w.id !== btn.dataset.delete);
      if (state.editingId === btn.dataset.delete) state.editingId = null;
      if (state.expandedId === btn.dataset.delete) state.expandedId = null;
      state.detailsCache.delete(btn.dataset.delete);
      state.filtered = state.filtered.filter((w) => w.id !== btn.dataset.delete);
      populateSidebarStats(auth);
      render();
    });
  });

  if (!state.editingId) return;

  const watch = state.watches.find((w) => w.id === state.editingId);
  if (!watch) {
    state.editingId = null;
    return;
  }

  const prefix = `edit-${watch.id}`;
  wireWatchEditForm(auth, watch, prefix, {
    onCancel: () => {
      state.editingId = null;
      render();
    },
    onSave: async (payload) => {
      const { watch: updated } = await watchesApi.update(auth.token, { id: watch.id, ...payload });
      const merged = {
        ...updated,
        poster_path: updated.tmdb_id === watch.tmdb_id ? watch.poster_path : null,
      };
      state.watches = state.watches.map((w) => (w.id === watch.id ? merged : w));
      state.filtered = state.filtered.map((w) => (w.id === watch.id ? merged : w));
      if (updated.tmdb_id !== watch.tmdb_id) {
        state.detailsCache.delete(watch.id);
      }
      state.editingId = null;
      populateSidebarStats(auth);
      render();
    },
  });
}
