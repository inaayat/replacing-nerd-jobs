import { bootPage, renderShell, populateSidebarStats } from './nav.js';
import { loginUrl } from './auth.js';
import { leaderboardApi, movieApi } from './api.js';
import { money, escapeHtml, monthLabel } from './format.js';
import { ratingStarBucket } from './billing.js';
import { watchLogListHtml, withWatchGridTransition } from './watch-log-grid.js';
import { publicRankStackHtml } from './rank-view.js';
import {
  memberProfilePage,
  memberProfileUrl,
  flipMemberPage,
  memberPageIndex,
  memberPageLabel,
} from './member-pages.js';

bootPage(async ({ root, auth }) => {
  const params = new URLSearchParams(location.search);
  const userId = params.get('user')?.trim();

  root.innerHTML = renderShell({
    title: 'Member profile',
    subtitle: 'Loading…',
    hideLogBar: !auth.signedIn,
    signedIn: auth.signedIn,
    body: `<main class="al-main" id="member-main"><p class="al-muted">Loading…</p></main>`,
  });

  const main = document.getElementById('member-main');
  if (!userId) {
    main.innerHTML = `
      <section class="al-panel">
        <p class="al-error">No member specified.</p>
        <p><a class="al-btn" href="/amc-a-lister/leaderboard.html">← Back to leaderboard</a></p>
      </section>
    `;
    return;
  }

  try {
    const token = auth.signedIn ? auth.token : undefined;
    const { profile, currentUserId } = await leaderboardApi.profile(userId, token);
    const isSelf = currentUserId === profile.userId;
    document.querySelector('.al-page-title').textContent = profile.displayName;
    document.querySelector('.al-page-sub').textContent = isSelf
      ? (profile.isPublic
        ? 'This is exactly what other people see.'
        : 'Private — only you can see this. Turn on your public profile in Settings.')
      : 'Public rank and watch log.';
    document.title = `${profile.displayName} — AMC A-Lister`;
    renderProfile(main, profile, { currentUserId, auth });
  } catch (err) {
    const isPrivate = err.status === 404;
    main.innerHTML = `
      <section class="al-panel">
        <p class="${isPrivate ? 'al-muted' : 'al-error'}">${escapeHtml(
          isPrivate
            ? 'This member has not made their log public.'
            : (err.message || 'Could not load profile.'),
        )}</p>
        ${!auth.signedIn && isPrivate ? `
          <p style="margin-top:12px"><a class="al-btn al-btn-primary" href="${loginUrl()}">Sign in</a></p>
        ` : ''}
        <p style="margin-top:12px"><a class="al-btn" href="/amc-a-lister/leaderboard.html">← Back to leaderboard</a></p>
      </section>
    `;
  }
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

function renderProfile(main, profile, { currentUserId, auth }) {
  const { stats, watches } = profile;
  // Absent when the member chose to withhold theaters — drop the filter too.
  const theaters = [...new Set(watches.map((w) => w.location).filter(Boolean))].sort();
  const showTheaters = theaters.length > 0;
  const formats = [...new Set(watches.map((w) => w.format).filter(Boolean))].sort();
  const periodLabel = stats.periodMonth ? monthLabel(`${stats.periodMonth}-01`) : 'This month';
  const isYou = currentUserId === profile.userId;
  const page = memberProfilePage(location.search);
  const rankCount = (profile.ranks || []).length;
  const logCount = watches.length;

  main.innerHTML = `
    <p class="al-member-back"><a class="al-link-btn" href="/amc-a-lister/leaderboard.html">← Leaderboard</a></p>

    <section class="al-panel al-member-stats">
      <h2 class="al-section-title">All-time stats</h2>
      <div class="al-hud al-hud-6">
        ${statCard('Seen', stats.totalSeen, 'count')}
        ${statCard('Savings', stats.totalSavings, 'money-signed')}
        ${statCard('Billed', stats.totalBilled, 'money')}
        ${statCard('Cost / movie', stats.costPerMovie, 'money')}
        ${statCard('Avg ticket', stats.avgTicket, 'money')}
        ${statCard('Avg runtime', stats.avgRuntimeMin, 'runtime')}
        ${statCard('Avg rating', stats.avgRating, 'rating')}
        ${statCard('DNFs', stats.dnfCount, 'count')}
      </div>
      <div class="al-member-period">
        <h3 class="al-member-period-title">${escapeHtml(periodLabel)}</h3>
        <div class="al-hud">
          ${statCard('Movies', stats.periodMovies, 'count')}
          ${statCard('Net savings', stats.periodSavings, 'money-signed')}
        </div>
      </div>
    </section>

    <section class="al-panel al-panel--log al-member-book" data-member-book>
      <div class="al-member-book-toolbar">
        <div class="al-segment al-watchlist-segment" role="tablist" aria-label="Rank or watch log">
          <button type="button" class="al-segment-btn${page === 'rank' ? ' is-active' : ''}"
            data-member-page="rank" role="tab" aria-selected="${page === 'rank' ? 'true' : 'false'}"
            aria-controls="member-page-rank" id="member-tab-rank">
            Rank <span class="al-segment-count">${rankCount}</span>
          </button>
          <button type="button" class="al-segment-btn${page === 'log' ? ' is-active' : ''}"
            data-member-page="log" role="tab" aria-selected="${page === 'log' ? 'true' : 'false'}"
            aria-controls="member-page-log" id="member-tab-log">
            Log <span class="al-segment-count">${logCount}</span>
          </button>
        </div>
        <div class="al-member-flip-nav">
          <button type="button" class="al-member-flip" data-member-flip="prev" aria-label="Previous page">${flipChevron('prev')}</button>
          <span class="al-member-folio" id="member-folio">${memberPageIndex(page)} / 2</span>
          <button type="button" class="al-member-flip" data-member-flip="next" aria-label="Next page">${flipChevron('next')}</button>
        </div>
      </div>

      <div class="al-member-book-stage">
        <div class="al-member-pages">
          <div class="al-member-page${page === 'rank' ? ' is-active' : ''}" id="member-page-rank"
            role="tabpanel" aria-labelledby="member-tab-rank" data-page="rank"
            ${page === 'rank' ? '' : 'hidden'}>
            <h2 class="al-section-title">Rank</h2>
            <p class="al-muted al-member-ranks-note">Theater stack, best first. Separate from star ratings.</p>
            ${publicRankStackHtml(profile.ranks)}
          </div>
          <div class="al-member-page al-member-log${page === 'log' ? ' is-active' : ''}" id="member-page-log"
            role="tabpanel" aria-labelledby="member-tab-log" data-page="log"
            ${page === 'log' ? '' : 'hidden'}>
            <h2 class="al-section-title">Watch log</h2>
            <div class="al-toolbar al-toolbar--log">
              <input class="al-input al-toolbar-search" id="member-search" type="search" placeholder="Search title or theater…" />
              ${showTheaters ? `
                <select class="al-select al-toolbar-filter" id="member-theater">
                  <option value="">All theaters</option>
                  ${theaters.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
                </select>
              ` : ''}
              <select class="al-select al-toolbar-filter al-toolbar-filter--format" id="member-format">
                <option value="">All formats</option>
                ${formats.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
              </select>
              <select class="al-select al-toolbar-filter" id="member-rating">
                <option value="">All ratings</option>
                <option value="5">5★</option>
                <option value="4">4★</option>
                <option value="3">3★</option>
                <option value="2">2★</option>
                <option value="1">1★</option>
                <option value="dnf">DNF</option>
                <option value="unrated">Unrated</option>
              </select>
              ${isYou ? `
                <button type="button" class="al-toggle-btn" id="member-include-home" aria-pressed="false">Include watched at home</button>
              ` : ''}
              <span class="al-muted" id="member-count"></span>
            </div>
            <div class="al-log-list-wrap" id="member-table"></div>
          </div>
        </div>
      </div>
    </section>

    ${!isYou && auth.signedIn ? `
      <p class="al-member-compare">
        <a class="al-btn al-btn-primary" href="/amc-a-lister/leaderboard.html?compare=${encodeURIComponent(profile.userId)}">
          Compare with ${escapeHtml(profile.displayName)}
        </a>
      </p>
    ` : ''}
  `;

  const listEl = document.getElementById('member-table');
  const state = {
    watches,
    filtered: watches,
    expandedId: null,
    detailsCache: new Map(),
    detailsLoading: null,
    detailsError: null,
  };

  const render = ({ transition = false } = {}) => {
    document.getElementById('member-count').textContent = `${state.filtered.length} of ${state.watches.length}`;
    const html = watchLogListHtml(state, { readonly: true });
    const apply = () => {
      listEl.innerHTML = html;
      wireMemberLogExpand(auth, state, render, listEl);
    };
    if (transition) withWatchGridTransition(listEl, apply);
    else apply();
  };

  const applyFilters = () => {
    const q = document.getElementById('member-search').value.trim().toLowerCase();
    const theater = document.getElementById('member-theater')?.value || '';
    const format = document.getElementById('member-format').value;
    const rating = document.getElementById('member-rating').value;
    const includeHomeEl = document.getElementById('member-include-home');
    const includeHome = includeHomeEl?.getAttribute('aria-pressed') === 'true';

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
  };

  const includeHomeEl = document.getElementById('member-include-home');
  includeHomeEl?.addEventListener('click', () => {
    const next = includeHomeEl.getAttribute('aria-pressed') !== 'true';
    includeHomeEl.setAttribute('aria-pressed', next ? 'true' : 'false');
    includeHomeEl.classList.toggle('is-active', next);
    applyFilters();
  });

  let searchTimer = null;
  const debouncedFilters = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 120);
  };

  document.getElementById('member-search').addEventListener('input', debouncedFilters);
  ['member-theater', 'member-format', 'member-rating'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', applyFilters);
  });

  render();

  const bookState = {
    page,
    userId: profile.userId,
    displayName: profile.displayName,
    flipping: false,
  };
  syncMemberPageChrome(bookState);
  wireMemberBook(bookState);
}

