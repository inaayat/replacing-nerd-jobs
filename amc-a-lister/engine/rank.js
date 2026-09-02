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
  eligibleTvTmdbIds,
  dropIneligibleTvRanks,
} from './rank-insert.js';

const RANK_KIND_KEY = 'alist.rank.kind';

const KIND_CONFIG = {
  movies: {
    ranksApi,
    searchApi: movieApi,
    uniqueLogged: uniqueLoggedMovies,
    firstRun: firstRunMovies,
    dropIneligible: dropIneligibleRanks,
    eligibleIds: eligibleTmdbIds,
    searchPlaceholder: 'Add a theater movie from your log',
    unrankedLabel: 'Theater movies from your log, not yet ranked',
    firstRunIntro: 'First setup ranks all theater movies you\'ve watched (DNFs count). Home and streaming stay out.',
    emptyFirstRun: 'No theater movies in your log yet. Rank only includes titles you watched in theaters (including DNFs).',
    stackLabel: (n) => `${n} movie${n === 1 ? '' : 's'}`,
    firstRunButton: (n) => `Rank ${n} movie${n === 1 ? '' : 's'}`,
    ineligibleError: 'Rank only includes movies you watched in theaters.',
    skipLabel: 'Skip this movie',
    subtitle: 'Stack-rank movies with pairwise compares. Star ratings on your log stay separate.',
  },
  tv: {
    ranksApi: tvRanksApi,
    searchApi: tvApi,
    uniqueLogged: uniqueLoggedShows,
    firstRun: firstRunShows,
    dropIneligible: dropIneligibleTvRanks,
    eligibleIds: eligibleTvTmdbIds,
    searchPlaceholder: 'Add a show from your log',
    unrankedLabel: 'Shows from your log, not yet ranked',
    firstRunIntro: 'First setup ranks every show you\'ve logged (DNFs count).',
    emptyFirstRun: 'No TV shows in your log yet. Rank only includes titles on your TV watch log.',
    stackLabel: (n) => `${n} show${n === 1 ? '' : 's'}`,
    firstRunButton: (n) => `Rank ${n} show${n === 1 ? '' : 's'}`,
    ineligibleError: 'Rank only includes shows on your TV watch log.',
    skipLabel: 'Skip this show',
    subtitle: 'Stack-rank TV shows with pairwise compares. Episode ratings on your log stay separate.',
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

  const tvEnabled = isTvBetaEnabled();
  const defaultKind = readStoredKind(tvEnabled);
  const subtitle = tvEnabled
    ? 'Stack-rank movies and TV with pairwise compares. Star ratings on your log stay separate.'
    : KIND_CONFIG.movies.subtitle;

  root.innerHTML = renderShell({
    title: 'Rank',
    subtitle,
    body: `<main class="al-main" id="rank-main"><p class="al-muted">Loading…</p></main>`,
    hideLogBar: true,
    signedIn: true,
  });

  await loadPage(auth, tvEnabled, defaultKind);
});

function readStoredKind(tvEnabled) {
  if (!tvEnabled) return 'movies';
  try {
    const stored = localStorage.getItem(RANK_KIND_KEY);
    return stored === 'tv' ? 'tv' : 'movies';
  } catch {
    return 'movies';
  }
}

function storeKind(kind) {
  try {
    localStorage.setItem(RANK_KIND_KEY, kind);
  } catch {
    // ignore storage failures
  }
}

