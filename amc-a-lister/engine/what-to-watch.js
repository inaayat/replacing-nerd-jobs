import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { watchlistApi } from './api.js';
import {
  sortAlreadyOut,
  sortComingSoon,
  wireWatchlistList,
  wireWatchlistAddForm,
} from './watchlist-ui.js';

const VIEWS = {
  soon: {
    label: 'Want to watch',
    segment: 'Coming soon',
    emptyMessage: 'No upcoming titles. Add one above.',
  },
  out: {
    label: 'What to watch',
    segment: 'Already out',
    emptyMessage: 'Nothing already out on your list. Add a title above.',
  },
};

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Watch',
    subtitle: 'Coming soon and already in theaters.',
    body: `<main class="al-main" id="wtw-main"><p class="al-muted">Loading…</p></main>`,
  });

  await loadPage(auth);
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

async function loadPage(auth) {
  const main = document.getElementById('wtw-main');
  if (!main) return;

  const { items: watchlist } = await watchlistApi.list(auth.token);

  main.innerHTML = `
    <section class="al-panel al-panel--watchlist" id="watchlist-panel">
      <div class="al-watchlist-header al-watchlist-header--compact">
        <h2 class="al-section-title" id="wtw-section-title">${VIEWS.soon.label}</h2>
        <span class="al-muted" id="wtw-count">${sortComingSoon(watchlist).length}</span>
      </div>
      <div class="al-segment al-watchlist-segment" role="tablist" aria-label="Watchlist view">
        <button type="button" class="al-segment-btn is-active" data-watchlist-view="soon" role="tab" aria-selected="true">
          Coming soon <span class="al-segment-count" id="wtw-soon-count">${sortComingSoon(watchlist).length}</span>
        </button>
        <button type="button" class="al-segment-btn" data-watchlist-view="out" role="tab" aria-selected="false">
          Already out <span class="al-segment-count" id="wtw-out-count">${sortAlreadyOut(watchlist).length}</span>
        </button>
      </div>
      <form class="al-watchlist-add" id="watchlist-add-form" autocomplete="off">
        <div class="al-watchlist-add-field al-search-wrap">
          <input class="al-input" id="watchlist-title" type="text" placeholder="Add a title…" required />
          <div class="al-search-results" id="watchlist-title-results" hidden></div>
        </div>
        <button class="al-btn al-btn-primary" type="submit">Add</button>
        <input type="hidden" id="watchlist-tmdb_id" value="" />
      </form>
      <p class="al-muted al-watchlist-status" id="watchlist-status" aria-live="polite"></p>
      <p class="al-muted al-watchlist-scroll-hint">
        <span class="al-hint-hover">Hover or click a poster for details.</span>
        <span class="al-hint-touch">Tap a poster for details.</span>
      </p>
      <div class="al-watchlist-strip-wrap">
        <div class="al-watchlist-list" id="watchlist-list"></div>
      </div>
    </section>
  `;

  const state = {
    watchlist,
    view: new URLSearchParams(location.search).get('view') === 'out' ? 'out' : 'soon',
  };

  const sectionTitle = document.getElementById('wtw-section-title');
  const countEl = document.getElementById('wtw-count');
  const soonCountEl = document.getElementById('wtw-soon-count');
  const outCountEl = document.getElementById('wtw-out-count');
  const hintEl = document.querySelector('.al-watchlist-scroll-hint');

  const refreshHeader = () => {
    const soon = sortComingSoon(state.watchlist);
    const out = sortAlreadyOut(state.watchlist);
    const cfg = VIEWS[state.view];
    const items = state.view === 'soon' ? soon : out;

    if (sectionTitle) sectionTitle.textContent = cfg.label;
    if (countEl) countEl.textContent = String(items.length);
    if (soonCountEl) soonCountEl.textContent = String(soon.length);
    if (outCountEl) outCountEl.textContent = String(out.length);
    if (hintEl) hintEl.hidden = items.length === 0;
  };

  const renderList = wireWatchlistList(auth, state, {
    listEl: document.getElementById('watchlist-list'),
    statusEl: document.getElementById('watchlist-status'),
    layout: 'strip',
    getItems: () => (state.view === 'soon'
      ? sortComingSoon(state.watchlist)
      : sortAlreadyOut(state.watchlist)),
    emptyMessage: () => VIEWS[state.view].emptyMessage,
    onChange: refreshHeader,
  });

  wireWatchlistAddForm(auth, state, {
    form: document.getElementById('watchlist-add-form'),
    titleInput: document.getElementById('watchlist-title'),
    resultsEl: document.getElementById('watchlist-title-results'),
    tmdbInput: document.getElementById('watchlist-tmdb_id'),
    statusEl: document.getElementById('watchlist-status'),
    onAdded: renderList,
  });

  document.querySelectorAll('[data-watchlist-view]').forEach((btn) => {
    const active = btn.dataset.watchlistView === state.view;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.addEventListener('click', () => {
      state.view = btn.dataset.watchlistView;
      document.querySelectorAll('[data-watchlist-view]').forEach((b) => {
        const isActive = b.dataset.watchlistView === state.view;
        b.classList.toggle('is-active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      renderList();
    });
  });
}
