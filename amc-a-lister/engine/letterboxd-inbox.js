import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { letterboxdApi, watchesApi } from './api.js';
import { shortDate, escapeHtml, parseMoneyInput } from './format.js';
import { theatersFromWatches, wireTheaterSuggest, rememberTheater } from './theater-suggest.js';
import { wireComboboxKeys } from './combobox.js';
import { wireSeenWithPicker } from './user-suggest.js';
import { WATCH_FORMATS } from './watch-form.js';
import { draftWatchFromItem, defaultTicketCents } from './letterboxd.js';

const RATING_VALUES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const INCLUDE_REVIEW_KEY = 'alist.letterboxd.includeReview';

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Letterboxd inbox',
    subtitle: 'New films from your Letterboxd diary. Pick where you saw each one, adjust anything, and save.',
    signedIn: true,
    hideLogBar: true,
    body: `<main class="al-main" id="lb-main"><p class="al-muted">Checking Letterboxd…</p></main>`,
  });

  await loadPage(auth);
});

function includeReviewPref() {
  try {
    return localStorage.getItem(INCLUDE_REVIEW_KEY) !== '0';
  } catch {
    return true;
  }
}

function setIncludeReviewPref(on) {
  try {
    localStorage.setItem(INCLUDE_REVIEW_KEY, on ? '1' : '0');
  } catch {
    // ignore storage failures
  }
}

function stars(rating) {
  if (rating == null) return '';
  const full = Math.floor(rating);
  return `${'★'.repeat(full)}${rating % 1 ? '½' : ''}`;
}

