import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { watchlistApi } from './api.js';
import {
  sortAlreadyOut,
  sortComingSoon,
  wireWatchlistList,
  wireWatchlistAddForm,
  renderWatchlistAddBar,
  renderWatchlistViewTabs,
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
    <section class="al-panel al-panel--watchlist" id="watchlist-panel">
      <div class="al-watchlist-header al-watchlist-header--compact">
        <h2 class="al-section-title" id="wtw-section-title">${VIEWS.soon.label}</h2>
        <span class="al-muted" id="wtw-count">${sortComingSoon(watchlist).length}</span>
      </div>
      ${renderWatchlistViewTabs({
        soonCount: sortComingSoon(watchlist).length,
        outCount: sortAlreadyOut(watchlist).length,
        activeView: new URLSearchParams(location.search).get('view') === 'out' ? 'out' : 'soon',
      })}
      ${renderWatchlistAddBar({ idPrefix: 'watchlist', submitLabel: 'Add it' })}
      <div class="al-log-list-wrap" id="watchlist-list-wrap">
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
  const modeEl = document.querySelector('.al-watchlist-mode');

  const refreshHeader = () => {
    const soon = sortComingSoon(state.watchlist);
    const out = sortAlreadyOut(state.watchlist);
    const cfg = VIEWS[state.view];
    const items = state.view === 'soon' ? soon : out;

    if (sectionTitle) sectionTitle.textContent = cfg.label;
    if (countEl) countEl.textContent = String(items.length);
    if (modeEl) {
      modeEl.querySelectorAll('[data-watchlist-view]').forEach((btn) => {
        const isSoon = btn.dataset.watchlistView === 'soon';
        const count = isSoon ? soon.length : out.length;
        const countBadge = btn.querySelector('.al-segment-count');
        if (countBadge) countBadge.textContent = String(count);
        const active = btn.dataset.watchlistView === state.view;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    }
  };

  const renderList = wireWatchlistList(auth, state, {
    listEl: document.getElementById('watchlist-list'),
    statusEl: document.getElementById('watchlist-status'),
    layout: 'log',
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
    releaseInput: document.getElementById('watchlist-release'),
    notesInput: document.getElementById('watchlist-notes'),
    shell: document.getElementById('watchlist-add-bar'),
    expandEl: document.getElementById('watchlist-expand'),
    onAdded: renderList,
  });

  document.querySelectorAll('[data-watchlist-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.watchlistView;
      renderList();
    });
  });
}
