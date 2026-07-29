import { watchesApi, movieApi } from './api.js';
import { parseMoneyInput, escapeHtml } from './format.js';

const FORMATS = ['', 'IMAX', 'Dolby', 'IMAX 3D', '70MM', 'Q&A'];

export function renderQuickLogBar() {
  const formatOptions = FORMATS.map((f) => `<option value="${f}">${f || 'Standard'}</option>`).join('');
  const today = new Date().toISOString().slice(0, 10);

  return `
    <header class="al-quicklog">
      <form class="al-quicklog-form" id="quick-log-form" autocomplete="off">
        <div class="al-quicklog-field al-search-wrap">
          <label class="sr-only" for="ql-title">Movie</label>
          <input class="al-quicklog-input" id="ql-title" name="title" type="text" placeholder="Movie title" required />
          <div class="al-search-results" id="ql-title-results" hidden></div>
        </div>
        <div class="al-quicklog-field">
          <label class="sr-only" for="ql-date">Date</label>
          <input class="al-quicklog-input" id="ql-date" name="watched_on" type="date" value="${today}" required />
        </div>
        <div class="al-quicklog-field al-quicklog-field--narrow">
          <label class="sr-only" for="ql-ticket">Ticket</label>
          <input class="al-quicklog-input" id="ql-ticket" name="ticket" type="text" inputmode="decimal" placeholder="$24.95" />
        </div>
        <div class="al-quicklog-field al-quicklog-field--narrow">
          <label class="sr-only" for="ql-format">Format</label>
          <select class="al-quicklog-input" id="ql-format" name="format">${formatOptions}</select>
        </div>
        <button class="al-quicklog-submit" type="submit">Log it</button>
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
  let searchTimer = null;

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
      format: form.format.value,
      ticket_cents: parseMoneyInput(form.ticket.value),
      location: null,
      auditorium: null,
      seat: null,
      rating: null,
      dnf: false,
      saw_alone: false,
      notes: null,
      tmdb_id: tmdbInput.value ? Number(tmdbInput.value) : null,
    };

    try {
      await watchesApi.create(auth.token, payload);
      statusEl.textContent = `Logged ${payload.title}`;
      statusEl.classList.add('is-success');
      form.reset();
      form.watched_on.value = new Date().toISOString().slice(0, 10);
      tmdbInput.value = '';
      titleInput.focus();
      if (onSuccess) await onSuccess();
      setTimeout(() => { statusEl.textContent = ''; statusEl.classList.remove('is-success'); }, 2500);
    } catch (err) {
      statusEl.textContent = err.message || 'Could not save.';
      statusEl.classList.add('is-error');
    }
  });
}
