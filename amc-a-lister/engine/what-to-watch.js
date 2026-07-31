import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { watchlistApi } from './api.js';
import {
  sortAlreadyOut,
  sortComingSoon,
  wireWatchlistList,
  wireWatchlistAddForm,
} from './watchlist-ui.js';

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'What to watch',
    subtitle: 'Already out — catch these before they leave theaters.',
    body: `<main class="al-main" id="wtw-main"><p class="al-muted">Loading…</p></main>`,
  });

  await loadPage(auth);
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

async function loadPage(auth) {
  const main = document.getElementById('wtw-main');
  if (!main) return;

  const { items: watchlist } = await watchlistApi.list(auth.token);
  const alreadyOut = sortAlreadyOut(watchlist);
  const comingSoon = sortComingSoon(watchlist);

  main.innerHTML = `
    <section class="al-panel al-panel--watchlist">
      <div class="al-watchlist-header al-watchlist-header--compact">
        <h2 class="al-section-title">Already out</h2>
        <div class="al-watchlist-header-actions">
          ${comingSoon.length ? `
            <a class="al-already-out-btn al-already-out-btn--empty" href="/amc-a-lister/">
              Coming soon <span class="al-already-out-count">${comingSoon.length}</span>
            </a>
          ` : ''}
          <span class="al-muted" id="wtw-count">${alreadyOut.length}</span>
        </div>
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
      <div class="al-watchlist-list" id="watchlist-list"></div>
    </section>
  `;

  const state = { watchlist };

  const refreshHeader = () => {
    const out = sortAlreadyOut(state.watchlist);
    const soon = sortComingSoon(state.watchlist);
    const actions = document.querySelector('.al-watchlist-header-actions');
    if (!actions) return;
    const linkHtml = soon.length
      ? `<a class="al-already-out-btn al-already-out-btn--empty" href="/amc-a-lister/">Coming soon <span class="al-already-out-count">${soon.length}</span></a>`
      : '';
    actions.innerHTML = `${linkHtml}<span class="al-muted" id="wtw-count">${out.length}</span>`;
  };

  const renderList = wireWatchlistList(auth, state, {
    listEl: document.getElementById('watchlist-list'),
    statusEl: document.getElementById('watchlist-status'),
    getItems: () => sortAlreadyOut(state.watchlist),
    emptyMessage: 'Nothing already out on your list. Add a title, or check Coming soon on the log.',
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
}