function createKindState(ranks, watches) {
  return {
    ranks,
    watches,
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
}

async function loadPage(auth, tvEnabled, initialKind) {
  const main = document.getElementById('rank-main');
  if (!main) return;

  const fetches = [
    ranksApi.list(auth.token),
    watchesApi.list(auth.token),
  ];
  if (tvEnabled) {
    fetches.push(tvRanksApi.list(auth.token), tvWatchesApi.list(auth.token));
  }

  const results = await Promise.all(fetches);
  const [{ ranks: movieRanks }, { watches }] = results;
  let tvRanks = [];
  let tvWatches = [];
  if (tvEnabled) {
    tvRanks = results[2]?.ranks || [];
    tvWatches = results[3]?.watches || [];
  }

  const page = {
    kind: initialKind === 'tv' && tvEnabled ? 'tv' : 'movies',
    tvEnabled,
    movies: createKindState(await pruneRanks('movies', movieRanks || [], watches || [], auth)),
    tv: createKindState(await pruneRanks('tv', tvRanks, tvWatches, auth)),
  };

  const render = () => {
    const state = activeState(page);
    const cfg = kindConfig(page.kind);
    const comparing = !!(state.candidate && state.insertState && !state.insertState.done);
    document.body.classList.toggle('al-rank-comparing', comparing);
    main.innerHTML = viewHtml(page, cfg);
    wire(auth, page, render);
  };

  const wireQueue = (kind) => {
    page[kind].runQueue = (items) => rankQueue(auth, page, kind, items, render);
  };
  wireQueue('movies');
  if (tvEnabled) wireQueue('tv');

  const params = new URLSearchParams(location.search);
  const addId = Number(params.get('add'));
  const addKind = params.get('kind') === 'tv' && tvEnabled ? 'tv' : 'movies';
  if (addId) {
    history.replaceState({}, '', '/amc-a-lister/rank.html');
    page.kind = addKind;
    storeKind(page.kind);
    const state = activeState(page);
    const cfg = kindConfig(page.kind);
    if (state.ranks.length) {
      const item = itemFromLogged(state, cfg, addId);
      if (item) {
        askToRank(page, cfg, item, render);
        return;
      }
    }
  }

  if (!activeState(page).ranks.length && startFirstRunQueue(page, page.kind)) return;
  render();
}

async function pruneRanks(kind, ranks, watches, auth) {
  const cfg = kindConfig(kind);
  const pruned = cfg.dropIneligible(ranks, watches);
  if (pruned.length === ranks.length) return ranks;
  try {
    const saved = await cfg.ranksApi.replace(auth.token, pruned);
    return saved.ranks || pruned;
  } catch {
    return pruned;
  }
}

function kindConfig(kind) {
  return KIND_CONFIG[kind] || KIND_CONFIG.movies;
}

function activeState(page) {
  return page[page.kind];
}

function viewHtml(page, cfg) {
  const state = activeState(page);
  const overlay = state.candidate && state.insertState && !state.insertState.done
    ? compareHtml(state, cfg)
    : '';
  const confirm = state.pending ? confirmHtml(state.pending) : '';
  const tabs = page.tvEnabled ? segmentHtml(page) : '';

  if (!state.ranks.length && !state.candidate && !state.saving) {
    return `${tabs}${firstRunHtml(state, cfg)}${confirm}${overlay}`;
  }

  return `${tabs}${listHtml(state, cfg)}${confirm}${overlay}`;
}

function segmentHtml(page) {
  const moviesActive = page.kind === 'movies';
  const tvActive = page.kind === 'tv';
  const movieCount = page.movies.ranks.length;
  const tvCount = page.tv.ranks.length;
  return `
    <div class="al-segment al-watchlist-segment al-rank-segment" role="tablist" aria-label="Rank kind">
      <button type="button" class="al-segment-btn${moviesActive ? ' is-active' : ''}" data-rank-kind="movies" role="tab" aria-selected="${moviesActive}">
        Movies <span class="al-segment-count">${movieCount}</span>
      </button>
      <button type="button" class="al-segment-btn${tvActive ? ' is-active' : ''}" data-rank-kind="tv" role="tab" aria-selected="${tvActive}">
        TV <span class="al-segment-count">${tvCount}</span>
      </button>
    </div>
  `;
}

function firstRunHtml(state, cfg) {
  const logged = cfg.firstRun(state.watches);
  const n = logged.length;

  const loggedBlock = n
    ? `
      <p class="al-muted">${cfg.firstRunIntro}</p>
      <div class="al-toolbar" style="margin-top:12px">
        <button class="al-btn al-btn-primary" type="button" id="rank-start">
          ${cfg.firstRunButton(n)}
        </button>
      </div>
    `
    : `
      <div class="al-empty al-empty--first-run">
        <p>${cfg.emptyFirstRun}</p>
      </div>
    `;

  return `
    <section class="al-panel al-rank-panel">
      <h2 class="al-section-title">Start a stack</h2>
      ${state.error ? `<p class="al-error">${escapeHtml(state.error)}</p>` : ''}
      ${state.status ? `<p class="al-muted" aria-live="polite">${escapeHtml(state.status)}</p>` : ''}
      ${loggedBlock}
    </section>
  `;
}

function listHtml(state, cfg) {
  const unranked = cfg.uniqueLogged(state.watches, state.ranks.map((r) => r.tmdb_id));
  const rows = state.ranks.map((item, i) => rankRowHtml(item, i + 1)).join('');

  return `
    <section class="al-panel al-rank-panel">
      <div class="al-watchlist-header al-watchlist-header--compact">
        <h2 class="al-section-title">Your stack</h2>
        <div class="al-rank-header-actions">
          <span class="al-muted">${cfg.stackLabel(state.ranks.length)}</span>
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
          <p class="al-rank-unranked-label">${cfg.unrankedLabel}</p>
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

function confirmHtml(item) {
  const rerank = !!item.alreadyRanked;
  return `
    <div class="al-rank-modal" role="dialog" aria-modal="true" aria-labelledby="rank-confirm-title">
      <div class="al-rank-modal-card">
        ${posterHtml(item, { size: 'w185', width: 80, height: 120, className: 'al-poster al-rank-poster' })}
        <div>
          <h2 class="al-rank-modal-title" id="rank-confirm-title">${rerank ? 'Re-rank this?' : 'Stack rank this?'}</h2>
          <p class="al-rank-modal-film">${escapeHtml(item.title)}${item.year ? ` (${item.year})` : ''}</p>
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

function compareHtml(state, cfg) {
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
        <button type="button" class="al-btn" data-compare-skip>${cfg.skipLabel}</button>
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

function itemFromLogged(state, cfg, tmdbId) {
  const id = Number(tmdbId);
  return cfg.uniqueLogged(state.watches).find((m) => m.tmdb_id === id)
    || state.ranks.find((m) => m.tmdb_id === id)
    || null;
}

function wire(auth, page, render) {
  wireSegments(page, render);
  wireSearch(auth, page, render);
  wireStart(page);
  wireList(auth, page, render);
  wireConfirm(page, render);
  wireCompare(page, render);
  wireClear(auth, page, render);
}

function wireSegments(page, render) {
  document.querySelectorAll('[data-rank-kind]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.rankKind;
      if (!next || next === page.kind) return;
      const state = activeState(page);
      if (state.busy || state.candidate) return;
      page.kind = next;
      storeKind(next);
      render();
    });
  });
}