async function loadPage(auth) {
  const main = document.getElementById('lb-main');
  if (!main) return;

  let lb;
  let watches = [];
  try {
    [lb, { watches }] = await Promise.all([
      letterboxdApi.sync(auth.token).catch((err) => {
        if (err.status === 400) return letterboxdApi.get(auth.token);
        throw err;
      }),
      watchesApi.list(auth.token),
    ]);
  } catch (err) {
    main.innerHTML = `<section class="al-panel"><p class="al-error">${escapeHtml(err.message || 'Could not reach Letterboxd.')}</p></section>`;
    return;
  }

  if (!lb.username) {
    main.innerHTML = `
      <section class="al-panel">
        <div class="al-empty">
          <p>Connect your Letterboxd account first.</p>
          <p><a class="al-btn al-btn-primary" href="/amc-a-lister/settings.html#letterboxd-form">Add username in Settings</a></p>
        </div>
      </section>
    `;
    return;
  }

  const state = {
    username: lb.username,
    profileUrl: lb.profile_url,
    syncedAt: lb.synced_at,
    items: lb.items || [],
    watches,
    theaters: theatersFromWatches(watches),
    open: null,
    busy: false,
    includeReview: includeReviewPref(),
    message: '',
    error: '',
  };

  main.innerHTML = `
    <section class="al-panel al-panel--log">
      <div class="al-toolbar al-toolbar--log">
        <button type="button" class="al-btn" id="lb-refresh">Check Letterboxd now</button>
        <button type="button" class="al-btn" id="lb-all-home">Mark all as at home</button>
        <label class="al-check"><input type="checkbox" id="lb-include-review" ${state.includeReview ? 'checked' : ''} /> Copy Letterboxd review into notes</label>
        <span class="al-muted" id="lb-count"></span>
      </div>
      <p class="al-muted">
        From <a href="${escapeHtml(state.profileUrl)}" target="_blank" rel="noopener">letterboxd.com/${escapeHtml(state.username)}</a>.
        Films already in your log are skipped. <a href="/amc-a-lister/settings.html#letterboxd-form">Change account</a>
      </p>
      <p class="al-error" id="lb-error" role="alert" hidden></p>
      <p class="al-muted" id="lb-message" aria-live="polite"></p>
      <div class="al-lb-list" id="lb-list"></div>
    </section>
  `;

  const listEl = document.getElementById('lb-list');

  const setMessage = (msg, isError = false) => {
    const errorEl = document.getElementById('lb-error');
    const msgEl = document.getElementById('lb-message');
    errorEl.hidden = !isError;
    errorEl.textContent = isError ? msg : '';
    msgEl.textContent = isError ? '' : msg;
  };

  const render = () => {
    document.getElementById('lb-count').textContent = state.items.length
      ? `${state.items.length} to review`
      : '';
    document.getElementById('lb-all-home').disabled = !state.items.length || state.busy;
    if (!state.items.length) {
      listEl.innerHTML = '<div class="al-empty">All caught up. New Letterboxd diary entries will show up here.</div>';
      return;
    }
    listEl.innerHTML = state.items.map((item) => cardHtml(item, state)).join('');
    if (state.open) wireOpenForm(auth, state, { onSaved, onCancel: () => { state.open = null; render(); } });
  };

  const removeItem = (guid) => {
    state.items = state.items.filter((i) => i.guid !== guid);
    if (state.open?.guid === guid) state.open = null;
  };

  const onSaved = async (item, mode, watch) => {
    removeItem(item.guid);
    state.watches = [watch, ...state.watches];
    if (mode === 'theater' && watch.location) state.theaters = rememberTheater(state.theaters, watch.location);
    setMessage(`Logged ${item.title} ${mode === 'theater' ? 'in theaters' : 'at home'}.`);
    render();
    populateSidebarStats(auth);
  };

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-lb-action]');
    if (!btn || state.busy) return;
    const guid = btn.closest('[data-guid]')?.dataset.guid;
    const item = state.items.find((i) => i.guid === guid);
    if (!item) return;
    const action = btn.dataset.lbAction;

    if (action === 'theater' || action === 'home') {
      state.open = { guid, mode: action };
      render();
      document.getElementById(action === 'theater' ? 'lb-location' : 'lb-rating')?.focus();
      return;
    }

    if (action === 'skip') {
      state.busy = true;
      try {
        await letterboxdApi.skip(auth.token, guid);
        removeItem(guid);
        setMessage(`Skipped ${item.title}. It won't come back.`);
      } catch (err) {
        setMessage(err.message || 'Could not skip.', true);
      } finally {
        state.busy = false;
        render();
      }
    }
  });

  document.getElementById('lb-include-review').addEventListener('change', (e) => {
    state.includeReview = e.target.checked;
    setIncludeReviewPref(state.includeReview);
    if (state.open) render();
  });

  document.getElementById('lb-refresh').addEventListener('click', async (e) => {
    if (state.busy) return;
    state.busy = true;
    e.target.disabled = true;
    setMessage('Checking Letterboxd…');
    try {
      const next = await letterboxdApi.sync(auth.token, { force: true });
      state.items = next.items || [];
      if (state.open && !state.items.some((i) => i.guid === state.open.guid)) state.open = null;
      setMessage(next.added ? `${next.added} new from Letterboxd.` : 'Nothing new on Letterboxd.');
    } catch (err) {
      setMessage(err.message || 'Could not reach Letterboxd.', true);
    } finally {
      state.busy = false;
      e.target.disabled = false;
      render();
    }
  });

  document.getElementById('lb-all-home').addEventListener('click', async () => {
    if (state.busy || !state.items.length) return;
    const count = state.items.length;
    const ok = confirm(
      `Log all ${count} film${count === 1 ? '' : 's'} as watched at home?\n\n`
      + 'Each keeps its Letterboxd date and rating. Home watches stay out of your savings and theater stats.',
    );
    if (!ok) return;
    state.busy = true;
    state.open = null;
    render();
    let done = 0;
    const failures = [];
    for (const item of [...state.items]) {
      setMessage(`Logging ${done + 1} of ${count}…`);
      try {
        const draft = draftWatchFromItem(item, { mode: 'home', includeReview: state.includeReview });
        const { watch } = await letterboxdApi.importItem(auth.token, item.guid, draft);
        removeItem(item.guid);
        state.watches = [watch, ...state.watches];
        done += 1;
      } catch (err) {
        failures.push(`${item.title}: ${err.message || 'failed'}`);
      }
    }
    state.busy = false;
    if (failures.length) setMessage(`Logged ${done}. Could not log ${failures.join('; ')}`, true);
    else setMessage(`Logged ${done} film${done === 1 ? '' : 's'} at home.`);
    render();
    populateSidebarStats(auth);
  });

  render();
}

