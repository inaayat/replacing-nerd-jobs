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
  if (item.year) return `${item.year} · date TBA`;
  return 'Release TBA';
}

/** Compact date for the always-visible strip label under posters. */
export function releaseStripLabel(item) {
  if (item.release_date) return shortDate(item.release_date);
  if (item.year) return String(item.year);
  return 'TBA';
}

function watchlistPopupHtml(item) {
  return `
    <div class="al-watchlist-popup" role="tooltip">
      <span class="al-watchlist-popup-title">${escapeHtml(item.title)}</span>
      <span class="al-watchlist-popup-date al-muted">${escapeHtml(releaseLabel(item))}</span>
      ${item.notes ? `<p class="al-watchlist-popup-notes al-muted">${escapeHtml(item.notes)}</p>` : ''}
      <div class="al-watchlist-popup-actions">
        <button type="button" class="al-link-btn" data-log-watchlist="${item.id}">Log screening</button>
        <button type="button" class="al-link-btn" data-remove-watchlist="${item.id}">Remove</button>
      </div>
    </div>
  `;
}

export function watchlistStripHtml(items, { emptyMessage } = {}) {
  if (!items.length) {
    return `<p class="al-muted al-watchlist-empty">${emptyMessage || 'Nothing here yet.'}</p>`;
  }
  return items.map((item) => `
    <article class="al-watchlist-strip-item" data-watchlist-id="${item.id}" tabindex="0" aria-label="${escapeHtml(item.title)}">
      <div class="al-watchlist-strip-poster">
        ${posterHtml(item, { size: 'w154', width: 64, height: 96, className: 'al-poster al-poster--watchlist-strip' })}
        ${watchlistPopupHtml(item)}
      </div>
      <span class="al-watchlist-strip-date">${escapeHtml(releaseStripLabel(item))}</span>
    </article>
  `).join('');
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

function renderWatchlistHtml(items, { layout = 'strip', emptyMessage, showRelease = true } = {}) {
  if (layout === 'strip') {
    return watchlistStripHtml(items, { emptyMessage });
  }
  return watchlistRowsHtml(items, { emptyMessage, showRelease });
}

function positionWatchlistPopup(item) {
  const popup = item.querySelector('.al-watchlist-popup');
  const poster = item.querySelector('.al-watchlist-strip-poster');
  if (!popup || !poster) return;

  popup.style.left = '0';
  popup.style.right = 'auto';
  popup.style.top = '0';
  popup.style.transform = 'none';
  popup.style.position = 'fixed';
  popup.style.visibility = 'hidden';
  popup.style.display = 'block';
  popup.style.opacity = '0';

  const rect = poster.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const gap = 8;
  const pad = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.left + (rect.width / 2) - (popupRect.width / 2);
  left = Math.max(pad, Math.min(left, vw - popupRect.width - pad));

  let top = rect.bottom + gap;
  if (top + popupRect.height > vh - pad) {
    top = Math.max(pad, rect.top - popupRect.height - gap);
  }

  popup.style.left = `${Math.round(left)}px`;
  popup.style.top = `${Math.round(top)}px`;
  popup.style.visibility = '';
  popup.style.opacity = '';
}

function clearWatchlistPopupPosition(item) {
  const popup = item.querySelector('.al-watchlist-popup');
  if (!popup) return;
  popup.style.position = '';
  popup.style.left = '';
  popup.style.right = '';
  popup.style.top = '';
  popup.style.transform = '';
  popup.style.display = '';
  popup.style.visibility = '';
  popup.style.opacity = '';
}

export function wireWatchlistList(auth, state, {
  listEl,
  countEl,
  statusEl,
  getItems,
  emptyMessage,
  showRelease = true,
  layout = 'strip',
  onChange,
}) {
  const closeOpenItems = () => {
    listEl.querySelectorAll('.al-watchlist-strip-item.is-open').forEach((el) => {
      el.classList.remove('is-open');
      clearWatchlistPopupPosition(el);
    });
  };

  const render = () => {
    const items = getItems();
    listEl.classList.toggle('al-watchlist-strip', layout === 'strip');
    listEl.classList.toggle('al-watchlist-list', layout === 'list');
    const message = typeof emptyMessage === 'function' ? emptyMessage() : emptyMessage;
    listEl.innerHTML = renderWatchlistHtml(items, { layout, emptyMessage: message, showRelease });
    if (countEl) countEl.textContent = String(items.length);
    onChange?.();

    listEl.querySelectorAll('[data-log-watchlist]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = state.watchlist.find((w) => w.id === btn.dataset.logWatchlist);
        if (!item) return;
        prefillQuickLog({ title: item.title, tmdbId: item.tmdb_id, mode: 'theater' });
      });
    });

    listEl.querySelectorAll('[data-remove-watchlist]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
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

    if (layout === 'strip') {
      listEl.querySelectorAll('.al-watchlist-strip-item').forEach((item) => {
        item.addEventListener('mouseenter', () => positionWatchlistPopup(item));
        item.addEventListener('mouseleave', () => {
          if (!item.classList.contains('is-open')) clearWatchlistPopupPosition(item);
        });
        item.addEventListener('focusin', () => positionWatchlistPopup(item));
        item.addEventListener('focusout', (e) => {
          if (item.contains(e.relatedTarget)) return;
          if (!item.classList.contains('is-open')) clearWatchlistPopupPosition(item);
        });
        item.addEventListener('click', (e) => {
          if (e.target.closest('[data-log-watchlist], [data-remove-watchlist]')) return;
          const wasOpen = item.classList.contains('is-open');
          closeOpenItems();
          if (!wasOpen) {
            item.classList.add('is-open');
            positionWatchlistPopup(item);
          }
        });
      });

      if (!listEl.dataset.stripDismissWired) {
        listEl.dataset.stripDismissWired = '1';
        document.addEventListener('click', (e) => {
          if (e.target.closest(`#${listEl.id}`)) return;
          closeOpenItems();
        });
        window.addEventListener('scroll', closeOpenItems, true);
        window.addEventListener('resize', closeOpenItems);
      }
    }
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
