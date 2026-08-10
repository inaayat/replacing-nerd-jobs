import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { watchlistApi } from './api.js';
import {
  sortAlreadyOut,
  sortComingSoon,
  wireWatchlistLogList,
  wireWatchlistAddForm,
  removeLocalWatchlistMatches,
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
    signedIn: true,
  });

  await loadPage(auth);
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

async function loadPage(auth) {
  const main = document.getElementById('wtw-main');
  if (!main) return;

  const { items: watchlist } = await watchlistApi.list(auth.token);

  main.innerHTML = `
    <section class="al-panel al-panel--log al-panel--watchlist" id="watchlist-panel">
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
      <div class="al-toolbar al-toolbar--log">
        <input class="al-input al-toolbar-search" id="wtw-search" type="search" placeholder="Search title or notes…" />
        <span class="al-muted" id="wtw-filter-count"></span>
      </div>
      <div class="al-log-list-wrap" id="watchlist-list"></div>
    </section>
  `;

  const state = {
    watchlist,
    view: new URLSearchParams(location.search).get('view') === 'out' ? 'out' : 'soon',
    search: '',
    expandedId: null,
    editingId: null,
    detailsCache: new Map(),
    detailsLoading: null,
    detailsError: null,
  };

  const sectionTitle = document.getElementById('wtw-section-title');
  const countEl = document.getElementById('wtw-count');
  const soonCountEl = document.getElementById('wtw-soon-count');
  const outCountEl = document.getElementById('wtw-out-count');
  const filterCountEl = document.getElementById('wtw-filter-count');

  const getViewItems = () => (state.view === 'soon'
    ? sortComingSoon(state.watchlist)
    : sortAlreadyOut(state.watchlist));

  const getFilteredItems = () => {
    const q = state.search.trim().toLowerCase();
    const items = getViewItems();
    if (!q) return items;
    return items.filter((item) => `${item.title} ${item.notes || ''}`.toLowerCase().includes(q));
  };

  const refreshHeader = () => {
    const soon = sortComingSoon(state.watchlist);
    const out = sortAlreadyOut(state.watchlist);
    const cfg = VIEWS[state.view];
    const filtered = getFilteredItems();

    if (sectionTitle) sectionTitle.textContent = cfg.label;
    if (countEl) countEl.textContent = String(getViewItems().length);
    if (soonCountEl) soonCountEl.textContent = String(soon.length);
    if (outCountEl) outCountEl.textContent = String(out.length);
    if (filterCountEl) {
      const total = getViewItems().length;
      filterCountEl.textContent = filtered.length === total
        ? `${total} title${total === 1 ? '' : 's'}`
        : `${filtered.length} of ${total}`;
    }
  };

  const renderList = wireWatchlistLogList(auth, state, {
    listEl: document.getElementById('watchlist-list'),
    statusEl: document.getElementById('watchlist-status'),
    getItems: getFilteredItems,
    emptyMessage: () => (state.search.trim()
      ? 'No matches.'
      : VIEWS[state.view].emptyMessage),
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

  document.getElementById('wtw-search').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderList();
  });

  document.addEventListener('alist-watch-logged', (e) => {
    removeLocalWatchlistMatches(state, e.detail || {});
    renderList();
  });

  document.querySelectorAll('[data-watchlist-view]').forEach((btn) => {
    const active = btn.dataset.watchlistView === state.view;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.addEventListener('click', () => {
      state.view = btn.dataset.watchlistView;
      state.expandedId = null;
      state.editingId = null;
      document.querySelectorAll('[data-watchlist-view]').forEach((b) => {
        const isActive = b.dataset.watchlistView === state.view;
        b.classList.toggle('is-active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      renderList();
    });
  });
}
