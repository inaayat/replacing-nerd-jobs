import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { summaryApi, watchesApi } from './api.js';
import { chargeMonth, topActorsByRating, ratingStarBucket } from './billing.js';
import { money, escapeHtml, monthLabel, shortDate } from './format.js';
import {
  buildDayStats,
  buildFormatStats,
  buildHabitStats,
  buildTheaterStats,
  buildValueStats,
} from './statistics.js';

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Stats',
    subtitle: 'Your membership value, movie taste, theaters, formats, cast, and watching habits.',
    body: `<main class="al-main al-main--insights" id="insights-main"><p class="al-muted">Loading…</p></main>`,
    signedIn: true,
  });

  const main = document.getElementById('insights-main');
  const [data, { watches }] = await Promise.all([
    summaryApi.get(auth.token),
    watchesApi.list(auth.token),
  ]);
  const { summary = {}, rewatches = [], ratings = {}, actors = [] } = data;
  const byMonth = summary.byMonth || [];
  const watchList = (watches || []).filter((watch) => watch.in_theaters !== false);
  const moviesByMonth = groupMovies(watchList, (watch) => chargeMonth(watch.watched_on));
  const moviesByRating = groupMovies(
    watchList.filter((watch) => !watch.dnf && watch.rating != null),
    (watch) => ratingStarBucket(watch.rating),
  );
  const moviesByTheater = groupMovies(watchList, (watch) => normalizeGroup(watch.location, 'Unknown theater'));
  const moviesByFormat = groupMovies(watchList, (watch) => normalizeGroup(watch.format, 'Standard'));
  const ratingBuckets = ratings.buckets || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const theaterStats = buildTheaterStats(watchList);
  const formatStats = buildFormatStats(watchList);
  const dayStats = buildDayStats(watchList);
  const habitStats = buildHabitStats(watchList);
  const valueStats = buildValueStats(summary);

  main.innerHTML = `
    <div class="al-insights-overview" aria-label="Stats overview">
      ${renderByMonthSection(byMonth, moviesByMonth)}
      ${renderRatingSection(ratings, ratingBuckets, moviesByRating, watchList)}
    </div>
    ${renderValueCategory(summary, valueStats)}
    ${renderTheaterCategory(theaterStats, moviesByTheater)}
    ${renderFormatCategory(formatStats, moviesByFormat)}
    ${renderCastCategory(actors)}
    ${renderHabitsCategory(habitStats, dayStats, rewatches)}
  `;

  wireInsightSections(main);
  wireByMonthYear(byMonth, moviesByMonth);
  requestAnimationFrame(() => {
    main.querySelectorAll('.al-meter-fill, .al-rating-bar-fill').forEach((element) => {
      element.style.width = `${element.dataset.width || '0'}%`;
    });
  });
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

function insightSection(title, body, {
  className = '',
  expanded = false,
  actions = '',
  kicker = '',
} = {}) {
  return `
    <section class="al-panel al-insight ${className} ${expanded ? 'is-expanded' : ''}">
      <div class="al-insight-header">
        <button type="button" class="al-insight-toggle" aria-expanded="${expanded ? 'true' : 'false'}">
          <span class="al-insight-chevron" aria-hidden="true"></span>
          <span class="al-insight-titles">
            ${kicker ? `<span class="al-insight-kicker">${escapeHtml(kicker)}</span>` : ''}
            <h2 class="serif">${escapeHtml(title)}</h2>
          </span>
        </button>
        ${actions}
      </div>
      <div class="al-insight-body"${expanded ? '' : ' hidden'}>${body}</div>
    </section>
  `;
}

function statCategory(id, title, description, body) {
  return `
    <section class="al-stat-category" aria-labelledby="${id}-title">
      <header class="al-stat-category-head">
        <p class="al-stat-category-kicker">By ${escapeHtml(id)}</p>
        <h2 class="serif" id="${id}-title">${escapeHtml(title)}</h2>
        <p>${escapeHtml(description)}</p>
      </header>
      ${body}
    </section>
  `;
}

