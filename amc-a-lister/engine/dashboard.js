import { bootPage, renderShell, requireSignIn, countUp } from './nav.js';
import { watchesApi, summaryApi } from './api.js';
import { money, shortDate, monthLabel, ratingLabel, escapeHtml } from './format.js';

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = `
    ${renderShell({
      title: 'Command center',
      subtitle: 'This billing period at a glance.',
      actions: `<a class="al-btn al-btn-primary" href="/amc-a-lister/add.html">+ Log movie</a>`,
    })}
    <main class="al-main" id="dash-main">
      <p class="al-muted">Loading…</p>
    </main>
  `;

  const main = document.getElementById('dash-main');
  const [watchesRes, summaryRes] = await Promise.all([
    watchesApi.list(auth.token),
    summaryApi.get(auth.token),
  ]);

  const watches = watchesRes.watches || [];
  const { summary } = summaryRes;
  const recent = watches.slice(0, 8);
  const period = summary.currentPeriod;

  main.innerHTML = `
    <section class="al-hud al-hud-6" aria-label="Totals">
      ${hudStat('Billed', summary.totalBilled, 'money')}
      ${hudStat('Charged', summary.totalCharged, 'money')}
      ${hudStat('Savings', summary.totalSavings, 'money', 'is-savings')}
      ${hudStat('Seen', summary.totalSeen, 'count')}
      ${hudStat('Cost / movie', summary.costPerMovie, 'money', 'is-cost')}
      ${hudStat('Avg ticket', summary.avgTicket, 'money')}
    </section>

    <section class="al-panel">
      <h2 class="serif">${monthLabel(period.month)} · this period</h2>
      <div class="al-hud" style="margin-bottom:0">
        ${hudStat('Movies', period.movies, 'count')}
        ${hudStat('Ticket value', period.charged, 'money')}
        ${hudStat('Bill', period.bill, 'money', 'is-cost')}
        ${hudStat('Net', period.savings, 'money', 'is-savings')}
      </div>
      <p class="al-muted" style="margin:8px 0 0">
        ${period.savings >= 0
    ? `Ahead by ${money(period.savings)} this month.`
    : `Break even with ~${period.breakEvenTickets} more standard tickets (~$15).`}
      </p>
      <div class="al-meter" aria-hidden="true"><span id="value-meter" style="width:0%"></span></div>
    </section>

    <section class="al-panel">
      <div class="al-toolbar">
        <h2 class="serif" style="margin:0;flex:1">Recent</h2>
        <a class="al-btn" href="/amc-a-lister/log.html">Full log</a>
      </div>
      ${recent.length ? recentTable(recent) : '<div class="al-empty">No screenings yet. <a href="/amc-a-lister/add.html">Log your first</a>.</div>'}
    </section>

    <section class="al-panel">
      <h2 class="serif">By month</h2>
      <div class="al-table-wrap">
        <table class="al-table">
          <thead>
            <tr>
              <th>Month</th>
              <th class="num">Movies</th>
              <th class="num">Charged</th>
              <th class="num">Bill</th>
              <th class="num">Net</th>
            </tr>
          </thead>
          <tbody>
            ${summary.byMonth.map((row) => `
              <tr>
                <td>${monthLabel(row.month)}</td>
                <td class="num">${row.movies}</td>
                <td class="num">${money(row.charged)}</td>
                <td class="num">${money(row.bill)}</td>
                <td class="num">${money(row.savings)}</td>
              </tr>
            `).join('') || '<tr><td colspan="5" class="al-muted">No data yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  animateHud(summary);
  const pct = period.bill > 0 ? Math.min(100, (period.charged / period.bill) * 100) : 0;
  requestAnimationFrame(() => {
    const meter = document.getElementById('value-meter');
    if (meter) meter.style.width = `${pct}%`;
  });
});

function hudStat(label, value, kind, extraClass = '') {
  return `
    <div class="al-stat">
      <div class="al-stat-label">${label}</div>
      <div class="al-stat-value ${extraClass}" data-hud="${label}" data-kind="${kind}" data-value="${value}">—</div>
    </div>
  `;
}

function animateHud(summary) {
  const map = {
    Billed: { v: summary.totalBilled, kind: 'money' },
    Charged: { v: summary.totalCharged, kind: 'money' },
    Savings: { v: summary.totalSavings, kind: 'money' },
    Seen: { v: summary.totalSeen, kind: 'count' },
    'Cost / movie': { v: summary.costPerMovie, kind: 'money' },
    'Avg ticket': { v: summary.avgTicket, kind: 'money' },
    Movies: { v: summary.currentPeriod.movies, kind: 'count' },
    'Ticket value': { v: summary.currentPeriod.charged, kind: 'money' },
    Bill: { v: summary.currentPeriod.bill, kind: 'money' },
    Net: { v: summary.currentPeriod.savings, kind: 'money' },
  };

  document.querySelectorAll('[data-hud]').forEach((el) => {
    const cfg = map[el.dataset.hud];
    if (!cfg) return;
    if (cfg.kind === 'money') {
      countUp(el, cfg.v / 100, { prefix: '$' });
    } else {
      countUp(el, cfg.v);
    }
  });
}

function recentTable(watches) {
  return `
    <div class="al-table-wrap">
      <table class="al-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Title</th>
            <th>Location</th>
            <th>Format</th>
            <th class="num">Charge</th>
            <th>Rating</th>
          </tr>
        </thead>
        <tbody>
          ${watches.map((w) => `
            <tr>
              <td>${shortDate(w.watched_on)}</td>
              <td><a href="/amc-a-lister/add.html?id=${encodeURIComponent(w.id)}">${escapeHtml(w.title)}</a></td>
              <td class="al-muted">${escapeHtml(w.location || '—')}</td>
              <td>${w.format ? `<span class="al-tag">${escapeHtml(w.format)}</span>` : '—'}</td>
              <td class="num">${money(w.ticket_cents)}</td>
              <td>${ratingLabel(w)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
