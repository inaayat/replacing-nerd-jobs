/**
 * Binary-search insertion for a best-first movie stack (1 = favorite).
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

/** Unique logged titles that have a tmdb_id, excluding those already ranked. */
export function uniqueLoggedMovies(watches, rankedTmdbIds = []) {
  const ranked = new Set((rankedTmdbIds || []).map(Number).filter((id) => id > 0));
  const seen = new Set();
  const out = [];
  for (const watch of watches || []) {
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
