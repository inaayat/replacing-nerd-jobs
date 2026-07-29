import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { summaryApi } from './api.js';
import { money, escapeHtml, monthLabel } from './format.js';

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Insights',
    subtitle: 'Data the spreadsheet never surfaced.',
    body: `<main class="al-main" id="insights-main"><p class="al-muted">Loading…</p></main>`,
  });

  const main = document.getElementById('insights-main');
  const data = await summaryApi.get(auth.token);
  const { summary, theaters, formats, rewatches, ratings } = data;
  const maxTheater = theaters[0]?.count || 1;
  const maxFormat = formats[0]?.charged || 1;
  const maxRating = Math.max(1, ...Object.values(ratings.buckets));

  main.innerHTML = `
    ${renderByMonthSection(summary.byMonth)}

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

  const byMonthSection = main.querySelector('.al-by-month');
  if (byMonthSection) wireByMonthToggle(byMonthSection);
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

function renderByMonthSection(byMonth) {
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
      <div class="al-panel-head">
        <h2 class="serif">By month</h2>
        <div class="al-segment" role="tablist" aria-label="By month view">
          <button type="button" class="al-segment-btn is-active" role="tab" aria-selected="true" data-view="graph">Graph</button>
          <button type="button" class="al-segment-btn" role="tab" aria-selected="false" data-view="table">Table</button>
        </div>
      </div>
      <div class="al-view-panel" data-panel="graph">${renderMonthGraph(byMonth)}</div>
      <div class="al-view-panel is-hidden" data-panel="table" hidden>${renderMonthTable(byMonth)}</div>
    </section>
  `;
}

function renderMonthGraph(byMonth) {
  const rows = [...byMonth].sort((a, b) => a.month.localeCompare(b.month));
  const maxMovies = Math.max(1, ...rows.map((r) => r.movies));
  const maxMoney = Math.max(1, ...rows.map((r) => Math.max(r.charged, r.bill)));

  const height = 240;
  const pad = { top: 16, right: 44, bottom: 40, left: 36 };
  const width = Math.max(320, rows.length * 56 + pad.left + pad.right);
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const groupW = chartW / rows.length;
  const barGap = 3;
  const barW = Math.min(16, Math.max(6, (groupW - barGap * 4) / 3));

  const movieScale = (n) => pad.top + chartH - (n / maxMovies) * chartH;
  const moneyScale = (cents) => pad.top + chartH - (cents / maxMoney) * chartH;

  const bars = rows.map((row, i) => {
    const cx = pad.left + groupW * i + groupW / 2;
    const x0 = cx - (barW * 3 + barGap * 2) / 2;
    const month = shortMonthLabel(row.month);
    const moviesH = chartH - (movieScale(row.movies) - pad.top);
    const chargedH = chartH - (moneyScale(row.charged) - pad.top);
    const billH = chartH - (moneyScale(row.bill) - pad.top);
    const yBase = pad.top + chartH;

    return `
      <g class="al-month-group">
        <rect class="al-month-bar al-month-bar--movies" x="${x0}" y="${movieScale(row.movies)}" width="${barW}" height="${moviesH}" rx="2">
          <title>${month}: ${row.movies} movie${row.movies === 1 ? '' : 's'}</title>
        </rect>
        <rect class="al-month-bar al-month-bar--charged" x="${x0 + barW + barGap}" y="${moneyScale(row.charged)}" width="${barW}" height="${chargedH}" rx="2">
          <title>${month}: ${money(row.charged)} charged</title>
        </rect>
        <rect class="al-month-bar al-month-bar--billed" x="${x0 + (barW + barGap) * 2}" y="${moneyScale(row.bill)}" width="${barW}" height="${billH}" rx="2">
          <title>${month}: ${money(row.bill)} billed</title>
        </rect>
        <text class="al-month-label" x="${cx}" y="${yBase + 16}" text-anchor="middle">${escapeHtml(month)}</text>
      </g>
    `;
  }).join('');

  const yTicksMovies = tickValues(maxMovies, 4).map((v) => {
    const y = movieScale(v);
    return `
      <g class="al-month-tick">
        <line x1="${pad.left}" y1="${y}" x2="${pad.left + chartW}" y2="${y}" />
        <text x="${pad.left - 8}" y="${y + 4}" text-anchor="end">${v}</text>
      </g>
    `;
  }).join('');

  const yTicksMoney = tickValues(maxMoney, 4).map((cents) => {
    const y = moneyScale(cents);
    return `<text class="al-month-tick-money" x="${pad.left + chartW + 8}" y="${y + 4}" text-anchor="start">${money(cents)}</text>`;
  }).join('');

  return `
    <div class="al-month-chart-wrap">
      <svg class="al-month-chart" style="min-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly movies watched, charged, and billed">
        <line class="al-month-axis" x1="${pad.left}" y1="${pad.top + chartH}" x2="${pad.left + chartW}" y2="${pad.top + chartH}" />
        ${yTicksMovies}
        ${bars}
        ${yTicksMoney}
      </svg>
      <ul class="al-month-legend" aria-hidden="true">
        <li><span class="al-month-swatch al-month-swatch--movies"></span>Movies watched</li>
        <li><span class="al-month-swatch al-month-swatch--charged"></span>Total charged</li>
        <li><span class="al-month-swatch al-month-swatch--billed"></span>Total billed</li>
      </ul>
    </div>
  `;
}

function renderMonthTable(byMonth) {
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
          ${byMonth.map((row) => `
            <tr>
              <td>${escapeHtml(monthLabel(row.month))}</td>
              <td class="num">${row.movies}</td>
              <td class="num">${money(row.charged)}</td>
              <td class="num">${money(row.bill)}</td>
              <td class="num ${savingsClass(row.savings)}">${formatSavings(row.savings)}</td>
            </tr>
          `).join('')}
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

function wireByMonthToggle(section) {
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

function shortMonthLabel(iso) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function tickValues(max, count) {
  if (max <= count) return [...Array(max + 1)].map((_, i) => i);
  const step = Math.ceil(max / count);
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
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
