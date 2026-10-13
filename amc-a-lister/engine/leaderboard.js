import { bootPage, renderShell, populateSidebarStats } from './nav.js';
import { loginUrl } from './auth.js';
import { leaderboardApi } from './api.js';
import { money, escapeHtml, posterHtml } from './format.js';
import { renderCompareResults } from './compare-view.js';

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
  compareWithId: null,
  comparison: null,
  compareLoading: false,
  compareError: null,
};

bootPage(async ({ root, auth }) => {
  pageState.auth = auth;
  root.innerHTML = renderShell({
    title: 'Leaderboard',
    subtitle: 'Public A-Lister ranks, recent posters, and watch logs.',
    hideLogBar: !auth.signedIn,
    signedIn: auth.signedIn,
    body: `<main class="al-main" id="leaderboard-main"><p class="al-muted">Loading…</p></main>`,
  });

  const main = document.getElementById('leaderboard-main');
  const token = auth.signedIn ? auth.token : undefined;
  const { entries = [], currentUserId = null } = await leaderboardApi.get(token);
  pageState.entries = entries;
  pageState.currentUserId = currentUserId;
  const compareParam = new URLSearchParams(location.search).get('compare')?.trim();
  if (compareParam && entries.some((entry) => entry.userId === compareParam)) {
    pageState.compareWithId = compareParam;
  }
  renderPage(main);
  if (compareParam && currentUserId) {
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
    <section class="al-panel al-board-panel">
      <div class="al-board-toolbar">
        <div>
          <p class="al-board-kicker">Public ranks</p>
          <h2 class="serif al-board-title">Leaderboard</h2>
          <p class="al-muted">Sorted by ${escapeHtml(col?.label || 'Movies seen')}.</p>
        </div>
        <div class="al-field al-board-sort-field">
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
      <ol class="al-board-list">
        ${sorted.map((entry, index) => renderBoardRow(entry, index + 1, currentUserId)).join('')}
      </ol>
    </section>
    ${renderComparePanel(entries, signedIn)}
  `;

  wireProfileControls(main);
  wireCompare(main);
}

function memberProfileUrl(userId) {
  return `/amc-a-lister/member.html?user=${encodeURIComponent(userId)}`;
}

function renderBoardRow(entry, rank, currentUserId) {
  const isYou = entry.userId === currentUserId;
  const posters = Array.isArray(entry.recentPosters) ? entry.recentPosters : [];
  const podium = rank <= 3 ? ` is-podium is-place-${rank}` : '';

  return `
    <li class="al-board-row${isYou ? ' is-you' : ''}${podium}">
      <span class="al-board-place serif" aria-label="Rank ${rank}">${rank}</span>
      <div class="al-board-identity">
        <div class="al-board-name-row">
          <a class="al-board-name serif" href="${memberProfileUrl(entry.userId)}">${escapeHtml(entry.displayName)}</a>
          ${isYou ? '<span class="al-you-badge">you</span>' : ''}
        </div>
        <div class="al-board-posters" aria-hidden="${posters.length ? 'false' : 'true'}">
          ${posters.length
            ? posters.map((movie) => posterHtml(movie, {
              size: 'w92',
              width: 40,
              height: 60,
              className: 'al-poster al-board-poster',
            })).join('')
            : '<span class="al-board-empty-posters">No movies yet</span>'}
        </div>
      </div>
      <dl class="al-board-stats">
        ${CARD_STATS.map((stat) => `
          <div>
            <dt>${escapeHtml(stat.label)}</dt>
            <dd class="${stat.kind === 'money' && stat.signed ? savingsClass(entry[stat.key]) : ''}">
              ${formatStat(entry, stat)}
            </dd>
          </div>
        `).join('')}
      </dl>
      <a class="al-board-view" href="${memberProfileUrl(entry.userId)}">View log →</a>
    </li>
  `;
}

function renderComparePanel(entries, signedIn) {
  if (entries.length < 2) {
    return `
      <section class="al-panel al-compare-panel">
        <p class="al-board-kicker">Side by side</p>
        <h2 class="serif">Compare stats</h2>
        <p class="al-muted">You need at least two accounts to compare watch logs.</p>
      </section>
    `;
  }

  // Comparison is always "you vs. one other member" now: the server takes the
  // first side from the session rather than a query param, so an anonymous
  // visitor can no longer diff two arbitrary people.
  if (!signedIn) {
    return `
      <section class="al-panel al-compare-panel">
        <p class="al-board-kicker">Side by side</p>
        <h2 class="serif">Compare stats</h2>
        <p class="al-muted">Sign in to compare your log against another member's.</p>
        <p style="margin-top:12px">
          <a class="al-btn al-btn-primary" href="${loginUrl()}">Sign in to compare</a>
        </p>
      </section>
    `;
  }

  const youId = pageState.currentUserId || '';
  const withId = pageState.compareWithId || '';
  const youEntry = entries.find((entry) => entry.userId === youId);
  const withEntry = entries.find((entry) => entry.userId === withId);
  const canCompare = !!withId && withId !== pageState.currentUserId;

  return `
    <section class="al-panel al-compare-panel" id="al-compare-panel">
      <p class="al-board-kicker">Side by side</p>
      <h2 class="serif">Compare your stats</h2>
      <p class="al-muted al-compare-lead">See shared movies, gaps, disagreements, and mutual favorites.</p>
      <form class="al-toolbar al-compare-toolbar" id="al-compare-form">
        <div class="al-field al-compare-field">
          <label for="al-compare-with">Compare with</label>
          <select class="al-input al-compare-select" id="al-compare-with" name="with">
            <option value="">Choose a member…</option>
            ${entries
    .filter((entry) => entry.userId !== pageState.currentUserId)
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
  if (!pageState.compareWithId || !pageState.currentUserId) {
    return '<p class="al-muted al-compare-status">Pick a member above to compare watch logs.</p>';
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
  return renderCompareResults(comparison, { youName, themName });
}

function wireProfileControls(main) {
  main.querySelector('#profile-sort')?.addEventListener('change', (event) => {
    sortState = { key: event.target.value, dir: 'desc' };
    renderPage(main);
  });
}

function wireCompare(main) {
  const form = main.querySelector('#al-compare-form');
  const withSelect = main.querySelector('#al-compare-with');
  const submit = form?.querySelector('button[type="submit"]');

  const syncSubmit = () => {
    if (!submit) return;
    const youId = pageState.currentUserId;
    const withId = withSelect?.value;
    submit.disabled = !youId || !withId || youId === withId;
  };

  withSelect?.addEventListener('change', syncSubmit);

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const youId = pageState.currentUserId;
    const withId = withSelect?.value;
    if (!youId || !withId || youId === withId) return;
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

function savingsClass(cents) {
  if (cents > 0) return 'is-savings';
  if (cents < 0) return 'is-cost';
  return '';
}

function formatSignedMoney(cents) {
  if (cents > 0) return `+${money(cents)}`;
  return money(cents);
}
