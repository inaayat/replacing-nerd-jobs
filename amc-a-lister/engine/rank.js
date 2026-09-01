import { bootPage, renderShell, requireSignIn, isRankBetaEnabled, isTvBetaEnabled } from './nav.js';
import { ranksApi, tvRanksApi, watchesApi, tvWatchesApi, movieApi, tvApi } from './api.js';
import { escapeHtml, posterHtml } from './format.js';
import { wireComboboxKeys } from './combobox.js';
import {
  createInsertSearch,
  applyInsertAnswer,
  removeByTmdbId,
  uniqueLoggedMovies,
  firstRunMovies,
  eligibleTmdbIds,
  dropIneligibleRanks,
  uniqueLoggedShows,
  firstRunShows,
  eligibleShowTmdbIds,
  dropIneligibleShowRanks,
} from './rank-insert.js';

const KINDS = {
  movies: {
    id: 'movies',
    tabLabel: 'Movies',
    noun: 'movie',
    nouns: 'movies',
    skipLabel: 'Skip this movie',
    api: ranksApi,
    searchApi: movieApi,
    uniqueUnranked: uniqueLoggedMovies,
    firstRun: firstRunMovies,
    eligibleIds: eligibleTmdbIds,
    dropIneligible: dropIneligibleRanks,
    searchPlaceholder: 'Add a theater movie from your log',
    unrankedLabel: 'Theater movies from your log, not yet ranked',
    firstRunHint: 'First setup ranks all theater movies you\'ve watched (DNFs count). Home and streaming stay out.',
    emptyLog: 'No theater movies in your log yet. Rank only includes titles you watched in theaters (including DNFs).',
    ineligibleError: 'Rank only includes movies you watched in theaters.',
    confirmAdd: 'This adds it to your stack, not your watch log. Star ratings stay as they are.',
    confirmRerank: 'Run compares again to place it in the stack. Your watch log is unchanged.',
    clearConfirm: 'Clear your entire ranking? This cannot be undone. Your watch log is unchanged.',
    removeConfirm: (title) => `Remove “${title}” from your stack? Your watch log is unchanged.`,
  },
  tv: {
    id: 'tv',
    tabLabel: 'TV',
    noun: 'show',
    nouns: 'shows',
    skipLabel: 'Skip this show',
    api: tvRanksApi,
    searchApi: tvApi,
    uniqueUnranked: uniqueLoggedShows,
    firstRun: firstRunShows,
    eligibleIds: eligibleShowTmdbIds,
    dropIneligible: dropIneligibleShowRanks,
    searchPlaceholder: 'Add a show from your TV log',
    unrankedLabel: 'Shows from your TV log, not yet ranked',
    firstRunHint: 'First setup ranks every unique show you\'ve logged (DNFs count). Episodes of the same series count once.',
    emptyLog: '',
    ineligibleError: 'Rank only includes shows you\'ve logged.',
    confirmAdd: 'This adds it to your TV stack, not your watch log. Star ratings stay as they are.',
    confirmRerank: 'Run compares again to place it in the stack. Your TV log is unchanged.',
    clearConfirm: 'Clear your entire TV ranking? This cannot be undone. Your TV log is unchanged.',
    removeConfirm: (title) => `Remove “${title}” from your TV stack? Your TV log is unchanged.`,
  },
};

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
            <p class="al-muted">Stack rank is off for your account.</p>
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
    subtitle: 'Stack-rank movies and TV with pairwise compares. Star ratings on your log stay separate.',
    body: `<main class="al-main" id="rank-main"><p class="al-muted">Loading…</p></main>`,
    hideLogBar: true,
    signedIn: true,
  });

  await loadPage(auth);
});

function kindCfg(state) {
  return KINDS[state.kind] || KINDS.movies;
}

function current(state) {
  return state.stacks[state.kind];
}

function rankPageUrl(kind) {
  return kind === 'tv' ? '/amc-a-lister/rank.html?tab=tv' : '/amc-a-lister/rank.html';
}

function emptyTvLogHtml() {
  if (isTvBetaEnabled()) {
    return `<p>No shows in your TV log yet. Rank a series after you <a href="/amc-a-lister/tv.html">log it on the TV page</a>.</p>`;
  }
  return `<p>Enable TV Shows in <a href="/amc-a-lister/settings.html">Settings</a>, log a series, then come back to rank it.</p>`;
}

async function pruneStack(auth, api, ranks, watches, dropFn) {
  const pruned = dropFn(ranks, watches || []);
  if (pruned.length === ranks.length) return ranks;
  try {
    const saved = await api.replace(auth.token, pruned);
    return saved.ranks || pruned;
  } catch {
    return pruned;
  }
}

