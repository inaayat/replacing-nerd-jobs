import { watchesApi, movieApi } from './api.js';
import { parseMoneyInput, escapeHtml } from './format.js';
import { loadUserTheaters, rememberTheater, wireTheaterSuggest } from './theater-suggest.js';
import { todayISO } from './dates.js';
import { wireComboboxKeys } from './combobox.js';
import { wireSeenWithPicker } from './user-suggest.js';

const FORMATS = ['', 'IMAX', 'Dolby', 'IMAX 3D', '70MM', 'Q&A'];

export function renderQuickLogBar() {
  const formatOptions = FORMATS.map((f) => `<option value="${f}">${f || 'Standard'}</option>`).join('');
  const today = todayISO();

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

        <div class="al-quicklog-expand" id="ql-expand" inert>
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
              <div class="al-quicklog-field al-quicklog-field--seen-with" data-theater-only>
                <label for="ql-seen-with">Seen with</label>
                <div class="al-seen-with" id="ql-seen-with-wrap">
                  <div class="al-seen-with-chips" id="ql-seen-with-chips"></div>
                  <div class="al-search-wrap">
                    <input class="al-quicklog-input" id="ql-seen-with" type="text" placeholder="Add username…" autocomplete="off" maxlength="24" />
                    <div class="al-search-results" id="ql-seen-with-results" hidden></div>
                  </div>
                </div>
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

  const seenWith = wireSeenWithPicker({
    chipsEl: document.getElementById('ql-seen-with-chips'),
    input: document.getElementById('ql-seen-with'),
    resultsEl: document.getElementById('ql-seen-with-results'),
    token: auth.token,
    onChange: () => checkExpand(),
  });

  loadUserTheaters(auth.token).then((list) => { theaters = list; });
  wireTheaterSuggest(locationInput, theaterResultsEl, {
    getTheaters: () => theaters,
  });
  wireComboboxKeys(titleInput, resultsEl);
  wireComboboxKeys(locationInput, theaterResultsEl);

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
      seenWith.clear();
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
    // `inert`, not aria-hidden: the panel collapses with grid-template-rows
    // rather than display:none, so its inputs stayed in the tab order while
    // being announced as hidden.
    expandEl.toggleAttribute('inert', !on);
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
      || (logMode === 'theater' && seenWith.getUsernames().length)
    );
    setExpanded(active);
  };

  ['ql-date', 'ql-title', 'ql-rating', 'ql-notes', 'ql-seen-with'].forEach((id) => {
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
            // Picking the film is never the last step, so hand the caret to the
            // next field. Theater focus also opens the past-theater list, which
            // usually turns the rest of the log into one click.
            focusAfterTitle(logMode);
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

  const submitBtn = document.getElementById('ql-submit');
  let saving = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // The resolve() round trip below leaves a ~1s window in which a second
    // click would log the same screening twice.
    if (saving) return;
    saving = true;
    submitBtn.disabled = true;
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
      seen_with: inTheaters ? seenWith.getUsernames() : [],
      saw_alone: inTheaters ? seenWith.getUsernames().length === 0 : false,
    };

    if (!payload.tmdb_id && payload.title) {
      payload.tmdb_id = await movieApi.resolve(auth.token, payload.title);
    }

    try {
      const { seen_with: seenResult, removed_watchlist } = await watchesApi.create(auth.token, payload);
      const withCount = seenResult?.summary
        ? (seenResult.summary.linked || 0) + (seenResult.summary.invited || 0)
        : payload.seen_with.length;
      const withNote = withCount
        ? ` · seen with ${withCount}`
        : '';
      statusEl.textContent = `Logged ${payload.title}${inTheaters ? '' : ' (off-theater)'}${withNote}`;
      statusEl.classList.add('is-success');
      if (inTheaters && payload.location) {
        theaters = rememberTheater(theaters, payload.location);
      }
      form.reset();
      form.watched_on.value = todayISO();
      baselineDate = form.watched_on.value;
      tmdbInput.value = '';
      ratingInput.disabled = false;
      seenWith.clear();
      setLogMode('theater');
      titleInput.focus();
      // Hand the caller what was logged (and which list row it came from) so a
      // watchlist entry can be cleared once it's been seen.
      const source = pendingSource;
      pendingSource = null;
      if (onSuccess) {
        await onSuccess({
          title: payload.title,
          tmdb_id: payload.tmdb_id,
          in_theaters: inTheaters,
          dnf: !!payload.dnf,
          watchlistId: source?.watchlistId ?? null,
          removed_watchlist: removed_watchlist || [],
        });
      }
      setTimeout(() => { statusEl.textContent = ''; statusEl.classList.remove('is-success'); }, 2500);
    } catch (err) {
      statusEl.textContent = err.message || 'Could not save.';
      statusEl.classList.add('is-error');
    } finally {
      saving = false;
      submitBtn.disabled = false;
    }
  });
}

/**
 * Move to whatever still needs typing once the title is settled: the theater
 * for a screening, the rating for anything watched at home.
 */
function focusAfterTitle(mode) {
  const next = mode === 'off-theater'
    ? document.getElementById('ql-rating')
    : document.getElementById('ql-location');
  next?.focus();
}

/** Which list row, if any, seeded the bar — reported back on a successful log. */
let pendingSource = null;

/** Pre-fill the sticky quick-log bar (e.g. from the Coming Soon list). */
export function prefillQuickLog({ title, tmdbId, mode = 'theater', watchlistId = null } = {}) {
  const shell = document.getElementById('al-quicklog');
  const titleInput = document.getElementById('ql-title');
  const tmdbInput = document.getElementById('ql-tmdb_id');
  if (!shell || !titleInput) return;

  pendingSource = watchlistId ? { watchlistId } : null;

  if (mode === 'off-theater') {
    shell.querySelector('[data-log-mode="off-theater"]')?.click();
  } else {
    shell.querySelector('[data-log-mode="theater"]')?.click();
  }

  if (title) titleInput.value = title;
  if (tmdbId != null) tmdbInput.value = String(tmdbId);
  else tmdbInput.value = '';

  // Expand the extra fields without firing a TMDB search we don't need: the
  // tmdb_id is already known when this comes from a list row.
  titleInput.dispatchEvent(new Event('change', { bubbles: true }));
  shell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  // The title arrived with the row, so start on the first field that is still
  // blank rather than making the user tab past what is already filled in.
  if (title) focusAfterTitle(mode);
  else titleInput.focus();
}