function statBlock(title, body, { className = '' } = {}) {
  return `
    <article class="al-panel al-insight al-stat-block ${className}">
      <h3 class="serif">${escapeHtml(title)}</h3>
      ${body}
    </article>
  `;
}

function metricCard({ label, value, note, tone = '' }) {
  return `
    <article class="al-insights-spot${tone ? ` is-${tone}` : ''}">
      <p class="al-insights-spot-label">${escapeHtml(label)}</p>
      <p class="al-insights-spot-value serif">${escapeHtml(value)}</p>
      <p class="al-insights-spot-note">${escapeHtml(note)}</p>
    </article>
  `;
}

function renderValueCategory(summary, valueStats) {
  const bestMonth = valueStats.bestMonth;
  return statCategory(
    'value',
    'Membership value',
    'What A-List has cost, what your tickets were worth, and how often the plan came out ahead.',
    `<div class="al-insights-spotlight al-insights-spotlight--value">
      ${metricCard({
    label: 'All-time savings',
    value: summary.totalSavings != null ? formatSavings(summary.totalSavings) : '—',
    note: `${summary.totalSeen || 0} screenings`,
    tone: (summary.totalSavings || 0) >= 0 ? 'good' : 'warn',
  })}
      ${metricCard({
    label: 'Effective cost / visit',
    value: summary.totalSeen ? money(summary.costPerMovie) : '—',
    note: `${money(summary.totalBilled || 0)} billed`,
  })}
      ${metricCard({
    label: 'Avg ticket value',
    value: summary.totalSeen ? money(summary.avgTicket) : '—',
    note: `${money(summary.totalCharged || 0)} total value`,
  })}
      ${metricCard({
    label: 'Months ahead',
    value: valueStats.monthCount ? `${valueStats.positiveMonths} / ${valueStats.monthCount}` : '—',
    note: bestMonth
      ? `Best: ${monthLabel(bestMonth.month)} (${formatSavings(bestMonth.savings)})`
      : 'No billing months yet',
    tone: valueStats.positiveMonths ? 'good' : '',
  })}
    </div>`,
  );
}

function renderTheaterCategory(theaters, moviesByTheater) {
  const body = theaters.length
    ? `
      <p class="al-muted al-insight-lede">Top 10 by visits. Average ticket uses screenings with a recorded ticket price.</p>
      ${rankTable({
    headers: [
      { label: 'Theater' },
      { label: 'Visits', className: 'num' },
      { label: 'Avg ticket', className: 'num' },
      { label: 'Avg rating', className: 'num' },
      { label: 'Ticket value', className: 'num' },
    ],
    rows: theaters.slice(0, 10).map((theater, index) => `
          <tr class="al-rank-row">
            <td class="al-card-primary">
              <span class="al-card-rank">${index + 1}</span>
              <span class="al-hover-target al-hover-target--label" tabindex="0">
                ${escapeHtml(theater.location)}
                ${renderMoviesPopup(moviesByTheater.get(theater.key) || [], {
      empty: 'No films at this theater.',
      scrollable: true,
    })}
              </span>
            </td>
            <td class="num" data-label="Visits">${theater.count}</td>
            <td class="num" data-label="Avg ticket">${theater.avgTicket == null ? '—' : money(theater.avgTicket)}</td>
            <td class="num" data-label="Avg rating">${theater.avgRating == null ? '—' : `${theater.avgRating}★`}</td>
            <td class="num" data-label="Ticket value">${money(theater.charged)}</td>
          </tr>
        `),
  })}
    `
    : '<div class="al-empty">No theater data yet.</div>';

  return statCategory(
    'theater',
    'Theaters',
    'Compare where you go by frequency, ticket value, and how highly you rated the movies there.',
    statBlock('Theater scorecard', body, { className: 'al-stat-block--wide' }),
  );
}

