import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { watchesApi, movieApi, showingInvitesApi } from './api.js';
import { money, shortDate, escapeHtml, posterHtml } from './format.js';
import { watchLogListHtml, withWatchGridTransition } from './watch-log-grid.js';
import { wireWatchEditForm } from './watch-form.js';
import { ratingStarBucket } from './billing.js';
import { wireUserSuggest } from './user-suggest.js';

let reloadLog;
let logFiltersMq;

function filterIconSvg() {
  return `
    <svg class="al-log-filter-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M3 5.75A.75.75 0 0 1 3.75 5h16.5a.75.75 0 0 1 .53 1.28L14.5 12.4v5.85a.75.75 0 0 1-1.14.64l-3-1.8A.75.75 0 0 1 10 16.4v-4L3.22 6.28A.75.75 0 0 1 3 5.75Z"/>
    </svg>
  `;
}

function logFiltersMobile() {
  return window.matchMedia('(max-width: 767px)').matches;
}

function logFiltersAreActive() {
  const theater = document.getElementById('log-theater')?.value;
  const format = document.getElementById('log-format')?.value;
  const rating = document.getElementById('log-rating')?.value;
  const includeHome = document.getElementById('log-include-home')?.getAttribute('aria-pressed') === 'true';
  return Boolean(theater || format || rating || includeHome);
}

function syncLogFilterBtn() {
  const btn = document.getElementById('log-filter-btn');
  const dot = btn?.querySelector('.al-log-filter-dot');
  if (!btn) return;
  const active = logFiltersAreActive();
  btn.classList.toggle('is-filtered', active);
  btn.setAttribute('aria-label', active ? 'Filters (on)' : 'Filters');
  if (dot) dot.hidden = !active;
}

function setLogFiltersOpen(open) {
  const wrap = document.getElementById('log-filters');
  const btn = document.getElementById('log-filter-btn');
  const sheet = document.getElementById('log-filters-sheet');
  if (!wrap || !btn) return;

  const next = Boolean(open) && logFiltersMobile();
  const wasOpen = wrap.classList.contains('is-open');
  wrap.classList.toggle('is-open', next);
  btn.setAttribute('aria-expanded', next ? 'true' : 'false');
  document.body.classList.toggle('al-log-filters-open', next);

  if (sheet) {
    if (next) {
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.setAttribute('aria-labelledby', 'log-filters-title');
    } else {
      sheet.removeAttribute('role');
      sheet.removeAttribute('aria-modal');
      sheet.removeAttribute('aria-labelledby');
    }
  }

  if (next) {
    sheet?.setAttribute('tabindex', '-1');
    sheet?.focus();
  } else if (wasOpen && logFiltersMobile()) {
    btn.focus();
  }
}

function wireLogFilterSheet() {
  const btn = document.getElementById('log-filter-btn');
  const wrap = document.getElementById('log-filters');
  const backdrop = document.getElementById('log-filters-backdrop');
  const done = document.getElementById('log-filters-done');
  if (!btn || !wrap) return;

  const close = () => setLogFiltersOpen(false);

  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    setLogFiltersOpen(!open);
  });
  backdrop?.addEventListener('click', close);
  done?.addEventListener('click', close);

  if (!logFiltersMq) {
    logFiltersMq = window.matchMedia('(max-width: 767px)');
    const onChange = () => {
      if (!logFiltersMq.matches) setLogFiltersOpen(false);
    };
    if (typeof logFiltersMq.addEventListener === 'function') {
      logFiltersMq.addEventListener('change', onChange);
    } else if (typeof logFiltersMq.addListener === 'function') {
      logFiltersMq.addListener(onChange);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const openWrap = document.getElementById('log-filters');
      if (!openWrap?.classList.contains('is-open')) return;
      e.preventDefault();
      setLogFiltersOpen(false);
    });
  }

  syncLogFilterBtn();
}

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Watch log',
    subtitle: 'A-List theater screenings by default — toggle home watches when you want them.',
    signedIn: true,
    body: `<main class="al-main" id="log-main"><p class="al-muted">Loading…</p></main>`,
  });

  reloadLog = () => loadLog(auth);
  await loadLog(auth);
}, { quickLogOnSuccess: async (auth) => {
  await Promise.all([reloadLog?.(), populateSidebarStats(auth)]);
}});

