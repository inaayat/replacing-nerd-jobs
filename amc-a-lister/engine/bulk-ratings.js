import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { watchesApi } from './api.js';
import { shortDate, escapeHtml, posterHtml } from './format.js';

const RATING_VALUES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Bulk edit ratings',
    subtitle: 'Update ratings for your whole watch log in one place. Only changed rows are saved.',
    signedIn: true,
    body: `<main class="al-main" id="bulk-ratings-main"><p class="al-muted">Loading…</p></main>`,
  });

  await loadPage(auth);
});

function ratingSelectValue(watch) {
  if (watch.dnf) return 'dnf';
  if (watch.rating == null) return '';
  return String(watch.rating);
}

function parseRatingSelect(value) {
  if (value === 'dnf') return { rating: null, dnf: true };
  if (!value) return { rating: null, dnf: false };
  return { rating: Number(value), dnf: false };
}

function ratingMatches(a, b) {
  return !!a.dnf === !!b.dnf && (a.rating ?? null) === (b.rating ?? null);
}

function ratingOptionsHtml(selected) {
  const opts = [
    { value: '', label: 'Unrated' },
    ...RATING_VALUES.map((n) => ({ value: String(n), label: `${n}★` })),
    { value: 'dnf', label: 'DNF' },
  ];
  return opts.map((o) => (
    `<option value="${o.value}"${o.value === selected ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
  )).join('');
}

async function loadPage(auth) {
  const main = document.getElementById('bulk-ratings-main');
  if (!main) return;

  const { watches } = await watchesApi.list(auth.token);

  const state = {
    watches,
    edits: new Map(),
    saving: false,
    message: '',
    error: '',
  };

  main.innerHTML = `
    <section class="al-panel al-panel--log">
      <div class="al-toolbar al-toolbar--log">
        <input class="al-input al-toolbar-search" id="bulk-search" type="search" placeholder="Search title…" />
        <label class="al-check"><input type="checkbox" id="bulk-unrated" /> Unrated only</label>
        <label class="al-check"><input type="checkbox" id="bulk-changed" /> Changed only</label>
        <a href="/amc-a-lister/" class="al-btn">← Watch log</a>
        <span class="al-muted" id="bulk-count"></span>
      </div>
      <div class="al-bulk-ratings-list" id="bulk-list"></div>
    </section>
    <div class="al-bulk-ratings-bar" id="bulk-bar" hidden>
      <span class="al-muted" id="bulk-bar-count"></span>
      <div class="al-bulk-ratings-bar-actions">
        <button type="button" class="al-btn" id="bulk-discard">Discard</button>
        <button type="button" class="al-btn al-btn-primary" id="bulk-save">Save ratings</button>
      </div>
    </div>
    <p class="al-error" id="bulk-error" hidden></p>
    <p class="al-muted" id="bulk-message" hidden></p>
  `;

  const getOriginal = (watch) => ({ rating: watch.rating ?? null, dnf: !!watch.dnf });

  const getCurrent = (watch) => state.edits.get(watch.id) || getOriginal(watch);

  const isChanged = (watch) => !ratingMatches(getOriginal(watch), getCurrent(watch));

  const changedWatches = () => state.watches.filter(isChanged);

  const filteredWatches = () => {
    const q = document.getElementById('bulk-search').value.trim().toLowerCase();
    const unratedOnly = document.getElementById('bulk-unrated').checked;
    const changedOnly = document.getElementById('bulk-changed').checked;

    return state.watches.filter((w) => {
      const current = getCurrent(w);
      if (q && !w.title.toLowerCase().includes(q)) return false;
      if (unratedOnly && (current.dnf || current.rating != null)) return false;
      if (changedOnly && !isChanged(w)) return false;
      return true;
    });
  };

  const updateBar = () => {
    const changed = changedWatches();
    const bar = document.getElementById('bulk-bar');
    const countEl = document.getElementById('bulk-bar-count');
    if (!changed.length) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    countEl.textContent = `${changed.length} unsaved change${changed.length === 1 ? '' : 's'}`;
  };

  const render = () => {
    const filtered = filteredWatches();
    document.getElementById('bulk-count').textContent = `${filtered.length} of ${state.watches.length}`;
    document.getElementById('bulk-list').innerHTML = listHtml(filtered, state, getCurrent, isChanged);
    wireRows(state, render, getOriginal);
    updateBar();
  };

  document.getElementById('bulk-search').addEventListener('input', render);
  document.getElementById('bulk-unrated').addEventListener('change', render);
  document.getElementById('bulk-changed').addEventListener('change', render);

  document.getElementById('bulk-discard').addEventListener('click', () => {
    state.edits.clear();
    state.error = '';
    state.message = '';
    document.getElementById('bulk-error').hidden = true;
    document.getElementById('bulk-message').hidden = true;
    render();
  });

  document.getElementById('bulk-save').addEventListener('click', async () => {
    const changed = changedWatches();
    if (!changed.length || state.saving) return;

    state.saving = true;
    state.error = '';
    state.message = '';
    document.getElementById('bulk-error').hidden = true;
    document.getElementById('bulk-message').hidden = true;
    document.getElementById('bulk-save').disabled = true;
    document.getElementById('bulk-discard').disabled = true;

    try {
      const rating_updates = changed.map((w) => {
        const { rating, dnf } = getCurrent(w);
        return { id: w.id, rating, dnf };
      });
      const { watches: updated } = await watchesApi.bulkUpdateRatings(auth.token, rating_updates);
      const byId = new Map(updated.map((w) => [w.id, w]));
      state.watches = state.watches.map((w) => byId.get(w.id) || w);
      state.edits.clear();
      state.message = `Saved ${updated.length} rating${updated.length === 1 ? '' : 's'}.`;
      document.getElementById('bulk-message').textContent = state.message;
      document.getElementById('bulk-message').hidden = false;
      await populateSidebarStats(auth);
      render();
    } catch (err) {
      state.error = err.message || 'Save failed.';
      document.getElementById('bulk-error').textContent = state.error;
      document.getElementById('bulk-error').hidden = false;
    } finally {
      state.saving = false;
      document.getElementById('bulk-save').disabled = false;
      document.getElementById('bulk-discard').disabled = false;
    }
  });

  render();
}

function listHtml(watches, state, getCurrent, isChanged) {
  if (!watches.length) return '<div class="al-empty">No matches.</div>';
  return `
    <div class="al-bulk-ratings-head" aria-hidden="true">
      <span class="al-bulk-ratings-col al-col-poster"></span>
      <span class="al-bulk-ratings-col">Date</span>
      <span class="al-bulk-ratings-col">Title</span>
      <span class="al-bulk-ratings-col">Rating</span>
    </div>
    ${watches.map((w) => rowHtml(w, getCurrent(w), isChanged(w))).join('')}
  `;
}

function rowHtml(watch, current, changed) {
  const selected = ratingSelectValue(current);
  return `
    <div class="al-bulk-ratings-row${changed ? ' is-changed' : ''}" data-id="${watch.id}">
      <div class="al-bulk-ratings-col al-col-poster">${posterHtml(watch)}</div>
      <div class="al-bulk-ratings-col al-bulk-ratings-col--date">${shortDate(watch.watched_on)}</div>
      <div class="al-bulk-ratings-col al-bulk-ratings-col--title">
        ${escapeHtml(watch.title)}
        ${watch.in_theaters === false ? '<span class="al-badge al-badge--muted">Off-theater</span>' : ''}
      </div>
      <div class="al-bulk-ratings-col al-bulk-ratings-col--rating">
        <label class="sr-only" for="rating-${watch.id}">Rating for ${escapeHtml(watch.title)}</label>
        <select class="al-select al-bulk-rating-select" id="rating-${watch.id}" data-id="${watch.id}">
          ${ratingOptionsHtml(selected)}
        </select>
      </div>
    </div>
  `;
}

function wireRows(state, render, getOriginal) {
  document.querySelectorAll('.al-bulk-rating-select').forEach((select) => {
    select.addEventListener('change', () => {
      const watch = state.watches.find((w) => w.id === select.dataset.id);
      if (!watch) return;
      const next = parseRatingSelect(select.value);
      if (ratingMatches(getOriginal(watch), next)) {
        state.edits.delete(watch.id);
      } else {
        state.edits.set(watch.id, next);
      }
      render();
    });
  });
}
