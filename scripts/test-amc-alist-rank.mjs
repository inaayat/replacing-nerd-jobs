/**
 * Pure-function tests for A-Lister Beli-style movie stack insertion.
 * Run: node scripts/test-amc-alist-rank.mjs
 */
import assert from 'node:assert/strict';
import {
  createInsertSearch,
  applyInsertAnswer,
  insertAt,
  removeByTmdbId,
  placeWithOracle,
  uniqueLoggedMovies,
  firstRunMovies,
  isTheaterWatch,
  eligibleTmdbIds,
  dropIneligibleRanks,
} from '../amc-a-lister/engine/rank-insert.js';

function movie(id, title = `M${id}`) {
  return { tmdb_id: id, title };
}

function ids(list) {
  return list.map((m) => m.tmdb_id);
}

function placeWithAnswers(rankedLength, answers) {
  let state = createInsertSearch(rankedLength);
  for (const answer of answers) {
    assert.equal(state.done, false, 'unexpected extra answer');
    state = applyInsertAnswer(state, answer);
  }
  return state;
}

// Empty stack: no compares, insert at 0.
{
  const state = createInsertSearch(0);
  assert.equal(state.done, true);
  assert.equal(state.insertIndex, 0);
  assert.equal(state.pivotIndex, null);
}

// One existing movie.
{
  const better = placeWithAnswers(1, ['better']);
  assert.equal(better.done, true);
  assert.equal(better.insertIndex, 0, 'better than #1 becomes the new #1');

  const worse = placeWithAnswers(1, ['worse']);
  assert.equal(worse.done, true);
  assert.equal(worse.insertIndex, 1, 'worse than #1 becomes #2');
}

// Three movies [A B C]; first pivot is index 1 (B).
{
  const start = createInsertSearch(3);
  assert.equal(start.pivotIndex, 1);

  const aboveB = applyInsertAnswer(start, 'better');
  assert.equal(aboveB.done, false);
  assert.equal(aboveB.pivotIndex, 0, 'narrows to A');

  const newFirst = applyInsertAnswer(aboveB, 'better');
  assert.equal(newFirst.done, true);
  assert.equal(newFirst.insertIndex, 0);

  const betweenAB = applyInsertAnswer(aboveB, 'worse');
  assert.equal(betweenAB.done, true);
  assert.equal(betweenAB.insertIndex, 1);

  const belowB = applyInsertAnswer(start, 'worse');
  assert.equal(belowB.pivotIndex, 2, 'narrows to C');

  const betweenBC = applyInsertAnswer(belowB, 'better');
  assert.equal(betweenBC.done, true);
  assert.equal(betweenBC.insertIndex, 2);

  const last = applyInsertAnswer(belowB, 'worse');
  assert.equal(last.done, true);
  assert.equal(last.insertIndex, 3);
}

// applyInsertAnswer rejects unknown answers.
{
  assert.throws(() => applyInsertAnswer(createInsertSearch(2), 'skip'), /better.*worse/);
}

// insertAt / removeByTmdbId.
{
  const ranked = [movie(1), movie(2), movie(3)];
  assert.deepEqual(ids(insertAt(ranked, movie(9), 0)), [9, 1, 2, 3]);
  assert.deepEqual(ids(insertAt(ranked, movie(9), 2)), [1, 2, 9, 3]);
  assert.deepEqual(ids(insertAt(ranked, movie(9), 99)), [1, 2, 3, 9]);
  assert.deepEqual(ids(removeByTmdbId(ranked, 2)), [1, 3]);
  assert.deepEqual(ids(removeByTmdbId(ranked, '3')), [1, 2]);
}

