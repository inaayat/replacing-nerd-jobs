import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { summaryApi, watchesApi } from './api.js';
import { chargeMonth, topActorsByRating, topTheatersByRating, ratingStarBucket, isExcludedTheaterLocation } from './billing.js';
import { money, escapeHtml, monthLabel, shortDate } from './format.js';

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Statistics',
    subtitle: 'Where you watch, what you reward, and whether A-List is earning its keep.',
    body: `<main class="al-main al-main--insights" id="insights-main"><p class="al-muted">Loading…</p></main>`,
    signedIn: true,
  });

  const main = document.getElementById('insights-main');
  const [data, { watches }] = await Promise.all([
    summaryApi.get(auth.token),
    watchesApi.list(auth.token),
  ]);
  const { summary = {}, theaters = [], formats = [], rewatches = [], ratings = {}, actors = [] } = data;
  const byMonth = summary.byMonth || [];
  const watchList = (watches || []).filter((w) => w.in_theaters !== false);
  const moviesByMonth = groupMoviesByMonth(watchList);
  const moviesByRating = groupMoviesByRating(watchList);
  const moviesByTheater = groupMoviesByTheater(watchList);
  const ratingBuckets = ratings.buckets || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const theatersByRating = topTheatersByRating(theaters, { minRated: 2, limit: 8 });

  main.innerHTML = `
    ${renderSpotlight({ summary, ratings, theaters, theatersByRating })}
    ${renderByMonthSection(byMonth, moviesByMonth)}
    <div class="al-insight-grid">
      ${renderRatingProfileSection(ratings, ratingBuckets, moviesByRating)}
      ${renderTheaterRatingSection(theatersByRating, moviesByTheater)}
      ${renderTheaterRankingSection(theaters, moviesByTheater)}
      ${renderFormatPremiumsSection(formats)}
      ${renderActorsMostSeenSection(actors)}
      ${renderActorsBestRatedSection(actors)}
    </div>
    ${renderRewatchesSection(rewatches)}
  `;

  wireInsightSections(main);
  requestAnimationFrame(() => {
    main.querySelectorAll('.al-meter-fill, .al-rating-bar-fill').forEach((el) => {
      const width = el.dataset.width || '0';
      el.style.width = `${width}%`;
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

function renderSpotlight({ summary, ratings, theaters, theatersByRating }) {
  const avgRating = averageWatchRating(ratings);
  const walkout = ratings.total
    ? Math.round(((ratings.dnf || 0) / ratings.total) * 100)
    : 0;
  const topVisited = theaters[0] || null;
  const topRated = theatersByRating[0] || null;

  return `
    <section class="al-insights-spotlight" aria-label="Statistics highlights">
      ${spotlightCard({
    label: 'Avg rating',
    value: avgRating != null ? `${avgRating}★` : '—',
    note: `${ratings.rated || 0} rated films`,
  })}
      ${spotlightCard({
    label: 'Walk-out rate',
    value: `${walkout}%`,
    note: `${ratings.dnf || 0} DNF`,
    tone: walkout >= 15 ? 'warn' : '',
  })}
      ${spotlightCard({
    label: 'Top theater',
    value: topVisited ? shortTheaterName(topVisited.location) : '—',
    note: topVisited ? `${topVisited.count} visits` : 'No visits yet',
  })}
      ${spotlightCard({
    label: 'Highest rated house',
    value: topRated ? shortTheaterName(topRated.location) : '—',
    note: topRated ? `${topRated.avgRating}★ · ${topRated.ratedCount} rated` : 'Need 2+ ratings',
    tone: 'accent',
  })}
      ${spotlightCard({
    label: 'All-time savings',
    value: summary.totalSavings != null ? formatSavings(summary.totalSavings) : '—',
    note: summary.totalSeen ? `${summary.totalSeen} screenings` : 'No screenings yet',
    tone: (summary.totalSavings || 0) >= 0 ? 'good' : 'warn',
  })}
    </section>
  `;
}

function spotlightCard({ label, value, note, tone = '' }) {
  return `
    <article class="al-insights-spot${tone ? ` is-${tone}` : ''}">
      <p class="al-insights-spot-label">${escapeHtml(label)}</p>
      <p class="al-insights-spot-value serif">${escapeHtml(value)}</p>
      <p class="al-insights-spot-note">${escapeHtml(note)}</p>
    </article>
  `;
}

function renderRatingProfileSection(ratings, ratingBuckets, moviesByRating) {
  const maxCount = Math.max(1, ...[5, 4, 3, 2, 1].map((n) => ratingBuckets[n] || 0));

  return insightSection('Rating profile', `
    <p class="al-muted al-insight-lede">
      ${ratings.rated || 0} rated · ${ratings.dnf || 0} DNF ·
      ${((ratings.dnf || 0) / Math.max(1, ratings.total || 0) * 100).toFixed(0)}% walk-out rate
    </p>
    <p class="al-muted al-insight-hint">
      Ratings round down to whole stars (4.5 counts as 4★).
      <span class="al-hint-hover">Hover a rating to see films.</span>
      <span class="al-hint-touch">Tap a rating to see films.</span>
    </p>
    <div class="al-rating-bars" role="list">
      ${[5, 4, 3, 2, 1].map((n) => {
    const count = ratingBuckets[n] || 0;
    const pct = Math.round((count / maxCount) * 100);
    return `
          <div class="al-rating-bar-row al-hover-target" tabindex="0" role="listitem">
            <span class="al-rating-bar-label">${n}★</span>
            <div class="al-rating-bar-track" aria-hidden="true">
              <i class="al-rating-bar-fill" data-width="${pct}" style="width:0%"></i>
            </div>
            <span class="al-rating-bar-count">${count}</span>
            ${renderMoviesPopup(moviesByRating.get(n) || [], { empty: 'No films at this rating.', scrollable: true })}
          </div>
        `;
  }).join('')}
    </div>
  `, { className: 'al-insight--rating', expanded: true, kicker: 'Taste' });
}

function renderTheaterRatingSection(theatersByRating, moviesByTheater) {
  if (!theatersByRating.length) {
    return insightSection('Avg rating by theater', `
      <div class="al-empty">Rate at least two films at a theater to rank houses here.</div>
    `, { className: 'al-insight--theater-rating', expanded: true, kicker: 'Venues' });
  }

  return insightSection('Avg rating by theater', `
    <p class="al-muted al-insight-lede">
      Sorted by average personal rating. Needs at least 2 rated films per theater.
    </p>
    <p class="al-muted al-insight-hint">
      <span class="al-hint-hover">Hover a theater to see films.</span>
      <span class="al-hint-touch">Tap a theater to see films.</span>
    </p>
    <ol class="al-theater-rating-list">
      ${theatersByRating.map((theater, i) => {
    const width = Math.max(8, Math.round((theater.avgRating / 5) * 100));
    return `
          <li class="al-theater-rating-row">
            <span class="al-theater-rating-rank">${i + 1}</span>
            <div class="al-theater-rating-body">
              <div class="al-theater-rating-top">
                <span class="al-hover-target al-hover-target--label" tabindex="0">
                  ${escapeHtml(theater.location)}
                  ${renderMoviesPopup(moviesByTheater.get(theater.location) || [], {
      empty: 'No films at this theater.',
      scrollable: true,
    })}
                </span>
                <span class="al-theater-rating-score">${theater.avgRating}★</span>
              </div>
              <div class="al-theater-rating-meta al-muted">
                ${theater.ratedCount} rated · ${theater.count} visit${theater.count === 1 ? '' : 's'}
              </div>
              <div class="al-meter al-meter--theater" aria-hidden="true">
                <span class="al-meter-fill" data-width="${width}" style="width:0%"></span>
              </div>
            </div>
          </li>
        `;
  }).join('')}
    </ol>
  `, { className: 'al-insight--theater-rating', expanded: true, kicker: 'Venues' });
}

function renderTheaterRankingSection(theaters, moviesByTheater) {
  return insightSection('Most visited', theaters.length
    ? `
      <p class="al-muted al-insight-hint">
        <span class="al-hint-hover">Hover a theater to see films.</span>
        <span class="al-hint-touch">Tap a theater to see films.</span>
      </p>
      ${rankTable({
      headers: [
        { label: 'Theater' },
        { label: 'Visits', className: 'num' },
        { label: 'Avg', className: 'num' },
        { label: 'Charged', className: 'num' },
      ],
      rows: theaters.slice(0, 6).map((t, i) => `
          <tr class="al-rank-row">
            <td class="al-card-primary">
              <span class="al-card-rank">${i + 1}</span>
              <span class="al-hover-target al-hover-target--label" tabindex="0">
                ${escapeHtml(t.location)}
                ${renderMoviesPopup(moviesByTheater.get(t.location) || [], { empty: 'No films at this theater.', scrollable: true })}
              </span>
            </td>
            <td class="num" data-label="Visits">${t.count}</td>
            <td class="num" data-label="Avg">${t.avgRating != null ? `${t.avgRating}★` : '—'}</td>
            <td class="num" data-label="Charged">${money(t.charged)}</td>
          </tr>
        `),
    })}
    `
    : '<div class="al-empty">No theater data yet.</div>',
  { className: 'al-insight--theater-visits', kicker: 'Venues' });
}

function renderFormatPremiumsSection(formats) {
  return insightSection('Format premiums', formats.length
    ? `
      <div class="al-format-list">
        ${formats.map((f) => {
    const maxCharged = Math.max(...formats.map((row) => row.charged), 1);
    const width = Math.round((f.charged / maxCharged) * 100);
    return `
            <div class="al-format-row">
              <div class="al-format-row-top">
                <span class="al-format-name">${escapeHtml(f.format)}</span>
                <span class="al-format-charged">${money(f.charged)}</span>
              </div>
              <div class="al-format-meta al-muted">${f.count} visit${f.count === 1 ? '' : 's'}</div>
              <div class="al-meter al-meter--format" aria-hidden="true">
                <span class="al-meter-fill" data-width="${width}" style="width:0%"></span>
              </div>
            </div>
          `;
  }).join('')}
      </div>
    `
    : '<div class="al-empty">No format data yet.</div>',
  { className: 'al-insight--formats', kicker: 'Spend' });
}

function renderActorsMostSeenSection(actors) {
  if (!actors.length) {
    return insightSection('Most seen', `
      <div class="al-empty">No actor data yet — link movies to TMDB when logging or expand a row in your log.</div>
    `, { className: 'al-actors-most-seen', kicker: 'Cast' });
  }

  return insightSection('Most seen', `
    <p class="al-muted al-by-actor-hint">Top 10 by unique films. Hover a name to see titles.</p>
    ${actorRankTable(actors.slice(0, 10))}
  `, { className: 'al-actors-most-seen', kicker: 'Cast' });
}

function renderActorsBestRatedSection(actors) {
  if (!actors.length) {
    return insightSection('Best rated', `
      <div class="al-empty">No actor data yet — link movies to TMDB when logging or expand a row in your log.</div>
    `, { className: 'al-actors-best-rated', kicker: 'Cast' });
  }

  const highestRated = topActorsByRating(actors, { minRated: 2, limit: 10 });

  return insightSection('Best rated', highestRated.length
    ? `
      <p class="al-muted al-by-actor-hint">Top 10 with at least 2 rated films. Hover a name to see titles.</p>
      ${actorRankTable(highestRated, { sortByRating: true })}
    `
    : '<div class="al-empty">Rate at least two films per actor to rank them here.</div>',
  { className: 'al-actors-best-rated', kicker: 'Cast' });
}

function renderRewatchesSection(rewatches) {
  return insightSection('Rewatches', rewatches.length
    ? `<div class="al-table-wrap al-table-wrap--cards"><table class="al-table al-card-table al-rewatch-table"><thead><tr><th>Title</th><th class="num">Times</th><th>Dates</th></tr></thead><tbody>
        ${rewatches.map((r) => `
          <tr>
            <td class="al-card-primary">${escapeHtml(r.title)}</td>
            <td class="num" data-label="Times">${r.count}</td>
            <td class="al-muted al-card-span" data-label="Dates">${r.dates.map((d) => d.slice(5)).join(', ')}</td>
          </tr>
        `).join('')}
      </tbody></table></div>`
    : '<div class="al-empty">No rewatches logged yet.</div>',
  { kicker: 'Habits' });
}

function renderByMonthSection(byMonth, moviesByMonth) {
  const rows = byMonth || [];
  if (!rows.length) {
    return insightSection('By month', `
      <div class="al-empty">No monthly data yet — log a screening to get started.</div>
    `, { className: 'al-by-month', expanded: true, kicker: 'Ledger' });
  }

  return insightSection('By month', `
    <p class="al-muted al-by-month-hint">
      <span class="al-hint-hover">Hover a month to see what you watched.</span>
      <span class="al-hint-touch">Tap a month to see what you watched.</span>
    </p>
    ${renderMonthTable(rows, moviesByMonth)}
  `, { className: 'al-by-month', expanded: true, kicker: 'Ledger' });
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
  const ratingLabel = sortByRating ? 'Avg rating' : 'Avg';
  return rankTable({
    headers: [
      { label: 'Actor' },
      { label: 'Films', className: 'num' },
      { label: ratingLabel, className: 'num' },
    ],
    rows: actors.map((actor, i) => `
      <tr class="al-rank-row">
        <td class="al-card-primary">
          <span class="al-card-rank">${i + 1}</span>
          <span class="al-hover-target al-hover-target--label" tabindex="0">
            ${escapeHtml(actor.actor)}
            ${renderMoviesPopup(actor.films, { empty: 'No films found.' })}
          </span>
        </td>
        <td class="num" data-label="Films">${actor.count}</td>
        <td class="num" data-label="${escapeHtml(ratingLabel)}">${actor.avgRating != null ? `${actor.avgRating}★` : '—'}</td>
      </tr>
    `),
  });
}

function rankTable({ headers, rows }) {
  return `
    <div class="al-table-wrap al-table-wrap--cards">
      <table class="al-table al-rank-table al-card-table">
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

function groupMoviesByRating(watches) {
  const map = new Map([[1, []], [2, []], [3, []], [4, []], [5, []]]);
  for (const watch of watches) {
    if (watch.dnf || watch.rating == null) continue;
    const bucket = ratingStarBucket(watch.rating);
    map.get(bucket).push({
      title: watch.title,
      watched_on: watch.watched_on,
    });
  }
  for (const movies of map.values()) {
    movies.sort((a, b) => b.watched_on.localeCompare(a.watched_on));
  }
  return map;
}

function groupMoviesByTheater(watches) {
  const map = new Map();
  for (const watch of watches) {
    const location = (watch.location || 'Unknown').trim() || 'Unknown';
    if (isExcludedTheaterLocation(location)) continue;
    if (!map.has(location)) map.set(location, []);
    map.get(location).push({
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
    <div class="al-table-wrap al-table-wrap--cards al-table-wrap--month">
      <table class="al-table al-month-table al-card-table">
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
          <tr class="al-month-total">
            <th class="al-card-primary" scope="row">Total</th>
            <th class="num" data-label="Watched">${totals.movies}</th>
            <th class="num" data-label="Charged">${money(totals.charged)}</th>
            <th class="num" data-label="Billed">${money(totals.bill)}</th>
            <th class="num ${savingsClass(totals.savings)}" data-label="Savings">${formatSavings(totals.savings)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderMonthRow(row, movies) {
  return `
    <tr class="al-month-row al-hover-target" tabindex="0">
      <td class="al-card-primary" data-label="Month">
        ${escapeHtml(monthLabel(row.month))}
        ${renderMoviesPopup(movies, { empty: 'No movies this month.' })}
      </td>
      <td class="num" data-label="Watched">${row.movies}</td>
      <td class="num" data-label="Charged">${money(row.charged)}</td>
      <td class="num" data-label="Billed">${money(row.bill)}</td>
      <td class="num ${savingsClass(row.savings)}" data-label="Savings">${formatSavings(row.savings)}</td>
    </tr>
  `;
}

function renderMoviesPopup(items, { empty = 'No movies.', scrollable = false } = {}) {
  const popupClass = `al-hover-popup${scrollable ? ' al-hover-popup--scroll' : ''}`;
  if (!items.length) {
    return `<span class="${popupClass}" role="tooltip">${escapeHtml(empty)}</span>`;
  }

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

function averageWatchRating(ratings) {
  const buckets = ratings?.buckets || {};
  let sum = 0;
  let count = 0;
  for (const n of [1, 2, 3, 4, 5]) {
    const c = buckets[n] || 0;
    sum += n * c;
    count += c;
  }
  if (!count) return null;
  return Math.round((sum / count) * 10) / 10;
}

function shortTheaterName(name) {
  const cleaned = String(name || '').replace(/^AMC\s+/i, '').trim();
  if (cleaned.length <= 22) return cleaned || name;
  return `${cleaned.slice(0, 20)}…`;
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
