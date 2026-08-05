import './pwa.js';
import { initAuth, wireAuthLink, refreshToken, authReturnUrl, loginUrl } from './auth.js';
import { summaryApi } from './api.js';
import { renderQuickLogBar, wireQuickLog } from './quick-log.js';

const NAV_ACTIVE = document.body.dataset.page || '';

const PAGES = [
  { href: '/amc-a-lister/', label: 'Log', id: 'log' },
  { href: '/amc-a-lister/what-to-watch.html', label: 'Watch', id: 'what-to-watch' },
  { href: '/amc-a-lister/tv.html', label: 'TV', id: 'tv' },
  { href: '/amc-a-lister/insights.html', label: 'Insights', id: 'insights' },
  { href: '/amc-a-lister/leaderboard.html', label: 'Leaderboard', id: 'leaderboard' },
  { href: '/amc-a-lister/settings.html', label: 'Settings', id: 'settings' },
];

export function renderShell({ title, subtitle, body = '', hideLogBar = false, signedIn = false } = {}) {
  const links = PAGES.map((p) => {
    const active = p.id === NAV_ACTIVE ? ' is-active' : '';
    return `<a href="${p.href}" class="al-nav-link${active}">${p.label}</a>`;
  }).join('');

  const mobileLinks = PAGES.map((p) => {
    const active = p.id === NAV_ACTIVE ? ' is-active' : '';
    return `<a href="${p.href}" class="al-mobile-nav-link${active}">${p.label}</a>`;
  }).join('');

  const isAddPage = NAV_ACTIVE === 'add';
  const showQuickLog = signedIn && !hideLogBar && !isAddPage;

  return `
    <div class="page-main">
      <header class="al-mobile-header" aria-label="AMC A-Lister">
        <div class="al-mobile-header-card">
          <div class="al-mobile-header-top">
            <a href="/amc-a-lister/" class="al-mobile-header-title">AMC A-Lister</a>
            <div class="al-mobile-header-actions">
              <a href="/" class="al-mobile-home-link">← Home</a>
              <a href="/account.html" class="al-mobile-auth-link" data-nav-auth>Log in</a>
            </div>
          </div>
          <div class="al-mobile-stats" id="al-mobile-stats" hidden>
            ${mobileStatsPlaceholder()}
          </div>
        </div>
      </header>
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
          <a href="/account.html" id="nav-auth-link" data-nav-auth>Log in</a>
          <p class="al-tmdb-credit">Movie &amp; TV data by <a href="https://www.themoviedb.org/" target="_blank" rel="noopener">TMDB</a></p>
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
  `;
}

function mobileStatsPlaceholder() {
  return `
    <div class="al-mobile-stats-inner">
      ${mobileStat('Seen', 'seen')}
      ${mobileStat('Savings', 'savings', 'is-savings')}
      ${mobileStat('Billed', 'billed', 'is-cost')}
      ${mobileStat('$/movie', 'cost')}
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

function mobileStat(label, key, extraClass = '') {
  return `
    <div class="al-mobile-stat">
      <span class="al-mobile-stat-label">${label}</span>
      <span class="al-mobile-stat-value ${extraClass}" data-sidebar="${key}">—</span>
    </div>
  `;
}

export async function populateSidebarStats(auth) {
  if (!auth.signedIn || !auth.token) return;

  const mobileBar = document.getElementById('al-mobile-stats');
  if (mobileBar) mobileBar.hidden = false;

  try {
    const data = await summaryApi.get(auth.token);
    const summary = data?.summary || {};

    const values = {
      seen: { v: summary.totalSeen ?? 0, kind: 'count' },
      savings: { v: summary.totalSavings ?? 0, kind: 'money' },
      billed: { v: summary.totalBilled ?? 0, kind: 'money' },
      cost: { v: summary.costPerMovie ?? 0, kind: 'money' },
      'avg-ticket': { v: summary.avgTicket ?? 0, kind: 'money' },
      'avg-runtime': { v: summary.avgRuntimeMin ?? 0, kind: 'runtime' },
    };

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

async function runBootPage(renderFn, auth, { quickLogOnSuccess } = {}) {
  const root = document.getElementById('app-root');
  await renderFn({ root, auth });
  wireAuthLink(auth);
  if (auth.signedIn && auth.token) {
    wireQuickLog(auth, { onSuccess: () => quickLogOnSuccess?.(auth) });
    populateSidebarStats(auth);
  }
}

export async function bootPage(renderFn, { quickLogOnSuccess } = {}) {
  const root = document.getElementById('app-root');
  const auth = await initAuth();

  if (auth.configured && auth.user && !auth.token) {
    await refreshToken(auth);
  }

  try {
    await runBootPage(renderFn, auth, { quickLogOnSuccess });
  } catch (err) {
    console.error(err);
    if (err.status === 401 && auth.configured) {
      const refreshed = await refreshToken(auth);
      if (refreshed) {
        auth.signedIn = true;
        auth.needsReauth = false;
        try {
          await runBootPage(renderFn, auth, { quickLogOnSuccess });
          return;
        } catch (retryErr) {
          console.error(retryErr);
          if (retryErr.status !== 401) {
            root.innerHTML = renderShell({
              title: 'Error',
              body: `<main class="al-main"><div class="al-panel"><p class="al-error">${retryErr.message || 'Something went wrong.'}</p></div></main>`,
            });
            return;
          }
        }
      }
      auth.signedIn = false;
      auth.needsReauth = !!auth.user;
      if (!requireSignIn(auth, root)) return;
      return;
    }
    root.innerHTML = renderShell({
      title: 'Error',
      body: `<main class="al-main"><div class="al-panel"><p class="al-error">${err.message || 'Something went wrong.'}</p></div></main>`,
    });
  }
}

export function requireSignIn(auth, root) {
  if (auth.signedIn && auth.token) return true;

  const loginHref = loginUrl();
  const reauthNote = auth.needsReauth
    ? '<p class="al-error">Your session expired. Sign in again to load your log.</p>'
    : '';
  const setupNote = !auth.configured
    ? '<p class="al-muted">Sign-in is not available in this environment yet. Deploy with Neon Auth configured to use your log.</p>'
    : '';

  root.innerHTML = renderShell({
    title: 'A-Lister',
    subtitle: 'Track every screening. Know if A-List is paying for itself.',
    hideLogBar: true,
    signedIn: false,
    body: `
      <main class="al-main">
        <section class="al-panel al-marketing">
          ${reauthNote}
          ${setupNote}
          <h2>Your watch diary, minus the spreadsheet</h2>
          <ul class="al-bullets">
            <li>Log a screening in under 30 seconds</li>
            <li>See billed vs. ticket savings each month</li>
            <li>Theater habits, format premiums, and rewatch stats on Insights</li>
          </ul>
          <p class="al-muted">Billing uses calendar months (1st–end), not the old sheet's 28th roll.</p>
          ${auth.configured ? `<p style="margin-top:12px"><a class="al-btn al-btn-primary" href="${loginHref}">Sign in to your log</a></p>` : ''}
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