// Oracle reconstructs a known total order regardless of insert sequence.
{
  const trueOrder = [10, 20, 30, 40, 50];
  const incoming = [40, 10, 50, 20, 30].map((id) => movie(id));
  let ranked = [];
  for (const candidate of incoming) {
    const result = placeWithOracle(ranked, candidate, (pivot, next) => (
      trueOrder.indexOf(next.tmdb_id) < trueOrder.indexOf(pivot.tmdb_id) ? 'better' : 'worse'
    ));
    ranked = result.ranked;
  }
  assert.deepEqual(ids(ranked), trueOrder);
}

// Re-rank: remove then re-insert with new answers.
{
  const ranked = [movie(1), movie(2), movie(3)];
  const without = removeByTmdbId(ranked, 1);
  // Pivot is the last of two remaining titles; "worse" inserts at the end.
  const moved = placeWithAnswers(without.length, ['worse']);
  assert.equal(moved.insertIndex, 2);
  const between = placeWithAnswers(without.length, ['better', 'worse']);
  assert.equal(between.insertIndex, 1);
  assert.deepEqual(ids(insertAt(without, movie(1), between.insertIndex)), [2, 1, 3]);
}

// Unique logged titles: tmdb_id required, first occurrence wins, skip ranked.
{
  const watches = [
    { tmdb_id: 11, title: 'Dune', poster_path: '/a.jpg' },
    { tmdb_id: 11, title: 'Dune (rewatch)' },
    { tmdb_id: null, title: 'Untagged' },
    { title: 'Also untagged' },
    { tmdb_id: 22, title: 'Heat', year: 1995 },
    { tmdb_id: 33, title: 'Already ranked' },
  ];
  const unique = uniqueLoggedMovies(watches, [33]);
  assert.deepEqual(unique.map((m) => m.tmdb_id), [11, 22]);
  assert.equal(unique[0].title, 'Dune');
  assert.equal(unique[1].year, 1995);
}

// Theater-only: home/streaming excluded, DNFs included, rewatches once.
{
  const watches = [
    { tmdb_id: 11, title: 'Dune', in_theaters: true },
    { tmdb_id: 11, title: 'Dune again', in_theaters: true, dnf: true },
    { tmdb_id: 22, title: 'Heat at home', in_theaters: false },
    { tmdb_id: 33, title: 'Walked out', in_theaters: true, dnf: true },
    { tmdb_id: 44, title: 'Legacy theater row' },
  ];
  assert.equal(isTheaterWatch(watches[0]), true);
  assert.equal(isTheaterWatch(watches[1]), true);
  assert.equal(isTheaterWatch(watches[2]), false);
  assert.equal(isTheaterWatch(watches[4]), true);

  const unique = uniqueLoggedMovies(watches);
  assert.deepEqual(unique.map((m) => m.tmdb_id), [11, 33, 44]);

  const ids = [...eligibleTmdbIds(watches)].sort((a, b) => a - b);
  assert.deepEqual(ids, [11, 33, 44]);

  const stored = [
    { tmdb_id: 11, title: 'Dune' },
    { tmdb_id: 22, title: 'Heat at home' },
    { tmdb_id: 33, title: 'Walked out' },
  ];
  assert.deepEqual(dropIneligibleRanks(stored, watches).map((m) => m.tmdb_id), [11, 33]);
}

// First-run queue is every unique theater title — no subset, home/streaming out.
{
  const watches = [
    { tmdb_id: 11, title: 'Dune', in_theaters: true },
    { tmdb_id: 11, title: 'Dune again', in_theaters: true },
    { tmdb_id: 22, title: 'Heat at home', in_theaters: false },
    { tmdb_id: 33, title: 'Walked out', in_theaters: true, dnf: true },
    { tmdb_id: 44, title: 'Legacy theater row' },
  ];
  const queue = firstRunMovies(watches);
  assert.deepEqual(queue.map((m) => m.tmdb_id), [11, 33, 44]);
  assert.equal(queue.length, uniqueLoggedMovies(watches).length);
  assert.deepEqual(firstRunMovies([]), []);
  assert.deepEqual(firstRunMovies(null), []);
}

console.log('amc alist rank tests passed');
