import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { watchesApi } from './api.js';
import { shortDate, escapeHtml, posterHtml } from './format.js';
import { theatersFromWatches } from './theater-suggest.js';
import { WATCH_FORMATS } from './watch-form.js';
import {
  screeningDraft,
  persistedScreening,
  screeningsMatch,
} from './bulk-edit.js';

const RATING_VALUES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Bulk edit',
    subtitle: 'Update rating, theater, format, seat, and ticket price for the whole log. Only changed rows are saved.',
    signedIn: true,
    hideLogBar: true,
    body: `<main class="al-main" id="bulk-ratings-main"><p class="al-muted">Loading…</p></main>`,
  });

  await loadPage(auth);
});

function ratingSelectValue(draft) {
  if (draft.dnf) return 'dnf';
  if (draft.rating == null) return '';
  return String(draft.rating);
}

function parseRatingSelect(value) {
  if (value === 'dnf') return { rating: null, dnf: true };
  if (!value) return { rating: null, dnf: false };
  return { rating: Number(value), dnf: false };
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

function formatOptionsHtml(selected) {
  const values = WATCH_FORMATS.includes(selected) ? WATCH_FORMATS : [...WATCH_FORMATS, selected];
  return values.map((f) => (
    `<option value="${escapeHtml(f)}"${f === selected ? ' selected' : ''}>${escapeHtml(f || 'Standard')}</option>`
  )).join('');
}

async function loadPage(auth) {
  const main = document.getElementById('bulk-ratings-main');
  if (!main) return;

  const { watches } = await watchesApi.list(auth.token);
  const theaters = theatersFromWatches(watches);

  const state = {
    watches,
    edits: new Map(),
    saving: false,
    message: '',
    error: '',
  };

  main.className = 'al-main al-main--bulk-ratings';

  main.innerHTML = `
    <section class="al-panel al-panel--log">
      <div class="al-toolbar al-toolbar--log">
        <input class="al-input al-toolbar-search" id="bulk-search" type="search" placeholder="Search title…" />
        <label class="al-check"><input type="checkbox" id="bulk-unrated" /> Unrated only</label>
        <label class="al-check"><input type="checkbox" id="bulk-changed" /> Changed only</label>
        <a href="/amc-a-lister/" class="al-btn">← Watch log</a>
        <span class="al-muted" id="bulk-count"></span>
      </div>
      <datalist id="bulk-theaters">
        ${theaters.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}
      </datalist>
      <div class="al-bulk-ratings-list" id="bulk-list"></div>
    </section>
    <div class="al-bulk-ratings-bar" id="bulk-bar" hidden>
      <span class="al-muted" id="bulk-bar-count"></span>
      <div class="al-bulk-ratings-bar-actions">
        <button type="button" class="al-btn" id="bulk-discard">Discard</button>
        <button type="button" class="al-btn al-btn-primary" id="bulk-save">Save changes</button>
      </div>
    </div>
    <p class="al-error" id="bulk-error" hidden></p>
    <p class="al-muted" id="bulk-message" hidden></p>
  `;

  const getOriginal = (watch) => screeningDraft(watch);

  const getCurrent = (watch) => state.edits.get(watch.id) || getOriginal(watch);

  const isChanged = (watch) => !screeningsMatch(getOriginal(watch), getCurrent(watch));

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

  const showError = (message) => {
    const el = document.getElementById('bulk-error');
    el.textContent = message || '';
    el.hidden = !message;
  };

  const showMessage = (message) => {
    const el = document.getElementById('bulk-message');
    el.textContent = message || '';
    el.hidden = !message;
  };

  const updateBar = () => {
    const changed = changedWatches();
    const bar = document.getElementById('bulk-bar');
    const countEl = document.getElementById('bulk-bar-count');
    const hasChanges = changed.length > 0;
    main.classList.toggle('has-bulk-bar', hasChanges);
    if (!hasChanges) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    countEl.textContent = `${changed.length} unsaved change${changed.length === 1 ? '' : 's'}`;
  };

  const render = () => {
    const filtered = filteredWatches();
    document.getElementById('bulk-count').textContent = `${filtered.length} of ${state.watches.length}`;
    document.getElementById('bulk-list').innerHTML = listHtml(filtered, getCurrent, isChanged);
    updateBar();
  };

  const rememberEdit = (watch, next) => {
    if (screeningsMatch(getOriginal(watch), next)) state.edits.delete(watch.id);
    else state.edits.set(watch.id, next);
  };

  document.getElementById('bulk-search').addEventListener('input', render);
  document.getElementById('bulk-unrated').addEventListener('change', render);
  document.getElementById('bulk-changed').addEventListener('change', render);

  window.addEventListener('beforeunload', (event) => {
    if (!changedWatches().length || state.saving) return;
    event.preventDefault();
    event.returnValue = '';
  });

  // Text fields must not re-render the list: a new input would drop the caret.
  document.getElementById('bulk-list').addEventListener('input', (event) => {
    const field = event.target.closest('[data-bulk-field]');
    if (!field || field.tagName === 'SELECT') return;
    const watch = state.watches.find((w) => w.id === field.dataset.id);
    if (!watch) return;
    const next = { ...getCurrent(watch) };
    if (field.dataset.bulkField === 'location') next.location = field.value;
    else if (field.dataset.bulkField === 'seat') next.seat = field.value;
    else if (field.dataset.bulkField === 'ticket') next.ticket = field.value;
    else return;
    rememberEdit(watch, next);
    field.closest('.al-bulk-ratings-row')?.classList.toggle('is-changed', isChanged(watch));
    updateBar();
  });

  document.getElementById('bulk-list').addEventListener('change', (event) => {
    const field = event.target.closest('[data-bulk-field]');
    if (!field) return;
    const watch = state.watches.find((w) => w.id === field.dataset.id);
    if (!watch) return;
    const next = { ...getCurrent(watch) };
    const kind = field.dataset.bulkField;

    if (kind === 'rating') {
      Object.assign(next, parseRatingSelect(field.value));
    } else if (kind === 'format') {
      next.format = field.value;
    } else if (kind === 'in_theaters') {
      next.in_theaters = field.checked;
    } else if (kind === 'location') {
      next.location = field.value;
    } else if (kind === 'seat') {
      next.seat = field.value;
    } else if (kind === 'ticket') {
      next.ticket = field.value;
    } else {
      return;
    }

    rememberEdit(watch, next);
    const row = field.closest('.al-bulk-ratings-row');
    row?.classList.toggle('is-changed', isChanged(watch));
    if (kind === 'in_theaters') syncTheaterFields(row, next.in_theaters);
    updateBar();
  });

  document.getElementById('bulk-discard').addEventListener('click', () => {
    state.edits.clear();
    state.error = '';
    state.message = '';
    showError('');
    showMessage('');
    render();
  });

  document.getElementById('bulk-save').addEventListener('click', async () => {
    const changed = changedWatches();
    if (!changed.length || state.saving) return;

    const rating_updates = [];
    for (const watch of changed) {
      const parsed = persistedScreening(getCurrent(watch));
      if (parsed.error) {
        showMessage('');
        showError(`${watch.title}: ${parsed.error}`);
        return;
      }
      rating_updates.push({ id: watch.id, ...parsed.data });
    }

    state.saving = true;
    state.error = '';
    state.message = '';
    showError('');
    showMessage('');
    document.getElementById('bulk-save').disabled = true;
    document.getElementById('bulk-discard').disabled = true;

    try {
      const { watches: updated = [] } = await watchesApi.bulkUpdateRatings(auth.token, rating_updates);
      if (!updated.length) {
        throw new Error('No changes were saved. Try again.');
      }
      const byId = new Map(updated.map((w) => [w.id, w]));
      state.watches = state.watches.map((w) => {
        const row = byId.get(w.id);
        if (!row) return w;
        return { ...w, ...row, poster_path: row.poster_path || w.poster_path };
      });
      state.edits.clear();
      showMessage(`Saved ${updated.length} screening${updated.length === 1 ? '' : 's'}.`);
      await populateSidebarStats(auth);
      render();
    } catch (err) {
      showError(err.message || 'Save failed.');
    } finally {
      state.saving = false;
      document.getElementById('bulk-save').disabled = false;
      document.getElementById('bulk-discard').disabled = false;
    }
  });

  render();
}

function syncTheaterFields(row, inTheaters) {
  if (!row) return;
  row.querySelectorAll('[data-theater-only]').forEach((el) => {
    el.disabled = !inTheaters;
  });
  row.classList.toggle('is-off-theater', !inTheaters);
}

function listHtml(watches, getCurrent, isChanged) {
  if (!watches.length) return '<div class="al-empty">No matches.</div>';
  return `
    <div class="al-bulk-ratings-head" aria-hidden="true">
      <span class="al-bulk-ratings-col al-col-poster"></span>
      <span class="al-bulk-ratings-col">Date</span>
      <span class="al-bulk-ratings-col">Title</span>
      <span class="al-bulk-ratings-col">In theaters</span>
      <span class="al-bulk-ratings-col">Theater</span>
      <span class="al-bulk-ratings-col">Format</span>
      <span class="al-bulk-ratings-col">Seat</span>
      <span class="al-bulk-ratings-col">Ticket</span>
      <span class="al-bulk-ratings-col">Rating</span>
    </div>
    ${watches.map((w) => rowHtml(w, getCurrent(w), isChanged(w))).join('')}
  `;
}

function rowHtml(watch, current, changed) {
  const selected = ratingSelectValue(current);
  const disabled = current.in_theaters ? '' : ' disabled';
  return `
    <div class="al-bulk-ratings-row${changed ? ' is-changed' : ''}${current.in_theaters ? '' : ' is-off-theater'}" data-id="${watch.id}">
      <div class="al-bulk-ratings-col al-col-poster">${posterHtml(watch)}</div>
      <div class="al-bulk-ratings-col al-bulk-ratings-col--date">${shortDate(watch.watched_on)}</div>
      <div class="al-bulk-ratings-col al-bulk-ratings-col--title">${escapeHtml(watch.title)}</div>
      <label class="al-bulk-ratings-col al-bulk-ratings-col--flag al-check">
        <input type="checkbox" data-bulk-field="in_theaters" data-id="${watch.id}" ${current.in_theaters ? 'checked' : ''} />
        <span class="al-bulk-label">In theaters</span>
      </label>
      <label class="al-bulk-ratings-col al-bulk-ratings-col--theater">
        <span class="al-bulk-label">Theater</span>
        <input class="al-input al-bulk-control" data-bulk-field="location" data-theater-only data-id="${watch.id}" list="bulk-theaters" value="${escapeHtml(current.location)}"${disabled} />
      </label>
      <label class="al-bulk-ratings-col al-bulk-ratings-col--format">
        <span class="al-bulk-label">Format</span>
        <select class="al-select al-bulk-control" data-bulk-field="format" data-theater-only data-id="${watch.id}"${disabled}>
          ${formatOptionsHtml(current.format)}
        </select>
      </label>
      <label class="al-bulk-ratings-col al-bulk-ratings-col--seat">
        <span class="al-bulk-label">Seat</span>
        <input class="al-input al-bulk-control" data-bulk-field="seat" data-theater-only data-id="${watch.id}" value="${escapeHtml(current.seat)}" maxlength="40"${disabled} />
      </label>
      <label class="al-bulk-ratings-col al-bulk-ratings-col--ticket">
        <span class="al-bulk-label">Ticket ($)</span>
        <input class="al-input al-bulk-control" data-bulk-field="ticket" data-theater-only data-id="${watch.id}" inputmode="decimal" value="${escapeHtml(current.ticket)}"${disabled} />
      </label>
      <label class="al-bulk-ratings-col al-bulk-ratings-col--rating">
        <span class="al-bulk-label">Rating</span>
        <select class="al-select al-bulk-control" data-bulk-field="rating" data-id="${watch.id}" aria-label="Rating for ${escapeHtml(watch.title)}">
          ${ratingOptionsHtml(selected)}
        </select>
      </label>
    </div>
  `;
}
