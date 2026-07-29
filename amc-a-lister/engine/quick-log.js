import { watchesApi, movieApi } from './api.js';
import { parseMoneyInput, escapeHtml } from './format.js';

const FORMATS = ['', 'IMAX', 'Dolby', 'IMAX 3D', '70MM', 'Q&A'];

export function renderQuickLogBar() {
  const formatOptions = FORMATS.map((f) => `<option value="${f}">${f || 'Standard'}</option>`).join('');
  const today = new Date().toISOString().slice(0, 10);

  return `
    <header class="al-quicklog">
      <form class="al-quicklog-form" id="quick-log-form" autocomplete="off">
        <div class="al-quicklog-field al-quicklog-field--title al-search-wrap">
          <label for="ql-title">Movie</label>
          <input class="al-quicklog-input" id="ql-title" name="title" type="text" placeholder="Title" required />
          <div class="al-search-results" id="ql-title-results" hidden></div>
        </div>
        <div class="al-quicklog-field">
          <label for="ql-date">Date seen</label>
          <input class="al-quicklog-input" id="ql-date" name="watched_on" type="date" value="${today}" required />
        </div>
        <div class="al-quicklog-field">
          <label for="ql-ticket">Ticket ($)</label>
          <input class="al-quicklog-input" id="ql-ticket" name="ticket" type="text" inputmode="decimal" placeholder="24.95" />
        </div>
        <div class="al-quicklog-field">
          <label for="ql-location">Theater</label>
          <input class="al-quicklog-input" id="ql-location" name="location" list="ql-theater-list" placeholder="AMC Lincoln Square 13" />
          <datalist id="ql-theater-list">
            <option value="AMC Lincoln Square 13"></option>
            <option value="AMC Empire 25"></option>
            <option value="N/A - India"></option>
          </datalist>
        </div>
        <div class="al-quicklog-field">
          <label for="ql-format">Format</label>
          <select class="al-quicklog-input" id="ql-format" name="format">${formatOptions}</select>
        </div>
        <div class="al-quicklog-field">
          <label for="ql-auditorium">Auditorium</label>
          <input class="al-quicklog-input" id="ql-auditorium" name="auditorium" type="text" />
        </div>
        <div class="al-quicklog-field">
          <label for="ql-seat">Seat</label>
          <input class="al-quicklog-input" id="ql-seat" name="seat" type="text" />
        </div>
        <div class="al-quicklog-field">
          <label for="ql-rating">Rating</label>
          <input class="al-quicklog-input" id="ql-rating" name="rating" type="number" min="1" max="5" step="0.5" placeholder="1–5" />
        </div>
        <div class="al-quicklog-field al-quicklog-field--checks">
          <label class="al-check"><input type="checkbox" id="ql-dnf" name="dnf" /> DNF</label>
          <label class="al-check"><input type="checkbox" id="ql-saw_alone" name="saw_alone" /> Saw alone</label>
        </div>
        <div class="al-quicklog-field al-quicklog-field--notes">
          <label for="ql-notes">Notes</label>
          <textarea class="al-quicklog-input al-quicklog-textarea" id="ql-notes" name="notes" rows="2" placeholder="Optional"></textarea>
        </div>
        <div class="al-quicklog-field al-quicklog-field--submit">
          <button class="al-quicklog-submit" type="submit">Log it</button>
        </div>
        <input type="hidden" id="ql-tmdb_id" value="" />
      </form>
      <p class="al-quicklog-status" id="ql-status" aria-live="polite"></p>
    </header>
  `;
}

export function wireQuickLog(auth, { onSuccess } = {}) {
  const form = document.getElementById('quick-log-form');
  if (!form || !auth.signedIn || !auth.token) return;

  const titleInput = document.getElementById('ql-title');
  const resultsEl = document.getElementById('ql-title-results');
  const tmdbInput = document.getElementById('ql-tmdb_id');
  const statusEl = document.getElementById('ql-status');
  const dnfInput = document.getElementById('ql-dnf');
  const ratingInput = document.getElementById('ql-rating');
  let searchTimer = null;

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

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.al-search-wrap')) resultsEl.hidden = true;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusEl.textContent = 'Saving…';
    statusEl.classList.remove('is-error', 'is-success');

    const payload = {
      watched_on: form.watched_on.value,
      title: form.title.value.trim(),
      location: form.location.value.trim() || null,
      format: form.format.value,
      auditorium: form.auditorium.value.trim() || null,
      seat: form.seat.value.trim() || null,
      ticket_cents: parseMoneyInput(form.ticket.value),
      rating: dnfInput.checked ? null : (form.rating.value ? Number(form.rating.value) : null),
      dnf: dnfInput.checked,
      saw_alone: form.saw_alone.checked,
      notes: form.notes.value.trim() || null,
      tmdb_id: tmdbInput.value ? Number(tmdbInput.value) : null,
    };

    try {
      await watchesApi.create(auth.token, payload);
      statusEl.textContent = `Logged ${payload.title}`;
      statusEl.classList.add('is-success');
      form.reset();
      form.watched_on.value = new Date().toISOString().slice(0, 10);
      tmdbInput.value = '';
      ratingInput.disabled = false;
      titleInput.focus();
      if (onSuccess) await onSuccess();
      setTimeout(() => { statusEl.textContent = ''; statusEl.classList.remove('is-success'); }, 2500);
    } catch (err) {
      statusEl.textContent = err.message || 'Could not save.';
      statusEl.classList.add('is-error');
    }
  });
}
