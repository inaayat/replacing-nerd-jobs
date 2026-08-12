import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { watchesApi, showingInvitesApi } from './api.js';
import { shortDate, money, escapeHtml, posterHtml } from './format.js';
import { wireUserSuggest } from './user-suggest.js';

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Bulk add to showings',
    subtitle: 'Pick one A-Lister and tag or invite them across many theater screenings at once.',
    signedIn: true,
    hideLogBar: true,
    body: `<main class="al-main" id="bulk-add-main"><p class="al-muted">Loading…</p></main>`,
  });

  await loadPage(auth);
});

function hasCompanion(watch, username) {
  const needle = String(username || '').trim().toLowerCase();
  if (!needle) return false;
  return (watch.companions || []).some((c) => String(c.username || '').toLowerCase() === needle);
}

function statusLabel(watch, username) {
  if (hasCompanion(watch, username)) {
    return '<span class="al-badge al-badge--together">Already tagged</span>';
  }
  const names = (watch.companions || []).map((c) => c.username).filter(Boolean);
  if (!names.length) return '';
  return `<span class="al-badge al-badge--together">with ${escapeHtml(names.join(', '))}</span>`;
}

async function loadPage(auth) {
  const main = document.getElementById('bulk-add-main');
  if (!main) return;

  const { watches } = await watchesApi.list(auth.token);
  const theaterWatches = watches.filter((w) => w.in_theaters !== false && w.location);

  const state = {
    watches: theaterWatches,
    selected: new Set(),
    username: '',
    saving: false,
    message: '',
    error: '',
  };

  main.className = 'al-main al-main--bulk-add';

  main.innerHTML = `
    <section class="al-panel al-panel--log">
      <div class="al-toolbar al-toolbar--log al-toolbar--bulk-add">
        <div class="al-bulk-add-user al-search-wrap">
          <label class="sr-only" for="bulk-username">Username</label>
          <input class="al-input" id="bulk-username" type="text" maxlength="24"
                 placeholder="Search username…" autocomplete="off" />
          <div class="al-search-results" id="bulk-username-results" hidden></div>
        </div>
        <input class="al-input al-toolbar-search" id="bulk-search" type="search" placeholder="Search title or theater…" />
        <label class="al-check"><input type="checkbox" id="bulk-hide-tagged" /> Hide already tagged</label>
        <button type="button" class="al-btn" id="bulk-select-visible">Select visible</button>
        <button type="button" class="al-btn" id="bulk-clear-selection">Clear</button>
        <a href="/amc-a-lister/" class="al-btn">← Watch log</a>
        <span class="al-muted" id="bulk-count"></span>
      </div>
      <div class="al-bulk-ratings-list al-bulk-add-list" id="bulk-list"></div>
    </section>
    <div class="al-bulk-ratings-bar" id="bulk-bar" hidden>
      <span class="al-muted" id="bulk-bar-count"></span>
      <div class="al-bulk-ratings-bar-actions">
        <button type="button" class="al-btn" id="bulk-discard">Clear selection</button>
        <button type="button" class="al-btn al-btn-primary" id="bulk-save">Add to selected</button>
      </div>
    </div>
    <p class="al-error" id="bulk-error" hidden></p>
    <p class="al-muted" id="bulk-message" hidden></p>
  `;

  const filteredWatches = () => {
    const q = document.getElementById('bulk-search').value.trim().toLowerCase();
    const hideTagged = document.getElementById('bulk-hide-tagged').checked;
    return state.watches.filter((w) => {
      if (q && !`${w.title} ${w.location || ''}`.toLowerCase().includes(q)) return false;
      if (hideTagged && hasCompanion(w, state.username)) return false;
      return true;
    });
  };

  const updateBar = () => {
    const bar = document.getElementById('bulk-bar');
    const countEl = document.getElementById('bulk-bar-count');
    const saveBtn = document.getElementById('bulk-save');
    const n = state.selected.size;
    const hasSelection = n > 0;
    main.classList.toggle('has-bulk-bar', hasSelection);
    bar.hidden = !hasSelection;
    if (!hasSelection) return;
    const who = state.username.trim() || '…';
    countEl.textContent = `${n} screening${n === 1 ? '' : 's'} → ${who}`;
    saveBtn.disabled = state.saving || !state.username.trim();
  };

  const render = () => {
    const filtered = filteredWatches();
    document.getElementById('bulk-count').textContent = `${filtered.length} of ${state.watches.length}`;
    document.getElementById('bulk-list').innerHTML = listHtml(filtered, state);
    updateBar();
  };

  document.getElementById('bulk-username').addEventListener('input', (e) => {
    state.username = e.target.value.trim();
    // Drop selections that are already tagged once the handle is known.
    if (state.username) {
      for (const id of [...state.selected]) {
        const watch = state.watches.find((w) => w.id === id);
        if (watch && hasCompanion(watch, state.username)) state.selected.delete(id);
      }
    }
    render();
  });

  wireUserSuggest(
    document.getElementById('bulk-username'),
    document.getElementById('bulk-username-results'),
    {
      token: auth.token,
      minChars: 0,
      onSelect: (username) => {
        state.username = username;
        document.getElementById('bulk-username').value = username;
        for (const id of [...state.selected]) {
          const watch = state.watches.find((w) => w.id === id);
          if (watch && hasCompanion(watch, username)) state.selected.delete(id);
        }
        render();
      },
    },
  );

  document.getElementById('bulk-search').addEventListener('input', render);
  document.getElementById('bulk-hide-tagged').addEventListener('change', render);

  document.getElementById('bulk-select-visible').addEventListener('click', () => {
    for (const watch of filteredWatches()) {
      if (hasCompanion(watch, state.username)) continue;
      state.selected.add(watch.id);
    }
    render();
  });

  document.getElementById('bulk-clear-selection').addEventListener('click', () => {
    state.selected.clear();
    render();
  });

  document.getElementById('bulk-discard').addEventListener('click', () => {
    state.selected.clear();
    state.error = '';
    state.message = '';
    document.getElementById('bulk-error').hidden = true;
    document.getElementById('bulk-message').hidden = true;
    render();
  });

  document.getElementById('bulk-list').addEventListener('change', (event) => {
    const input = event.target.closest('.al-bulk-add-check');
    if (!input) return;
    if (input.checked) state.selected.add(input.value);
    else state.selected.delete(input.value);
    updateBar();
    input.closest('.al-bulk-ratings-row')?.classList.toggle('is-selected', input.checked);
  });

  window.addEventListener('beforeunload', (event) => {
    if (!state.selected.size || state.saving) return;
    event.preventDefault();
    event.returnValue = '';
  });

  document.getElementById('bulk-save').addEventListener('click', async () => {
    const username = state.username.trim();
    const watchIds = [...state.selected];
    if (!username || !watchIds.length || state.saving) return;

    state.saving = true;
    state.error = '';
    state.message = '';
    document.getElementById('bulk-error').hidden = true;
    document.getElementById('bulk-message').hidden = true;
    document.getElementById('bulk-save').disabled = true;
    document.getElementById('bulk-discard').disabled = true;

    try {
      const result = await showingInvitesApi.bulkCreate(auth.token, {
        username,
        watch_ids: watchIds,
      });
      const { watches } = await watchesApi.list(auth.token);
      state.watches = watches.filter((w) => w.in_theaters !== false && w.location);
      state.selected.clear();

      const s = result.summary || {};
      const parts = [];
      if (s.linked) parts.push(`tagged ${s.linked}`);
      if (s.invited) parts.push(`invited ${s.invited}`);
      if (s.already) parts.push(`already linked ${s.already}`);
      if (s.failed) parts.push(`${s.failed} failed`);
      state.message = parts.length
        ? `${result.username || username}: ${parts.join(' · ')}.`
        : `No changes for ${result.username || username}.`;
      document.getElementById('bulk-message').textContent = state.message;
      document.getElementById('bulk-message').hidden = false;

      if (s.failed) {
        const failed = (result.results || []).filter((r) => r.error && !r.already_pending);
        if (failed.length) {
          state.error = failed.map((r) => r.error).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
          document.getElementById('bulk-error').textContent = state.error;
          document.getElementById('bulk-error').hidden = false;
        }
      }

      await populateSidebarStats(auth);
      render();
    } catch (err) {
      state.error = err.message || 'Could not add them to those showings.';
      document.getElementById('bulk-error').textContent = state.error;
      document.getElementById('bulk-error').hidden = false;
    } finally {
      state.saving = false;
      document.getElementById('bulk-save').disabled = false;
      document.getElementById('bulk-discard').disabled = false;
      updateBar();
    }
  });

  render();
}

