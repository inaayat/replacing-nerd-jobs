import { bootPage, renderShell, requireSignIn, isRankBetaEnabled } from './nav.js';
import { ranksApi, watchesApi, movieApi } from './api.js';
import { escapeHtml, posterHtml } from './format.js';
import { wireComboboxKeys } from './combobox.js';
import {
  createInsertSearch,
  applyInsertAnswer,
  removeByTmdbId,
  uniqueLoggedMovies,
} from './rank-insert.js';

bootPage(async ({ root, auth }) => {
  if (!isRankBetaEnabled()) {
    root.innerHTML = renderShell({
      title: 'Rank',
      subtitle: 'This one is still in beta.',
      signedIn: auth.signedIn,
      hideLogBar: true,
      body: `
        <main class="al-main">
          <section class="al-panel">
            <p class="al-muted">Movie stack rank is off for your account.</p>
            <p style="margin-top:12px">
              <a class="al-btn al-btn-primary" href="/amc-a-lister/settings.html">Turn it on in Settings</a>
            </p>
          </section>
        </main>
      `,
    });
    return;
  }

  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Rank',
    subtitle: 'Stack-rank movies with pairwise compares. Star ratings on your log stay separate.',
    body: `<main class="al-main" id="rank-main"><p class="al-muted">Loading…</p></main>`,
    hideLogBar: true,
    signedIn: true,
  });

  await loadPage(auth);
});

async function loadPage(auth) {
  const main = document.getElementById('rank-main');
  if (!main) return;

  const [{ ranks }, { watches }] = await Promise.all([
    ranksApi.list(auth.token),
    watchesApi.list(auth.token),
  ]);

  const state = {
    ranks: ranks || [],
    watches: watches || [],
    selected: new Set(),
    pending: null,
    candidate: null,
    insertState: null,
    comparePool: [],
    remaining: 0,
    saving: false,
    error: '',
    status: '',
    busy: false,
    compareResolve: null,
  };

  const render = () => {
    const comparing = !!(state.candidate && state.insertState && !state.insertState.done);
    document.body.classList.toggle('al-rank-comparing', comparing);
    main.innerHTML = viewHtml(state);
    wire(auth, state, render);
  };

  state.runQueue = (movies) => rankQueue(auth, state, movies, render);
  render();
}

function viewHtml(state) {
  const overlay = state.candidate && state.insertState && !state.insertState.done
    ? compareHtml(state)
    : '';
  const confirm = state.pending ? confirmHtml(state.pending) : '';

  if (!state.ranks.length && !state.candidate && !state.saving) {
    return `${firstRunHtml(state)}${confirm}${overlay}`;
  }

  return `${listHtml(state)}${confirm}${overlay}`;
}

function firstRunHtml(state) {
  const logged = uniqueLoggedMovies(state.watches);
  const selectedCount = [...state.selected].length;

  const loggedBlock = logged.length
    ? `
      <p class="al-muted">Pick movies from your log to stack-rank. You do not have to rank all of them.</p>
      <div class="al-rank-picker-tools">
        <input class="al-input" id="rank-picker-filter" type="search" placeholder="Filter logged titles…" />
        <button class="al-btn" type="button" id="rank-select-all">Select all</button>
        <button class="al-btn" type="button" id="rank-select-none">Clear</button>
      </div>
      <div class="al-rank-picker" id="rank-picker">
        ${logged.map((movie) => pickerRowHtml(movie, state.selected.has(movie.tmdb_id))).join('')}
      </div>
      <div class="al-toolbar" style="margin-top:12px">
        <button class="al-btn al-btn-primary" type="button" id="rank-start" ${selectedCount ? '' : 'disabled'}>
          Rank ${selectedCount || ''} movie${selectedCount === 1 ? '' : 's'}
        </button>
      </div>
    `
    : `
      <div class="al-empty al-empty--first-run">
        <p>No movies in your log yet. Search TMDB to start a stack with one or two titles, then compare.</p>
      </div>
    `;

  return `
    <section class="al-panel al-rank-panel">
      <h2 class="al-section-title">Start a stack</h2>
      ${state.error ? `<p class="al-error">${escapeHtml(state.error)}</p>` : ''}
      ${loggedBlock}
      <div class="al-rank-add" style="margin-top:16px">
        <h3 class="al-rank-add-title">Search TMDB</h3>
        ${searchFieldHtml('Add a title without logging it')}
      </div>
    </section>
  `;
}

