import { bootPage, renderShell, requireSignIn } from './nav.js';
import { watchesApi, movieApi } from './api.js';
import { parseMoneyInput, escapeHtml } from './format.js';

const FORMATS = ['', 'IMAX', 'Dolby', 'IMAX 3D', '70MM', 'Q&A'];

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  const params = new URLSearchParams(location.search);
  const editId = params.get('id');
  let existing = null;

  if (editId) {
    const { watches } = await watchesApi.list(auth.token);
    existing = watches.find((w) => w.id === editId) || null;
  }

  root.innerHTML = renderShell({
    title: existing ? 'Edit screening' : 'Log a movie',
    subtitle: 'Under 30 seconds — title, date, ticket value.',
    signedIn: true,
    body: `
    <main class="al-main">
      <form class="al-panel al-form-grid" id="watch-form">
        <div class="al-field span-2 al-search-wrap">
          <label for="title">Movie</label>
          <input class="al-input" id="title" name="title" required autocomplete="off" value="${escapeHtml(existing?.title || '')}" />
          <div class="al-search-results" id="title-results" hidden></div>
        </div>
        <div class="al-field">
          <label for="watched_on">Date seen</label>
          <input class="al-input" id="watched_on" name="watched_on" type="date" required value="${existing?.watched_on || new Date().toISOString().slice(0, 10)}" />
        </div>
        <div class="al-field">
          <label for="ticket">Ticket value ($)</label>
          <input class="al-input" id="ticket" name="ticket" inputmode="decimal" placeholder="24.95" value="${existing?.ticket_cents != null ? (existing.ticket_cents / 100).toFixed(2) : ''}" />
        </div>
        <div class="al-field">
          <label for="location">Theater</label>
          <input class="al-input" id="location" name="location" list="theater-list" value="${escapeHtml(existing?.location || '')}" />
          <datalist id="theater-list">
            <option value="AMC Lincoln Square 13"></option>
            <option value="AMC Empire 25"></option>
            <option value="N/A - India"></option>
          </datalist>
        </div>
        <div class="al-field">
          <label for="format">Format</label>
          <select class="al-select" id="format" name="format">
            ${FORMATS.map((f) => `<option value="${f}" ${existing?.format === f ? 'selected' : ''}>${f || 'Standard'}</option>`).join('')}
          </select>
        </div>
        <div class="al-field">
          <label for="auditorium">Auditorium</label>
          <input class="al-input" id="auditorium" name="auditorium" value="${escapeHtml(existing?.auditorium || '')}" />
        </div>
        <div class="al-field">
          <label for="seat">Seat</label>
          <input class="al-input" id="seat" name="seat" value="${escapeHtml(existing?.seat || '')}" />
        </div>
        <div class="al-field">
          <label for="rating">Rating (1–5)</label>
          <input class="al-input" id="rating" name="rating" type="number" min="1" max="5" step="0.5" value="${existing?.rating ?? ''}" ${existing?.dnf ? 'disabled' : ''} />
        </div>
        <div class="al-field" style="display:flex;align-items:end">
          <label class="al-check"><input type="checkbox" id="dnf" name="dnf" ${existing?.dnf ? 'checked' : ''} /> DNF</label>
        </div>
        <div class="al-field span-2">
          <label for="notes">Notes</label>
          <textarea class="al-textarea" id="notes" name="notes" rows="2">${escapeHtml(existing?.notes || '')}</textarea>
        </div>
        <input type="hidden" id="tmdb_id" value="${existing?.tmdb_id ?? ''}" />
        <div class="span-2 al-toolbar">
          <button class="al-btn al-btn-primary" type="submit">${existing ? 'Save changes' : 'Save screening'}</button>
          <p class="al-muted" id="form-status" style="margin:0"></p>
        </div>
      </form>
    </main>
    <div class="al-toast" id="toast" role="status"></div>
    `,
  });

  const form = document.getElementById('watch-form');
  const titleInput = document.getElementById('title');
  const resultsEl = document.getElementById('title-results');
  const tmdbInput = document.getElementById('tmdb_id');
  let searchTimer = null;

  document.getElementById('dnf').addEventListener('change', (e) => {
    const rating = document.getElementById('rating');
    rating.disabled = e.target.checked;
    if (e.target.checked) rating.value = '';
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
    const status = document.getElementById('form-status');
    status.textContent = 'Saving…';

    const payload = {
      watched_on: form.watched_on.value,
      title: form.title.value.trim(),
      location: form.location.value.trim() || null,
      format: form.format.value,
      auditorium: form.auditorium.value.trim() || null,
      seat: form.seat.value.trim() || null,
      ticket_cents: parseMoneyInput(form.ticket.value),
      rating: form.dnf.checked ? null : (form.rating.value ? Number(form.rating.value) : null),
      dnf: form.dnf.checked,
      notes: form.notes.value.trim() || null,
      tmdb_id: tmdbInput.value ? Number(tmdbInput.value) : null,
    };

    if (!payload.tmdb_id && payload.title) {
      payload.tmdb_id = await movieApi.resolve(auth.token, payload.title);
    }

    try {
      if (existing) {
        await watchesApi.update(auth.token, { id: existing.id, ...payload });
      } else {
        await watchesApi.create(auth.token, payload);
      }
      showToast('Saved');
      setTimeout(() => { location.href = '/amc-a-lister/'; }, 500);
    } catch (err) {
      status.textContent = err.message;
    }
  });
});

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('is-visible');
  setTimeout(() => el.classList.remove('is-visible'), 2000);
}