async function loadPage(auth) {
  const main = document.getElementById('rank-main');
  if (!main) return;

  const [
    { ranks: storedMovieRanks },
    { watches: movieWatches },
    { ranks: storedTvRanks },
    { watches: tvWatches },
  ] = await Promise.all([
    ranksApi.list(auth.token),
    watchesApi.list(auth.token),
    tvRanksApi.list(auth.token),
    tvWatchesApi.list(auth.token),
  ]);

  const movieRanks = await pruneStack(
    auth,
    ranksApi,
    storedMovieRanks || [],
    movieWatches || [],
    dropIneligibleRanks,
  );
  const tvRanks = await pruneStack(
    auth,
    tvRanksApi,
    storedTvRanks || [],
    tvWatches || [],
    dropIneligibleShowRanks,
  );

  const params = new URLSearchParams(location.search);
  const kind = params.get('tab') === 'tv' ? 'tv' : 'movies';

  const state = {
    kind,
    stacks: {
      movies: { ranks: movieRanks, watches: movieWatches || [] },
      tv: { ranks: tvRanks, watches: tvWatches || [] },
    },
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

  state.runQueue = (items) => rankQueue(auth, state, items, render);

  const addId = Number(params.get('add'));
  if (addId) {
    history.replaceState({}, '', rankPageUrl(state.kind));
    // After-add on an existing stack ranks that one title. Empty stack is first
    // setup: every eligible logged title goes into the compare queue.
    if (current(state).ranks.length) {
      const item = itemFromLogged(state, addId);
      if (item) {
        askToRank(state, item, render);
        return;
      }
    }
  }

  if (!current(state).ranks.length && startFirstRunQueue(state)) return;
  render();
}

function viewHtml(state) {
  const overlay = state.candidate && state.insertState && !state.insertState.done
    ? compareHtml(state)
    : '';
  const confirm = state.pending ? confirmHtml(state) : '';

  if (!current(state).ranks.length && !state.candidate && !state.saving) {
    return `${firstRunHtml(state)}${confirm}${overlay}`;
  }

  return `${listHtml(state)}${confirm}${overlay}`;
}

function tabsHtml(state) {
  const movieCount = state.stacks.movies.ranks.length;
  const tvCount = state.stacks.tv.ranks.length;
  return `
    <div class="al-segment al-watchlist-segment" role="tablist" aria-label="Rank movies or TV">
      <button type="button" class="al-segment-btn${state.kind === 'movies' ? ' is-active' : ''}"
        data-rank-kind="movies" role="tab" aria-selected="${state.kind === 'movies' ? 'true' : 'false'}">
        Movies <span class="al-segment-count">${movieCount}</span>
      </button>
      <button type="button" class="al-segment-btn${state.kind === 'tv' ? ' is-active' : ''}"
        data-rank-kind="tv" role="tab" aria-selected="${state.kind === 'tv' ? 'true' : 'false'}">
        TV <span class="al-segment-count">${tvCount}</span>
      </button>
    </div>
  `;
}

function firstRunHtml(state) {
  const cfg = kindCfg(state);
  const logged = cfg.firstRun(current(state).watches);
  const n = logged.length;
  const emptyBody = state.kind === 'tv' ? emptyTvLogHtml() : `<p>${escapeHtml(cfg.emptyLog)}</p>`;

  const loggedBlock = n
    ? `
      <p class="al-muted">${escapeHtml(cfg.firstRunHint)}</p>
      <div class="al-toolbar" style="margin-top:12px">
        <button class="al-btn al-btn-primary" type="button" id="rank-start">
          Rank ${n} ${n === 1 ? cfg.noun : cfg.nouns}
        </button>
      </div>
    `
    : `
      <div class="al-empty al-empty--first-run">
        ${emptyBody}
      </div>
    `;

  return `
    <section class="al-panel al-rank-panel">
      ${tabsHtml(state)}
      <h2 class="al-section-title">Start a stack</h2>
      ${state.error ? `<p class="al-error">${escapeHtml(state.error)}</p>` : ''}
      ${state.status ? `<p class="al-muted" aria-live="polite">${escapeHtml(state.status)}</p>` : ''}
      ${loggedBlock}
    </section>
  `;
}

function listHtml(state) {
  const cfg = kindCfg(state);
  const stack = current(state);
  const unranked = cfg.uniqueUnranked(stack.watches, stack.ranks.map((r) => r.tmdb_id));
  const rows = stack.ranks.map((item, i) => rankRowHtml(item, i + 1)).join('');
  const count = stack.ranks.length;

  return `
    <section class="al-panel al-rank-panel">
      ${tabsHtml(state)}
      <div class="al-watchlist-header al-watchlist-header--compact">
        <h2 class="al-section-title">Your stack</h2>
        <div class="al-rank-header-actions">
          <span class="al-muted">${count} ${count === 1 ? cfg.noun : cfg.nouns}</span>
          <button class="al-btn" type="button" id="rank-clear">Clear ranking</button>
        </div>
      </div>
      ${state.error ? `<p class="al-error">${escapeHtml(state.error)}</p>` : ''}
      ${state.status ? `<p class="al-muted" aria-live="polite">${escapeHtml(state.status)}</p>` : ''}
      <div class="al-rank-add">
        ${searchFieldHtml(cfg.searchPlaceholder)}
      </div>
      ${unranked.length ? `
        <div class="al-rank-unranked">
          <p class="al-rank-unranked-label">${escapeHtml(cfg.unrankedLabel)}</p>
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

function unrankedChipHtml(item) {
  return `
    <button type="button" class="al-rank-chip" data-add-logged="${item.tmdb_id}">
      ${posterHtml(item, { size: 'w92', width: 28, height: 42, className: 'al-poster al-rank-chip-poster' })}
      <span>${escapeHtml(item.title)}</span>
    </button>
  `;
}

function rankRowHtml(item, position) {
  return `
    <article class="al-rank-row">
      <div class="al-rank-num" aria-hidden="true">${position}</div>
      ${posterHtml(item, { size: 'w154', width: 56, height: 84, className: 'al-poster al-rank-poster' })}
      <div class="al-rank-meta">
        <div class="al-rank-title">${escapeHtml(item.title)}</div>
        <div class="al-muted">${item.year || ''}</div>
        <div class="al-rank-row-actions">
          <button type="button" class="al-link-btn" data-rerank="${item.tmdb_id}">Re-rank</button>
          <button type="button" class="al-link-btn" data-unrank="${item.tmdb_id}">Remove</button>
        </div>
      </div>
    </article>
  `;
}

function confirmHtml(state) {
  const item = state.pending;
  const cfg = kindCfg(state);
  const rerank = !!item.alreadyRanked;
  return `
    <div class="al-rank-modal" role="dialog" aria-modal="true" aria-labelledby="rank-confirm-title">
      <div class="al-rank-modal-card">
        ${posterHtml(item, { size: 'w185', width: 80, height: 120, className: 'al-poster al-rank-poster' })}
        <div>
          <h2 class="al-rank-modal-title" id="rank-confirm-title">${rerank ? 'Re-rank this?' : 'Stack rank this?'}</h2>
          <p class="al-rank-modal-film">${escapeHtml(item.title)}${item.year ? ` (${item.year})` : ''}</p>
          <p class="al-muted">${rerank ? cfg.confirmRerank : cfg.confirmAdd}</p>
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
  const cfg = kindCfg(state);
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
        <button type="button" class="al-btn" data-compare-skip>${escapeHtml(cfg.skipLabel)}</button>
        <button type="button" class="al-btn" data-compare-finish>Finish for now</button>
      </div>
      ${state.saving ? '<p class="al-muted">Saving…</p>' : ''}
    </div>
  `;
}

function itemFromSearch(btn) {
  return {
    tmdb_id: Number(btn.dataset.id),
    title: btn.dataset.title,
    year: btn.dataset.year ? Number(btn.dataset.year) : null,
    poster_path: btn.dataset.poster || null,
  };
}

function itemFromLogged(state, tmdbId) {
  const cfg = kindCfg(state);
  const stack = current(state);
  const id = Number(tmdbId);
  return cfg.uniqueUnranked(stack.watches).find((item) => item.tmdb_id === id)
    || stack.ranks.find((item) => item.tmdb_id === id)
    || null;
}

function wire(auth, state, render) {
  wireTabs(state, render);
  wireSearch(auth, state, render);
  wireStart(state);
  wireList(auth, state, render);
  wireConfirm(state, render);
  wireCompare(state);
  wireClear(auth, state, render);
}

function isComparing(state) {
  return !!(state.busy || (state.candidate && state.insertState && !state.insertState.done));
}

function wireTabs(state, render) {
  document.querySelectorAll('[data-rank-kind]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.rankKind === 'tv' ? 'tv' : 'movies';
      if (next === state.kind) return;
      if (isComparing(state)) return;
      state.kind = next;
      state.pending = null;
      state.error = '';
      state.status = '';
      history.replaceState({}, '', rankPageUrl(state.kind));
      render();
    });
  });
}

