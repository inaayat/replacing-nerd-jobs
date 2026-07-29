import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { leaderboardApi } from './api.js';
import { money, escapeHtml } from './format.js';

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

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Leaderboard',
    subtitle: 'How every A-Lister stacks up.',
    body: `<main class="al-main" id="leaderboard-main"><p class="al-muted">Loading…</p></main>`,
  });

  const main = document.getElementById('leaderboard-main');
  const { entries = [], currentUserId } = await leaderboardApi.get(auth.token);
  renderLeaderboard(main, entries, currentUserId);
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

function renderLeaderboard(main, entries, currentUserId) {
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
            </tr>
          </thead>
          <tbody>
            ${sorted.map((entry, index) => renderRow(entry, index + 1, currentUserId)).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;

  wireSort(main, entries, currentUserId);
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

function renderRow(entry, rank, currentUserId) {
  const isYou = entry.userId === currentUserId;
  return `
    <tr class="${isYou ? 'is-you' : ''}">
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
    </tr>
  `;
}

function wireSort(main, entries, currentUserId) {
  main.querySelectorAll('[data-sort]').forEach((th) => {
    th.querySelector('.al-sort-btn')?.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortState.key === key) {
        sortState = { key, dir: sortState.dir === 'desc' ? 'asc' : 'desc' };
      } else {
        sortState = { key, dir: 'desc' };
      }
      renderLeaderboard(main, entries, currentUserId);
    });
  });
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

function savingsClass(cents) {
  if (cents > 0) return 'is-savings';
  if (cents < 0) return 'is-cost';
  return '';
}

function formatSignedMoney(cents) {
  if (cents > 0) return `+${money(cents)}`;
  return money(cents);
}
