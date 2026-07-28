import { initAuth, wireAuthLink } from './auth.js';

const NAV_ACTIVE = document.body.dataset.page || '';

const PAGES = [
  { href: '/amc-a-lister/', label: 'Dashboard', id: 'dashboard' },
  { href: '/amc-a-lister/log.html', label: 'Log', id: 'log' },
  { href: '/amc-a-lister/insights.html', label: 'Insights', id: 'insights' },
  { href: '/amc-a-lister/settings.html', label: 'Settings', id: 'settings' },
];

export function renderShell({ title, subtitle, actions = '' } = {}) {
  const links = PAGES.map((p) => {
    const active = p.id === NAV_ACTIVE ? ' is-active' : '';
    return `<a href="${p.href}" class="al-nav-link${active}">${p.label}</a>`;
  }).join('');

  return `
    <header class="al-hero">
      <div class="al-hero-inner">
        <div class="al-hero-copy">
          <p class="al-kicker brand-mono">AMC Stubs A-List</p>
          <h1 class="al-title serif">${title || 'A-Lister'}</h1>
          ${subtitle ? `<p class="al-sub">${subtitle}</p>` : ''}
        </div>
        ${actions ? `<div class="al-hero-actions">${actions}</div>` : ''}
      </div>
    </header>
    <nav class="al-nav brand-mono">
      ${links}
      <a href="/account.html" id="nav-auth-link" class="al-nav-link al-nav-auth">Log in</a>
    </nav>
  `;
}

export async function bootPage(renderFn) {
  const root = document.getElementById('app-root');
  const auth = await initAuth();

  try {
    await renderFn({ root, auth });
    wireAuthLink(auth);
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="al-panel"><p class="al-error">${err.message || 'Something went wrong.'}</p></div>`;
  }
}

export function requireSignIn(auth, root) {
  if (auth.signedIn) return true;
  root.innerHTML = `
    ${renderShell({
      title: 'A-Lister',
      subtitle: 'Track every screening. Know if A-List is paying for itself.',
      actions: `<a class="al-btn al-btn-primary" href="/account.html?next=${encodeURIComponent(location.pathname)}">Sign in to your log</a>`,
    })}
    <main class="al-main">
      <section class="al-panel al-marketing">
        <h2 class="serif">Your watch diary, minus the spreadsheet</h2>
        <ul class="al-bullets">
          <li>Log a screening in under 30 seconds</li>
          <li>See billed vs. ticket savings each month</li>
          <li>Theater habits, format premiums, and rewatch stats on Insights</li>
        </ul>
        <p class="al-muted">Billing uses calendar months (1st–end), not the old sheet’s 28th roll.</p>
      </section>
    </main>
  `;
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