function flipChevron(direction) {
  const points = direction === 'prev' ? '15 6 9 12 15 18' : '9 6 15 12 9 18';
  return `<svg class="al-member-flip-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="${points}"/></svg>`;
}

function syncMemberPageChrome(state) {
  const folio = document.getElementById('member-folio');
  if (folio) folio.textContent = `${memberPageIndex(state.page)} / 2`;
  document.querySelectorAll('[data-member-page]').forEach((btn) => {
    const active = btn.dataset.memberPage === state.page;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  if (state.displayName) {
    document.title = `${state.displayName} — ${memberPageLabel(state.page)} — AMC A-Lister`;
  }
}

function showMemberPage(state, page, { animate = true, historyMode = 'push' } = {}) {
  const next = page === 'rank' ? 'rank' : 'log';
  if (next === state.page) return;
  const book = document.querySelector('[data-member-book]');
  const fromEl = document.getElementById(`member-page-${state.page}`);
  const toEl = document.getElementById(`member-page-${next}`);
  if (!book || !fromEl || !toEl) return;

  const goingNext = (state.page === 'rank' && next === 'log');
  state.page = next;

  fromEl.classList.remove('is-active');
  toEl.classList.add('is-active');
  fromEl.hidden = true;
  toEl.hidden = false;
  syncMemberPageChrome(state);

  if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    state.flipping = true;
    book.classList.toggle('is-flip-next', goingNext);
    book.classList.toggle('is-flip-prev', !goingNext);
    fromEl.hidden = false;
    fromEl.classList.add('is-leaving');
    toEl.classList.add('is-entering');
    window.setTimeout(() => {
      fromEl.classList.remove('is-leaving');
      toEl.classList.remove('is-entering');
      fromEl.hidden = true;
      book.classList.remove('is-flip-next', 'is-flip-prev');
      state.flipping = false;
    }, 320);
  }

  if (historyMode === 'push') {
    window.history.pushState({ memberPage: next }, '', memberProfileUrl(state.userId, next));
  } else if (historyMode === 'replace') {
    window.history.replaceState({ memberPage: next }, '', memberProfileUrl(state.userId, next));
  }
}

function wireMemberBook(state) {
  const book = document.querySelector('[data-member-book]');
  if (!book) return;

  const go = (page, opts) => {
    if (state.flipping) return;
    showMemberPage(state, page, opts);
  };

  book.querySelectorAll('[data-member-page]').forEach((btn) => {
    btn.addEventListener('click', () => go(btn.dataset.memberPage));
  });
  book.querySelector('[data-member-flip="prev"]')?.addEventListener('click', () => {
    go(flipMemberPage(state.page, 'prev'));
  });
  book.querySelector('[data-member-flip="next"]')?.addEventListener('click', () => {
    go(flipMemberPage(state.page, 'next'));
  });

  window.addEventListener('popstate', () => {
    go(memberProfilePage(location.search), { historyMode: 'none' });
  });

  const onKey = (e) => {
    if (e.target.closest('input, select, textarea, [contenteditable]')) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(flipMemberPage(state.page, 'next'));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(flipMemberPage(state.page, 'prev'));
    }
  };
  document.addEventListener('keydown', onKey);

  wirePageSwipe(book.querySelector('.al-member-book-stage'), {
    onLeft: () => go(flipMemberPage(state.page, 'next')),
    onRight: () => go(flipMemberPage(state.page, 'prev')),
  });
}