function renderFormatCategory(formats, moviesByFormat) {
  const body = formats.length
    ? `
      <p class="al-muted al-insight-lede">See which formats fill your calendar and carry the biggest ticket value.</p>
      ${rankTable({
    headers: [
      { label: 'Format' },
      { label: 'Visits', className: 'num' },
      { label: 'Share', className: 'num' },
      { label: 'Avg ticket', className: 'num' },
      { label: 'Avg rating', className: 'num' },
    ],
    rows: formats.map((format, index) => `
          <tr class="al-rank-row">
            <td class="al-card-primary">
              <span class="al-card-rank">${index + 1}</span>
              <span class="al-hover-target al-hover-target--label" tabindex="0">
                ${escapeHtml(format.format)}
                ${renderMoviesPopup(moviesByFormat.get(format.key) || [], {
      empty: 'No films in this format.',
      scrollable: true,
    })}
              </span>
            </td>
            <td class="num" data-label="Visits">${format.count}</td>
            <td class="num" data-label="Share">${formatPercent(format.share)}</td>
            <td class="num" data-label="Avg ticket">${format.avgTicket == null ? '—' : money(format.avgTicket)}</td>
            <td class="num" data-label="Avg rating">${format.avgRating == null ? '—' : `${format.avgRating}★`}</td>
          </tr>
        `),
  })}
    `
    : '<div class="al-empty">No format data yet.</div>';

  return statCategory(
    'format',
    'Formats',
    'Standard, IMAX, Dolby, 70mm, and everything else you have logged.',
    statBlock('Format scorecard', body, { className: 'al-stat-block--wide' }),
  );
}

function renderCastCategory(actors) {
  const mostSeen = actors.length
    ? `
      <p class="al-muted al-insight-lede">Top 10 by unique films.</p>
      ${actorRankTable(actors.slice(0, 10))}
    `
    : '<div class="al-empty">No cast data yet — link movies to TMDB when logging or expand a row in your log.</div>';
  const highestRated = topActorsByRating(actors, { minRated: 2, limit: 10 });
  const bestRated = highestRated.length
    ? `
      <p class="al-muted al-insight-lede">At least two rated films per cast member.</p>
      ${actorRankTable(highestRated, { sortByRating: true })}
    `
    : '<div class="al-empty">Rate at least two films per cast member to build this list.</div>';

  return statCategory(
    'cast',
    'Cast',
    'The performers who recur most often in your log and the ones whose movies you rate highest.',
    `<div class="al-stat-category-grid">
      ${statBlock('Most seen', mostSeen)}
      ${statBlock('Best rated', bestRated)}
    </div>`,
  );
}

function renderHabitsCategory(habits, days, rewatches) {
  const runtimeValue = habits.runtimeCount ? formatRuntime(habits.totalRuntimeMin) : '—';
  const dayBody = days.length
    ? rankTable({
      headers: [
        { label: 'Day' },
        { label: 'Visits', className: 'num' },
        { label: 'Share', className: 'num' },
        { label: 'Avg rating', className: 'num' },
      ],
      rows: days.map((day, index) => `
        <tr class="al-rank-row">
          <td class="al-card-primary"><span class="al-card-rank">${index + 1}</span>${escapeHtml(day.day)}</td>
          <td class="num" data-label="Visits">${day.count}</td>
          <td class="num" data-label="Share">${formatPercent(day.share)}</td>
          <td class="num" data-label="Avg rating">${day.avgRating == null ? '—' : `${day.avgRating}★`}</td>
        </tr>
      `),
    })
    : '<div class="al-empty">No day-of-week data yet.</div>';

  return statCategory(
    'habit',
    'Watching habits',
    'When you go, who you go with, how much time you spend, and which movies bring you back.',
    `<div class="al-insights-spotlight al-insights-spotlight--habits">
      ${metricCard({
    label: 'Screen time',
    value: runtimeValue,
    note: habits.runtimeCount ? `${habits.runtimeCount} films with runtime` : 'Runtime data unavailable',
  })}
      ${metricCard({
    label: 'Solo trips',
    value: habits.total ? `${formatPercent(habits.soloShare)}` : '—',
    note: `${habits.soloCount} of ${habits.total} screenings`,
  })}
      ${metricCard({
    label: 'Weekend share',
    value: habits.total ? `${formatPercent(habits.weekendShare)}` : '—',
    note: `${habits.weekendCount} weekend screenings`,
  })}
      ${metricCard({
    label: 'Repeat screenings',
    value: habits.total ? `${formatPercent(habits.repeatShare)}` : '—',
    note: `${habits.repeatScreenings} beyond ${habits.uniqueTitles} unique titles`,
  })}
    </div>
    <div class="al-stat-category-grid">
      ${statBlock('Favorite days', dayBody)}
      ${statBlock('Rewatches', renderRewatches(rewatches))}
    </div>`,
  );
}

