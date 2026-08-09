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

function watchlistMobileMeta(item) {
  return `<span class="al-log-meta-primary">${escapeHtml(releaseLabel(item))}</span>`;
}

export function watchlistLogListHtml(items, { emptyMessage, logLabel, releaseColumn = 'Release' } = {}) {
  if (!items.length) {
    return `<div class="al-empty">${emptyMessage || 'Nothing here yet.'}</div>`;
  }
  return `
    <div class="al-log-list al-log-list--watchlist">
      <div class="al-log-head" aria-hidden="true">
        <span class="al-log-col al-col-poster"></span>
        <span class="al-log-col">${escapeHtml(releaseColumn)}</span>
        <span class="al-log-col">Title</span>
        <span class="al-log-col">Actions</span>
      </div>
      ${items.map((item) => `
        <article class="al-log-row" data-watchlist-id="${item.id}">
          <div class="al-log-col al-col-poster">${posterHtml(item, { size: 'w92', width: 28, height: 42 })}</div>
          <div class="al-log-col al-log-col--desktop">${escapeHtml(releaseLabel(item))}</div>
          <div class="al-log-col--body">
            <div class="al-log-col al-log-col--title">${escapeHtml(item.title)}</div>
            <div class="al-log-col al-log-col--mobile-meta al-only-mobile">${watchlistMobileMeta(item)}</div>
          </div>
          <div class="al-log-col al-row-actions">
            <button type="button" class="al-link-btn" data-log-watchlist="${item.id}">${escapeHtml(logLabel || 'Log screening')}</button>
            <button type="button" class="al-link-btn" data-remove-watchlist="${item.id}">Remove</button>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

export function renderWatchlistAddBar({
  idPrefix = 'watchlist',
  submitLabel = 'Add it',
  titleLabel = 'Movie',
  titlePlaceholder = 'Title',
} = {}) {
  return `
    <div class="al-quicklog al-watchlist-add-bar" id="${idPrefix}-add-bar">
      <form class="al-quicklog-form" id="${idPrefix}-add-form" autocomplete="off">
        <div class="al-quicklog-primary">
          <div class="al-quicklog-field al-quicklog-field--date">
            <label for="${idPrefix}-release">Release</label>
            <input class="al-quicklog-input" id="${idPrefix}-release" type="date" />
          </div>
          <div class="al-quicklog-field al-quicklog-field--title al-search-wrap">
            <label for="${idPrefix}-title">${escapeHtml(titleLabel)}</label>
            <input class="al-quicklog-input" id="${idPrefix}-title" type="text" placeholder="${escapeHtml(titlePlaceholder)}" required />
            <div class="al-search-results" id="${idPrefix}-title-results" hidden></div>
          </div>
        </div>
        <div class="al-quicklog-expand" id="${idPrefix}-expand" aria-hidden="true">
          <div class="al-quicklog-expand-inner">
            <div class="al-quicklog-extra">
              <div class="al-quicklog-field al-quicklog-field--notes">
                <label for="${idPrefix}-notes">Notes</label>
                <input class="al-quicklog-input" id="${idPrefix}-notes" type="text" placeholder="Optional" />
              </div>
            </div>
          </div>
        </div>
        <div class="al-quicklog-actions">
          <button class="al-quicklog-submit" type="submit">${escapeHtml(submitLabel)}</button>
        </div>
        <input type="hidden" id="${idPrefix}-tmdb_id" value="" />
      </form>
      <p class="al-quicklog-status" id="${idPrefix}-status" aria-live="polite"></p>
    </div>
  `;
}

export function renderWatchlistViewTabs({
  soonCount,
  outCount,
  soonLabel = 'Coming soon',
  outLabel = 'Already out',
  viewAttr = 'data-watchlist-view',
  activeView = 'soon',
} = {}) {
  const tab = (view, label, count) => {
    const active = view === activeView;
    return `
      <button type="button" class="al-quicklog-mode-btn${active ? ' is-active' : ''}" ${viewAttr}="${view}" role="tab" aria-selected="${active ? 'true' : 'false'}">
        ${label} <span class="al-segment-count">${count}</span>
      </button>
    `;
  };
  return `
    <div class="al-quicklog-mode al-watchlist-mode" role="tablist" aria-label="Watchlist view">
      ${tab('soon', soonLabel, soonCount)}
      ${tab('out', outLabel, outCount)}
    </div>
  `;
}

function renderWatchlistHtml(items, { layout = 'strip', emptyMessage, showRelease = true, logLabel, releaseColumn } = {}) {
  if (layout === 'strip') {
    return watchlistStripHtml(items, { emptyMessage, logLabel });
  }
  if (layout === 'log') {
    return watchlistLogListHtml(items, { emptyMessage, logLabel, releaseColumn });
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
    listEl.innerHTML = renderWatchlistHtml(items, {
      layout,
      emptyMessage: message,
      showRelease,
      logLabel,
      releaseColumn: layout === 'log' && showRelease === false ? 'Airs' : 'Release',
    });
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

export function wireWatchlistAddForm(auth, state, {
  form,
  titleInput,
  resultsEl,
  tmdbInput,
  statusEl,
  releaseInput,
  notesInput,
  shell,
  expandEl,
  onAdded,
  searchApi = movieApi,
  watchlistApi: api = watchlistApi,
}) {
  let searchTimer = null;
  let expanded = false;

  const setExpanded = (on) => {
    if (!expandEl || !shell) return;
    if (expanded === on) return;
    expanded = on;
    shell.classList.toggle('is-expanded', on);
    expandEl.setAttribute('aria-hidden', on ? 'false' : 'true');
  };

  const checkExpand = () => {
    if (!shell) return;
    const hasTitle = Boolean(titleInput.value.trim());
    shell.classList.toggle('has-title', hasTitle);
    const active = Boolean(
      hasTitle
      || (releaseInput?.value)
      || (notesInput?.value.trim())
    );
    setExpanded(active);
  };

  if (shell) {
    ['input', 'change'].forEach((eventName) => {
      titleInput.addEventListener(eventName, checkExpand);
      releaseInput?.addEventListener(eventName, checkExpand);
      notesInput?.addEventListener(eventName, checkExpand);
    });
  }

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
          <button type="button" data-id="${m.tmdb_id}" data-title="${escapeHtml(m.title)}" data-release="${escapeHtml(m.release_date || m.first_air_date || '')}">
            ${m.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${m.poster_path}" alt="" width="28" height="42" style="border-radius:4px;object-fit:cover">` : '<span style="width:28px"></span>'}
            <span>${escapeHtml(m.title)}${m.year ? ` <span class="al-muted">(${m.year})</span>` : ''}</span>
          </button>
        `).join('');
        resultsEl.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', () => {
            titleInput.value = btn.dataset.title;
            tmdbInput.value = btn.dataset.id;
            if (releaseInput && btn.dataset.release) {
              releaseInput.value = btn.dataset.release;
            }
            resultsEl.hidden = true;
            checkExpand();
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
    statusEl.classList.remove('is-error', 'is-success');
    const title = titleInput.value.trim();
    let tmdbId = tmdbInput.value ? Number(tmdbInput.value) : null;
    if (!tmdbId && title) {
      tmdbId = await searchApi.resolve(auth.token, title);
    }
    const notes = notesInput?.value.trim() || null;
    try {
      const { item } = await api.create(auth.token, { title, tmdb_id: tmdbId, notes });
      state.watchlist = [item, ...state.watchlist];
      form.reset();
      tmdbInput.value = '';
      if (shell) {
        shell.classList.remove('has-title', 'is-expanded');
        if (expandEl) expandEl.setAttribute('aria-hidden', 'true');
        expanded = false;
      }
      statusEl.textContent = `Added ${title}`;
      statusEl.classList.add('is-success');
      onAdded?.();
      titleInput.focus();
      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.classList.remove('is-success');
      }, 2500);
    } catch (err) {
      statusEl.textContent = err.message || 'Could not add.';
      statusEl.classList.add('is-error');
    }
  });
}