function cardHtml(item, state) {
  const open = state.open?.guid === item.guid ? state.open : null;
  const poster = item.poster_url
    ? `<img class="al-lb-poster" src="${escapeHtml(item.poster_url)}" alt="" loading="lazy" width="70" height="105">`
    : '<span class="al-lb-poster al-poster--empty" aria-hidden="true"></span>';
  const meta = [
    `Watched ${shortDate(item.watched_on)}`,
    item.rating != null ? `<span class="al-lb-stars" aria-label="${item.rating} stars">${stars(item.rating)}</span>` : 'Unrated',
  ].join(' · ');
  return `
    <article class="al-lb-card${open ? ' is-open' : ''}" data-guid="${escapeHtml(item.guid)}">
      <div class="al-lb-card-main">
        ${poster}
        <div class="al-lb-card-body">
          <h3 class="al-lb-title">
            ${escapeHtml(item.title)}${item.film_year ? ` <span class="al-muted">(${item.film_year})</span>` : ''}
            ${item.classification === 'rewatch' ? '<span class="al-badge">Rewatch</span>' : ''}
          </h3>
          <p class="al-muted al-lb-meta">${meta}${item.link ? ` · <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">Letterboxd</a>` : ''}</p>
          ${item.review ? `<p class="al-lb-review">${escapeHtml(item.review)}</p>` : ''}
          ${open ? '' : `
            <div class="al-lb-actions">
              <span class="al-lb-ask">Where did you watch it?</span>
              <button type="button" class="al-btn al-btn-primary" data-lb-action="theater">In theaters</button>
              <button type="button" class="al-btn" data-lb-action="home">At home</button>
              <button type="button" class="al-link-btn" data-lb-action="skip">Skip</button>
            </div>
          `}
        </div>
      </div>
      ${open ? formHtml(item, open.mode, state) : ''}
    </article>
  `;
}

function ratingOptionsHtml(selected, allowDnf) {
  const opts = [
    { value: '', label: 'Unrated' },
    ...RATING_VALUES.map((n) => ({ value: String(n), label: `${n}★` })),
    ...(allowDnf ? [{ value: 'dnf', label: 'DNF' }] : []),
  ];
  return opts.map((o) => (
    `<option value="${o.value}"${o.value === selected ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
  )).join('');
}

