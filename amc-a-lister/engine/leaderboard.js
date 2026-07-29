import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { leaderboardApi } from './api.js';
import { money, escapeHtml, posterHtml } from './format.js';

const SORT_COLUMNS = [
  { key: 'totalSeen', label: 'Seen', kind: 'count' },
  { key: 'totalSavings', label: 'Savings', kind: 'money', signed: true },
  { key: 'totalCharged', label: 'Charged', kind: 'money' },
  { key: 'totalBilled', label: 'Billed', kind: 'money' },
  { key: 'costPerMovie', label: 'Cost / movie', kind: 'money' },
  { key: 'avgTicket', label: 'Avg ticket', kind: 'money' },
  { key: 'avgRuntimeMin', label: 'Avg runtime', kind: 'runtime' },
  { key: 'avgRating', label: 'Avg rating', kind: 'rating' },
  { key: 'periodMovies', label: 'This month', kind: 'count' },
  { key: 'periodSavings', label: 'Month net', kind: 'money', signed: true },
];

let sortState = { key: 'totalSeen', dir: 'desc' };
let pageState = {
  auth: null,
  entries: [],
  currentUserId: null,
  compareUserId: null,
  comparison: null,
  compareLoading: false,
  compareError: null,
};

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  pageState.auth = auth;
  root.innerHTML = renderShell({
    title: 'Leaderboard',
    subtitle: 'How every A-Lister stacks up.',
    body: `<main class="al-main" id="leaderboard-main"><p class="al-muted">Loading…</p></main>`,
  });

  const main = document.getElementById('leaderboard-main');
  const { entries = [], currentUserId } = await leaderboardApi.get(auth.token);
  pageState.entries = entries;
  pageState.currentUserId = currentUserId;
  renderPage(main);
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

function renderPage(main) {
  const { entries, currentUserId } = pageState;
  if (!entries.length) {
    main.innerHTML = `
      <section class="al-panel">
        <div class="al-empty">No accounts yet — sign in to start the leaderboard.</div>
      </section>
    `;
    return;
  }

  const sorted = sortEntries(entries, sortState.key, sortState.dir);
  const col = SORT_COLUMNS.find((c) => c.key === sortState.key);
  const others = entries.filter((entry) => entry.userId !== currentUserId);

  main.innerHTML = `
    <section class="al-panel al-leaderboard">
      <p class="al-muted">Stats for everyone with an account. Sorted by ${escapeHtml(col?.label || 'Seen')}.</p>
      <div class="al-table-wrap">
        <table class="al-table al-leaderboard-table">
          <thead>
            <tr>
              <th class="num al-leaderboard-rank">#</th>
              <th>Member</th>
              ${SORT_COLUMNS.map((c) => sortHeader(c)).join('')}
              <th class="al-leaderboard-actions">Compare</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((entry, index) => renderRow(entry, index + 1, currentUserId)).join('')}
          </tbody>
        </table>
      </div>
    </section>
    ${renderComparePanel(others, currentUserId)}
  `;

  wireSort(main);
  wireCompare(main, others);
}

function renderComparePanel(others, currentUserId) {
  if (!others.length) {
    return `
      <section class="al-panel al-compare-panel">
        <h2>Compare your stats</h2>
        <p class="al-muted">You need at least one other account to compare watch logs.</p>
      </section>
    `;
  }

  const selected = pageState.compareUserId || '';
  const them = others.find((entry) => entry.userId === selected);

  return `
    <section class="al-panel al-compare-panel" id="al-compare-panel">
      <h2>Compare your stats</h2>
      <p class="al-muted al-compare-lead">See shared movies, gaps, disagreements, and mutual favorites.</p>
      <form class="al-toolbar al-compare-toolbar" id="al-compare-form">
        <div class="al-field al-compare-field">
          <label for="al-compare-select">Compare with</label>
          <select class="al-input al-compare-select" id="al-compare-select" name="with">
            <option value="">Choose a member…</option>
            ${others.map((entry) => `
              <option value="${escapeHtml(entry.userId)}"${entry.userId === selected ? ' selected' : ''}>
                ${escapeHtml(entry.displayName)}
              </option>
            `).join('')}
          </select>
        </div>
        <button type="submit" class="al-btn al-btn-primary" ${selected ? '' : 'disabled'}>Compare</button>
      </form>
      ${renderCompareBody(them)}
    </section>
  `;
}

