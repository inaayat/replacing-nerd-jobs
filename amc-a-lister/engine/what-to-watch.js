import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { watchlistApi } from './api.js';
import {
  sortAlreadyOut,
  sortComingSoon,
  combinedWatchlistItems,
  wireWatchlistLogList,
  wireWatchlistAddForm,
} from './watchlist-ui.js';

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
        <h2 class="al-section-title">Want to watch</h2>
        <span class="al-muted" id="wtw-count">${watchlist.length}</span>
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
      <div class="al-log-list-wrap" id="watchlist-list"></div>
    </section>
  `;

  const state = {
    watchlist,
    search: '',
    expandedId: null,
    editingId: null,
    detailsCache: new Map(),
    detailsLoading: null,
    detailsError: null,
  };

  const countEl = document.getElementById('wtw-count');
  const summaryEl = document.getElementById('wtw-summary');
  const filterCountEl = document.getElementById('wtw-filter-count');

  const getAllItems = () => combinedWatchlistItems(state.watchlist);

  const getFilteredItems = () => {
    const q = state.search.trim().toLowerCase();
    const items = getAllItems();
    if (!q) return items;
    return items.filter((item) => `${item.title} ${item.notes || ''}`.toLowerCase().includes(q));
  };

  const refreshHeader = () => {
    const out = sortAlreadyOut(state.watchlist);
    const soon = sortComingSoon(state.watchlist);
    const filtered = getFilteredItems();
    const total = state.watchlist.length;

    if (countEl) countEl.textContent = String(total);
    if (summaryEl) {
      const parts = [];
      if (out.length) parts.push(`${out.length} already out`);
      if (soon.length) parts.push(`${soon.length} coming soon`);
      summaryEl.textContent = parts.join(' · ') || 'Nothing on your list yet.';
    }
    if (filterCountEl) {
      filterCountEl.textContent = filtered.length === total
        ? `${total} title${total === 1 ? '' : 's'}`
        : `${filtered.length} of ${total}`;
    }
  };

  const renderList = wireWatchlistLogList(auth, state, {
    listEl: document.getElementById('watchlist-list'),
    statusEl: document.getElementById('watchlist-status'),
    getItems: getFilteredItems,
    shadeComingSoon: true,
    emptyMessage: () => (state.search.trim()
      ? 'No matches.'
      : 'Nothing on your list yet. Add a title above.'),
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

  refreshHeader();
}