function listHtml(state) {
  const unranked = uniqueLoggedMovies(state.watches, state.ranks.map((r) => r.tmdb_id));
  const rows = state.ranks.map((movie, i) => rankRowHtml(movie, i + 1)).join('');

  return `
    <section class="al-panel al-rank-panel">
      <div class="al-watchlist-header al-watchlist-header--compact">
        <h2 class="al-section-title">Your stack</h2>
        <span class="al-muted">${state.ranks.length} movie${state.ranks.length === 1 ? '' : 's'}</span>
      </div>
      ${state.error ? `<p class="al-error">${escapeHtml(state.error)}</p>` : ''}
      ${state.status ? `<p class="al-muted" aria-live="polite">${escapeHtml(state.status)}</p>` : ''}
      <div class="al-rank-add">
        ${searchFieldHtml('Add a movie to this stack')}
      </div>
      ${unranked.length ? `
        <div class="al-rank-unranked">
          <p class="al-rank-unranked-label">From your log, not yet ranked</p>
          <div class="al-rank-unranked-list">
            ${unranked.slice(0, 12).map(unrankedChipHtml).join('')}
          </div>
        </div>
      ` : ''}
      <div class="al-rank-list" id="rank-list">
        ${rows || '<p class="al-empty">Nothing ranked yet.</p>'}
      </div>
    </section>
  `;
}

function searchFieldHtml(placeholder) {
  return `
    <form class="al-rank-search" id="rank-search-form" autocomplete="off">
      <div class="al-search-wrap al-rank-search-wrap">
        <input class="al-input" id="rank-search" type="text" placeholder="${escapeHtml(placeholder)}" />
        <div class="al-search-results" id="rank-search-results" hidden></div>
      </div>
    </form>
  `;
}

function pickerRowHtml(movie, checked) {
  return `
    <button type="button" class="al-rank-pick${checked ? ' is-selected' : ''}" data-pick="${movie.tmdb_id}" aria-pressed="${checked ? 'true' : 'false'}">
      ${posterHtml(movie, { size: 'w154', width: 48, height: 72, className: 'al-poster al-rank-thumb' })}
      <span class="al-rank-pick-meta">
        <span class="al-rank-pick-title">${escapeHtml(movie.title)}</span>
        ${movie.year ? `<span class="al-muted">${movie.year}</span>` : ''}
      </span>
      <span class="al-rank-pick-mark" aria-hidden="true">${checked ? '✓' : ''}</span>
    </button>
  `;
}

function unrankedChipHtml(movie) {
  return `
    <button type="button" class="al-rank-chip" data-add-logged="${movie.tmdb_id}">
      ${posterHtml(movie, { size: 'w92', width: 28, height: 42, className: 'al-poster al-rank-chip-poster' })}
      <span>${escapeHtml(movie.title)}</span>
    </button>
  `;
}

function rankRowHtml(movie, position) {
  return `
    <article class="al-rank-row">
      <div class="al-rank-num" aria-hidden="true">${position}</div>
      ${posterHtml(movie, { size: 'w154', width: 56, height: 84, className: 'al-poster al-rank-poster' })}
      <div class="al-rank-meta">
        <div class="al-rank-title">${escapeHtml(movie.title)}</div>
        <div class="al-muted">${movie.year || ''}</div>
        <div class="al-rank-row-actions">
          <button type="button" class="al-link-btn" data-rerank="${movie.tmdb_id}">Re-rank</button>
          <button type="button" class="al-link-btn" data-unrank="${movie.tmdb_id}">Remove</button>
        </div>
      </div>
    </article>
  `;
}

