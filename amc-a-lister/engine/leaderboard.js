import { bootPage, renderShell, populateSidebarStats } from './nav.js';
import { leaderboardApi } from './api.js';
import { money, escapeHtml, posterHtml } from './format.js';

const SORT_COLUMNS = [
  { key: 'totalSeen', label: 'Movies seen', kind: 'count' },
  { key: 'totalSavings', label: 'Savings', kind: 'money', signed: true },
  { key: 'totalCharged', label: 'Ticket value', kind: 'money' },
  { key: 'totalBilled', label: 'Billed', kind: 'money' },
  { key: 'costPerMovie', label: 'Cost per movie', kind: 'money' },
  { key: 'avgTicket', label: 'Avg ticket', kind: 'money' },
  { key: 'avgRuntimeMin', label: 'Avg runtime', kind: 'runtime' },
  { key: 'avgRating', label: 'Avg rating', kind: 'rating' },
  { key: 'periodMovies', label: 'This month', kind: 'count' },
  { key: 'periodSavings', label: 'Month net', kind: 'money', signed: true },
];

const CARD_STATS = [
  { key: 'totalSeen', label: 'Seen', kind: 'count' },
  { key: 'totalSavings', label: 'Savings', kind: 'money', signed: true },
  { key: 'avgRating', label: 'Avg rating', kind: 'rating' },
  { key: 'periodMovies', label: 'This month', kind: 'count' },
];

let sortState = { key: 'totalSeen', dir: 'desc' };
let pageState = {
  auth: null,
  entries: [],
  currentUserId: null,
  compareYouId: null,
  compareWithId: null,
  comparison: null,
  compareLoading: false,
  compareError: null,
};