async function loadLog(auth) {
  const main = document.getElementById('log-main');
  if (!main) return;
  document.body.classList.remove('al-log-filters-open');

  const [{ watches }, invites] = await Promise.all([
    watchesApi.list(auth.token),
    showingInvitesApi.list(auth.token).catch(() => ({ incoming: [], outgoing: [] })),
  ]);
  const theaters = [...new Set(watches.map((w) => w.location).filter(Boolean))].sort();
  const formats = [...new Set(watches.map((w) => w.format).filter(Boolean))].sort();

  main.innerHTML = `
    <section class="al-panel al-panel--invites" id="showing-invites-panel" hidden></section>
    <section class="al-panel al-panel--log">
      <div class="al-toolbar al-toolbar--log">
        <div class="al-log-search-row">
          <input class="al-input al-toolbar-search" id="log-search" type="search" placeholder="Search title or theater…" />
          <button type="button" class="al-log-filter-btn" id="log-filter-btn" aria-label="Filters" aria-expanded="false" aria-controls="log-filters" aria-haspopup="dialog">
            ${filterIconSvg()}
            <span class="al-log-filter-dot" hidden></span>
          </button>
        </div>
        <div class="al-log-filters" id="log-filters">
          <button type="button" class="al-log-filters-backdrop" id="log-filters-backdrop" tabindex="-1" aria-label="Close filters"></button>
          <div class="al-log-filters-sheet" id="log-filters-sheet">
            <div class="al-log-filters-head">
              <h2 class="al-log-filters-title" id="log-filters-title">Filters</h2>
              <button type="button" class="al-btn al-btn-primary" id="log-filters-done">Done</button>
            </div>
            <div class="al-log-filters-body">
              <select class="al-select al-toolbar-filter" id="log-theater">
                <option value="">All theaters</option>
                ${theaters.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
              </select>
              <select class="al-select al-toolbar-filter al-toolbar-filter--format" id="log-format">
                <option value="">All formats</option>
                ${formats.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
              </select>
              <select class="al-select al-toolbar-filter" id="log-rating">
                <option value="">All ratings</option>
                <option value="5">5★</option>
                <option value="4">4★</option>
                <option value="3">3★</option>
                <option value="2">2★</option>
                <option value="1">1★</option>
                <option value="dnf">DNF</option>
                <option value="unrated">Unrated</option>
              </select>
              <button type="button" class="al-toggle-btn" id="log-include-home" aria-pressed="false">Include watched at home</button>
            </div>
          </div>
        </div>
        <a href="/amc-a-lister/bulk-ratings.html" class="al-btn">Bulk edit ratings</a>
        <a href="/amc-a-lister/bulk-add.html" class="al-btn">Bulk add viewer</a>
        <span class="al-muted" id="log-count"></span>
      </div>
      <p class="al-error" id="log-error" role="alert" hidden></p>
      <p class="al-muted" id="log-status" aria-live="polite"></p>
      <div class="al-log-list-wrap" id="log-table"></div>
    </section>
  `;

  const includeHomeEl = document.getElementById('log-include-home');

  const state = {
    watches,
    filtered: watches,
    invites,
    // An invite you have to respond to is the only thing on this page with a
    // deadline, so it opens with Accept/Deny already on screen. Outgoing-only
    // ("waiting on them") has nothing to act on and stays collapsed.
    invitesExpanded: (invites?.incoming || []).length > 0,
    editingId: null,
    expandedId: null,
    addingId: null,
    detailsCache: new Map(),
    detailsLoading: null,
    detailsError: null,
  };

  const renderNow = () => {
    document.getElementById('log-count').textContent = `${state.filtered.length} of ${state.watches.length}`;
    renderInvitesPanel(auth, state, render);
    document.getElementById('log-table').innerHTML = tableHtml(state);
    wireRowActions(auth, state, render);
  };

  const render = (opts = {}) => {
    if (opts.transition) {
      withWatchGridTransition(document.getElementById('log-table'), renderNow);
      return;
    }
    renderNow();
  };

  const includeHomeOn = () => includeHomeEl.getAttribute('aria-pressed') === 'true';

  const applyFilters = () => {
    const q = document.getElementById('log-search').value.trim().toLowerCase();
    const theater = document.getElementById('log-theater').value;
    const format = document.getElementById('log-format').value;
    const rating = document.getElementById('log-rating').value;
    const includeHome = includeHomeOn();

    state.filtered = state.watches.filter((w) => {
      if (!includeHome && w.in_theaters === false) return false;
      if (q && !`${w.title} ${w.location || ''}`.toLowerCase().includes(q)) return false;
      if (theater && w.location !== theater) return false;
      if (format && w.format !== format) return false;
      if (rating === 'dnf') {
        if (!w.dnf) return false;
      } else if (rating === 'unrated') {
        if (w.dnf || w.rating != null) return false;
      } else if (rating) {
        if (w.dnf || w.rating == null) return false;
        if (String(ratingStarBucket(w.rating)) !== rating) return false;
      }
      return true;
    });
    render();
    syncLogFilterBtn();
  };

  wireLogFilterSheet();

  includeHomeEl.addEventListener('click', () => {
    const next = !includeHomeOn();
    includeHomeEl.setAttribute('aria-pressed', next ? 'true' : 'false');
    includeHomeEl.classList.toggle('is-active', next);
    applyFilters();
  });

  // Typing rebuilt the whole table and re-bound every listener on each
  // keystroke; for a 100+ row log that is visibly laggy.
  let searchTimer = null;
  const debouncedFilters = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 120);
  };

  document.getElementById('log-search').addEventListener('input', debouncedFilters);
  ['log-theater', 'log-format', 'log-rating'].forEach((id) => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });

  applyFilters();
}

