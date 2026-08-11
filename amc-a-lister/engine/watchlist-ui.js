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

/** Already released, oldest release first (chronological). */
export function sortAlreadyOut(items, today = todayISO()) {
  return items
    .filter((item) => isAlreadyOut(item, today))
    .sort((a, b) => {
      const aDate = a.release_date || (a.year != null ? `${a.year}-01-01` : '0000-01-01');
      const bDate = b.release_date || (b.year != null ? `${b.year}-01-01` : '0000-01-01');
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
}

/** Already-out titles first (chronological), then coming soon (soonest first). */
export function combinedWatchlistItems(items, today = todayISO()) {
  return [...sortAlreadyOut(items, today), ...sortComingSoon(items, today)];
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

function watchlistPopupHtml(item, logLabel = 'Log screening') {
  return `
    <div class="al-watchlist-popup" role="tooltip">
      <span class="al-watchlist-popup-title">${escapeHtml(item.title)}</span>
      <span class="al-watchlist-popup-date al-muted">${escapeHtml(releaseLabel(item))}</span>
      ${item.notes ? `<p class="al-watchlist-popup-notes al-muted">${escapeHtml(item.notes)}</p>` : ''}
      <div class="al-watchlist-popup-actions">
        <button type="button" class="al-link-btn" data-log-watchlist="${item.id}">${escapeHtml(logLabel)}</button>
        <button type="button" class="al-link-btn" data-remove-watchlist="${item.id}">Remove</button>
      </div>
    </div>
  `;
}

export function watchlistStripHtml(items, { emptyMessage, logLabel } = {}) {
  if (!items.length) {
    return `<p class="al-muted al-watchlist-empty">${emptyMessage || 'Nothing here yet.'}</p>`;
  }
  return items.map((item) => `
    <article class="al-watchlist-strip-item" data-watchlist-id="${item.id}" tabindex="0" aria-label="${escapeHtml(item.title)}">
      <div class="al-watchlist-strip-poster">
        ${posterHtml(item, { size: 'w154', width: 64, height: 96, className: 'al-poster al-poster--watchlist-strip' })}
        ${watchlistPopupHtml(item, logLabel)}
      </div>
      <span class="al-watchlist-strip-date">${escapeHtml(releaseStripLabel(item))}</span>
    </article>
  `).join('');
}

export function watchlistRowsHtml(items, { emptyMessage, showRelease = true, logLabel } = {}) {
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
        <button type="button" class="al-link-btn" data-log-watchlist="${item.id}">${escapeHtml(logLabel || 'Log')}</button>
        <button type="button" class="al-link-btn" data-remove-watchlist="${item.id}">✕</button>
      </div>
    </article>
  `).join('');
}

function renderWatchlistHtml(items, { layout = 'strip', emptyMessage, showRelease = true, logLabel } = {}) {
  if (layout === 'strip') {
    return watchlistStripHtml(items, { emptyMessage, logLabel });
  }
  return watchlistRowsHtml(items, { emptyMessage, showRelease, logLabel });
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
  watchlistApi: api = watchlistApi,
  onLogItem,
  logLabel = 'Log screening',
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
    listEl.innerHTML = renderWatchlistHtml(items, { layout, emptyMessage: message, showRelease, logLabel });
    if (countEl) countEl.textContent = String(items.length);
    onChange?.();

    listEl.querySelectorAll('[data-log-watchlist]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = state.watchlist.find((w) => w.id === btn.dataset.logWatchlist);
        if (!item) return;
        if (onLogItem) {
          onLogItem(item);
        } else {
          prefillQuickLog({ title: item.title, tmdbId: item.tmdb_id, mode: 'theater' });
        }
      });
    });

    listEl.querySelectorAll('[data-remove-watchlist]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.removeWatchlist;
        if (!confirm('Remove from want to watch?')) return;
        try {
          await api.remove(auth.token, id);
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

function mobileWatchlistMeta(item) {
  const primary = [releaseLabel(item), item.notes ? 'Has notes' : null]
    .filter(Boolean)
    .map((part) => escapeHtml(String(part)))
    .join(' · ');
  return `<span class="al-log-meta-primary">${primary}</span>`;
}

function watchlistEditRowHtml(item) {
  return `
    <div class="al-log-entry al-log-entry--editing" data-entry-id="${item.id}">
      <article class="al-log-row al-log-row--watchlist al-log-row--editing" data-id="${item.id}">
        <form class="al-watchlist-edit-form" data-watchlist-edit-form="${item.id}">
          <div class="al-watchlist-edit-fields">
            <input class="al-input" name="title" type="text" value="${escapeHtml(item.title)}" required />
            <input class="al-input" name="notes" type="text" value="${escapeHtml(item.notes || '')}" placeholder="Notes (optional)" />
            <button class="al-btn al-btn-primary" type="submit">Save</button>
            <button class="al-btn" type="button" data-cancel-watchlist="${item.id}">Cancel</button>
          </div>
        </form>
      </article>
    </div>
  `;
}

function watchlistDetailPanelHtml(item, state, { detailsKind = 'movie', detailClass = '' } = {}) {
  const wrap = (content) => `
    <div class="al-log-detail${detailClass}">
      <div class="al-log-detail-inner">${content}</div>
    </div>
  `;

  if (!item.tmdb_id) {
    return wrap('<p class="al-muted">No TMDB match for this title. Use <strong>Edit</strong> to pick the title from search.</p>');
  }

  if (state.detailsLoading === item.id) {
    return wrap('<p class="al-muted">Loading details…</p>');
  }

  if (state.detailsError && state.expandedId === item.id) {
    return wrap(`<p class="al-error">${escapeHtml(state.detailsError)}</p>`);
  }

  const details = state.detailsCache.get(item.id);
  if (!details) {
    return wrap('<p class="al-muted">Loading details…</p>');
  }

  if (detailsKind === 'tv') {
    const genres = details.genres?.length ? details.genres.join(', ') : '—';
    const seasons = details.number_of_seasons != null ? `${details.number_of_seasons} season${details.number_of_seasons === 1 ? '' : 's'}` : '—';
    const episodes = details.number_of_episodes != null ? `${details.number_of_episodes} episodes` : '—';
    const creator = details.creator || '—';
    const cast = details.cast?.length ? details.cast.join(', ') : '—';
    const titleLine = `${escapeHtml(details.title)}${details.year ? ` <span class="al-muted">(${details.year})</span>` : ''}`;

    return wrap(`
      <h3 class="al-log-detail-title serif">${titleLine}</h3>
      <div class="al-log-detail-body">
        ${details.poster_path ? posterHtml(details, { size: 'w185', width: 88, height: 132, className: 'al-poster al-poster--detail' }) : ''}
        <div class="al-log-detail-meta">
          <dl class="al-log-detail-facts">
            <div class="al-log-detail-fact"><dt>Seasons</dt><dd>${escapeHtml(seasons)}</dd></div>
            <div class="al-log-detail-fact"><dt>Episodes</dt><dd>${escapeHtml(episodes)}</dd></div>
            <div class="al-log-detail-fact"><dt>Genre</dt><dd>${escapeHtml(genres)}</dd></div>
            <div class="al-log-detail-fact"><dt>Creator</dt><dd>${escapeHtml(creator)}</dd></div>
            <div class="al-log-detail-fact"><dt>Cast</dt><dd>${escapeHtml(cast)}</dd></div>
            <div class="al-log-detail-fact"><dt>Status</dt><dd>${escapeHtml(details.status || '—')}</dd></div>
          </dl>
        </div>
      </div>
      <section class="al-log-detail-overview-wrap">
        <h4 class="al-log-detail-subhead">Overview</h4>
        ${details.overview
    ? `<p class="al-log-detail-overview">${escapeHtml(details.overview)}</p>`
    : '<p class="al-muted">No overview available.</p>'}
      </section>
    `);
  }

  const genres = details.genres?.length ? details.genres.join(', ') : '—';
  const runtime = details.runtime_min ? `${details.runtime_min} min` : '—';
  const director = details.director || '—';
  const cast = details.cast?.length ? details.cast.join(', ') : '—';
  const titleLine = `${escapeHtml(details.title)}${details.year ? ` <span class="al-muted">(${details.year})</span>` : ''}`;

  return wrap(`
    <h3 class="al-log-detail-title serif">${titleLine}</h3>
    <div class="al-log-detail-body">
      ${details.poster_path ? posterHtml(details, { size: 'w185', width: 88, height: 132, className: 'al-poster al-poster--detail' }) : ''}
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
      ${details.overview
    ? `<p class="al-log-detail-overview">${escapeHtml(details.overview)}</p>`
    : '<p class="al-muted">No overview available.</p>'}
    </section>
  `);
}

function watchlistViewEntryHtml(item, state, { logLabel = 'Log screening', detailsKind = 'movie', shadeComingSoon = false } = {}) {
  const expanded = item.id === state.expandedId;
  const comingSoon = shadeComingSoon && !isAlreadyOut(item);
  const soonClass = comingSoon ? ' al-log-row--coming-soon' : '';
  const detailSoonClass = comingSoon ? ' al-log-detail--coming-soon' : '';
  return `
    <div class="al-log-entry ${expanded ? 'is-expanded' : ''}${comingSoon ? ' is-coming-soon' : ''}" data-entry-id="${item.id}">
      <article class="al-log-row al-log-row--watchlist al-log-row--clickable${soonClass} ${expanded ? 'is-expanded' : ''}" data-expand-row tabindex="0" role="button" aria-expanded="${expanded}">
        <div class="al-log-col al-col-poster">${posterHtml(item, { size: 'w92', width: 28, height: 42 })}</div>
        <div class="al-log-col al-log-col--desktop">${escapeHtml(releaseLabel(item))}</div>
        <div class="al-log-col--body">
          <div class="al-log-col al-log-col--title">${escapeHtml(item.title)}</div>
          <div class="al-log-col al-log-col--mobile-meta al-only-mobile">${mobileWatchlistMeta(item)}</div>
        </div>
        <div class="al-log-col al-log-col--desktop al-muted">${escapeHtml(item.notes || '—')}</div>
        <div class="al-log-col al-row-actions">
          <button type="button" class="al-link-btn" data-log-watchlist="${item.id}">${escapeHtml(logLabel)}</button>
          <button type="button" class="al-link-btn" data-edit-watchlist="${item.id}">Edit</button>
          <button type="button" class="al-link-btn" data-remove-watchlist="${item.id}">Remove</button>
        </div>
      </article>
      ${expanded ? watchlistDetailPanelHtml(item, state, { detailsKind, detailClass: detailSoonClass }) : ''}
    </div>
  `;
}

export function watchlistLogTableHtml(items, state, { emptyMessage, logLabel, detailsKind, shadeComingSoon = false } = {}) {
  if (!items.length) {
    return `<div class="al-empty">${emptyMessage || 'Nothing here yet.'}</div>`;
  }
  return `
    <div class="al-log-list al-log-list--watchlist">
      <div class="al-log-head al-log-head--watchlist" aria-hidden="true">
        <span class="al-log-col al-col-poster"></span>
        <span class="al-log-col">Release</span>
        <span class="al-log-col">Title</span>
        <span class="al-log-col">Notes</span>
        <span class="al-log-col">Actions</span>
      </div>
      ${items.map((item) => (
        item.id === state.editingId
          ? watchlistEditRowHtml(item)
          : watchlistViewEntryHtml(item, state, { logLabel, detailsKind, shadeComingSoon })
      )).join('')}
    </div>
  `;
}

async function loadWatchlistDetails(auth, state, itemId, render, { detailsApi, detailsKind = 'movie' } = {}) {
  const item = state.watchlist.find((w) => w.id === itemId);
  if (!item?.tmdb_id) return;

  if (state.detailsCache.has(itemId)) return;

  state.detailsLoading = itemId;
  state.detailsError = null;
  render();

  try {
    const data = await detailsApi.details(auth.token, item.tmdb_id);
    const details = detailsKind === 'tv' ? data.show : data.movie;
    state.detailsCache.set(itemId, details);
    if (details?.poster_path && !item.poster_path) {
      const withPoster = { ...item, poster_path: details.poster_path };
      state.watchlist = state.watchlist.map((w) => (w.id === itemId ? withPoster : w));
    }
  } catch (err) {
    state.detailsError = err.message || 'Could not load details.';
  } finally {
    state.detailsLoading = null;
    render();
  }
}

export function wireWatchlistLogList(auth, state, {
  listEl,
  statusEl,
  getItems,
  emptyMessage,
  onChange,
  watchlistApi: api = watchlistApi,
  detailsApi = movieApi,
  detailsKind = 'movie',
  onLogItem,
  logLabel = 'Log screening',
  shadeComingSoon = false,
}) {
  if (!state.detailsCache) state.detailsCache = new Map();

  const render = () => {
    const items = getItems();
    const message = typeof emptyMessage === 'function' ? emptyMessage() : emptyMessage;
    listEl.innerHTML = watchlistLogTableHtml(items, state, { emptyMessage: message, logLabel, detailsKind, shadeComingSoon });
    onChange?.();
    wireWatchlistLogActions(auth, state, render, {
      api,
      detailsApi,
      detailsKind,
      onLogItem,
      logLabel,
      statusEl,
    });
  };

  render();
  return render;
}

function wireWatchlistLogActions(auth, state, render, {
  api,
  detailsApi,
  detailsKind,
  onLogItem,
  statusEl,
}) {
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

      const item = state.watchlist.find((w) => w.id === id);
      if (item?.tmdb_id && !state.detailsCache.has(id)) {
        loadWatchlistDetails(auth, state, id, render, { detailsApi, detailsKind });
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

  document.querySelectorAll('[data-log-watchlist]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = state.watchlist.find((w) => w.id === btn.dataset.logWatchlist);
      if (!item) return;
      if (onLogItem) {
        onLogItem(item);
      } else {
        prefillQuickLog({ title: item.title, tmdbId: item.tmdb_id, mode: 'theater' });
      }
    });
  });

  document.querySelectorAll('[data-edit-watchlist]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.editingId = btn.dataset.editWatchlist;
      state.expandedId = null;
      render();
    });
  });

  document.querySelectorAll('[data-remove-watchlist]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.removeWatchlist;
      if (!confirm('Remove from want to watch?')) return;
      try {
        await api.remove(auth.token, id);
        state.watchlist = state.watchlist.filter((item) => item.id !== id);
        if (state.editingId === id) state.editingId = null;
        if (state.expandedId === id) state.expandedId = null;
        state.detailsCache.delete(id);
        render();
      } catch (err) {
        if (statusEl) statusEl.textContent = err.message || 'Could not remove.';
      }
    });
  });

  document.querySelectorAll('[data-cancel-watchlist]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.editingId = null;
      render();
    });
  });

  document.querySelectorAll('[data-watchlist-edit-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = form.dataset.watchlistEditForm;
      const fd = new FormData(form);
      const payload = {
        id,
        title: String(fd.get('title') || '').trim(),
        notes: String(fd.get('notes') || '').trim() || null,
      };
      try {
        const { item } = await api.update(auth.token, payload);
        const prev = state.watchlist.find((w) => w.id === id);
        state.watchlist = state.watchlist.map((w) => (w.id === id ? { ...item, poster_path: prev?.poster_path, release_date: prev?.release_date, year: prev?.year } : w));
        state.editingId = null;
        render();
      } catch (err) {
        if (statusEl) statusEl.textContent = err.message || 'Could not save.';
      }
    });
  });
}

export function wireWatchlistAddForm(auth, state, {
  form,
  titleInput,
  resultsEl,
  tmdbInput,
  statusEl,
  onAdded,
  searchApi = movieApi,
  watchlistApi: api = watchlistApi,
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
        const { results } = await searchApi.search(auth.token, q);
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
      tmdbId = await searchApi.resolve(auth.token, title);
    }
    try {
      const { item } = await api.create(auth.token, { title, tmdb_id: tmdbId });
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