function confirmHtml(movie) {
  const rerank = !!movie.alreadyRanked;
  return `
    <div class="al-rank-modal" role="dialog" aria-modal="true" aria-labelledby="rank-confirm-title">
      <div class="al-rank-modal-card">
        ${posterHtml(movie, { size: 'w185', width: 80, height: 120, className: 'al-poster al-rank-poster' })}
        <div>
          <h2 class="al-rank-modal-title" id="rank-confirm-title">${rerank ? 'Re-rank this?' : 'Stack rank this?'}</h2>
          <p class="al-rank-modal-film">${escapeHtml(movie.title)}${movie.year ? ` (${movie.year})` : ''}</p>
          <p class="al-muted">${rerank
            ? 'Run compares again to place it in the stack. Your watch log is unchanged.'
            : 'This adds it to your stack, not your watch log. Star ratings stay as they are.'}</p>
          <div class="al-rank-modal-actions">
            <button type="button" class="al-btn al-btn-primary" id="rank-confirm-yes">Yes, compare</button>
            <button type="button" class="al-btn" id="rank-confirm-no">Not now</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function compareHtml(state) {
  const pivot = state.comparePool[state.insertState.pivotIndex];
  const candidate = state.candidate;
  if (!pivot || !candidate) return '';
  const remaining = state.remaining;
  const stepLabel = remaining
    ? `Placing ${escapeHtml(candidate.title)} · ${remaining} left after this`
    : `Placing ${escapeHtml(candidate.title)}`;

  return `
    <div class="al-rank-compare" id="rank-compare" role="dialog" aria-modal="true" aria-labelledby="rank-compare-prompt">
      <p class="al-rank-compare-kicker">${stepLabel}</p>
      <h2 class="al-rank-compare-prompt" id="rank-compare-prompt">Which do you like more?</h2>
      <p class="al-muted al-rank-compare-hint">Tap a poster, or swipe right if you like the new one more. Arrow keys work too.</p>
      <div class="al-rank-compare-cards">
        <button type="button" class="al-rank-card" data-compare="worse" id="rank-card-pivot">
          <span class="al-rank-card-badge">#${pivot.position || state.insertState.pivotIndex + 1}</span>
          ${posterHtml(pivot, { size: 'w342', width: 220, height: 330, className: 'al-poster al-rank-card-poster' })}
          <span class="al-rank-card-title">${escapeHtml(pivot.title)}</span>
          <span class="al-muted">${pivot.year || ''}</span>
          <span class="al-rank-card-cta">This one</span>
        </button>
        <button type="button" class="al-rank-card al-rank-card--new" data-compare="better" id="rank-card-new">
          <span class="al-rank-card-badge is-new">New</span>
          ${posterHtml(candidate, { size: 'w342', width: 220, height: 330, className: 'al-poster al-rank-card-poster' })}
          <span class="al-rank-card-title">${escapeHtml(candidate.title)}</span>
          <span class="al-muted">${candidate.year || ''}</span>
          <span class="al-rank-card-cta">This one</span>
        </button>
      </div>
      <div class="al-rank-compare-actions">
        <button type="button" class="al-btn" data-compare-skip>Skip this movie</button>
        <button type="button" class="al-btn" data-compare-finish>Finish for now</button>
      </div>
      ${state.saving ? '<p class="al-muted">Saving…</p>' : ''}
    </div>
  `;
}

function movieFromSearch(btn) {
  return {
    tmdb_id: Number(btn.dataset.id),
    title: btn.dataset.title,
    year: btn.dataset.year ? Number(btn.dataset.year) : null,
    poster_path: btn.dataset.poster || null,
  };
}

function movieFromLogged(state, tmdbId) {
  const id = Number(tmdbId);
  return uniqueLoggedMovies(state.watches).find((m) => m.tmdb_id === id)
    || state.ranks.find((m) => m.tmdb_id === id)
    || null;
}

function wire(auth, state, render) {
  wireSearch(auth, state, render);
  wirePicker(state, render);
  wireList(auth, state, render);
  wireConfirm(state, render);
  wireCompare(state);
}

function wireSearch(auth, state, render) {
  const input = document.getElementById('rank-search');
  const resultsEl = document.getElementById('rank-search-results');
  if (!input || !resultsEl) return;

  let searchTimer = null;
  wireComboboxKeys(input, resultsEl);

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
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
          <button type="button" data-id="${m.tmdb_id}" data-title="${escapeHtml(m.title)}"
            data-year="${m.year || ''}" data-poster="${escapeHtml(m.poster_path || '')}">
            ${m.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${m.poster_path}" alt="" width="28" height="42" style="border-radius:4px;object-fit:cover">` : '<span style="width:28px"></span>'}
            <span>${escapeHtml(m.title)}${m.year ? ` <span class="al-muted">(${m.year})</span>` : ''}</span>
          </button>
        `).join('');
        resultsEl.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', () => {
            resultsEl.hidden = true;
            input.value = '';
            askToRank(state, movieFromSearch(btn), render);
          });
        });
      } catch {
        resultsEl.hidden = true;
      }
    }, 300);
  });

  document.getElementById('rank-search-form')?.addEventListener('submit', (e) => e.preventDefault());
}

function wirePicker(state, render) {
  const filter = document.getElementById('rank-picker-filter');
  if (filter) {
    filter.addEventListener('input', () => {
      const q = filter.value.trim().toLowerCase();
      document.querySelectorAll('[data-pick]').forEach((btn) => {
        const title = btn.querySelector('.al-rank-pick-title')?.textContent.toLowerCase() || '';
        btn.hidden = Boolean(q) && !title.includes(q);
      });
    });
  }

  document.getElementById('rank-select-all')?.addEventListener('click', () => {
    uniqueLoggedMovies(state.watches).forEach((m) => state.selected.add(m.tmdb_id));
    render();
  });
  document.getElementById('rank-select-none')?.addEventListener('click', () => {
    state.selected.clear();
    render();
  });

  document.querySelectorAll('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.pick);
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
      render();
    });
  });

  document.getElementById('rank-start')?.addEventListener('click', () => {
    const byId = new Map(uniqueLoggedMovies(state.watches).map((m) => [m.tmdb_id, m]));
    const movies = [...state.selected].map((id) => byId.get(id)).filter(Boolean);
    if (!movies.length) return;
    state.selected.clear();
    state.runQueue(movies);
  });
}

function wireList(auth, state, render) {
  document.querySelectorAll('[data-add-logged]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const movie = movieFromLogged(state, btn.dataset.addLogged);
      if (movie) askToRank(state, movie, render);
    });
  });

  document.querySelectorAll('[data-rerank]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const movie = state.ranks.find((m) => m.tmdb_id === Number(btn.dataset.rerank));
      if (movie) state.runQueue([movie]);
    });
  });

  document.querySelectorAll('[data-unrank]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const movie = state.ranks.find((m) => m.tmdb_id === Number(btn.dataset.unrank));
      if (!movie) return;
      if (!confirm(`Remove “${movie.title}” from your stack? Your watch log is unchanged.`)) return;
      try {
        state.saving = true;
        const { ranks } = await ranksApi.remove(auth.token, movie.tmdb_id);
        state.ranks = ranks;
        state.status = `Removed ${movie.title} from the stack.`;
        state.error = '';
      } catch (err) {
        state.error = err.message || 'Could not remove that title.';
      } finally {
        state.saving = false;
        render();
      }
    });
  });
}

function wireConfirm(state, render) {
  document.getElementById('rank-confirm-yes')?.addEventListener('click', () => {
    const movie = state.pending;
    state.pending = null;
    if (movie) state.runQueue([movie]);
    else render();
  });
  document.getElementById('rank-confirm-no')?.addEventListener('click', () => {
    state.pending = null;
    render();
  });
}

function wireCompare(state) {
  const overlay = document.getElementById('rank-compare');
  if (!overlay) return;

  overlay.querySelectorAll('[data-compare]').forEach((btn) => {
    btn.addEventListener('click', () => submitCompare(state, btn.dataset.compare));
  });
  overlay.querySelector('[data-compare-skip]')?.addEventListener('click', () => submitCompare(state, 'skip'));
  overlay.querySelector('[data-compare-finish]')?.addEventListener('click', () => submitCompare(state, 'finish'));

  const onKey = (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      submitCompare(state, 'better');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      submitCompare(state, 'worse');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      submitCompare(state, 'skip');
    }
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('remove', () => document.removeEventListener('keydown', onKey), { once: true });
  // overlay isn't removed via the 'remove' event unless we use a MutationObserver;
  // drop the listener on the next compare resolve by storing it.
  state._compareKey = onKey;

  wireSwipe(overlay, {
    onRight: () => submitCompare(state, 'better'),
    onLeft: () => submitCompare(state, 'worse'),
  });
}

function submitCompare(state, answer) {
  const resolve = state.compareResolve;
  if (!resolve) return;
  state.compareResolve = null;
  if (state._compareKey) {
    document.removeEventListener('keydown', state._compareKey);
    state._compareKey = null;
  }
  resolve(answer);
}

function waitForCompare(state, render) {
  return new Promise((resolve) => {
    state.compareResolve = resolve;
    render();
  });
}

function askToRank(state, movie, render) {
  if (!movie?.tmdb_id) return;
  state.pending = {
    ...movie,
    alreadyRanked: state.ranks.some((r) => r.tmdb_id === movie.tmdb_id),
  };
  render();
}

async function rankQueue(auth, state, movies, render) {
  if (state.busy) return;
  state.busy = true;
  state.error = '';
  state.status = '';
  const queue = movies.filter((m) => m?.tmdb_id);
  state.remaining = Math.max(0, queue.length - 1);

  try {
    for (let i = 0; i < queue.length; i += 1) {
      const movie = queue[i];
      state.remaining = queue.length - 1 - i;
      const pool = removeByTmdbId(state.ranks, movie.tmdb_id);
      let insert = createInsertSearch(pool.length);
      if (!insert.done) {
        state.candidate = movie;
        state.comparePool = pool.map((m, idx) => ({ ...m, position: idx + 1 }));
        let outcome = null;
        while (!insert.done) {
          state.insertState = insert;
          outcome = await waitForCompare(state, render);
          if (outcome === 'skip' || outcome === 'finish') break;
          insert = applyInsertAnswer(insert, outcome);
        }
        state.candidate = null;
        state.insertState = null;
        state.compareResolve = null;
        if (outcome === 'skip') {
          render();
          continue;
        }
        if (outcome === 'finish') {
          render();
          return;
        }
      }

      try {
        state.saving = true;
        render();
        const { ranks } = await ranksApi.upsert(auth.token, {
          tmdb_id: movie.tmdb_id,
          title: movie.title,
          year: movie.year,
          poster_path: movie.poster_path,
          position: insert.insertIndex + 1,
        });
        state.ranks = ranks;
        state.status = `Placed ${movie.title} at #${insert.insertIndex + 1}.`;
      } catch (err) {
        state.error = err.message || 'Could not save that rank.';
        state.saving = false;
        state.candidate = null;
        state.insertState = null;
        render();
        return;
      } finally {
        state.saving = false;
      }
    }

    state.candidate = null;
    state.insertState = null;
    render();
  } finally {
    state.busy = false;
    document.body.classList.remove('al-rank-comparing');
  }
}

function wireSwipe(el, { onLeft, onRight }) {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let locked = null;

  const start = (x, y) => {
    startX = x;
    startY = y;
    tracking = true;
    locked = null;
  };
  const move = (x, y, event) => {
    if (!tracking) return;
    const dx = x - startX;
    const dy = y - startY;
    if (locked == null && Math.hypot(dx, dy) > 10) {
      locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (locked === 'h') {
      event?.preventDefault();
      el.style.setProperty('--al-rank-swipe', `${dx}px`);
    }
  };
  const end = (x) => {
    if (!tracking) return;
    tracking = false;
    const dx = x - startX;
    el.style.removeProperty('--al-rank-swipe');
    if (locked === 'h' && Math.abs(dx) >= 56) {
      if (dx > 0) onRight();
      else onLeft();
    }
    locked = null;
  };

  el.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    start(t.clientX, t.clientY);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    const t = e.changedTouches[0];
    move(t.clientX, t.clientY, e);
  }, { passive: false });
  el.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    end(t.clientX);
  });
}
