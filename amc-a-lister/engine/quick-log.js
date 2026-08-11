import { watchesApi, movieApi } from './api.js';
import { parseMoneyInput, escapeHtml } from './format.js';
import { loadUserTheaters, rememberTheater, wireTheaterSuggest } from './theater-suggest.js';

const FORMATS = ['', 'IMAX', 'Dolby', 'IMAX 3D', '70MM', 'Q&A'];

export function renderQuickLogBar() {
  const formatOptions = FORMATS.map((f) => `<option value="${f}">${f || 'Standard'}</option>`).join('');
  const today = new Date().toISOString().slice(0, 10);

  return `
    <header class="al-quicklog" id="al-quicklog">
      <div class="al-quicklog-mode" role="tablist" aria-label="Log type">
        <button type="button" class="al-quicklog-mode-btn is-active" data-log-mode="theater" role="tab" aria-selected="true">In theaters</button>
        <button type="button" class="al-quicklog-mode-btn" data-log-mode="off-theater" role="tab" aria-selected="false">Not in theaters</button>
      </div>
      <form class="al-quicklog-form" id="quick-log-form" autocomplete="off">
        <div class="al-quicklog-primary">
          <div class="al-quicklog-field al-quicklog-field--date">
            <label for="ql-date">Date</label>
            <input class="al-quicklog-input" id="ql-date" name="watched_on" type="date" value="${today}" required />
          </div>
          <div class="al-quicklog-field al-quicklog-field--title al-search-wrap">
            <label for="ql-title">Movie</label>
            <input class="al-quicklog-input" id="ql-title" name="title" type="text" placeholder="Title" required autocomplete="off" />
            <div class="al-search-results" id="ql-title-results" hidden></div>
          </div>
          <div class="al-quicklog-field al-quicklog-field--location al-search-wrap" data-theater-only>
            <label for="ql-location">Theater</label>
            <input class="al-quicklog-input" id="ql-location" name="location" type="text" placeholder="AMC Lincoln Square 13" autocomplete="off" />
            <div class="al-search-results" id="ql-theater-results" hidden></div>
          </div>
          <div class="al-quicklog-field al-quicklog-field--ticket" data-theater-only>
            <label for="ql-ticket">Price</label>
            <input class="al-quicklog-input" id="ql-ticket" name="ticket" type="text" inputmode="decimal" placeholder="24.95" />
          </div>
          <div class="al-quicklog-field al-quicklog-field--submit">
            <label for="ql-submit">Submit</label>
            <button class="al-quicklog-submit" id="ql-submit" type="submit">Log it</button>
          </div>
        </div>

        <div class="al-quicklog-expand" id="ql-expand" aria-hidden="true">
          <div class="al-quicklog-expand-inner">
            <div class="al-quicklog-extra">
              <div class="al-quicklog-field" data-theater-only>
                <label for="ql-format">Format</label>
                <select class="al-quicklog-input" id="ql-format" name="format">${formatOptions}</select>
              </div>
              <div class="al-quicklog-field" data-theater-only>
                <label for="ql-auditorium">Auditorium</label>
                <input class="al-quicklog-input" id="ql-auditorium" name="auditorium" type="text" />
              </div>
              <div class="al-quicklog-field" data-theater-only>
                <label for="ql-seat">Seat</label>
                <input class="al-quicklog-input" id="ql-seat" name="seat" type="text" />
              </div>
              <div class="al-quicklog-field">
                <label for="ql-rating">Rating</label>
                <input class="al-quicklog-input" id="ql-rating" name="rating" type="number" min="1" max="5" step="0.5" placeholder="1–5" />
              </div>
              <div class="al-quicklog-field al-quicklog-field--checks" data-theater-only>
                <label class="al-check"><input type="checkbox" id="ql-dnf" name="dnf" /> DNF</label>
              </div>
              <div class="al-quicklog-field al-quicklog-field--notes" data-theater-only>
                <label for="ql-notes">Notes</label>
                <input class="al-quicklog-input" id="ql-notes" name="notes" type="text" placeholder="Optional" />
              </div>
            </div>
          </div>
        </div>

        <input type="hidden" id="ql-tmdb_id" value="" />
        <input type="hidden" id="ql-in_theaters" value="true" />
      </form>
      <p class="al-quicklog-hint al-muted" id="ql-hint" hidden>Off-theater watches stay in your log but are excluded from savings and leaderboard stats.</p>
      <p class="al-quicklog-status" id="ql-status" aria-live="polite"></p>
    </header>
  `;
}

