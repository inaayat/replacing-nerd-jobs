import { movieApi } from './api.js';
import { parseMoneyInput, escapeHtml } from './format.js';
import { loadUserTheaters, wireTheaterSuggest } from './theater-suggest.js';

export const WATCH_FORMATS = ['', 'IMAX', 'Dolby', 'IMAX 3D', '70MM', 'Q&A'];

export function renderWatchEditForm(watch, prefix = 'edit') {
  const ticketVal = watch.ticket_cents != null ? (watch.ticket_cents / 100).toFixed(2) : '';
  const formatOptions = WATCH_FORMATS.map((f) => (
    `<option value="${f}" ${watch.format === f ? 'selected' : ''}>${f || 'Standard'}</option>`
  )).join('');

  return `
    <form class="al-log-edit-form al-form-grid" data-watch-edit="${watch.id}" id="${prefix}-form">
      <div class="al-field span-2 al-search-wrap">
        <label for="${prefix}-title">Movie</label>
        <input class="al-input" id="${prefix}-title" required autocomplete="off" value="${escapeHtml(watch.title)}" />
        <div class="al-search-results" id="${prefix}-title-results" hidden></div>
      </div>
      <div class="al-field">
        <label for="${prefix}-watched_on">Date seen</label>
        <input class="al-input" id="${prefix}-watched_on" type="date" required value="${watch.watched_on}" />
      </div>
      <div class="al-field">
        <label for="${prefix}-ticket">Ticket value ($)</label>
        <input class="al-input" id="${prefix}-ticket" inputmode="decimal" value="${ticketVal}" data-theater-only />
      </div>
      <div class="al-field" data-theater-only>
        <label for="${prefix}-location">Theater</label>
        <div class="al-search-wrap">
          <input class="al-input" id="${prefix}-location" type="text" autocomplete="off" value="${escapeHtml(watch.location || '')}" />
          <div class="al-search-results" id="${prefix}-theater-results" hidden></div>
        </div>
      </div>
      <div class="al-field" data-theater-only>
        <label for="${prefix}-format">Format</label>
        <select class="al-select" id="${prefix}-format">${formatOptions}</select>
      </div>
      <div class="al-field" data-theater-only>
        <label for="${prefix}-auditorium">Auditorium</label>
        <input class="al-input" id="${prefix}-auditorium" value="${escapeHtml(watch.auditorium || '')}" />
      </div>
      <div class="al-field" data-theater-only>
        <label for="${prefix}-seat">Seat</label>
        <input class="al-input" id="${prefix}-seat" value="${escapeHtml(watch.seat || '')}" />
      </div>
      <div class="al-field">
        <label for="${prefix}-rating">Rating (1–5)</label>
        <input class="al-input" id="${prefix}-rating" type="number" min="1" max="5" step="0.5" value="${watch.rating ?? ''}" ${watch.dnf ? 'disabled' : ''} />
      </div>
      <div class="al-field" style="display:flex;align-items:end" data-theater-only>
        <label class="al-check"><input type="checkbox" id="${prefix}-dnf" ${watch.dnf ? 'checked' : ''} /> DNF</label>
      </div>
      <div class="al-field" style="display:flex;align-items:end">
        <label class="al-check"><input type="checkbox" id="${prefix}-in_theaters" ${watch.in_theaters !== false ? 'checked' : ''} /> In theaters</label>
      </div>
      <div class="al-field span-2" data-theater-only>
        <label for="${prefix}-notes">Notes</label>
        <textarea class="al-textarea" id="${prefix}-notes" rows="2">${escapeHtml(watch.notes || '')}</textarea>
      </div>
      <input type="hidden" id="${prefix}-tmdb_id" value="${watch.tmdb_id ?? ''}" />
      <div class="span-2 al-toolbar">
        <button class="al-btn al-btn-primary" type="submit">Save changes</button>
        <button class="al-btn" type="button" data-cancel-edit>Cancel</button>
        <p class="al-muted" id="${prefix}-status" style="margin:0"></p>
      </div>
    </form>
  `;
}