function renderCompareBody(them) {
  if (!pageState.compareUserId) {
    return '<p class="al-muted al-compare-status">Pick someone from the table or dropdown to compare watch logs.</p>';
  }

  if (pageState.compareLoading) {
    return '<p class="al-muted al-compare-status">Loading comparison…</p>';
  }

  if (pageState.compareError) {
    return `<p class="al-error al-compare-status">${escapeHtml(pageState.compareError)}</p>`;
  }

  const comparison = pageState.comparison;
  if (!comparison) {
    return '<p class="al-muted al-compare-status">Pick someone to compare.</p>';
  }

  const themName = them?.displayName || comparison.them.displayName;

  return `
    <p class="al-muted al-compare-status">
      You vs ${escapeHtml(themName)} ·
      ${comparison.bothSeen.length} shared ·
      ${comparison.onlyYou.length} only you ·
      ${comparison.onlyThem.length} only them
    </p>
    <div class="al-compare-results">
    ${renderCompareSection('Both seen', comparison.bothSeen, {
      hint: 'Movies you have both logged at least once.',
      labelFn: (movie) => compareRatingLabel(movie),
    })}
    ${renderCompareSection(`Only you${themName ? ` (not ${escapeHtml(themName)})` : ''}`, comparison.onlyYou, {
      hint: 'Movies in your log that they have not seen.',
      labelFn: (movie) => singleRatingLabel(movie.rating),
    })}
    ${renderCompareSection(`Only ${escapeHtml(themName)} (not you)`, comparison.onlyThem, {
      hint: 'Movies in their log that you have not seen.',
      labelFn: (movie) => singleRatingLabel(movie.rating),
    })}
    ${renderCompareSection('Disagreed (1★+ apart)', comparison.disagreed, {
      hint: 'Shared movies where your ratings differ by at least one star.',
      labelFn: (movie) => `${formatRating(movie.yourRating)} vs ${formatRating(movie.theirRating)}`,
    })}
    ${renderCompareSection('Both loved (4★+)', comparison.bothLoved, {
      hint: 'Shared movies you both rated 4 stars or higher.',
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

function renderRow(entry, rank, currentUserId) {
  const isYou = entry.userId === currentUserId;
  const isSelected = entry.userId === pageState.compareUserId;
  return `
    <tr class="${isYou ? 'is-you' : ''}${isSelected ? ' is-compare-target' : ''}">
      <td class="num al-leaderboard-rank">${rank}</td>
      <td class="al-leaderboard-name">
        ${escapeHtml(entry.displayName)}${isYou ? ' <span class="al-you-badge">you</span>' : ''}
      </td>
      <td class="num">${entry.totalSeen}</td>
      <td class="num ${savingsClass(entry.totalSavings)}">${formatSignedMoney(entry.totalSavings)}</td>
      <td class="num">${money(entry.totalCharged)}</td>
      <td class="num">${money(entry.totalBilled)}</td>
      <td class="num">${money(entry.costPerMovie)}</td>
      <td class="num">${money(entry.avgTicket)}</td>
      <td class="num">${entry.avgRuntimeMin > 0 ? `${entry.avgRuntimeMin} min` : '—'}</td>
      <td class="num">${entry.avgRating != null ? `${entry.avgRating}★` : '—'}</td>
      <td class="num">${entry.periodMovies}</td>
      <td class="num ${savingsClass(entry.periodSavings)}">${formatSignedMoney(entry.periodSavings)}</td>
      <td class="al-leaderboard-actions">
        ${isYou
    ? '<span class="al-muted">—</span>'
    : `<button type="button" class="al-btn al-compare-row-btn" data-compare-with="${escapeHtml(entry.userId)}">Compare</button>`}
      </td>
    </tr>
  `;
}

function wireSort(main) {
  main.querySelectorAll('[data-sort]').forEach((th) => {
    th.querySelector('.al-sort-btn')?.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortState.key === key) {
        sortState = { key, dir: sortState.dir === 'desc' ? 'asc' : 'desc' };
      } else {
        sortState = { key, dir: 'desc' };
      }
      renderPage(main);
    });
  });
}

function wireCompare(main, others) {
  const form = main.querySelector('#al-compare-form');
  const select = main.querySelector('#al-compare-select');

  select?.addEventListener('change', () => {
    const submit = form?.querySelector('button[type="submit"]');
    if (submit) submit.disabled = !select.value;
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const userId = select?.value;
    if (!userId) return;
    await loadComparison(main, userId);
  });

  main.querySelectorAll('[data-compare-with]').forEach((button) => {
    button.addEventListener('click', async () => {
      const userId = button.dataset.compareWith;
      if (!userId) return;
      pageState.compareUserId = userId;
      renderPage(main);
      const nextSelect = main.querySelector('#al-compare-select');
      if (nextSelect) nextSelect.value = userId;
      await loadComparison(main, userId);
      document.getElementById('al-compare-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

async function loadComparison(main, userId) {
  pageState.compareUserId = userId;
  pageState.compareLoading = true;
  pageState.compareError = null;
  pageState.comparison = null;
  renderPage(main);

  try {
    pageState.comparison = await leaderboardApi.compare(pageState.auth.token, userId);
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

function sortHeader(column) {
  const active = sortState.key === column.key;
  const arrow = active ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : '';
  return `
    <th class="num al-sortable${active ? ' is-active' : ''}" data-sort="${column.key}" scope="col">
      <button type="button" class="al-sort-btn">${escapeHtml(column.label)}${arrow}</button>
    </th>
  `;
}

function compareRatingLabel(movie) {
  const yours = formatRating(movie.yourRating);
  const theirs = formatRating(movie.theirRating);
  if (yours === '—' && theirs === '—') return 'No ratings';
  return `You ${yours} · Them ${theirs}`;
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
