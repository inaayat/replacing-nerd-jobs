import { bootPage, renderShell, requireSignIn } from './nav.js';
import { tvWatchesApi, tvWatchlistApi, tvApi } from './api.js';
import {
  sortAlreadyOut,
  sortComingSoon,
  todayISO,
  wireWatchlistList,
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
    subtitle: 'Track series you have watched and shows you want to catch.',
    body: `<main class="al-main" id="tv-main"><p class="al-muted">Loading…</p></main>`,
    hideLogBar: true,
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
    <section class="al-panel al-panel--tv">
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
            <input class="al-input al-tv-add-ep" id="tv-add-season" type="number" min="1" placeholder="S" title="Season" />
            <input class="al-input al-tv-add-ep" id="tv-add-episode" type="number" min="1" placeholder="E" title="Episode" />
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
        <p class="al-muted al-watchlist-scroll-hint">
          <span class="al-hint-hover">Hover or click a poster for details.</span>
          <span class="al-hint-touch">Tap a poster for details.</span>
        </p>
        <div class="al-segment al-watchlist-segment al-tv-airing-segment" role="tablist" aria-label="TV watchlist view">
          <button type="button" class="al-segment-btn is-active" data-tv-watchlist-view="soon" role="tab" aria-selected="true">
            Coming soon <span class="al-segment-count" id="tv-soon-count">0</span>
          </button>
          <button type="button" class="al-segment-btn" data-tv-watchlist-view="out" role="tab" aria-selected="false">
            Already aired <span class="al-segment-count" id="tv-out-count">0</span>
          </button>
        </div>
        <div class="al-watchlist-strip-wrap">
          <div class="al-watchlist-list" id="tv-watchlist-list"></div>
        </div>
      </div>
    </section>
  `;

  const state = {
    watches,
    watchlist,
    view: 'watched',
    watchlistView: 'soon',
    editingId: null,
  };

  const watchedPanel = document.getElementById('tv-watched-panel');
  const wantPanel = document.getElementById('tv-want-panel');
  const sectionTitle = document.getElementById('tv-section-title');
  const countEl = document.getElementById('tv-count');
  const watchedCountEl = document.getElementById('tv-watched-count');
  const wantCountEl = document.getElementById('tv-want-count');
  const watchedStatusEl = document.getElementById('tv-watched-status');
  const soonCountEl = document.getElementById('tv-soon-count');
  const outCountEl = document.getElementById('tv-out-count');

  const refreshHeader = () => {
    const cfg = VIEWS[state.view];
    if (sectionTitle) sectionTitle.textContent = cfg.label;
    if (watchedCountEl) watchedCountEl.textContent = String(state.watches.length);
    if (wantCountEl) wantCountEl.textContent = String(state.watchlist.length);

    const soon = sortComingSoon(state.watchlist);
    const out = sortAlreadyOut(state.watchlist);
    if (soonCountEl) soonCountEl.textContent = String(soon.length);
    if (outCountEl) outCountEl.textContent = String(out.length);

    if (state.view === 'watched') {
      if (countEl) countEl.textContent = String(state.watches.length);
      watchedPanel.hidden = false;
      wantPanel.hidden = true;
    } else {
      const items = state.watchlistView === 'soon' ? soon : out;
      if (countEl) countEl.textContent = String(items.length);
      watchedPanel.hidden = true;
      wantPanel.hidden = false;
    }
  };

  const renderWatchedList = () => {
    const listEl = document.getElementById('tv-watched-list');
    if (!state.watches.length) {
      listEl.innerHTML = '<div class="al-empty">No shows logged yet. Add one above.</div>';
      refreshHeader();
      return;
    }

    listEl.innerHTML = `
      <div class="al-log-list">
        <div class="al-log-head al-log-head--tv" aria-hidden="true">
          <span class="al-log-col al-col-poster"></span>
          <span class="al-log-col">Date</span>
          <span class="al-log-col">Title</span>
          <span class="al-log-col">Episode</span>
          <span class="al-log-col">Rating</span>
          <span class="al-log-col">Actions</span>
        </div>
        ${state.watches.map((w) => (
          w.id === state.editingId ? tvEditRowHtml(w) : tvViewRowHtml(w)
        )).join('')}
      </div>
    `;

    wireWatchedActions(auth, state, renderWatchedList);
    refreshHeader();
  };

  const renderWatchlist = wireWatchlistList(auth, state, {
    listEl: document.getElementById('tv-watchlist-list'),
    statusEl: document.getElementById('tv-watchlist-status'),
    layout: 'strip',
    watchlistApi: tvWatchlistApi,
    logLabel: 'Log watched',
    getItems: () => (state.watchlistView === 'soon'
      ? sortComingSoon(state.watchlist)
      : sortAlreadyOut(state.watchlist)),
    emptyMessage: () => (state.watchlistView === 'soon'
      ? 'No upcoming shows. Add one above.'
      : 'Nothing already aired on your list. Add a show above.'),
    onLogItem: (item) => {
      state.view = 'watched';
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

  document.querySelectorAll('[data-tv-watchlist-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.watchlistView = btn.dataset.tvWatchlistView;
      document.querySelectorAll('[data-tv-watchlist-view]').forEach((b) => {
        const active = b.dataset.tvWatchlistView === state.watchlistView;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderWatchlist();
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

function tvViewRowHtml(w) {
  return `
    <article class="al-log-row al-log-row--tv" data-tv-id="${w.id}">
      <div class="al-log-col al-col-poster">${posterHtml(w, { size: 'w92', width: 28, height: 42 })}</div>
      <div class="al-log-col al-log-col--desktop">${shortDate(w.watched_on)}</div>
      <div class="al-log-col al-log-col--title">${escapeHtml(w.title)}</div>
      <div class="al-log-col al-log-col--desktop al-muted">${escapeHtml(episodeLabel(w))}</div>
      <div class="al-log-col al-log-col--desktop">${ratingLabel(w)}</div>
      <div class="al-log-col al-row-actions">
        <button type="button" class="al-link-btn" data-tv-edit="${w.id}">Edit</button>
        <button type="button" class="al-link-btn" data-tv-delete="${w.id}">Delete</button>
      </div>
    </article>
  `;
}

function tvEditRowHtml(w) {
  const ratingVal = w.dnf ? 'dnf' : (w.rating != null ? String(w.rating) : '');
  return `
    <article class="al-log-row al-log-row--tv al-log-row--editing" data-tv-id="${w.id}">
      <form class="al-tv-edit-form" data-tv-edit-form="${w.id}">
        <div class="al-tv-add-row">
          <input class="al-input" name="title" type="text" value="${escapeHtml(w.title)}" required />
          <input class="al-input al-tv-add-date" name="watched_on" type="date" value="${w.watched_on}" required />
          <input class="al-input al-tv-add-ep" name="season" type="number" min="1" placeholder="S" value="${w.season ?? ''}" />
          <input class="al-input al-tv-add-ep" name="episode" type="number" min="1" placeholder="E" value="${w.episode ?? ''}" />
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
  `;
}

function wireWatchedActions(auth, state, render) {
  document.querySelectorAll('[data-tv-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.editingId = btn.dataset.tvEdit;
      render();
    });
  });

  document.querySelectorAll('[data-tv-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.editingId = null;
      render();
    });
  });

  document.querySelectorAll('[data-tv-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this entry?')) return;
      await tvWatchesApi.remove(auth.token, btn.dataset.tvDelete);
      state.watches = state.watches.filter((w) => w.id !== btn.dataset.tvDelete);
      if (state.editingId === btn.dataset.tvDelete) state.editingId = null;
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
      state.editingId = null;
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
