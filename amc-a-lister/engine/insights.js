import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { summaryApi, watchesApi } from './api.js';
import { chargeMonth, topActorsByRating } from './billing.js';
import { money, escapeHtml, monthLabel, shortDate } from './format.js';

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Insights',
    subtitle: 'Data the spreadsheet never surfaced.',
    body: `<main class="al-main" id="insights-main"><p class="al-muted">Loading…</p></main>`,
  });

  const main = document.getElementById('insights-main');
  const [data, { watches }] = await Promise.all([
    summaryApi.get(auth.token),
    watchesApi.list(auth.token),
  ]);
  const { summary = {}, theaters = [], formats = [], rewatches = [], ratings = {}, actors = [] } = data;
  const byMonth = summary.byMonth || [];
  const moviesByMonth = groupMoviesByMonth(watches || []);
  const ratingBuckets = ratings.buckets || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  main.innerHTML = `
    ${renderByMonthSection(byMonth, moviesByMonth)}
    <div class="al-insight-grid">
      ${renderByActorSection(actors)}
      ${renderInsightGrid(theaters, formats, ratings, ratingBuckets)}
    </div>
    ${renderRewatchesSection(rewatches)}
  `;

  wireInsightSections(main);
  const byActorSection = main.querySelector('.al-by-actor');
  if (byActorSection) wireSegmentToggle(byActorSection);
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

function insightSection(title, body, { className = '', expanded = false, actions = '' } = {}) {
  return `
    <section class="al-panel al-insight ${className} ${expanded ? 'is-expanded' : ''}">
      <div class="al-insight-header">
        <button type="button" class="al-insight-toggle" aria-expanded="${expanded ? 'true' : 'false'}">
          <span class="al-insight-chevron" aria-hidden="true"></span>
          <h2 class="serif">${escapeHtml(title)}</h2>
        </button>
        ${actions}
      </div>
      <div class="al-insight-body"${expanded ? '' : ' hidden'}>${body}</div>
    </section>
  `;
}

function renderInsightGrid(theaters, formats, ratings, ratingBuckets) {
  return `
    ${insightSection('Rating profile', `
      <p class="al-muted">${ratings.rated || 0} rated · ${ratings.dnf || 0} DNF · ${((ratings.dnf || 0) / Math.max(1, ratings.total || 0) * 100).toFixed(0)}% walk-out rate</p>
      ${rankTable({
    headers: [
      { label: 'Rating' },
      { label: 'Count', className: 'num' },
    ],
    rows: [5, 4, 3, 2, 1].map((n) => `
          <tr>
            <td>${n}★</td>
            <td class="num">${ratingBuckets[n] || 0}</td>
          </tr>
        `),
  })}
    `)}
    ${insightSection('Theater ranking', theaters.length
    ? rankTable({
      headers: [
        { label: '#', className: 'num' },
        { label: 'Theater' },
        { label: 'Visits', className: 'num' },
        { label: 'Charged', className: 'num' },
      ],
      rows: theaters.slice(0, 6).map((t, i) => `
          <tr>
            <td class="num al-rank-num">${i + 1}</td>
            <td>${escapeHtml(t.location)}</td>
            <td class="num">${t.count}</td>
            <td class="num">${money(t.charged)}</td>
          </tr>
        `),
    })
    : '<div class="al-empty">No theater data yet.</div>')}
    ${insightSection('Format premiums', formats.length
    ? rankTable({
      headers: [
        { label: 'Format' },
        { label: 'Visits', className: 'num' },
        { label: 'Charged', className: 'num' },
      ],
      rows: formats.map((f) => `
          <tr>
            <td>${escapeHtml(f.format)}</td>
            <td class="num">${f.count}</td>
            <td class="num">${money(f.charged)}</td>
          </tr>
        `),
    })
    : '<div class="al-empty">No format data yet.</div>')}
  `;
}

function renderByActorSection(actors) {
  if (!actors.length) {
    return insightSection('By actor', `
      <div class="al-empty">No actor data yet — link movies to TMDB when logging or expand a row in your log.</div>
    `, { className: 'al-by-actor' });
  }

  const mostSeen = actors.slice(0, 10);
  const highestRated = topActorsByRating(actors, { minRated: 2, limit: 10 });
  const segment = `
    <div class="al-segment al-insight-actions" role="tablist" aria-label="By actor view">
      <button type="button" class="al-segment-btn is-active" role="tab" aria-selected="true" data-view="most">Most seen</button>
      <button type="button" class="al-segment-btn" role="tab" aria-selected="false" data-view="rated">Highest rated</button>
    </div>
  `;

  return insightSection('By actor', `
    <p class="al-muted al-by-actor-hint">Top 10 unique films per actor. Hover a name to see titles.</p>
    <div class="al-view-panel" data-panel="most">
      ${actorRankTable(mostSeen)}
    </div>
    <div class="al-view-panel is-hidden" data-panel="rated" hidden>
      ${highestRated.length
    ? actorRankTable(highestRated, { sortByRating: true })
    : '<div class="al-empty">Rate at least two films per actor to rank them here.</div>'}
    </div>
  `, { className: 'al-by-actor', actions: segment });
}

function renderRewatchesSection(rewatches) {
  return insightSection('Rewatches', rewatches.length
    ? `<div class="al-table-wrap"><table class="al-table"><thead><tr><th>Title</th><th class="num">Times</th><th>Dates</th></tr></thead><tbody>
        ${rewatches.map((r) => `
          <tr>
            <td>${escapeHtml(r.title)}</td>
            <td class="num">${r.count}</td>
            <td class="al-muted">${r.dates.map((d) => d.slice(5)).join(', ')}</td>
          </tr>
        `).join('')}
      </tbody></table></div>`
    : '<div class="al-empty">No rewatches logged yet.</div>');
}