function wirePageSwipe(el, { onLeft, onRight }) {
  if (!el) return;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let locked = null;

  el.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    startX = t.clientX;
    startY = t.clientY;
    tracking = true;
    locked = null;
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (locked == null && Math.hypot(dx, dy) > 10) {
      locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (locked === 'h') e.preventDefault();
  }, { passive: false });
  el.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    if (locked === 'h' && Math.abs(dx) >= 56) {
      if (dx < 0) onLeft();
      else onRight();
    }
    locked = null;
  });
}

function wireMemberLogExpand(auth, state, render, listEl) {
  listEl.querySelectorAll('[data-expand-row]').forEach((row) => {
    const toggle = (e) => {
      if (e.target.closest('.al-row-actions')) return;
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
      state.detailsError = null;
      render({ transition: true });

      const watch = state.watches.find((w) => w.id === id);
      if (watch?.tmdb_id && !state.detailsCache.has(id)) {
        loadMemberMovieDetails(auth, state, id, render);
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

  listEl.querySelectorAll('[data-collapse-card]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.expandedId = null;
      state.detailsError = null;
      render({ transition: true });
    });
  });
}

async function loadMemberMovieDetails(auth, state, watchId, render) {
  const watch = state.watches.find((w) => w.id === watchId);
  if (!watch?.tmdb_id) return;
  if (state.detailsCache.has(watchId)) return;

  state.detailsLoading = watchId;
  state.detailsError = null;
  render();

  try {
    const token = auth?.signedIn ? auth.token : undefined;
    const { movie } = await movieApi.details(token, watch.tmdb_id);
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

function statCard(label, value, kind) {
  let display = '—';
  let extraClass = '';
  if (kind === 'count') {
    display = String(value ?? 0);
  } else if (kind === 'money') {
    display = money(value);
  } else if (kind === 'money-signed') {
    extraClass = value > 0 ? 'is-savings' : (value < 0 ? 'is-cost' : '');
    display = value > 0 ? `+${money(value)}` : money(value);
  } else if (kind === 'runtime') {
    display = value > 0 ? `${value} min` : '—';
  } else if (kind === 'rating') {
    display = value != null ? `${value}★` : '—';
  }

  return `
    <div class="al-stat">
      <div class="al-stat-label">${escapeHtml(label)}</div>
      <div class="al-stat-value ${extraClass}">${escapeHtml(display)}</div>
    </div>
  `;
}