function listHtml(watches, state) {
  if (!watches.length) {
    return '<div class="al-empty">No theater screenings match.</div>';
  }
  return `
    <div class="al-bulk-ratings-head al-bulk-add-head" aria-hidden="true">
      <span class="al-bulk-ratings-col al-bulk-add-col-check"></span>
      <span class="al-bulk-ratings-col al-col-poster"></span>
      <span class="al-bulk-ratings-col">Date</span>
      <span class="al-bulk-ratings-col">Title</span>
      <span class="al-bulk-ratings-col">Theater</span>
      <span class="al-bulk-ratings-col">Ticket</span>
    </div>
    ${watches.map((w) => rowHtml(w, state)).join('')}
  `;
}

function rowHtml(watch, state) {
  const tagged = hasCompanion(watch, state.username);
  const checked = state.selected.has(watch.id);
  return `
    <label class="al-bulk-ratings-row al-bulk-add-row${checked ? ' is-selected' : ''}${tagged ? ' is-tagged' : ''}" data-id="${watch.id}">
      <span class="al-bulk-ratings-col al-bulk-add-col-check">
        <input class="al-bulk-add-check" type="checkbox" value="${watch.id}"
               ${checked ? 'checked' : ''} ${tagged ? 'disabled' : ''}
               aria-label="Select ${escapeHtml(watch.title)}" />
      </span>
      <span class="al-bulk-ratings-col al-col-poster">${posterHtml(watch)}</span>
      <span class="al-bulk-ratings-col al-bulk-ratings-col--date">${shortDate(watch.watched_on)}</span>
      <span class="al-bulk-ratings-col al-bulk-ratings-col--title">
        ${escapeHtml(watch.title)}
        ${statusLabel(watch, state.username)}
      </span>
      <span class="al-bulk-ratings-col al-bulk-add-col-theater al-muted">${escapeHtml(watch.location || '—')}</span>
      <span class="al-bulk-ratings-col al-bulk-add-col-ticket">${money(watch.ticket_cents)}</span>
    </label>
  `;
}
