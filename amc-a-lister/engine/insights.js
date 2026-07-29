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
  const { summary, theaters, formats, rewatches, ratings, actors = [] } = data;
  const moviesByMonth = groupMoviesByMonth(watches);
  const maxTheater = theaters[0]?.count || 1;
  const maxFormat = formats[0]?.charged || 1;
  const maxRating = Math.max(1, ...Object.values(ratings.buckets));

  main.innerHTML = `
    ${renderByMonthSection(summary.byMonth, moviesByMonth)}

    <div class="al-insight-grid">
      <section class="al-panel">
        <h2 class="serif">A-List value meter</h2>
        <p class="al-muted">${monthLabel(summary.currentPeriod.month)}: ${money(summary.currentPeriod.charged)} ticket value vs ${money(summary.currentPeriod.bill)} billed.</p>
        <div class="al-meter"><span style="width:${summary.currentPeriod.bill ? Math.min(100, (summary.currentPeriod.charged / summary.currentPeriod.bill) * 100) : 0}%"></span></div>
        <p style="margin:8px 0 0;font-size:0.88rem">
          ${summary.currentPeriod.savings >= 0
    ? `<strong style="color:#0d7a42">+${money(summary.currentPeriod.savings)}</strong> ahead this period.`
    : `Need ~<strong>${summary.currentPeriod.breakEvenTickets}</strong> more ~$15 tickets to break even.`}
        </p>
      </section>

      <section class="al-panel">
        <h2 class="serif">Rating profile</h2>
        <p class="al-muted">${ratings.rated} rated · ${ratings.dnf} DNF · ${(ratings.dnf / Math.max(1, ratings.total) * 100).toFixed(0)}% walk-out rate</p>
        ${[5, 4, 3, 2, 1].map((n) => barRow(`${n}★`, ratings.buckets[n], maxRating)).join('')}
      </section>

      <section class="al-panel">
        <h2 class="serif">Theater ranking</h2>
        ${theaters.length
    ? theaters.slice(0, 6).map((t) => barRow(t.location, t.count, maxTheater, `${t.count} · ${money(t.charged)}`)).join('')
    : '<div class="al-empty">No theater data yet.</div>'}
      </section>

      <section class="al-panel">
        <h2 class="serif">Format premiums</h2>
        ${formats.length
    ? formats.map((f) => barRow(f.format, f.charged, maxFormat, `${f.count} · ${money(f.charged)}`)).join('')
    : '<div class="al-empty">No format data yet.</div>'}
      </section>
    </div>

    ${renderByActorSection(actors)}

    <section class="al-panel">
      <h2 class="serif">Rewatches</h2>
      ${rewatches.length
    ? `<div class="al-table-wrap"><table class="al-table"><thead><tr><th>Title</th><th class="num">Times</th><th>Dates</th></tr></thead><tbody>
        ${rewatches.map((r) => `
          <tr>
            <td>${escapeHtml(r.title)}</td>
            <td class="num">${r.count}</td>
            <td class="al-muted">${r.dates.map((d) => d.slice(5)).join(', ')}</td>
          </tr>
        `).join('')}
      </tbody></table></div>`
    : '<div class="al-empty">No rewatches logged yet.</div>'}
    </section>
  `;

  const byActorSection = main.querySelector('.al-by-actor');
  if (byActorSection) wireSegmentToggle(byActorSection);
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

function renderByActorSection(actors) {
  if (!actors.length) {
    return `
      <section class="al-panel al-by-actor">
        <h2 class="serif">By actor</h2>
        <div class="al-empty">No actor data yet — link movies to TMDB when logging or expand a row in your log.</div>
      </section>
    `;
  }

  const mostSeen = actors.slice(0, 10);
  const highestRated = topActorsByRating(actors, { minRated: 2, limit: 10 });
  const maxCount = mostSeen[0]?.count || 1;

  return `
    <section class="al-panel al-by-actor">
      <div class="al-panel-head">
        <h2 class="serif">By actor</h2>
        <div class="al-segment" role="tablist" aria-label="By actor view">
          <button type="button" class="al-segment-btn is-active" role="tab" aria-selected="true" data-view="most">Most seen</button>
          <button type="button" class="al-segment-btn" role="tab" aria-selected="false" data-view="rated">Highest rated</button>
        </div>
      </div>
      <p class="al-muted al-by-actor-hint">Top 10 from billed cast on TMDB-matched titles.</p>
      <div class="al-view-panel" data-panel="most">
        ${mostSeen.map((actor) => barRow(
    actor.actor,
    actor.count,
    maxCount,
    actorRightLabel(actor),
  )).join('')}
      </div>
      <div class="al-view-panel is-hidden" data-panel="rated" hidden>
        ${highestRated.length
    ? highestRated.map((actor) => barRow(
      actor.actor,
      actor.avgRating,
      5,
      `${actor.avgRating}★ · ${actor.count} films`,
    )).join('')
    : '<div class="al-empty">Rate at least two films per actor to rank them here.</div>'}
      </div>
    </section>
  `;
}

function actorRightLabel(actor) {
  const rating = actor.avgRating != null ? `${actor.avgRating}★ avg` : '— avg';
  return `${actor.count} films · ${rating}`;
}

function wireSegmentToggle(section) {
  const buttons = [...section.querySelectorAll('[data-view]')];
  const panels = [...section.querySelectorAll('[data-panel]')];

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
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

function renderByMonthSection(byMonth, moviesByMonth) {
  if (!byMonth.length) {
    return `
      <section class="al-panel al-by-month">
        <h2 class="serif">By month</h2>
        <div class="al-empty">No monthly data yet — log a screening to get started.</div>
      </section>
    `;
  }

  return `
    <section class="al-panel al-by-month">
      <h2 class="serif">By month</h2>
      <p class="al-muted al-by-month-hint">
        <span class="al-hint-hover">Hover a month to see what you watched.</span>
        <span class="al-hint-touch">Tap a month to see what you watched.</span>
      </p>
      ${renderMonthTable(byMonth, moviesByMonth)}
    </section>
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
        ${byMonth.map((row) => renderMonthGroup(row, moviesByMonth.get(row.month) || [])).join('')}
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

function renderMonthGroup(row, movies) {
  const moviesHtml = movies.length
    ? `<ul class="al-month-movies">${movies.map((movie) => `
        <li>
          <span class="al-month-movie-title">${escapeHtml(movie.title)}</span>
          <span class="al-month-movie-date">${escapeHtml(shortDate(movie.watched_on))}</span>
        </li>
      `).join('')}</ul>`
    : '<p class="al-muted al-month-movies-empty">No movies this month.</p>';

  return `
    <tbody class="al-month-group">
      <tr class="al-month-row" tabindex="0">
        <td>${escapeHtml(monthLabel(row.month))}</td>
        <td class="num">${row.movies}</td>
        <td class="num">${money(row.charged)}</td>
        <td class="num">${money(row.bill)}</td>
        <td class="num ${savingsClass(row.savings)}">${formatSavings(row.savings)}</td>
      </tr>
      <tr class="al-month-detail" aria-hidden="true">
        <td colspan="5">${moviesHtml}</td>
      </tr>
    </tbody>
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

function barRow(label, value, max, right = value) {
  const pct = Math.round((value / max) * 100);
  return `
    <div class="al-bar-row">
      <span>${escapeHtml(String(label))}</span>
      <span class="al-muted brand-mono">${right}</span>
      <div class="al-bar"><i style="width:${pct}%"></i></div>
    </div>
  `;
}
