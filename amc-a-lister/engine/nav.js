import './pwa.js';
import { initAuth, wireAuthLink, refreshToken, loginUrl } from './auth.js';
import { summaryApi, membershipApi } from './api.js';
import { renderQuickLogBar, wireQuickLog } from './quick-log.js';
import { escapeHtml } from './format.js';

const NAV_ACTIVE = document.body.dataset.page || '';
const TV_BETA_KEY = 'alist.beta.tv';
const RANK_BETA_KEY = 'alist.beta.rank';

const PAGES = [
  { href: '/amc-a-lister/', label: 'Log', id: 'log' },
  { href: '/amc-a-lister/what-to-watch.html', label: 'Coming Soon', id: 'what-to-watch' },
  { href: '/amc-a-lister/tv.html', label: 'TV', id: 'tv', beta: 'tv' },
  { href: '/amc-a-lister/rank.html', label: 'Rank', id: 'rank', beta: 'rank' },
  { href: '/amc-a-lister/statistics.html', label: 'Stats', id: 'statistics' },
  { href: '/amc-a-lister/leaderboard.html', label: 'Leaderboard', id: 'leaderboard' },
  { href: '/amc-a-lister/settings.html', label: 'Settings', id: 'settings', mobileIcon: 'settings' },
];

export function isTvBetaEnabled() {
  try {
    return localStorage.getItem(TV_BETA_KEY) === '1';
  } catch {
    return false;
  }
}

export function setTvBetaEnabled(enabled) {
  try {
    localStorage.setItem(TV_BETA_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage failures
  }
}

export function isRankBetaEnabled() {
  try {
    return localStorage.getItem(RANK_BETA_KEY) === '1';
  } catch {
    return false;
  }
}

export function setRankBetaEnabled(enabled) {
  try {
    localStorage.setItem(RANK_BETA_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage failures
  }
}

/** After logging a theater watch (DNF included), offer to put it on the Rank stack. */
function offerRankAfterLog(logged) {
  if (!isRankBetaEnabled()) return;
  if (!logged || logged.in_theaters === false) return;
  const tmdbId = Number(logged.tmdb_id);
  if (!tmdbId) return;
  if (document.body.dataset.page === 'rank') return;
  if (document.getElementById('rank-after-add')) return;

  const overlay = document.createElement('div');
  overlay.id = 'rank-after-add';
  overlay.className = 'al-rank-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'rank-after-add-title');
  overlay.innerHTML = `
    <div class="al-rank-modal-card">
      <div>
        <h2 class="al-rank-modal-title" id="rank-after-add-title">Stack rank this?</h2>
        <p class="al-rank-modal-film">${escapeHtml(logged.title || 'This movie')}</p>
        <p class="al-muted">Add it to your theater stack. Your watch log stays as it is.</p>
        <div class="al-rank-modal-actions">
          <button type="button" class="al-btn al-btn-primary" id="rank-after-yes">Yes, compare</button>
          <button type="button" class="al-btn" id="rank-after-no">Not now</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#rank-after-yes')?.addEventListener('click', () => {
    location.href = `/amc-a-lister/rank.html?add=${tmdbId}`;
  });
  overlay.querySelector('#rank-after-no')?.addEventListener('click', () => overlay.remove());
}

function visiblePages() {
  return PAGES.filter((p) => {
    if (p.beta === 'tv') return isTvBetaEnabled();
    if (p.beta === 'rank') return isRankBetaEnabled();
    return true;
  });
}

function settingsIconSvg() {
  return `
    <svg class="al-nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.77 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.24l2.39-.96c.5.39 1.04.71 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.25.1.54 0 .68-.24l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"/>
    </svg>
  `;
}

export function renderShell({ title, subtitle, body = '', hideLogBar = false, signedIn = false } = {}) {
  const pages = visiblePages();
  const links = pages.map((p) => {
    const active = p.id === NAV_ACTIVE ? ' is-active' : '';
    return `<a href="${p.href}" class="al-nav-link${active}">${p.label}</a>`;
  }).join('');

  const mobileLinks = pages.map((p) => {
    const active = p.id === NAV_ACTIVE ? ' is-active' : '';
    if (p.mobileIcon === 'settings') {
      return `<a href="${p.href}" class="al-mobile-nav-link al-mobile-nav-link--icon${active}" aria-label="Settings" title="Settings">${settingsIconSvg()}</a>`;
    }
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

async function ensureMonthlyRateSetup(auth) {
  if (!auth.signedIn || !auth.token) return true;
  if (NAV_ACTIVE === 'settings') return true;
  try {
    const { membership } = await membershipApi.get(auth.token);
    if (membership?.rate_setup_complete === false) {
      location.replace('/amc-a-lister/settings.html?setup=rate');
      return false;
    }
  } catch {
    // ignore — page can still load
  }
  return true;
}

async function runBootPage(renderFn, auth, { quickLogOnSuccess } = {}) {
  const root = document.getElementById('app-root');
  if (!(await ensureMonthlyRateSetup(auth))) return;
  await renderFn({ root, auth });
  wireAuthLink(auth);
  if (auth.signedIn && auth.token) {
    wireQuickLog(auth, {
      onSuccess: async (logged) => {
        await quickLogOnSuccess?.(auth, logged);
        offerRankAfterLog(logged);
      },
    });
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
              body: errorBody(retryErr),
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
      body: errorBody(err),
    });
  }
}

/** Server messages can echo submitted values, so never interpolate them raw. */
function errorBody(err) {
  const message = escapeHtml(err?.message || 'Something went wrong.');
  return `<main class="al-main"><div class="al-panel"><p class="al-error">${message}</p></div></main>`;
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
            <li>Theater habits, format premiums, and rewatch stats on Stats</li>
          </ul>
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