function renderRatingSection(ratings, ratingBuckets, moviesByRating, watches) {
  const maxCount = Math.max(1, ...[5, 4, 3, 2, 1].map((rating) => ratingBuckets[rating] || 0));
  const avgRating = averageWatchRating(watches);
  const walkoutRate = (ratings.dnf || 0) / Math.max(1, ratings.total || 0);

  return insightSection('Ratings', `
    <div class="al-rating-summary" aria-label="Rating summary">
      <div><span>Average</span><strong>${avgRating == null ? '—' : `${avgRating}★`}</strong></div>
      <div><span>Rated</span><strong>${ratings.rated || 0}</strong></div>
      <div><span>DNF</span><strong>${ratings.dnf || 0}</strong></div>
      <div><span>Walk-out rate</span><strong>${formatPercent(walkoutRate)}</strong></div>
    </div>
    <p class="al-muted al-insight-hint">
      Ratings round down to whole-star groups.
      <span class="al-hint-hover">Hover a row to see films.</span>
      <span class="al-hint-touch">Tap a row to see films.</span>
    </p>
    <div class="al-rating-bars" role="list">
      ${[5, 4, 3, 2, 1].map((rating) => {
    const count = ratingBuckets[rating] || 0;
    const width = Math.round((count / maxCount) * 100);
    return `
          <div class="al-rating-bar-row al-hover-target" tabindex="0" role="listitem">
            <span class="al-rating-bar-label">${rating}★</span>
            <div class="al-rating-bar-track" aria-hidden="true">
              <i class="al-rating-bar-fill" data-width="${width}" style="width:0%"></i>
            </div>
            <span class="al-rating-bar-count">${count}</span>
            ${renderMoviesPopup(moviesByRating.get(rating) || [], {
      empty: 'No films at this rating.',
      scrollable: true,
    })}
          </div>
        `;
  }).join('')}
    </div>
  `, { className: 'al-insight--rating', expanded: true, kicker: 'Top summary' });
}