function renderByMonthSection(byMonth, moviesByMonth) {
  const rows = byMonth || [];
  if (!rows.length) {
    return insightSection('By month', `
      <div class="al-empty">No monthly data yet — log a screening to get started.</div>
    `, { className: 'al-by-month' });
  }

  return insightSection('By month', `
    <p class="al-muted al-by-month-hint">
      <span class="al-hint-hover">Hover a month to see what you watched.</span>
      <span class="al-hint-touch">Tap a month to see what you watched.</span>
    </p>
    ${renderMonthTable(rows, moviesByMonth)}
  `, { className: 'al-by-month' });
}

function wireInsightSections(root) {
  root.querySelectorAll('.al-insight').forEach((section) => {
    const btn = section.querySelector('.al-insight-toggle');
    const body = section.querySelector('.al-insight-body');
    if (!btn || !body) return;

    btn.addEventListener('click', () => {
      const open = section.classList.toggle('is-expanded');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      body.hidden = !open;
    });
  });
}

function actorRankTable(actors, { sortByRating = false } = {}) {
  return rankTable({
    headers: [
      { label: '#', className: 'num' },
      { label: 'Actor' },
      { label: 'Films', className: 'num' },
      { label: sortByRating ? 'Avg rating' : 'Avg', className: 'num' },
    ],
    rows: actors.map((actor, i) => `
      <tr>
        <td class="num al-rank-num">${i + 1}</td>
        <td>
          <span class="al-hover-target al-hover-target--label" tabindex="0">
            ${escapeHtml(actor.actor)}
            ${renderMoviesPopup(actor.films, { empty: 'No films found.' })}
          </span>
        </td>
        <td class="num">${actor.count}</td>
        <td class="num">${actor.avgRating != null ? `${actor.avgRating}★` : '—'}</td>
      </tr>
    `),
  });
}

function rankTable({ headers, rows }) {
  return `
    <div class="al-table-wrap">
      <table class="al-table al-rank-table">
        <thead>
          <tr>
            ${headers.map((header) => `
              <th${header.className ? ` class="${header.className}"` : ''}>${header.label}</th>
            `).join('')}
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
  `;
}

function wireSegmentToggle(section) {
  const buttons = [...section.querySelectorAll('[data-view]')];
  const panels = [...section.querySelectorAll('[data-panel]')];

  buttons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const view = btn.dataset.view;
      buttons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panels.forEach((panel) => {
        const show = panel.dataset.panel === view;
        panel.classList.toggle('is-hidden', !show);
        panel.hidden = !show;
      });
    });
  });
}

function groupMoviesByMonth(watches) {
  const map = new Map();
  for (const watch of watches) {
    const month = chargeMonth(watch.watched_on);
    if (!map.has(month)) map.set(month, []);
    map.get(month).push({
      title: watch.title,
      watched_on: watch.watched_on,
    });
  }
  for (const movies of map.values()) {
    movies.sort((a, b) => b.watched_on.localeCompare(a.watched_on));
  }
  return map;
}

function renderMonthTable(byMonth, moviesByMonth) {
  const totals = byMonth.reduce(
    (acc, row) => ({
      movies: acc.movies + row.movies,
      charged: acc.charged + row.charged,
      bill: acc.bill + row.bill,
      savings: acc.savings + row.savings,
    }),
    { movies: 0, charged: 0, bill: 0, savings: 0 },
  );

  return `
    <div class="al-table-wrap">
      <table class="al-table al-month-table">
        <thead>
          <tr>
            <th>Month</th>
            <th class="num">Watched</th>
            <th class="num">Charged</th>
            <th class="num">Billed</th>
            <th class="num">Savings</th>
          </tr>
        </thead>
        <tbody>
          ${byMonth.map((row) => renderMonthRow(row, moviesByMonth.get(row.month) || [])).join('')}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            <th class="num">${totals.movies}</th>
            <th class="num">${money(totals.charged)}</th>
            <th class="num">${money(totals.bill)}</th>
            <th class="num ${savingsClass(totals.savings)}">${formatSavings(totals.savings)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderMonthRow(row, movies) {
  return `
    <tr class="al-month-row al-hover-target" tabindex="0">
      <td>
        ${escapeHtml(monthLabel(row.month))}
        ${renderMoviesPopup(movies, { empty: 'No movies this month.' })}
      </td>
      <td class="num">${row.movies}</td>
      <td class="num">${money(row.charged)}</td>
      <td class="num">${money(row.bill)}</td>
      <td class="num ${savingsClass(row.savings)}">${formatSavings(row.savings)}</td>
    </tr>
  `;
}

function renderMoviesPopup(items, { empty = 'No movies.' } = {}) {
  if (!items.length) {
    return `<span class="al-hover-popup" role="tooltip">${escapeHtml(empty)}</span>`;
  }

  return `
    <span class="al-hover-popup" role="tooltip">
      <span class="al-hover-popup-title">Movies</span>
      <ul class="al-hover-popup-list">
        ${items.map((item) => `
          <li>
            <span class="al-hover-popup-item-title">${escapeHtml(item.title)}</span>
            <span class="al-hover-popup-item-date">${escapeHtml(shortDate(item.watched_on))}</span>
          </li>
        `).join('')}
      </ul>
    </span>
  `;
}

function savingsClass(cents) {
  if (cents > 0) return 'is-savings';
  if (cents < 0) return 'is-cost';
  return '';
}

function formatSavings(cents) {
  if (cents > 0) return `+${money(cents)}`;
  return money(cents);
}
