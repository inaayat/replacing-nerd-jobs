import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { watchesApi } from './api.js';
import { money, shortDate, ratingLabel, escapeHtml, posterHtml } from './format.js';

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Watch log',
    subtitle: 'Search and filter every screening.',
    body: `<main class="al-main" id="log-main"><p class="al-muted">Loading…</p></main>`,
  });

  await loadLog(auth);
}, { quickLogOnSuccess: async (auth) => {
  await populateSidebarStats(auth);
  location.reload();
}});

async function loadLog(auth) {
  const main = document.getElementById('log-main');
  if (!main) return;

  const { watches } = await watchesApi.list(auth.token);
  const theaters = [...new Set(watches.map((w) => w.location).filter(Boolean))].sort();
  const formats = [...new Set(watches.map((w) => w.format).filter(Boolean))].sort();

  main.innerHTML = `
    <section class="al-panel">
      <div class="al-toolbar">
        <input class="al-input" id="log-search" type="search" placeholder="Search title or theater…" style="max-width:240px" />
        <select class="al-select" id="log-theater" style="max-width:180px">
          <option value="">All theaters</option>
          ${theaters.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
        </select>
        <select class="al-select" id="log-format" style="max-width:140px">
          <option value="">All formats</option>
          ${formats.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
        </select>
        <label class="al-check"><input type="checkbox" id="log-alone" /> Alone</label>
        <label class="al-check"><input type="checkbox" id="log-dnf" /> DNF only</label>
        <span class="al-muted" id="log-count"></span>
      </div>
      <div class="al-log-list-wrap" id="log-table"></div>
    </section>
  `;

  const state = { watches, filtered: watches };
  const render = () => {
    document.getElementById('log-count').textContent = `${state.filtered.length} of ${watches.length}`;
    document.getElementById('log-table').innerHTML = tableHtml(state.filtered, auth.token);
    wireRowActions(auth.token, render);
  };

  const applyFilters = () => {
    const q = document.getElementById('log-search').value.trim().toLowerCase();
    const theater = document.getElementById('log-theater').value;
    const format = document.getElementById('log-format').value;
    const alone = document.getElementById('log-alone').checked;
    const dnfOnly = document.getElementById('log-dnf').checked;

    state.filtered = watches.filter((w) => {
      if (q && !`${w.title} ${w.location || ''}`.toLowerCase().includes(q)) return false;
      if (theater && w.location !== theater) return false;
      if (format && w.format !== format) return false;
      if (alone && !w.saw_alone) return false;
      if (dnfOnly && !w.dnf) return false;
      return true;
    });
    render();
  };

  ['log-search', 'log-theater', 'log-format', 'log-alone', 'log-dnf'].forEach((id) => {
    document.getElementById(id).addEventListener('input', applyFilters);
    document.getElementById(id).addEventListener('change', applyFilters);
  });

  render();
}

function tableHtml(watches, token) {
  if (!watches.length) return '<div class="al-empty">No matches.</div>';
  return `
    <div class="al-log-list">
      <div class="al-log-head" aria-hidden="true">
        <span class="al-log-col al-col-poster"></span>
        <span class="al-log-col">Date</span>
        <span class="al-log-col">Title</span>
        <span class="al-log-col">Location</span>
        <span class="al-log-col">Format</span>
        <span class="al-log-col">Seat</span>
        <span class="al-log-col">Charge</span>
        <span class="al-log-col">Rating</span>
        <span class="al-log-col">Actions</span>
      </div>
      ${watches.map((w) => `
        <article class="al-log-row" data-id="${w.id}">
          <div class="al-log-col al-col-poster">${posterHtml(w)}</div>
          <div class="al-log-col">${shortDate(w.watched_on)}</div>
          <div class="al-log-col al-log-col--title">${escapeHtml(w.title)}</div>
          <div class="al-log-col al-muted">${escapeHtml(w.location || '—')}</div>
          <div class="al-log-col">${w.format ? escapeHtml(w.format) : '—'}</div>
          <div class="al-log-col al-muted">${escapeHtml([w.auditorium, w.seat].filter(Boolean).join(' · ') || '—')}</div>
          <div class="al-log-col al-log-col--num">${money(w.ticket_cents)}</div>
          <div class="al-log-col">${ratingLabel(w)}</div>
          <div class="al-log-col al-row-actions">
            <a class="al-link-btn" href="/amc-a-lister/add.html?id=${encodeURIComponent(w.id)}">Edit</a>
            <button type="button" class="al-link-btn" data-delete="${w.id}">Delete</button>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function wireRowActions(token, rerender) {
  document.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this screening?')) return;
      await watchesApi.remove(token, btn.dataset.delete);
      location.reload();
    });
  });
}
