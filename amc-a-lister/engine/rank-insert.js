/**
 * Binary-search insertion for a best-first stack (1 = favorite).
 * Browser-safe ESM — no node: imports, no npm packages.
 *
 * `better` means the candidate belongs closer to #1 than the pivot.
 * `worse` means it belongs further down the stack than the pivot.
 */

export function createInsertSearch(rankedLength) {
  const n = Math.max(0, Number(rankedLength) || 0);
  if (n <= 0) {
    return { lo: 0, hi: 0, done: true, insertIndex: 0, pivotIndex: null };
  }
  const lo = 0;
  const hi = n;
  return {
    lo,
    hi,
    done: false,
    insertIndex: null,
    pivotIndex: Math.floor((lo + hi) / 2),
  };
}

export function applyInsertAnswer(state, answer) {
  if (!state || state.done) return state;
  if (answer !== 'better' && answer !== 'worse') {
    throw new Error('answer must be "better" or "worse"');
  }

  let { lo, hi } = state;
  const pivot = state.pivotIndex;
  if (answer === 'better') hi = pivot;
  else lo = pivot + 1;

  if (lo >= hi) {
    return { lo, hi, done: true, insertIndex: lo, pivotIndex: null };
  }
  return {
    lo,
    hi,
    done: false,
    insertIndex: null,
    pivotIndex: Math.floor((lo + hi) / 2),
  };
}

export function insertAt(ranked, movie, insertIndex) {
  const next = Array.isArray(ranked) ? ranked.slice() : [];
  const index = Math.max(0, Math.min(Number(insertIndex) || 0, next.length));
  next.splice(index, 0, movie);
  return next;
}

export function removeByTmdbId(ranked, tmdbId) {
  const id = Number(tmdbId);
  return (ranked || []).filter((movie) => Number(movie.tmdb_id) !== id);
}

/**
 * Place `candidate` into `ranked` (best-first) using an oracle.
 * `decide(pivot, candidate)` returns `'better'` | `'worse'`.
 */
export function placeWithOracle(ranked, candidate, decide) {
  const list = Array.isArray(ranked) ? ranked.slice() : [];
  let state = createInsertSearch(list.length);
  const answers = [];
  while (!state.done) {
    const pivot = list[state.pivotIndex];
    const answer = decide(pivot, candidate);
    answers.push({ pivotIndex: state.pivotIndex, answer });
    state = applyInsertAnswer(state, answer);
  }
  return {
    ranked: insertAt(list, candidate, state.insertIndex),
    insertIndex: state.insertIndex,
    answers,
  };
}

/**
 * Theater screenings only. `in_theaters === false` is home/streaming.
 * DNFs stay eligible — the log already stores that as `dnf`.
 * Missing `in_theaters` counts as theater (legacy rows defaulted true).
 */
export function isTheaterWatch(watch) {
  return watch != null && watch.in_theaters !== false;
}

function uniqueLoggedItems(watches, rankedTmdbIds = [], eligibleWatch = null) {
  const ranked = new Set((rankedTmdbIds || []).map(Number).filter((id) => id > 0));
  const seen = new Set();
  const out = [];
  for (const watch of watches || []) {
    if (eligibleWatch && !eligibleWatch(watch)) continue;
    const tmdbId = Number(watch.tmdb_id);
    if (!tmdbId || seen.has(tmdbId) || ranked.has(tmdbId)) continue;
    seen.add(tmdbId);
    out.push({
      tmdb_id: tmdbId,
      title: watch.title,
      year: watch.year != null && watch.year !== '' ? Number(watch.year) : null,
      poster_path: watch.poster_path || null,
    });
  }
  return out;
}

function eligibleIdsFromWatches(watches, eligibleWatch = null) {
  const ids = new Set();
  for (const watch of watches || []) {
    if (eligibleWatch && !eligibleWatch(watch)) continue;
    const tmdbId = Number(watch.tmdb_id);
    if (tmdbId > 0) ids.add(tmdbId);
  }
  return ids;
}

function dropIneligible(ranks, watches, eligibleWatch = null) {
  const eligible = eligibleIdsFromWatches(watches, eligibleWatch);
  return (ranks || []).filter((item) => eligible.has(Number(item.tmdb_id)));
}

/** Unique tmdb_ids the user has watched in a theater (DNF included). */
export function eligibleTmdbIds(watches) {
  return eligibleIdsFromWatches(watches, isTheaterWatch);
}

/** Drop stored ranks that are not theater watches, keeping relative order. */
export function dropIneligibleRanks(ranks, watches) {
  return dropIneligible(ranks, watches, isTheaterWatch);
}

/** Unique theater-logged titles that have a tmdb_id, excluding those already ranked. */
export function uniqueLoggedMovies(watches, rankedTmdbIds = []) {
  return uniqueLoggedItems(watches, rankedTmdbIds, isTheaterWatch);
}

/**
 * First ranking setup: every unique theater-watched title (DNFs included).
 * No subset — later adds use unranked chips / search / after-add instead.
 */
export function firstRunMovies(watches) {
  return uniqueLoggedMovies(watches);
}

/** Unique tmdb_ids from the TV log (DNF included). Episodes of one show count once. */
export function eligibleShowTmdbIds(watches) {
  return eligibleIdsFromWatches(watches);
}

/** Drop stored TV ranks that are not in the TV log, keeping relative order. */
export function dropIneligibleShowRanks(ranks, watches) {
  return dropIneligible(ranks, watches);
}

/** Unique logged shows that have a tmdb_id, excluding those already ranked. */
export function uniqueLoggedShows(watches, rankedTmdbIds = []) {
  return uniqueLoggedItems(watches, rankedTmdbIds);
}

/**
 * First TV ranking setup: every unique logged show (DNFs included).
 * Multiple episodes of the same series become one stack entry.
 */
export function firstRunShows(watches) {
  return uniqueLoggedShows(watches);
}