export function wireWatchEditForm(auth, watch, prefix, { onSave, onCancel }) {
  const form = document.getElementById(`${prefix}-form`);
  if (!form) return;

  const titleInput = document.getElementById(`${prefix}-title`);
  const resultsEl = document.getElementById(`${prefix}-title-results`);
  const locationInput = document.getElementById(`${prefix}-location`);
  const theaterResultsEl = document.getElementById(`${prefix}-theater-results`);
  const tmdbInput = document.getElementById(`${prefix}-tmdb_id`);
  const dnfInput = document.getElementById(`${prefix}-dnf`);
  const ratingInput = document.getElementById(`${prefix}-rating`);
  const inTheatersInput = document.getElementById(`${prefix}-in_theaters`);
  const statusEl = document.getElementById(`${prefix}-status`);
  let searchTimer = null;
  let theaters = [];

  loadUserTheaters(auth.token).then((list) => { theaters = list; });
  wireTheaterSuggest(locationInput, theaterResultsEl, {
    getTheaters: () => theaters,
  });

  const syncTheaterFields = () => {
    const inTheaters = inTheatersInput.checked;
    form.querySelectorAll('[data-theater-only]').forEach((el) => {
      el.style.display = inTheaters ? '' : 'none';
    });
    if (!inTheaters) {
      dnfInput.checked = false;
      ratingInput.disabled = false;
    }
  };

  inTheatersInput.addEventListener('change', syncTheaterFields);
  syncTheaterFields();

  dnfInput.addEventListener('change', () => {
    ratingInput.disabled = dnfInput.checked;
    if (dnfInput.checked) ratingInput.value = '';
  });

  titleInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = titleInput.value.trim();
    if (q.length < 2) {
      resultsEl.hidden = true;
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const { results } = await movieApi.search(auth.token, q);
        if (!results.length) {
          resultsEl.hidden = true;
          return;
        }
        resultsEl.hidden = false;
        resultsEl.innerHTML = results.map((m) => `
          <button type="button" data-id="${m.tmdb_id}" data-title="${escapeHtml(m.title)}">
            ${m.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${m.poster_path}" alt="" width="28" height="42" style="border-radius:4px;object-fit:cover">` : '<span style="width:28px"></span>'}
            <span>${escapeHtml(m.title)}${m.year ? ` <span class="al-muted">(${m.year})</span>` : ''}</span>
          </button>
        `).join('');
        resultsEl.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', () => {
            titleInput.value = btn.dataset.title;
            tmdbInput.value = btn.dataset.id;
            resultsEl.hidden = true;
          });
        });
      } catch {
        resultsEl.hidden = true;
      }
    }, 300);
  });

  form.addEventListener('click', (e) => {
    if (!e.target.closest('.al-search-wrap')) resultsEl.hidden = true;
  });

  form.querySelector('[data-cancel-edit]')?.addEventListener('click', () => onCancel?.());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusEl.textContent = 'Saving…';

    const inTheaters = inTheatersInput.checked;
    const payload = {
      watched_on: document.getElementById(`${prefix}-watched_on`).value,
      title: titleInput.value.trim(),
      location: inTheaters ? (document.getElementById(`${prefix}-location`).value.trim() || null) : 'Not in theaters',
      format: inTheaters ? document.getElementById(`${prefix}-format`).value : '',
      auditorium: inTheaters ? (document.getElementById(`${prefix}-auditorium`).value.trim() || null) : null,
      seat: inTheaters ? (document.getElementById(`${prefix}-seat`).value.trim() || null) : null,
      ticket_cents: inTheaters ? parseMoneyInput(document.getElementById(`${prefix}-ticket`).value) : null,
      rating: inTheaters && dnfInput.checked ? null : (ratingInput.value ? Number(ratingInput.value) : null),
      dnf: inTheaters ? dnfInput.checked : false,
      notes: inTheaters ? (document.getElementById(`${prefix}-notes`).value.trim() || null) : null,
      tmdb_id: tmdbInput.value ? Number(tmdbInput.value) : null,
      in_theaters: inTheaters,
    };

    if (!payload.tmdb_id && payload.title) {
      payload.tmdb_id = await movieApi.resolve(auth.token, payload.title);
    }

    try {
      await onSave(payload);
    } catch (err) {
      statusEl.textContent = err.message || 'Could not save.';
    }
  });
}
