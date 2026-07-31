import { escapeHtml, posterHtml, shortDate } from './format.js';
import { prefillQuickLog } from './quick-log.js';
import { watchlistApi, movieApi } from './api.js';

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function isAlreadyOut(item, today = todayISO()) {
  if (item.release_date) return item.release_date <= today;
  // Year-only without a full date: past years are out; current/future stay in coming soon.
  if (item.year != null) return Number(item.year) < new Date().getFullYear();
  return true;
}

/** Coming soon first (soonest release), undated future years after dated ones. */
export function sortComingSoon(items, today = todayISO()) {
  return items
    .filter((item) => !isAlreadyOut(item, today))
    .sort((a, b) => {
      const aDate = a.release_date || (a.year != null ? `${a.year}-12-31` : '9999-12-31');
      const bDate = b.release_date || (b.year != null ? `${b.year}-12-31` : '9999-12-31');
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
}

/** Already released, newest release first. */
export function sortAlreadyOut(items, today = todayISO()) {
  return items
    .filter((item) => isAlreadyOut(item, today))
    .sort((a, b) => {
      const aDate = a.release_date || (a.year != null ? `${a.year}-01-01` : '0000-01-01');
      const bDate = b.release_date || (b.year != null ? `${b.year}-01-01` : '0000-01-01');
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
}

export function releaseLabel(item) {
  if (item.release_date) return shortDate(item.release_date);
  if (item.year) return String(item.year);
  return 'TBA';
}

export function watchlistRowsHtml(items, { emptyMessage, showRelease = true } = {}) {
  if (!items.length) {
    return `<p class="al-muted al-watchlist-empty">${emptyMessage || 'Nothing here yet.'}</p>`;
  }
  return items.map((item) => `
    <article class="al-watchlist-row" data-watchlist-id="${item.id}">
      ${posterHtml(item, { size: 'w92', width: 40, height: 60, className: 'al-poster al-poster--watchlist-sm' })}
      <div class="al-watchlist-row-body">
        <h3 class="al-watchlist-row-title">${escapeHtml(item.title)}</h3>
        ${showRelease ? `<p class="al-watchlist-row-meta al-muted">${escapeHtml(releaseLabel(item))}</p>` : ''}
      </div>
      <div class="al-watchlist-row-actions">
        <button type="button" class="al-link-btn" data-log-watchlist="${item.id}">Log</button>
        <button type="button" class="al-link-btn" data-remove-watchlist="${item.id}">✕</button>
      </div>
    </article>
  `).join('');
}

export function wireWatchlistList(auth, state, {
  listEl,
  countEl,
  statusEl,
  getItems,
  emptyMessage,
  showRelease = true,
  onChange,
}) {
  const render = () => {
    const items = getItems();
    listEl.innerHTML = watchlistRowsHtml(items, { emptyMessage, showRelease });
    if (countEl) countEl.textContent = String(items.length);
    onChange?.();

    listEl.querySelectorAll('[data-log-watchlist]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = state.watchlist.find((w) => w.id === btn.dataset.logWatchlist);
        if (!item) return;
        prefillQuickLog({ title: item.title, tmdbId: item.tmdb_id, mode: 'theater' });
      });
    });

    listEl.querySelectorAll('[data-remove-watchlist]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.removeWatchlist;
        if (!confirm('Remove from want to watch?')) return;
        try {
          await watchlistApi.remove(auth.token, id);
          state.watchlist = state.watchlist.filter((item) => item.id !== id);
          render();
        } catch (err) {
          if (statusEl) statusEl.textContent = err.message || 'Could not remove.';
        }
      });
    });
  };

  render();
  return render;
}

export function wireWatchlistAddForm(auth, state, {
  form,
  titleInput,
  resultsEl,
  tmdbInput,
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
        const { results } = await movieApi.search(auth.token, q);
        if (!results.length) {
          resultsEl.hidden = true;
          return;
        }
        resultsEl.hidden = false;
        resultsEl.innerHTML = results.map((m) => `
          <button type="button" data-id="${m.tmdb_id}" data-title="${escapeHtml(m.title)}">
            ${m.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${m.poster_path}" alt="" width="28" height="42" style="border-radius:4px;object-fit:cover">` : '<span style="width:28px"></span>'}
            <span>${escapeHtml(m.title)}${m.year ? ` <span class="al-muted">(${m.year})</span>` : ''}</span>
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
      tmdbId = await movieApi.resolve(auth.token, title);
    }
    try {
      const { item } = await watchlistApi.create(auth.token, { title, tmdb_id: tmdbId });
      state.watchlist = [item, ...state.watchlist];
      form.reset();
      tmdbInput.value = '';
      statusEl.textContent = `Added ${title}`;
      onAdded?.();
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    } catch (err) {
      statusEl.textContent = err.message || 'Could not add.';
    }
  });
}
