import { initAuth, wireAuthLink, refreshToken } from './auth.js';
import { summaryApi } from './api.js';
import { renderQuickLogBar, wireQuickLog } from './quick-log.js';

const NAV_ACTIVE = document.body.dataset.page || '';

const PAGES = [
  { href: '/amc-a-lister/', label: 'Log', id: 'log' },
  { href: '/amc-a-lister/insights.html', label: 'Insights', id: 'insights' },
  { href: '/amc-a-lister/settings.html', label: 'Settings', id: 'settings' },
];

export function renderShell({ title, subtitle, body = '', hideLogBar = false } = {}) {
  const links = PAGES.map((p) => {
    const active = p.id === NAV_ACTIVE ? ' is-active' : '';
    return `<a href="${p.href}" class="al-nav-link${active}">${p.label}</a>`;
  }).join('');

  const mobileLinks = PAGES.map((p) => {
    const active = p.id === NAV_ACTIVE ? ' is-active' : '';
    return `<a href="${p.href}" class="al-mobile-nav-link${active}">${p.label}</a>`;
  }).join('');

  const isAddPage = NAV_ACTIVE === 'add';
  const showQuickLog = !hideLogBar && !isAddPage;

  return `
    <div class="page-main">
      <aside class="al-sidebar">
        <div class="al-sidebar-brand">
          <a href="/amc-a-lister/" class="al-sidebar-title">AMC A-Lister</a>
          <p class="al-sidebar-tagline">heartbreak feels good in a place like this..</p>
        </div>
        <div class="al-sidebar-stats" id="al-sidebar-stats">
          ${sidebarStatsPlaceholder()}
        </div>
        <nav class="al-sidebar-nav" aria-label="A-Lister pages">
          ${links}
        </nav>
        <div class="al-sidebar-footer">
          <a href="/">← Beep boop</a>
          <a href="/account.html" id="nav-auth-link">Log in</a>
          <p class="al-tmdb-credit">Movie data &amp; posters by <a href="https://www.themoviedb.org/" target="_blank" rel="noopener">TMDB</a></p>
        </div>
      </aside>
      <div class="al-content-scroll">
        ${showQuickLog ? renderQuickLogBar() : ''}
        ${title ? `
          <div class="al-page-header">
            <h1 class="al-page-title">${title}</h1>
            ${subtitle ? `<p class="al-page-sub">${subtitle}</p>` : ''}
          </div>
        ` : ''}
        ${body}
      </div>
      <nav class="al-mobile-nav" aria-label="A-Lister pages">${mobileLinks}</nav>
    </div>
  `;
}

function sidebarStatsPlaceholder() {
  return `
    <div class="al-sidebar-stats-block">
      <p class="al-sidebar-stats-heading">All time</p>
      ${sidebarStat('Seen', 'seen')}
      ${sidebarStat('Savings', 'savings', 'is-savings')}
      ${sidebarStat('Billed', 'billed', 'is-cost')}
      ${sidebarStat('Cost / movie', 'cost')}
      ${sidebarStat('Avg ticket', 'avg-ticket')}
      ${sidebarStat('Avg runtime', 'avg-runtime')}
    </div>
    <div class="al-sidebar-stats-block">
      <p class="al-sidebar-stats-heading" id="al-period-label">This period</p>
      ${sidebarStat('Movies', 'period-movies')}
      ${sidebarStat('Net', 'period-net', 'is-savings')}
    </div>
  `;
}

function sidebarStat(label, key, extraClass = '') {
  return `
    <div class="al-sidebar-stat">
      <div class="al-sidebar-stat-label">${label}</div>
      <div class="al-sidebar-stat-value ${extraClass}" data-sidebar="${key}">—</div>
    </div>
  `;
}