function wireSearch(auth, page, render) {
  const cfg = kindConfig(page.kind);
  const state = activeState(page);
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
        const { results } = await cfg.searchApi.search(auth.token, q);
        const eligible = results.filter((m) => isEligibleToRank(state, cfg, m));
        if (!eligible.length) {
          resultsEl.hidden = true;
          return;
        }
        resultsEl.hidden = false;
        resultsEl.innerHTML = eligible.map((m) => `
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
            const item = itemFromSearch(btn);
            if (!isEligibleToRank(state, cfg, item)) {
              state.error = cfg.ineligibleError;
              render();
              return;
            }
            askToRank(page, cfg, item, render);
          });
        });
      } catch {
        resultsEl.hidden = true;
      }
    }, 300);
  });

  document.getElementById('rank-search-form')?.addEventListener('submit', (e) => e.preventDefault());
}

function startFirstRunQueue(page, kind) {
  const cfg = kindConfig(kind);
  const state = page[kind];
  const items = cfg.firstRun(state.watches);
  if (!items.length) return false;
  state.runQueue(items);
  return true;
}

function wireStart(page) {
  document.getElementById('rank-start')?.addEventListener('click', () => {
    startFirstRunQueue(page, page.kind);
  });
}

function wireList(auth, page, render) {
  const cfg = kindConfig(page.kind);
  const state = activeState(page);

  document.querySelectorAll('[data-add-logged]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = itemFromLogged(state, cfg, btn.dataset.addLogged);
      if (item) askToRank(page, cfg, item, render);
    });
  });

  document.querySelectorAll('[data-rerank]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = state.ranks.find((m) => m.tmdb_id === Number(btn.dataset.rerank));
      if (item) state.runQueue([item]);
    });
  });

  document.querySelectorAll('[data-unrank]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = state.ranks.find((m) => m.tmdb_id === Number(btn.dataset.unrank));
      if (!item) return;
      if (!confirm(`Remove “${item.title}” from your stack? Your watch log is unchanged.`)) return;
      try {
        state.saving = true;
        const { ranks } = await cfg.ranksApi.remove(auth.token, item.tmdb_id);
        state.ranks = ranks;
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

function wireClear(auth, page, render) {
  const cfg = kindConfig(page.kind);
  const state = activeState(page);

  document.getElementById('rank-clear')?.addEventListener('click', async () => {
    if (!state.ranks.length) return;
    if (!confirm('Clear your entire ranking? This cannot be undone. Your watch log is unchanged.')) return;
    try {
      state.saving = true;
      const { ranks } = await cfg.ranksApi.replace(auth.token, []);
      state.ranks = ranks || [];
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

function wireConfirm(page, render) {
  const state = activeState(page);

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

function wireCompare(page, render) {
  const state = activeState(page);
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

function isEligibleToRank(state, cfg, item) {
  return cfg.eligibleIds(state.watches).has(Number(item?.tmdb_id));
}

function askToRank(page, cfg, item, render) {
  const state = activeState(page);
  if (!item?.tmdb_id) return;
  if (!isEligibleToRank(state, cfg, item)) {
    state.error = cfg.ineligibleError;
    state.pending = null;
    render();
    return;
  }
  state.pending = {
    ...item,
    alreadyRanked: state.ranks.some((r) => r.tmdb_id === item.tmdb_id),
  };
  render();
}

async function rankQueue(auth, page, kind, items, render) {
  const cfg = kindConfig(kind);
  const state = page[kind];
  if (state.busy) return;
  state.busy = true;
  state.error = '';
  state.status = '';
  const queue = items.filter((m) => m?.tmdb_id && isEligibleToRank(state, cfg, m));
  state.remaining = Math.max(0, queue.length - 1);

  try {
    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i];
      state.remaining = queue.length - 1 - i;
      const pool = removeByTmdbId(state.ranks, item.tmdb_id);
      let insert = createInsertSearch(pool.length);
      if (!insert.done) {
        state.candidate = item;
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
        const { ranks } = await cfg.ranksApi.upsert(auth.token, {
          tmdb_id: item.tmdb_id,
          title: item.title,
          year: item.year,
          poster_path: item.poster_path,
          position: insert.insertIndex + 1,
        });
        state.ranks = ranks;
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