export function wireQuickLog(auth, { onSuccess } = {}) {
  const form = document.getElementById('quick-log-form');
  if (!form || !auth.signedIn || !auth.token) return;

  const shell = document.getElementById('al-quicklog');
  const titleInput = document.getElementById('ql-title');
  const resultsEl = document.getElementById('ql-title-results');
  const locationInput = document.getElementById('ql-location');
  const theaterResultsEl = document.getElementById('ql-theater-results');
  const tmdbInput = document.getElementById('ql-tmdb_id');
  const statusEl = document.getElementById('ql-status');
  const dnfInput = document.getElementById('ql-dnf');
  const ratingInput = document.getElementById('ql-rating');
  const expandEl = document.getElementById('ql-expand');
  const inTheatersInput = document.getElementById('ql-in_theaters');
  const hintEl = document.getElementById('ql-hint');
  const initialDate = form.watched_on.value;
  let baselineDate = initialDate;
  let searchTimer = null;
  let expanded = false;
  let logMode = 'theater';
  let theaters = [];

  loadUserTheaters(auth.token).then((list) => { theaters = list; });
  wireTheaterSuggest(locationInput, theaterResultsEl, {
    getTheaters: () => theaters,
  });

  const setLogMode = (mode) => {
    logMode = mode;
    const inTheaters = mode === 'theater';
    inTheatersInput.value = inTheaters ? 'true' : 'false';
    shell.classList.toggle('is-off-theater', !inTheaters);
    hintEl.hidden = inTheaters;
    shell.querySelectorAll('[data-log-mode]').forEach((btn) => {
      const active = btn.dataset.logMode === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (!inTheaters) {
      form.location.value = '';
      form.ticket.value = '';
      form.format.value = '';
      form.auditorium.value = '';
      form.seat.value = '';
      dnfInput.checked = false;
      ratingInput.disabled = false;
      form.notes.value = '';
      shell.classList.remove('has-title');
    }
    checkExpand();
  };

  shell.querySelectorAll('[data-log-mode]').forEach((btn) => {
    btn.addEventListener('click', () => setLogMode(btn.dataset.logMode));
  });

  const setExpanded = (on) => {
    if (expanded === on) return;
    expanded = on;
    shell.classList.toggle('is-expanded', on);
    expandEl.setAttribute('aria-hidden', on ? 'false' : 'true');
  };

  const checkExpand = () => {
    const hasTitle = Boolean(titleInput.value.trim());
    shell.classList.toggle('has-title', hasTitle && logMode === 'theater');

    const active = Boolean(
      hasTitle
      || form.watched_on.value !== baselineDate
      || form.rating.value
      || (logMode === 'theater' && form.notes.value.trim())
      || (logMode === 'theater' && dnfInput.checked)
    );
    setExpanded(active);
  };

  ['ql-date', 'ql-title', 'ql-rating', 'ql-notes'].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener('input', checkExpand);
    el.addEventListener('change', checkExpand);
  });

  dnfInput.addEventListener('change', () => {
    ratingInput.disabled = dnfInput.checked;
    if (dnfInput.checked) ratingInput.value = '';
    checkExpand();
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
            checkExpand();
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

    const inTheaters = inTheatersInput.value !== 'false';
    const payload = {
      watched_on: form.watched_on.value,
      title: form.title.value.trim(),
      location: inTheaters ? (form.location.value.trim() || null) : 'Not in theaters',
      format: inTheaters ? form.format.value : '',
      auditorium: inTheaters ? (form.auditorium.value.trim() || null) : null,
      seat: inTheaters ? (form.seat.value.trim() || null) : null,
      ticket_cents: inTheaters ? parseMoneyInput(form.ticket.value) : null,
      rating: inTheaters && dnfInput.checked ? null : (form.rating.value ? Number(form.rating.value) : null),
      dnf: inTheaters ? dnfInput.checked : false,
      notes: inTheaters ? (form.notes.value.trim() || null) : null,
      tmdb_id: tmdbInput.value ? Number(tmdbInput.value) : null,
      in_theaters: inTheaters,
    };

    if (!payload.tmdb_id && payload.title) {
      payload.tmdb_id = await movieApi.resolve(auth.token, payload.title);
    }

    try {
      await watchesApi.create(auth.token, payload);
      statusEl.textContent = `Logged ${payload.title}${inTheaters ? '' : ' (off-theater)'}`;
      statusEl.classList.add('is-success');
      if (inTheaters && payload.location) {
        theaters = rememberTheater(theaters, payload.location);
      }
      form.reset();
      form.watched_on.value = new Date().toISOString().slice(0, 10);
      baselineDate = form.watched_on.value;
      tmdbInput.value = '';
      ratingInput.disabled = false;
      setLogMode('theater');
      titleInput.focus();
      if (onSuccess) await onSuccess();
      setTimeout(() => { statusEl.textContent = ''; statusEl.classList.remove('is-success'); }, 2500);
    } catch (err) {
      statusEl.textContent = err.message || 'Could not save.';
      statusEl.classList.add('is-error');
    }
  });
}

/** Pre-fill the sticky quick-log bar (e.g. from want-to-watch). */
export function prefillQuickLog({ title, tmdbId, mode = 'theater' } = {}) {
  const shell = document.getElementById('al-quicklog');
  const titleInput = document.getElementById('ql-title');
  const tmdbInput = document.getElementById('ql-tmdb_id');
  if (!shell || !titleInput) return;

  if (mode === 'off-theater') {
    shell.querySelector('[data-log-mode="off-theater"]')?.click();
  } else {
    shell.querySelector('[data-log-mode="theater"]')?.click();
  }

  if (title) titleInput.value = title;
  if (tmdbId != null) tmdbInput.value = String(tmdbId);
  else tmdbInput.value = '';

  titleInput.dispatchEvent(new Event('input', { bubbles: true }));
  shell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  titleInput.focus();
}