export async function populateSidebarStats(auth) {
  if (!auth.signedIn || !auth.token) return;

  try {
    const data = await summaryApi.get(auth.token);
    const { summary } = data;
    const period = summary.currentPeriod;

    const values = {
      seen: { v: summary.totalSeen, kind: 'count' },
      savings: { v: summary.totalSavings, kind: 'money' },
      billed: { v: summary.totalBilled, kind: 'money' },
      cost: { v: summary.costPerMovie, kind: 'money' },
      'avg-ticket': { v: summary.avgTicket, kind: 'money' },
      'avg-runtime': { v: summary.avgRuntimeMin, kind: 'runtime' },
      'period-movies': { v: period.movies, kind: 'count' },
      'period-net': { v: period.savings, kind: 'money' },
    };

    const periodLabel = document.getElementById('al-period-label');
    if (periodLabel && period.month) {
      const [y, m] = period.month.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      periodLabel.textContent = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    document.querySelectorAll('[data-sidebar]').forEach((el) => {
      const cfg = values[el.dataset.sidebar];
      if (!cfg) return;
      if (cfg.kind === 'money') {
        countUp(el, cfg.v / 100, { prefix: '$' });
      } else if (cfg.kind === 'runtime') {
        if (cfg.v > 0) countUp(el, cfg.v, { suffix: ' min' });
        else el.textContent = '—';
      } else {
        countUp(el, cfg.v);
      }
    });
  } catch {
    // sidebar stats are best-effort
  }
}

export async function bootPage(renderFn, { quickLogOnSuccess } = {}) {
  const root = document.getElementById('app-root');
  const auth = await initAuth();

  if (auth.configured && auth.user && !auth.token) {
    await refreshToken(auth);
  }

  try {
    await renderFn({ root, auth });
    wireAuthLink(auth);
    if (auth.signedIn && auth.token) {
      wireQuickLog(auth, { onSuccess: () => quickLogOnSuccess?.(auth) });
      populateSidebarStats(auth);
    }
  } catch (err) {
    console.error(err);
    if (err.status === 401 && auth.configured) {
      auth.signedIn = false;
      auth.needsReauth = !!auth.user;
      if (!requireSignIn(auth, root)) return;
    }
    root.innerHTML = renderShell({
      title: 'Error',
      body: `<main class="al-main"><div class="al-panel"><p class="al-error">${err.message || 'Something went wrong.'}</p></div></main>`,
    });
  }
}

export function requireSignIn(auth, root) {
  if (auth.signedIn && auth.token) return true;

  const loginHref = `/account.html?next=${encodeURIComponent(location.pathname)}`;
  const reauthNote = auth.needsReauth
    ? '<p class="al-error">Your session expired. Sign in again to load your log.</p>'
    : '';

  root.innerHTML = renderShell({
    title: 'A-Lister',
    subtitle: 'Track every screening. Know if A-List is paying for itself.',
    body: `
      <main class="al-main">
        <section class="al-panel al-marketing">
          ${reauthNote}
          <h2>Your watch diary, minus the spreadsheet</h2>
          <ul class="al-bullets">
            <li>Log a screening in under 30 seconds</li>
            <li>See billed vs. ticket savings each month</li>
            <li>Theater habits, format premiums, and rewatch stats on Insights</li>
          </ul>
          <p class="al-muted">Billing uses calendar months (1st–end), not the old sheet's 28th roll.</p>
          <p style="margin-top:12px"><a class="al-btn al-btn-primary" href="${loginHref}">Sign in to your log</a></p>
        </section>
      </main>
    `,
  });
  wireAuthLink(auth);
  return false;
}

export function countUp(el, target, { prefix = '', suffix = '', duration = 700 } = {}) {
  const end = Number(target) || 0;
  const start = performance.now();
  const from = 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    const val = from + (end - from) * eased;
    el.textContent = `${prefix}${formatHudNumber(val)}${suffix}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function formatHudNumber(n) {
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString();
  return (Math.round(n * 100) / 100).toLocaleString();
}