function wireSearch(auth, state, render) {
  const input = document.getElementById('rank-search');
  const resultsEl = document.getElementById('rank-search-results');
  if (!input || !resultsEl) return;

  const cfg = kindCfg(state);
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
        const { results } = await cfg.searchApi.search(auth.token, q);
        const eligible = results.filter((item) => isEligibleToRank(state, item));
        if (!eligible.length) {
          resultsEl.hidden = true;
          return;
        }
        resultsEl.hidden = false;
        resultsEl.innerHTML = eligible.map((item) => `
          <button type="button" data-id="${item.tmdb_id}" data-title="${escapeHtml(item.title)}"
            data-year="${item.year || ''}" data-poster="${escapeHtml(item.poster_path || '')}">
            ${item.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${item.poster_path}" alt="" width="28" height="42" style="border-radius:4px;object-fit:cover">` : '<span style="width:28px"></span>'}
            <span>${escapeHtml(item.title)}${item.year ? ` <span class="al-muted">(${item.year})</span>` : ''}</span>
          </button>
        `).join('');
        resultsEl.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', () => {
            resultsEl.hidden = true;
            input.value = '';
            const item = itemFromSearch(btn);
            if (!isEligibleToRank(state, item)) {
              state.error = kindCfg(state).ineligibleError;
              render();
              return;
            }
            askToRank(state, item, render);
          });
        });
      } catch {
        resultsEl.hidden = true;
      }
    }, 300);
  });

  document.getElementById('rank-search-form')?.addEventListener('submit', (e) => e.preventDefault());
}

function startFirstRunQueue(state) {
  const items = kindCfg(state).firstRun(current(state).watches);
  if (!items.length) return false;
  state.runQueue(items);
  return true;
}

function wireStart(state) {
  document.getElementById('rank-start')?.addEventListener('click', () => {
    startFirstRunQueue(state);
  });
}

function wireList(auth, state, render) {
  const cfg = kindCfg(state);
  const stack = current(state);

  document.querySelectorAll('[data-add-logged]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = itemFromLogged(state, btn.dataset.addLogged);
      if (item) askToRank(state, item, render);
    });
  });

  document.querySelectorAll('[data-rerank]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = stack.ranks.find((row) => row.tmdb_id === Number(btn.dataset.rerank));
      if (item) state.runQueue([item]);
    });
  });

  document.querySelectorAll('[data-unrank]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = stack.ranks.find((row) => row.tmdb_id === Number(btn.dataset.unrank));
      if (!item) return;
      if (!confirm(cfg.removeConfirm(item.title))) return;
      try {
        state.saving = true;
        const { ranks } = await cfg.api.remove(auth.token, item.tmdb_id);
        stack.ranks = ranks;
        state.status = `Removed ${item.title} from the stack.`;
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

function wireClear(auth, state, render) {
  document.getElementById('rank-clear')?.addEventListener('click', async () => {
    const cfg = kindCfg(state);
    const stack = current(state);
    if (!stack.ranks.length) return;
    if (!confirm(cfg.clearConfirm)) return;
    try {
      state.saving = true;
      const { ranks } = await cfg.api.replace(auth.token, []);
      stack.ranks = ranks || [];
      state.status = 'Ranking cleared.';
      state.error = '';
    } catch (err) {
      state.error = err.message || 'Could not clear the ranking.';
    } finally {
      state.saving = false;
      render();
    }
  });
}

function wireConfirm(state, render) {
  document.getElementById('rank-confirm-yes')?.addEventListener('click', () => {
    const item = state.pending;
    state.pending = null;
    if (item) state.runQueue([item]);
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

function isEligibleToRank(state, item) {
  return kindCfg(state).eligibleIds(current(state).watches).has(Number(item?.tmdb_id));
}

function askToRank(state, item, render) {
  if (!item?.tmdb_id) return;
  if (!isEligibleToRank(state, item)) {
    state.error = kindCfg(state).ineligibleError;
    state.pending = null;
    render();
    return;
  }
  state.pending = {
    ...item,
    alreadyRanked: current(state).ranks.some((row) => row.tmdb_id === item.tmdb_id),
  };
  render();
}

async function rankQueue(auth, state, items, render) {
  if (state.busy) return;
  state.busy = true;
  state.error = '';
  state.status = '';
  const cfg = kindCfg(state);
  const stack = current(state);
  const queue = items.filter((item) => item?.tmdb_id && isEligibleToRank(state, item));
  state.remaining = Math.max(0, queue.length - 1);

  try {
    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i];
      state.remaining = queue.length - 1 - i;
      const pool = removeByTmdbId(stack.ranks, item.tmdb_id);
      let insert = createInsertSearch(pool.length);
      if (!insert.done) {
        state.candidate = item;
        state.comparePool = pool.map((row, idx) => ({ ...row, position: idx + 1 }));
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
        const { ranks } = await cfg.api.upsert(auth.token, {
          tmdb_id: item.tmdb_id,
          title: item.title,
          year: item.year,
          poster_path: item.poster_path,
          position: insert.insertIndex + 1,
        });
        stack.ranks = ranks;
        state.status = `Placed ${item.title} at #${insert.insertIndex + 1}.`;
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
