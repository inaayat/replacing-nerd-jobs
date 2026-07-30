import { bootPage, renderShell, populateSidebarStats } from './nav.js';
import { leaderboardApi } from './api.js';
import { money, shortDate, ratingLabel, escapeHtml, posterHtml, monthLabel } from './format.js';

bootPage(async ({ root, auth }) => {
  const params = new URLSearchParams(location.search);
  const userId = params.get('user')?.trim();

  root.innerHTML = renderShell({
    title: 'Member profile',
    subtitle: 'Loading…',
    hideLogBar: !auth.signedIn,
    body: `<main class="al-main" id="member-main"><p class="al-muted">Loading…</p></main>`,
  });

  const main = document.getElementById('member-main');
  if (!userId) {
    main.innerHTML = `
      <section class="al-panel">
        <p class="al-error">No member specified.</p>
        <p><a class="al-btn" href="/amc-a-lister/leaderboard.html">← Back to leaderboard</a></p>
      </section>
    `;
    return;
  }

  try {
    const token = auth.signedIn ? auth.token : undefined;
    const { profile, currentUserId } = await leaderboardApi.profile(userId, token);
    document.querySelector('.al-page-title').textContent = profile.displayName;
    document.querySelector('.al-page-sub').textContent = currentUserId === profile.userId
      ? 'Your public watch log and A-List stats.'
      : 'Public watch log and A-List stats.';
    document.title = `${profile.displayName} — AMC A-Lister`;
    renderProfile(main, profile, { currentUserId, auth });
  } catch (err) {
    main.innerHTML = `
      <section class="al-panel">
        <p class="al-error">${escapeHtml(err.message || 'Could not load profile.')}</p>
        <p><a class="al-btn" href="/amc-a-lister/leaderboard.html">← Back to leaderboard</a></p>
      </section>
    `;
  }
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

function renderProfile(main, profile, { currentUserId, auth }) {
  const { stats, watches } = profile;
  const theaters = [...new Set(watches.map((w) => w.location).filter(Boolean))].sort();
  const formats = [...new Set(watches.map((w) => w.format).filter(Boolean))].sort();
  const periodLabel = stats.periodMonth ? monthLabel(`${stats.periodMonth}-01`) : 'This month';
  const isYou = currentUserId === profile.userId;

  main.innerHTML = `
    <p class="al-member-back"><a class="al-link-btn" href="/amc-a-lister/leaderboard.html">← Leaderboard</a></p>

    <section class="al-panel al-member-stats">
      <h2 class="al-section-title">All-time stats</h2>
      <div class="al-hud al-hud-6">
        ${statCard('Seen', stats.totalSeen, 'count')}
        ${statCard('Savings', stats.totalSavings, 'money-signed')}
        ${statCard('Billed', stats.totalBilled, 'money')}
        ${statCard('Cost / movie', stats.costPerMovie, 'money')}
        ${statCard('Avg ticket', stats.avgTicket, 'money')}
        ${statCard('Avg runtime', stats.avgRuntimeMin, 'runtime')}
        ${statCard('Avg rating', stats.avgRating, 'rating')}
        ${statCard('DNFs', stats.dnfCount, 'count')}
      </div>
      <div class="al-member-period">
        <h3 class="al-member-period-title">${escapeHtml(periodLabel)}</h3>
        <div class="al-hud">
          ${statCard('Movies', stats.periodMovies, 'count')}
          ${statCard('Net savings', stats.periodSavings, 'money-signed')}
        </div>
      </div>
    </section>

    <section class="al-panel al-panel--log al-member-log">
      <div class="al-toolbar al-toolbar--log">
        <input class="al-input al-toolbar-search" id="member-search" type="search" placeholder="Search title or theater…" />
        <select class="al-select al-toolbar-filter" id="member-theater">
          <option value="">All theaters</option>
          ${theaters.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
        </select>
        <select class="al-select al-toolbar-filter al-toolbar-filter--format" id="member-format">
          <option value="">All formats</option>
          ${formats.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
        </select>
        <label class="al-check"><input type="checkbox" id="member-alone" /> Alone</label>
        <label class="al-check"><input type="checkbox" id="member-dnf" /> DNF only</label>
        <span class="al-muted" id="member-count"></span>
      </div>
      <div class="al-log-list-wrap" id="member-table"></div>
    </section>

    ${!isYou && auth.signedIn ? `
      <p class="al-member-compare">
        <a class="al-btn al-btn-primary" href="/amc-a-lister/leaderboard.html?compare=${encodeURIComponent(profile.userId)}">
          Compare with ${escapeHtml(profile.displayName)}
        </a>
      </p>
    ` : ''}
  `;

  const state = { watches, filtered: watches };

  const render = () => {
    document.getElementById('member-count').textContent = `${state.filtered.length} of ${state.watches.length}`;
    document.getElementById('member-table').innerHTML = tableHtml(state.filtered);
  };

  const applyFilters = () => {
    const q = document.getElementById('member-search').value.trim().toLowerCase();
    const theater = document.getElementById('member-theater').value;
    const format = document.getElementById('member-format').value;
    const alone = document.getElementById('member-alone').checked;
    const dnfOnly = document.getElementById('member-dnf').checked;

    state.filtered = state.watches.filter((w) => {
      if (q && !`${w.title} ${w.location || ''}`.toLowerCase().includes(q)) return false;
      if (theater && w.location !== theater) return false;
      if (format && w.format !== format) return false;
      if (alone && !w.saw_alone) return false;
      if (dnfOnly && !w.dnf) return false;
      return true;
    });
    render();
  };

  ['member-search', 'member-theater', 'member-format', 'member-alone', 'member-dnf'].forEach((id) => {
    document.getElementById(id).addEventListener('input', applyFilters);
    document.getElementById(id).addEventListener('change', applyFilters);
  });

  render();
}

function statCard(label, value, kind) {
  let display = '—';
  let extraClass = '';
  if (kind === 'count') {
    display = String(value ?? 0);
  } else if (kind === 'money') {
    display = money(value);
  } else if (kind === 'money-signed') {
    extraClass = value > 0 ? 'is-savings' : (value < 0 ? 'is-cost' : '');
    display = value > 0 ? `+${money(value)}` : money(value);
  } else if (kind === 'runtime') {
    display = value > 0 ? `${value} min` : '—';
  } else if (kind === 'rating') {
    display = value != null ? `${value}★` : '—';
  }

  return `
    <div class="al-stat">
      <div class="al-stat-label">${escapeHtml(label)}</div>
      <div class="al-stat-value ${extraClass}">${escapeHtml(display)}</div>
    </div>
  `;
}

function tableHtml(watches) {
  if (!watches.length) return '<div class="al-empty">No screenings logged yet.</div>';
  return `
    <div class="al-log-list al-log-list--readonly">
      <div class="al-log-head" aria-hidden="true">
        <span class="al-log-col al-col-poster"></span>
        <span class="al-log-col">Date</span>
        <span class="al-log-col">Title</span>
        <span class="al-log-col">Location</span>
        <span class="al-log-col">Format</span>
        <span class="al-log-col">Seat</span>
        <span class="al-log-col">Charge</span>
        <span class="al-log-col">Rating</span>
      </div>
      ${watches.map((w) => viewRowHtml(w)).join('')}
    </div>
  `;
}

function mobileLogMeta(w) {
  const primary = [
    shortDate(w.watched_on),
    w.format || 'Standard',
    money(w.ticket_cents),
    ratingLabel(w),
  ].filter(Boolean).map((part) => escapeHtml(String(part))).join(' · ');
  const location = escapeHtml(w.location || '—');
  return `<span class="al-log-meta-primary">${primary}</span><span class="al-log-meta-location">${location}</span>`;
}

function viewRowHtml(w) {
  return `
    <div class="al-log-entry">
      <article class="al-log-row">
        <div class="al-log-col al-col-poster">${posterHtml(w)}</div>
        <div class="al-log-col al-log-col--desktop">${shortDate(w.watched_on)}</div>
        <div class="al-log-col--body">
          <div class="al-log-col al-log-col--title">${escapeHtml(w.title)}</div>
          <div class="al-log-col al-log-col--mobile-meta al-only-mobile">${mobileLogMeta(w)}</div>
        </div>
        <div class="al-log-col al-log-col--desktop al-muted">${escapeHtml(w.location || '—')}</div>
        <div class="al-log-col al-log-col--desktop">${w.format ? escapeHtml(w.format) : '—'}</div>
        <div class="al-log-col al-log-col--desktop al-muted">${escapeHtml([w.auditorium, w.seat].filter(Boolean).join(' · ') || '—')}</div>
        <div class="al-log-col al-log-col--desktop al-log-col--num">${money(w.ticket_cents)}</div>
        <div class="al-log-col al-log-col--desktop">${ratingLabel(w)}</div>
      </article>
    </div>
  `;
}
