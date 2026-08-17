import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { watchlistApi } from './api.js';
import { prefillQuickLog } from './quick-log.js';
import {
  sortWatchAtHome,
  itemsForWatchlistView,
  wireWatchlistLogList,
  wireWatchlistAddForm,
} from './watchlist-ui.js';

const VIEWS = {
  'coming-soon': { label: 'Coming Soon', logLabel: 'Log screening' },
  'watch-at-home': { label: 'Watch at Home', logLabel: 'Log at home' },
};

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Coming Soon',
    subtitle: "What's next, and what's already playing.",
    body: `<main class="al-main" id="wtw-main"><p class="al-muted">Loading…</p></main>`,
    signedIn: true,
  });

  await loadPage(auth);
}, {
  quickLogOnSuccess: async (auth, logged) => {
    await Promise.all([clearLoggedFromList(auth, logged), populateSidebarStats(auth)]);
  },
});

/**
 * A title you've now seen shouldn't still be on a list of things you want to
 * see — previously the list only ever grew. Matches the row the user clicked
 * "Log screening" on, or failing that any row for the same film.
 */
async function clearLoggedFromList(auth, logged) {
  const state = pageState;
  if (!state || !logged) return;

  const match = state.watchlist.find((item) => (
    (logged.watchlistId && item.id === logged.watchlistId)
    || (logged.tmdb_id && item.tmdb_id === logged.tmdb_id)
  ));
  if (!match) return;

  try {
    await watchlistApi.remove(auth.token, match.id);
    state.watchlist = state.watchlist.filter((item) => item.id !== match.id);
    state.rerender?.();
    const statusEl = document.getElementById('watchlist-status');
    if (statusEl) {
      statusEl.textContent = `Logged ${match.title} — removed from your list.`;
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  } catch {
    // The screening saved either way; leaving the row is a harmless fallback.
  }
}

let pageState = null;

async function loadPage(auth) {
  const main = document.getElementById('wtw-main');
  if (!main) return;

  const { items: watchlist } = await watchlistApi.list(auth.token);
  const soonCount = itemsForWatchlistView(watchlist, 'coming-soon').length;
  const homeCount = sortWatchAtHome(watchlist).length;

  main.innerHTML = `
    <section class="al-panel al-panel--log al-panel--watchlist" id="watchlist-panel">
      <div class="al-watchlist-header al-watchlist-header--compact">
        <h2 class="al-section-title" id="wtw-section-title">${VIEWS['coming-soon'].label}</h2>
        <span class="al-muted" id="wtw-count">${watchlist.length}</span>
      </div>
      <div class="al-segment al-watchlist-segment" role="tablist" aria-label="Watchlist view">
        <button type="button" class="al-segment-btn is-active" data-wtw-view="coming-soon" role="tab" aria-selected="true">
          Coming Soon <span class="al-segment-count" id="wtw-soon-count">${soonCount}</span>
        </button>
        <button type="button" class="al-segment-btn" data-wtw-view="watch-at-home" role="tab" aria-selected="false">
          Watch at Home <span class="al-segment-count" id="wtw-home-count">${homeCount}</span>
        </button>
      </div>
      <p class="al-muted al-watchlist-summary" id="wtw-summary"></p>
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
      <div class="al-log-list-wrap" id="watchlist-list" data-wtw-view="coming-soon"></div>
    </section>
  `;

  const state = {
    watchlist,
    view: 'coming-soon',
    search: '',
    expandedId: null,
    editingId: null,
    detailsCache: new Map(),
    detailsLoading: null,
    detailsError: null,
    rerender: null,
  };
  pageState = state;

  const listWrap = document.getElementById('watchlist-list');
  const sectionTitle = document.getElementById('wtw-section-title');
  const countEl = document.getElementById('wtw-count');
  const summaryEl = document.getElementById('wtw-summary');
  const filterCountEl = document.getElementById('wtw-filter-count');
  const soonCountEl = document.getElementById('wtw-soon-count');
  const homeCountEl = document.getElementById('wtw-home-count');

  const getViewItems = () => itemsForWatchlistView(state.watchlist, state.view);

  const getFilteredItems = () => {
    const q = state.search.trim().toLowerCase();
    const items = getViewItems();
    if (!q) return items;
    return items.filter((item) => `${item.title} ${item.notes || ''}`.toLowerCase().includes(q));
  };

  const emptyMessageForView = () => {
    if (state.search.trim()) return 'No matches.';
    if (state.view === 'coming-soon') return 'Nothing coming soon. Add a title above.';
    return 'Nothing to watch at home yet.';
  };

  const refreshHeader = () => {
    const cfg = VIEWS[state.view];
    const soon = itemsForWatchlistView(state.watchlist, 'coming-soon');
    const home = sortWatchAtHome(state.watchlist);
    const viewItems = getViewItems();
    const filtered = getFilteredItems();

    if (sectionTitle) sectionTitle.textContent = cfg.label;
    if (soonCountEl) soonCountEl.textContent = String(soon.length);
    if (homeCountEl) homeCountEl.textContent = String(home.length);
    if (countEl) countEl.textContent = String(viewItems.length);
    if (listWrap) listWrap.dataset.wtwView = state.view;

    if (summaryEl) {
      const parts = [];
      if (soon.length) parts.push(`${soon.length} coming soon / in theaters`);
      if (home.length) parts.push(`${home.length} watch at home`);
      summaryEl.textContent = parts.join(' · ') || 'Nothing on your list yet.';
    }

    if (filterCountEl) {
      const total = viewItems.length;
      filterCountEl.textContent = filtered.length === total
        ? `${total} title${total === 1 ? '' : 's'}`
        : `${filtered.length} of ${total}`;
    }
  };

  const onLogItem = (item) => {
    const mode = state.view === 'watch-at-home' ? 'off-theater' : 'theater';
    prefillQuickLog({ title: item.title, tmdbId: item.tmdb_id, mode, watchlistId: item.id });
  };

  const renderList = wireWatchlistLogList(auth, state, {
    listEl: listWrap,
    statusEl: document.getElementById('watchlist-status'),
    getItems: getFilteredItems,
    emptyMessage: emptyMessageForView,
    onChange: refreshHeader,
    onLogItem,
    logLabel: () => VIEWS[state.view].logLabel,
    view: () => state.view,
  });
  state.rerender = renderList;

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

  document.querySelectorAll('[data-wtw-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.wtwView;
      state.expandedId = null;
      state.editingId = null;
      document.querySelectorAll('[data-wtw-view]').forEach((b) => {
        const active = b.dataset.wtwView === state.view;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderList();
    });
  });

  refreshHeader();
}