function renderByMonthSection(byMonth, moviesByMonth) {
  const rows = byMonth || [];
  if (!rows.length) {
    return insightSection('By month', `
      <div class="al-empty">No monthly data yet — log a screening to get started.</div>
    `, { className: 'al-by-month', expanded: true, kicker: 'Top summary' });
  }

  const years = [...new Set(rows.map((row) => row.month.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const yearFilter = years.length > 1
    ? `
      <select class="al-select al-by-month-year" id="by-month-year" aria-label="Filter by year">
        <option value="">All years</option>
        ${years.map((year) => `<option value="${year}">${year}</option>`).join('')}
      </select>
    `
    : '';

  return insightSection('By month', `
    <div class="al-by-month-controls">
      <p class="al-muted al-by-month-hint">
        <span class="al-hint-hover">Hover a month to see what you watched.</span>
        <span class="al-hint-touch">Tap a month to see what you watched.</span>
      </p>
      ${yearFilter}
    </div>
    <div id="by-month-table">${renderMonthTable(rows, moviesByMonth)}</div>
  `, { className: 'al-by-month', expanded: true, kicker: 'Top summary' });
}

function renderRewatches(rewatches) {
  if (!rewatches.length) return '<div class="al-empty">No rewatches logged yet.</div>';
  return `
    <div class="al-table-wrap al-table-wrap--cards">
      <table class="al-table al-card-table al-rewatch-table">
        <thead><tr><th>Title</th><th class="num">Times</th><th>Dates</th></tr></thead>
        <tbody>
          ${rewatches.map((rewatch) => `
            <tr>
              <td class="al-card-primary">${escapeHtml(rewatch.title)}</td>
              <td class="num" data-label="Times">${rewatch.count}</td>
              <td class="al-muted al-card-span" data-label="Dates">${rewatch.dates.map((date) => escapeHtml(shortDate(date))).join(', ')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function actorRankTable(actors, { sortByRating = false } = {}) {
  const ratingLabel = sortByRating ? 'Avg rating' : 'Avg';
  return rankTable({
    headers: [
      { label: 'Actor' },
      { label: 'Films', className: 'num' },
      { label: ratingLabel, className: 'num' },
    ],
    rows: actors.map((actor, index) => `
      <tr class="al-rank-row">
        <td class="al-card-primary">
          <span class="al-card-rank">${index + 1}</span>
          <span class="al-hover-target al-hover-target--label" tabindex="0">
            ${escapeHtml(actor.actor)}
            ${renderMoviesPopup(actor.films, { empty: 'No films found.' })}
          </span>
        </td>
        <td class="num" data-label="Films">${actor.count}</td>
        <td class="num" data-label="${escapeHtml(ratingLabel)}">${actor.avgRating == null ? '—' : `${actor.avgRating}★`}</td>
      </tr>
    `),
  });
}

function rankTable({ headers, rows }) {
  return `
    <div class="al-table-wrap al-table-wrap--cards">
      <table class="al-table al-rank-table al-card-table">
        <thead>
          <tr>${headers.map((header) => `<th${header.className ? ` class="${header.className}"` : ''}>${header.label}</th>`).join('')}</tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
  `;
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
    <div class="al-table-wrap al-table-wrap--month">
      <table class="al-table al-month-table">
        <thead>
          <tr>
            <th>Month</th>
            <th class="num" title="Watched"><span class="al-th-full">Watched</span><span class="al-th-short">#</span></th>
            <th class="num">Charged</th>
            <th class="num">Billed</th>
            <th class="num">Savings</th>
          </tr>
        </thead>
        <tbody>
          ${byMonth.map((row) => renderMonthRow(row, moviesByMonth.get(row.month) || [])).join('')}
        </tbody>
        <tfoot>
          <tr class="al-month-total">
            <th scope="row">Total</th>
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

function renderMoviesPopup(items, { empty = 'No movies.', scrollable = false } = {}) {
  const popupClass = `al-hover-popup${scrollable ? ' al-hover-popup--scroll' : ''}`;
  if (!items.length) return `<span class="${popupClass}" role="tooltip">${escapeHtml(empty)}</span>`;
  return `
    <span class="${popupClass}" role="tooltip">
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

function groupMovies(watches, keyFor) {
  const map = new Map();
  for (const watch of watches) {
    const key = keyFor(watch);
    if (key == null) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ title: watch.title, watched_on: watch.watched_on });
  }
  for (const movies of map.values()) {
    movies.sort((a, b) => b.watched_on.localeCompare(a.watched_on));
  }
  return map;
}

function wireByMonthYear(byMonth, moviesByMonth) {
  const select = document.getElementById('by-month-year');
  const target = document.getElementById('by-month-table');
  if (!select || !target) return;
  select.addEventListener('change', () => {
    const rows = select.value
      ? byMonth.filter((row) => row.month.startsWith(select.value))
      : byMonth;
    target.innerHTML = rows.length
      ? renderMonthTable(rows, moviesByMonth)
      : '<div class="al-empty">No months in that year.</div>';
  });
}

function wireInsightSections(root) {
  root.querySelectorAll('.al-insight-toggle').forEach((button) => {
    const section = button.closest('.al-insight');
    const body = section?.querySelector('.al-insight-body');
    if (!section || !body) return;
    button.addEventListener('click', () => {
      const open = section.classList.toggle('is-expanded');
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      body.hidden = !open;
    });
  });
}

function averageWatchRating(watches) {
  const rated = watches.filter((watch) => !watch.dnf && watch.rating != null);
  if (!rated.length) return null;
  const sum = rated.reduce((total, watch) => total + Number(watch.rating), 0);
  return Math.round((sum / rated.length) * 10) / 10;
}

function normalizeGroup(value, fallback) {
  return (String(value || '').trim() || fallback).toLowerCase().replace(/\s+/g, ' ');
}

function formatRuntime(minutes) {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
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
