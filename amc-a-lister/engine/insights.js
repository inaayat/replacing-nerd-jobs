import { bootPage, renderShell, requireSignIn } from './nav.js';
import { summaryApi } from './api.js';
import { money, escapeHtml, monthLabel } from './format.js';

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = `
    ${renderShell({
      title: 'Insights',
      subtitle: 'Data the spreadsheet never surfaced.',
    })}
    <main class="al-main" id="insights-main"><p class="al-muted">Loading…</p></main>
  `;

  const main = document.getElementById('insights-main');
  const data = await summaryApi.get(auth.token);
  const { summary, theaters, formats, rewatches, ratings } = data;
  const maxTheater = theaters[0]?.count || 1;
  const maxFormat = formats[0]?.charged || 1;
  const maxRating = Math.max(1, ...Object.values(ratings.buckets));

  main.innerHTML = `
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
});

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
