import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { watchesApi } from './api.js';
import { money, shortDate, ratingLabel, escapeHtml, posterHtml } from './format.js';
import { renderWatchEditForm, wireWatchEditForm } from './watch-form.js';

let reloadLog;

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Watch log',
    subtitle: 'Search and filter every screening.',
    body: `<main class="al-main" id="log-main"><p class="al-muted">Loading…</p></main>`,
  });

  reloadLog = () => loadLog(auth);
  await loadLog(auth);
}, { quickLogOnSuccess: async (auth) => {
  await Promise.all([reloadLog?.(), populateSidebarStats(auth)]);
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

  const state = { watches, filtered: watches, editingId: null };
  const render = () => {
    document.getElementById('log-count').textContent = `${state.filtered.length} of ${state.watches.length}`;
    document.getElementById('log-table').innerHTML = tableHtml(state.filtered, state.editingId);
    wireRowActions(auth, state, render);
  };

  const applyFilters = () => {
    const q = document.getElementById('log-search').value.trim().toLowerCase();
    const theater = document.getElementById('log-theater').value;
    const format = document.getElementById('log-format').value;
    const alone = document.getElementById('log-alone').checked;
    const dnfOnly = document.getElementById('log-dnf').checked;

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

  ['log-search', 'log-theater', 'log-format', 'log-alone', 'log-dnf'].forEach((id) => {
    document.getElementById(id).addEventListener('input', applyFilters);
    document.getElementById(id).addEventListener('change', applyFilters);
  });

  render();
}

function tableHtml(watches, editingId) {
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
      ${watches.map((w) => (
        w.id === editingId ? editRowHtml(w) : viewRowHtml(w)
      )).join('')}
    </div>
  `;
}

function viewRowHtml(w) {
  return `
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
        <button type="button" class="al-link-btn" data-edit="${w.id}">Edit</button>
        <button type="button" class="al-link-btn" data-delete="${w.id}">Delete</button>
      </div>
    </article>
  `;
}

function editRowHtml(w) {
  return `
    <article class="al-log-row al-log-row--editing" data-id="${w.id}">
      ${renderWatchEditForm(w, `edit-${w.id}`)}
    </article>
  `;
}

function wireRowActions(auth, state, render) {
  document.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.editingId = btn.dataset.edit;
      render();
    });
  });

  document.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this screening?')) return;
      await watchesApi.remove(auth.token, btn.dataset.delete);
      state.watches = state.watches.filter((w) => w.id !== btn.dataset.delete);
      if (state.editingId === btn.dataset.delete) state.editingId = null;
      state.filtered = state.filtered.filter((w) => w.id !== btn.dataset.delete);
      populateSidebarStats(auth);
      render();
    });
  });

  if (!state.editingId) return;

  const watch = state.watches.find((w) => w.id === state.editingId);
  if (!watch) {
    state.editingId = null;
    return;
  }

  const prefix = `edit-${watch.id}`;
  wireWatchEditForm(auth, watch, prefix, {
    onCancel: () => {
      state.editingId = null;
      render();
    },
    onSave: async (payload) => {
      const { watch: updated } = await watchesApi.update(auth.token, { id: watch.id, ...payload });
      const merged = {
        ...updated,
        poster_path: updated.tmdb_id === watch.tmdb_id ? watch.poster_path : null,
      };
      state.watches = state.watches.map((w) => (w.id === watch.id ? merged : w));
      state.filtered = state.filtered.map((w) => (w.id === watch.id ? merged : w));
      state.editingId = null;
      populateSidebarStats(auth);
      render();
    },
  });
}