function formHtml(item, mode, state) {
  const theater = mode === 'theater';
  const draft = draftWatchFromItem(item, { mode, includeReview: state.includeReview });
  const location = theater ? (state.theaters[0] || '') : '';
  const cents = theater ? defaultTicketCents(state.watches, location) : null;
  const halfStarNote = item.rating != null && item.rating < 1
    ? '<p class="al-muted al-field-hint">Letterboxd ½★ starts at 1★ here — A-Lister ratings go from 1 to 5.</p>'
    : '';
  const formatOptions = WATCH_FORMATS.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f || 'Standard')}</option>`).join('');

  return `
    <form class="al-lb-form" id="lb-form" data-mode="${mode}" autocomplete="off">
      <p class="al-lb-form-head">${theater ? 'In theaters' : 'At home'} <span class="al-muted">— check the details, then save.</span></p>
      <div class="al-form-grid">
        <div class="al-field">
          <label for="lb-date">Date</label>
          <input class="al-input" id="lb-date" type="date" value="${escapeHtml(draft.watched_on)}" required />
        </div>
        <div class="al-field">
          <label for="lb-rating">Rating</label>
          <select class="al-select" id="lb-rating">${ratingOptionsHtml(draft.rating != null ? String(draft.rating) : '', theater)}</select>
          ${halfStarNote}
        </div>
        ${theater ? `
          <div class="al-field al-search-wrap">
            <label for="lb-location">Theater</label>
            <input class="al-input" id="lb-location" type="text" value="${escapeHtml(location)}" placeholder="AMC Lincoln Square 13" autocomplete="off" />
            <div class="al-search-results" id="lb-theater-results" hidden></div>
          </div>
          <div class="al-field">
            <label for="lb-ticket">Ticket price</label>
            <input class="al-input" id="lb-ticket" type="text" inputmode="decimal" value="${cents != null ? (cents / 100).toFixed(2) : ''}" placeholder="24.95" />
          </div>
          <div class="al-field">
            <label for="lb-format">Format</label>
            <select class="al-select" id="lb-format">${formatOptions}</select>
          </div>
          <div class="al-field">
            <label for="lb-seen-with">Seen with</label>
            <div class="al-seen-with">
              <div class="al-seen-with-chips" id="lb-seen-with-chips"></div>
              <div class="al-search-wrap">
                <input class="al-input" id="lb-seen-with" type="text" placeholder="Add username…" autocomplete="off" maxlength="24" />
                <div class="al-search-results" id="lb-seen-with-results" hidden></div>
              </div>
            </div>
          </div>
        ` : ''}
        <div class="al-field span-2">
          <label for="lb-notes">Notes</label>
          <textarea class="al-textarea" id="lb-notes" rows="2" maxlength="2000">${escapeHtml(draft.notes || '')}</textarea>
        </div>
      </div>
      ${theater ? '' : '<p class="al-muted al-field-hint">Home watches stay in your log but are left out of savings and leaderboard stats.</p>'}
      <div class="al-toolbar" style="margin-top:10px">
        <button type="submit" class="al-btn al-btn-primary" id="lb-save">Save to log</button>
        <button type="button" class="al-btn" id="lb-cancel">Cancel</button>
        <p class="al-muted" id="lb-form-status" style="margin:0" aria-live="polite"></p>
      </div>
    </form>
  `;
}

function wireOpenForm(auth, state, { onSaved, onCancel }) {
  const form = document.getElementById('lb-form');
  if (!form) return;
  const item = state.items.find((i) => i.guid === state.open.guid);
  const mode = state.open.mode;
  const theater = mode === 'theater';
  const statusEl = document.getElementById('lb-form-status');

  let seenWith = null;
  if (theater) {
    const locationInput = document.getElementById('lb-location');
    const ticketInput = document.getElementById('lb-ticket');
    const resultsEl = document.getElementById('lb-theater-results');
    let priceEdited = false;
    ticketInput.addEventListener('input', () => { priceEdited = true; });
    wireTheaterSuggest(locationInput, resultsEl, {
      getTheaters: () => state.theaters,
      onSelect: (name) => {
        if (priceEdited) return;
        const cents = defaultTicketCents(state.watches, name);
        ticketInput.value = cents != null ? (cents / 100).toFixed(2) : '';
      },
    });
    wireComboboxKeys(locationInput, resultsEl);
    seenWith = wireSeenWithPicker({
      chipsEl: document.getElementById('lb-seen-with-chips'),
      input: document.getElementById('lb-seen-with'),
      resultsEl: document.getElementById('lb-seen-with-results'),
      token: auth.token,
    });
  }

  document.getElementById('lb-cancel').addEventListener('click', onCancel);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.busy) return;
    const ratingValue = document.getElementById('lb-rating').value;
    const dnf = theater && ratingValue === 'dnf';
    const seen = seenWith ? seenWith.getUsernames() : [];
    const watch = {
      ...draftWatchFromItem(item, { mode, includeReview: false }),
      watched_on: document.getElementById('lb-date').value,
      rating: dnf || !ratingValue ? null : Number(ratingValue),
      dnf,
      notes: document.getElementById('lb-notes').value.trim() || null,
    };
    if (theater) {
      watch.location = document.getElementById('lb-location').value.trim() || null;
      watch.ticket_cents = parseMoneyInput(document.getElementById('lb-ticket').value);
      watch.format = document.getElementById('lb-format').value;
      watch.seen_with = seen;
      watch.saw_alone = seen.length === 0;
    }

    state.busy = true;
    document.getElementById('lb-save').disabled = true;
    statusEl.textContent = 'Saving…';
    try {
      const result = await letterboxdApi.importItem(auth.token, item.guid, watch);
      state.busy = false;
      await onSaved(item, mode, result.watch);
    } catch (err) {
      state.busy = false;
      if (err.status === 409) {
        state.items = state.items.filter((i) => i.guid !== item.guid);
        onCancel();
        return;
      }
      document.getElementById('lb-save').disabled = false;
      statusEl.textContent = err.message || 'Could not save.';
    }
  });
}