bootPage(async ({ root, auth }) => {
  pageState.auth = auth;
  root.innerHTML = renderShell({
    title: 'Leaderboard',
    subtitle: 'Every A-Lister profile, stats, and watch logs.',
    hideLogBar: !auth.signedIn,
    body: `<main class="al-main" id="leaderboard-main"><p class="al-muted">Loading…</p></main>`,
  });

  const main = document.getElementById('leaderboard-main');
  const token = auth.signedIn ? auth.token : undefined;
  const { entries = [], currentUserId = null } = await leaderboardApi.get(token);
  pageState.entries = entries;
  pageState.currentUserId = currentUserId;
  if (currentUserId && !pageState.compareYouId) {
    pageState.compareYouId = currentUserId;
  }
  const compareParam = new URLSearchParams(location.search).get('compare')?.trim();
  if (compareParam && entries.some((entry) => entry.userId === compareParam)) {
    pageState.compareWithId = compareParam;
    if (currentUserId) pageState.compareYouId = currentUserId;
  }
  renderPage(main);
  if (compareParam && (currentUserId || pageState.compareYouId)) {
    await loadComparison(main);
    document.getElementById('al-compare-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

function renderPage(main) {
  const { entries, currentUserId } = pageState;
  if (!entries.length) {
    main.innerHTML = `
      <section class="al-panel">
        <div class="al-empty">No accounts yet.</div>
      </section>
    `;
    return;
  }

  const sorted = sortEntries(entries, sortState.key, sortState.dir);
  const col = SORT_COLUMNS.find((c) => c.key === sortState.key);
  const signedIn = !!currentUserId;

  main.innerHTML = `
    <section class="al-panel al-profiles-panel">
      <div class="al-profile-toolbar">
        <div>
          <h2>User profiles</h2>
          <p class="al-muted">Sorted by ${escapeHtml(col?.label || 'Movies seen')}.</p>
        </div>
        <div class="al-field al-profile-sort-field">
          <label for="profile-sort">Sort by</label>
          <select class="al-input al-profile-sort" id="profile-sort">
            ${SORT_COLUMNS.map((column) => `
              <option value="${column.key}"${sortState.key === column.key ? ' selected' : ''}>
                ${escapeHtml(column.label)}
              </option>
            `).join('')}
          </select>
        </div>
      </div>
      <div class="al-profile-grid">
        ${sorted.map((entry, index) => renderProfileCard(entry, index + 1, currentUserId)).join('')}
      </div>
    </section>
    ${renderComparePanel(entries, signedIn)}
  `;

  wireProfileControls(main);
  wireCompare(main);
}

function memberProfileUrl(userId) {
  return `/amc-a-lister/member.html?user=${encodeURIComponent(userId)}`;
}

function renderProfileCard(entry, rank, currentUserId) {
  const isYou = entry.userId === currentUserId;

  return `
    <article class="al-profile-card${isYou ? ' is-you' : ''}">
      <div class="al-profile-card-head">
        <span class="al-profile-rank">#${rank}</span>
        <h3 class="al-profile-name">
          <a href="${memberProfileUrl(entry.userId)}">${escapeHtml(entry.displayName)}</a>
        </h3>
        ${isYou ? '<span class="al-you-badge">you</span>' : ''}
      </div>
      <dl class="al-profile-stats">
        ${CARD_STATS.map((stat) => `
          <div class="al-profile-stat">
            <dt>${stat.label}</dt>
            <dd class="${stat.kind === 'money' && stat.signed ? savingsClass(entry[stat.key]) : ''}">
              ${formatStat(entry, stat)}
            </dd>
          </div>
        `).join('')}
      </dl>
      <a class="al-profile-view" href="${memberProfileUrl(entry.userId)}">View log →</a>
    </article>
  `;
}

function renderComparePanel(entries, signedIn) {
  if (entries.length < 2) {
    return `
      <section class="al-panel al-compare-panel">
        <h2>Compare stats</h2>
        <p class="al-muted">You need at least two accounts to compare watch logs.</p>
      </section>
    `;
  }

  const youId = pageState.compareYouId || '';
  const withId = pageState.compareWithId || '';
  const youEntry = entries.find((entry) => entry.userId === youId);
  const withEntry = entries.find((entry) => entry.userId === withId);
  const canCompare = signedIn
    ? !!withId && withId !== pageState.currentUserId
    : !!youId && !!withId && youId !== withId;

  return `
    <section class="al-panel al-compare-panel" id="al-compare-panel">
      <h2>${signedIn ? 'Compare your stats' : 'Compare stats'}</h2>
      <p class="al-muted al-compare-lead">See shared movies, gaps, disagreements, and mutual favorites.</p>
      <form class="al-toolbar al-compare-toolbar" id="al-compare-form">
        ${signedIn ? '' : `
          <div class="al-field al-compare-field">
            <label for="al-compare-you">Member</label>
            <select class="al-input al-compare-select" id="al-compare-you" name="you">
              <option value="">Choose a member…</option>
              ${entries.map((entry) => `
                <option value="${escapeHtml(entry.userId)}"${entry.userId === youId ? ' selected' : ''}>
                  ${escapeHtml(entry.displayName)}
                </option>
              `).join('')}
            </select>
          </div>
        `}
        <div class="al-field al-compare-field">
          <label for="al-compare-with">Compare with</label>
          <select class="al-input al-compare-select" id="al-compare-with" name="with">
            <option value="">Choose a member…</option>
            ${entries
    .filter((entry) => !signedIn || entry.userId !== pageState.currentUserId)
    .map((entry) => `
              <option value="${escapeHtml(entry.userId)}"${entry.userId === withId ? ' selected' : ''}>
                ${escapeHtml(entry.displayName)}
              </option>
            `).join('')}
          </select>
        </div>
        <button type="submit" class="al-btn al-btn-primary" ${canCompare ? '' : 'disabled'}>Compare</button>
      </form>
      ${renderCompareBody(youEntry, withEntry)}
    </section>
  `;
}

function renderCompareBody(youEntry, withEntry) {
  if (!pageState.compareWithId || (!pageState.currentUserId && !pageState.compareYouId)) {
    return '<p class="al-muted al-compare-status">Pick two members above to compare watch logs.</p>';
  }

  if (pageState.compareLoading) {
    return '<p class="al-muted al-compare-status">Loading comparison…</p>';
  }

  if (pageState.compareError) {
    return `<p class="al-error al-compare-status">${escapeHtml(pageState.compareError)}</p>`;
  }

  const comparison = pageState.comparison;
  if (!comparison) {
    return '<p class="al-muted al-compare-status">Pick members to compare.</p>';
  }

  const youName = youEntry?.displayName || comparison.you.displayName;
  const themName = withEntry?.displayName || comparison.them.displayName;

  return `
    <p class="al-muted al-compare-status">
      ${escapeHtml(youName)} vs ${escapeHtml(themName)} ·
      ${comparison.bothSeen.length} shared ·
      ${comparison.onlyYou.length} only ${escapeHtml(youName)} ·
      ${comparison.onlyThem.length} only ${escapeHtml(themName)}
    </p>
    <div class="al-compare-results">
    ${renderCompareSection('Both seen', comparison.bothSeen, {
      hint: 'Movies both members have logged at least once.',
      labelFn: (movie) => compareRatingLabel(movie, youName, themName),
    })}
    ${renderCompareSection(`Only ${youName}`, comparison.onlyYou, {
      hint: `Movies in ${youName}'s log that ${themName} has not seen.`,
      labelFn: (movie) => singleRatingLabel(movie.rating),
    })}
    ${renderCompareSection(`Only ${themName}`, comparison.onlyThem, {
      hint: `Movies in ${themName}'s log that ${youName} has not seen.`,
      labelFn: (movie) => singleRatingLabel(movie.rating),
    })}
    ${renderCompareSection('Disagreed (1★+ apart)', comparison.disagreed, {
      hint: 'Shared movies where ratings differ by at least one star.',
      labelFn: (movie) => `${formatRating(movie.yourRating)} vs ${formatRating(movie.theirRating)}`,
    })}
    ${renderCompareSection('Both loved (4★+)', comparison.bothLoved, {
      hint: 'Shared movies both rated 4 stars or higher.',
      labelFn: (movie) => `${formatRating(movie.yourRating)} · ${formatRating(movie.theirRating)}`,
    })}
    </div>
  `;
}

function renderCompareSection(title, movies, { hint, labelFn }) {
  return `
    <section class="al-compare-section">
      <div class="al-compare-section-head">
        <h3>${escapeHtml(title)}</h3>
        <span class="al-compare-count">${movies.length}</span>
      </div>
      <p class="al-muted">${escapeHtml(hint)}</p>
      ${movies.length
    ? `<div class="al-poster-strip">${movies.map((movie) => renderPosterItem(movie, labelFn(movie))).join('')}</div>`
    : '<div class="al-empty">Nothing here yet.</div>'}
    </section>
  `;
}

function renderPosterItem(movie, label) {
  return `
    <div class="al-poster-strip-item">
      ${posterHtml(movie, { size: 'w154', width: 72, height: 108, className: 'al-poster al-poster--strip' })}
      <span class="al-poster-strip-label" title="${escapeHtml(movie.title)}">${escapeHtml(movie.title)}</span>
      <span class="al-poster-strip-meta">${escapeHtml(label)}</span>
    </div>
  `;
}

function wireProfileControls(main) {
  main.querySelector('#profile-sort')?.addEventListener('change', (event) => {
    sortState = { key: event.target.value, dir: 'desc' };
    renderPage(main);
  });
}

function wireCompare(main) {
  const form = main.querySelector('#al-compare-form');
  const youSelect = main.querySelector('#al-compare-you');
  const withSelect = main.querySelector('#al-compare-with');
  const submit = form?.querySelector('button[type="submit"]');

  const syncSubmit = () => {
    if (!submit) return;
    const signedIn = !!pageState.currentUserId;
    const youId = signedIn ? pageState.currentUserId : youSelect?.value;
    const withId = withSelect?.value;
    submit.disabled = !youId || !withId || youId === withId;
  };

  youSelect?.addEventListener('change', syncSubmit);
  withSelect?.addEventListener('change', syncSubmit);

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const signedIn = !!pageState.currentUserId;
    const youId = signedIn ? pageState.currentUserId : youSelect?.value;
    const withId = withSelect?.value;
    if (!youId || !withId || youId === withId) return;
    pageState.compareYouId = youId;
    pageState.compareWithId = withId;
    await loadComparison(main);
  });
}

async function loadComparison(main) {
  pageState.compareLoading = true;
  pageState.compareError = null;
  pageState.comparison = null;
  renderPage(main);

  try {
    const token = pageState.auth?.signedIn ? pageState.auth.token : undefined;
    pageState.comparison = await leaderboardApi.compare({
      token,
      youId: pageState.compareYouId,
      withUserId: pageState.compareWithId,
    });
    pageState.compareError = null;
  } catch (err) {
    pageState.comparison = null;
    pageState.compareError = err.message || 'Could not load comparison.';
  } finally {
    pageState.compareLoading = false;
    renderPage(main);
  }
}

function sortEntries(entries, key, dir) {
  const mult = dir === 'desc' ? -1 : 1;
  return [...entries].sort((a, b) => {
    const av = a[key] ?? -Infinity;
    const bv = b[key] ?? -Infinity;
    if (av === bv) return a.displayName.localeCompare(b.displayName);
    return (av > bv ? 1 : -1) * mult;
  });
}

function formatStat(entry, stat) {
  const value = entry[stat.key];
  if (stat.kind === 'money') {
    return stat.signed ? formatSignedMoney(value) : money(value);
  }
  if (stat.kind === 'rating') {
    return value != null ? `${value}★` : '—';
  }
  if (stat.key === 'avgRuntimeMin') {
    return value > 0 ? `${value} min` : '—';
  }
  return value ?? 0;
}

function compareRatingLabel(movie, youName, themName) {
  const yours = formatRating(movie.yourRating);
  const theirs = formatRating(movie.theirRating);
  if (yours === '—' && theirs === '—') return 'No ratings';
  return `${youName} ${yours} · ${themName} ${theirs}`;
}

function singleRatingLabel(rating) {
  return rating != null ? formatRating(rating) : 'No rating';
}

function formatRating(rating) {
  if (rating == null) return '—';
  return `${rating}★`;
}

function savingsClass(cents) {
  if (cents > 0) return 'is-savings';
  if (cents < 0) return 'is-cost';
  return '';
}

function formatSignedMoney(cents) {
  if (cents > 0) return `+${money(cents)}`;
  return money(cents);
}