function showLogError(message) {
  const el = document.getElementById('log-error');
  if (!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

function showLogStatus(message) {
  const el = document.getElementById('log-status');
  if (!el) return;
  el.textContent = message || '';
}

function renderInvitesPanel(auth, state, render) {
  const panel = document.getElementById('showing-invites-panel');
  if (!panel) return;
  const incoming = state.invites?.incoming || [];
  const outgoing = state.invites?.outgoing || [];
  if (!incoming.length && !outgoing.length) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  const expanded = !!state.invitesExpanded;
  const total = incoming.length + outgoing.length;
  const summaryBits = [];
  if (incoming.length) summaryBits.push(`${incoming.length} to respond`);
  if (outgoing.length) summaryBits.push(`${outgoing.length} waiting`);
  const summary = summaryBits.join(' · ') || `${total} invite${total === 1 ? '' : 's'}`;

  panel.hidden = false;
  panel.classList.toggle('is-collapsed', !expanded);
  panel.innerHTML = `
    <button type="button" class="al-invites-toggle" data-invites-toggle aria-expanded="${expanded}">
      <span class="al-invites-toggle-main">
        <h2 class="al-invites-title">Showing invites</h2>
        <span class="al-invites-count">${escapeHtml(summary)}</span>
      </span>
      <span class="al-invites-chevron" aria-hidden="true"></span>
    </button>
    <div class="al-invites-body" ${expanded ? '' : 'hidden'}>
      <p class="al-muted al-invites-help">Accept to add it to your log, or tag an existing same-date/movie entry — never a duplicate. Deny to dismiss.</p>
      ${incoming.length ? `
        <div class="al-invites-list" id="incoming-invites">
          ${incoming.map((invite) => inviteCardHtml(invite, 'incoming')).join('')}
        </div>
      ` : ''}
      ${outgoing.length ? `
        <div class="al-invites-outgoing">
          <h3 class="al-invites-subhead">Waiting on</h3>
          <ul class="al-invites-outgoing-list">
            ${outgoing.map((invite) => `
              <li class="al-invites-outgoing-item">
                <span class="al-invites-outgoing-text">
                  <strong>${escapeHtml(invite.to_username || 'Member')}</strong>
                  · ${escapeHtml(invite.title)}
                  · ${shortDate(invite.watched_on)}
                  · ${escapeHtml(invite.location || '—')}
                </span>
                <button type="button" class="al-link-btn al-invites-cancel" data-invite-cancel="${invite.id}">Delete</button>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;

  panel.querySelector('[data-invites-toggle]')?.addEventListener('click', () => {
    state.invitesExpanded = !state.invitesExpanded;
    render();
  });

  panel.querySelectorAll('[data-invite-cancel]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.inviteCancel;
      if (!id) return;
      btn.disabled = true;
      try {
        await showingInvitesApi.cancel(auth.token, id);
        state.invites.outgoing = (state.invites.outgoing || []).filter((i) => i.id !== id);
        showLogStatus('Invite deleted.');
        render();
      } catch (err) {
        showLogError(err.message || 'Could not delete invite.');
        btn.disabled = false;
      }
    });
  });

  panel.querySelectorAll('[data-invite-accept], [data-invite-deny]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.inviteAccept || btn.dataset.inviteDeny;
      const action = btn.dataset.inviteAccept ? 'accept' : 'deny';
      btn.disabled = true;
      try {
        const result = await showingInvitesApi.respond(auth.token, { id, action });
        state.invites.incoming = state.invites.incoming.filter((i) => i.id !== id);
        if (action === 'accept') {
          const { watches } = await watchesApi.list(auth.token);
          state.watches = watches;
          const q = document.getElementById('log-search')?.value.trim().toLowerCase() || '';
          const theater = document.getElementById('log-theater')?.value || '';
          const format = document.getElementById('log-format')?.value || '';
          const rating = document.getElementById('log-rating')?.value || '';
          const includeHome = document.getElementById('log-include-home')?.getAttribute('aria-pressed') === 'true';
          state.filtered = state.watches.filter((w) => {
            if (!includeHome && w.in_theaters === false) return false;
            if (q && !`${w.title} ${w.location || ''}`.toLowerCase().includes(q)) return false;
            if (theater && w.location !== theater) return false;
            if (format && w.format !== format) return false;
            if (rating === 'dnf') return !!w.dnf;
            if (rating === 'unrated') return !w.dnf && w.rating == null;
            if (rating) {
              if (w.dnf || w.rating == null) return false;
              return String(ratingStarBucket(w.rating)) === rating;
            }
            return true;
          });
          showLogStatus(result.linked || result.reused_existing
            ? (result.filled_fields?.length
              ? `Accepted — tagged your existing entry and filled in ${result.filled_fields.join(', ')}.`
              : 'Accepted — tagged your existing log entry (no duplicate).')
            : 'Added to your watch log.');
          populateSidebarStats(auth);
        } else {
          showLogStatus('Invite declined.');
        }
        render();
      } catch (err) {
        showLogError(err.message || 'Could not update invite.');
        btn.disabled = false;
      }
    });
  });
}

function inviteCardHtml(invite, kind) {
  return `
    <article class="al-invite-card" data-invite-id="${invite.id}">
      <div class="al-invite-card-poster">
        ${posterHtml(invite, { size: 'w92', width: 40, height: 60, className: 'al-poster al-poster--watchlist-sm' })}
      </div>
      <div class="al-invite-card-body">
        <h3 class="al-invite-card-title">${escapeHtml(invite.title)}</h3>
        <p class="al-muted">
          From <strong>${escapeHtml(invite.from_username || 'Member')}</strong>
          · ${shortDate(invite.watched_on)}
          · ${escapeHtml(invite.location || '—')}
          · ${money(invite.ticket_cents)}
          ${invite.format ? ` · ${escapeHtml(invite.format)}` : ''}
        </p>
      </div>
      ${kind === 'incoming' ? `
        <div class="al-invite-card-actions">
          <button type="button" class="al-btn al-btn-primary" data-invite-accept="${invite.id}">Accept</button>
          <button type="button" class="al-btn" data-invite-deny="${invite.id}">Deny</button>
        </div>
      ` : ''}
    </article>
  `;
}

function tableHtml(state) {
  return watchLogListHtml(state);
}

async function loadMovieDetails(auth, state, watchId, render) {
  const watch = state.watches.find((w) => w.id === watchId);
  if (!watch?.tmdb_id) return;

  if (state.detailsCache.has(watchId)) return;

  state.detailsLoading = watchId;
  state.detailsError = null;

  try {
    const { movie } = await movieApi.details(auth.token, watch.tmdb_id);
    state.detailsCache.set(watchId, movie);
    if (movie.poster_path && !watch.poster_path) {
      const withPoster = { ...watch, poster_path: movie.poster_path };
      state.watches = state.watches.map((w) => (w.id === watchId ? withPoster : w));
      state.filtered = state.filtered.map((w) => (w.id === watchId ? withPoster : w));
    }
  } catch (err) {
    state.detailsError = err.message || 'Could not load movie details.';
  } finally {
    state.detailsLoading = null;
    render();
  }
}

function wireRowActions(auth, state, render) {
  document.querySelectorAll('[data-expand-row]').forEach((row) => {
    const toggle = (e) => {
      if (e.target.closest('.al-row-actions')) return;
      if (e.target.closest('.al-add-viewer')) return;
      const entry = row.closest('.al-log-entry');
      const id = entry?.dataset.entryId;
      if (!id) return;

      if (state.expandedId === id) {
        state.expandedId = null;
        state.detailsError = null;
        render({ transition: true });
        return;
      }

      state.expandedId = id;
      state.editingId = null;
      state.addingId = null;
      state.detailsError = null;

      const watch = state.watches.find((w) => w.id === id);
      render({ transition: true });
      if (watch?.tmdb_id && !state.detailsCache.has(id)) {
        loadMovieDetails(auth, state, id, render);
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

  document.querySelectorAll('[data-collapse-card]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.expandedId = null;
      state.addingId = null;
      state.detailsError = null;
      render({ transition: true });
    });
  });

  document.querySelectorAll('[data-add-viewer]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.addViewer;
      state.addingId = state.addingId === id ? null : id;
      state.editingId = null;
      if (state.addingId) state.expandedId = null;
      showLogError('');
      render();
      if (state.addingId) {
        const input = document.getElementById(`add-viewer-${state.addingId}`);
        const resultsEl = document.getElementById(`add-viewer-results-${state.addingId}`);
        if (input && resultsEl) {
          wireUserSuggest(input, resultsEl, {
            token: auth.token,
            getExclude: () => {
              const watch = state.watches.find((w) => w.id === state.addingId);
              return (watch?.companions || []).map((c) => c.username);
            },
            onSelect: (username) => {
              input.value = username;
            },
          });
        }
        input?.focus();
      }
    });
  });

  document.querySelectorAll('[data-cancel-add-viewer]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.addingId = null;
      render();
    });
  });

  document.querySelectorAll('[data-add-viewer-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const watchId = form.dataset.addViewerForm;
      const input = form.querySelector('input[name="username"]');
      const username = input?.value.trim();
      if (!username) return;
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      showLogError('');
      try {
        const result = await showingInvitesApi.create(auth.token, {
          watch_id: watchId,
          username,
        });
        state.addingId = null;
        if (result.linked) {
          const { watches } = await watchesApi.list(auth.token);
          state.watches = watches;
          const q = document.getElementById('log-search')?.value.trim().toLowerCase() || '';
          const theater = document.getElementById('log-theater')?.value || '';
          const format = document.getElementById('log-format')?.value || '';
          const rating = document.getElementById('log-rating')?.value || '';
          const includeHome = document.getElementById('log-include-home')?.getAttribute('aria-pressed') === 'true';
          state.filtered = state.watches.filter((w) => {
            if (!includeHome && w.in_theaters === false) return false;
            if (q && !`${w.title} ${w.location || ''}`.toLowerCase().includes(q)) return false;
            if (theater && w.location !== theater) return false;
            if (format && w.format !== format) return false;
            if (rating === 'dnf') return !!w.dnf;
            if (rating === 'unrated') return !w.dnf && w.rating == null;
            if (rating) {
              if (w.dnf || w.rating == null) return false;
              return String(ratingStarBucket(w.rating)) === rating;
            }
            return true;
          });
          showLogStatus(result.already
            ? `Already tagged with ${result.companion?.username || username}.`
            : `Tagged as watched together with ${result.companion?.username || username}.`);
        } else {
          const invites = await showingInvitesApi.list(auth.token);
          state.invites = invites;
          showLogStatus(`Invite sent to ${username}.`);
        }
        render();
      } catch (err) {
        showLogError(err.message || 'Could not add that user.');
        submitBtn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.editingId = btn.dataset.edit;
      state.expandedId = null;
      state.addingId = null;
      render();
    });
  });

  document.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.delete;
      if (!confirm('Delete this screening?')) return;

      btn.disabled = true;
      try {
        await watchesApi.remove(auth.token, id);
      } catch (err) {
        // Previously unhandled: the row silently stayed put on any failure.
        btn.disabled = false;
        showLogError(err.message || 'Could not delete that screening.');
        return;
      }

      state.watches = state.watches.filter((w) => w.id !== id);
      state.filtered = state.filtered.filter((w) => w.id !== id);
      if (state.editingId === id) state.editingId = null;
      if (state.expandedId === id) state.expandedId = null;
      if (state.addingId === id) state.addingId = null;
      state.detailsCache.delete(id);
      populateSidebarStats(auth);
      render();
    });
  });

  if (!state.editingId) return;

  const watch = state.watches.find((w) => w.id === state.editingId);
  if (!watch) {
    state.editingId = null;
    return;
  }

  const prefix = `edit-${watch.id}`;
  wireWatchEditForm(auth, watch, prefix, {
    onCancel: () => {
      state.editingId = null;
      render();
    },
    onSave: async (payload) => {
      const { watch: updated } = await watchesApi.update(auth.token, { id: watch.id, ...payload });
      const merged = {
        ...updated,
        poster_path: updated.poster_path || (updated.tmdb_id === watch.tmdb_id ? watch.poster_path : null),
        companions: updated.companions || watch.companions || [],
      };
      state.watches = state.watches.map((w) => (w.id === watch.id ? merged : w));
      state.filtered = state.filtered.map((w) => (w.id === watch.id ? merged : w));
      if (updated.tmdb_id !== watch.tmdb_id) {
        state.detailsCache.delete(watch.id);
      }
      state.editingId = null;
      populateSidebarStats(auth);
      render();
    },
  });
}
