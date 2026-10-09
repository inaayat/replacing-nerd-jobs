/**
 * Pure-function tests for A-Lister Beli-style movie stack insertion.
 * Run: node scripts/test-amc-alist-rank.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rankStackHtml, rankStackWithUnrankedHtml, unrankedGridHtml } from '../amc-a-lister/engine/rank-view.js';
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
  eligibleTvTmdbIds,
  dropIneligibleTvRanks,
  uniqueLoggedShows,
  firstRunShows,
  unlinkedTvShowCount,
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

  // Missing watch list (the Rank page bug) must not throw, and yields nothing to rank.
  assert.deepEqual(uniqueLoggedMovies(undefined, [11]), []);
  assert.deepEqual(uniqueLoggedShows(null, [100]), []);

  // 110 theater screenings / 92 ranked unique titles: leftover unique movies stay unranked.
  const rankedWatches = [];
  for (let i = 1; i <= 92; i += 1) rankedWatches.push({ tmdb_id: i, title: `R${i}`, in_theaters: true });
  const extraUnranked = [];
  for (let i = 93; i <= 110; i += 1) extraUnranked.push({ tmdb_id: i, title: `U${i}`, in_theaters: true });
  const leftover = uniqueLoggedMovies(
    rankedWatches.concat(extraUnranked),
    rankedWatches.map((w) => w.tmdb_id),
  );
  assert.equal(leftover.length, 18);
  assert.equal(leftover[0].tmdb_id, 93);
  assert.equal(
    uniqueLoggedMovies(
      rankedWatches.concat(rankedWatches.slice(0, 18)),
      rankedWatches.map((w) => w.tmdb_id),
    ).length,
    0,
    'rewatches of ranked titles are not unranked',
  );
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

// TV shows: episode logs dedupe to show level; any logged tmdb_id is eligible.
{
  const watches = [
    { tmdb_id: 100, title: 'Severance', poster_path: '/s.jpg' },
    { tmdb_id: 100, title: 'Severance S2E1', season: 2, episode: 1 },
    { tmdb_id: 200, title: 'The Bear', dnf: true },
    { tmdb_id: null, title: 'Untagged' },
  ];
  const unique = uniqueLoggedShows(watches, [200]);
  assert.deepEqual(unique.map((s) => s.tmdb_id), [100]);
  assert.equal(unique[0].title, 'Severance');
  assert.equal(unique[0].poster_path, '/s.jpg');

  const ids = [...eligibleTvTmdbIds(watches)].sort((a, b) => a - b);
  assert.deepEqual(ids, [100, 200]);

  const stored = [
    { tmdb_id: 100, title: 'Severance' },
    { tmdb_id: 300, title: 'Gone show' },
  ];
  assert.deepEqual(dropIneligibleTvRanks(stored, watches).map((s) => s.tmdb_id), [100]);

  const queue = firstRunShows(watches);
  assert.deepEqual(queue.map((s) => s.tmdb_id), [100, 200]);
}

// Unlinked TV shows: titles without tmdb_id.
{
  const watches = [
    { title: 'Ted Lasso' },
    { title: 'Ted Lasso', tmdb_id: null },
    { title: 'The Bear', tmdb_id: 200 },
  ];
  assert.equal(unlinkedTvShowCount(watches), 1);
  assert.equal(unlinkedTvShowCount([]), 0);
}

// The stack and the unranked set are poster grids, and every unranked title is included.
{
  const ranked = [
    { tmdb_id: 1, title: 'Sinners', year: 2025, poster_path: '/s.jpg' },
    { tmdb_id: 2, title: 'Dune', year: 2024 },
  ];
  const stack = rankStackHtml(ranked);
  assert.match(stack, /class="al-rank-grid"/);
  assert.match(stack, /al-rank-tile-num">1</);
  assert.match(stack, /al-rank-tile-num">2</);
  assert.match(stack, /Sinners/);
  assert.match(stack, /aria-label="Re-rank"/);
  assert.match(stack, /aria-label="Remove"/);
  assert.match(stack, /data-rerank="1"/);
  assert.match(stack, /data-unrank="2"/);
  assert.equal(rankStackHtml([]), '<p class="al-empty">Nothing ranked yet.</p>');

  const unranked = Array.from({ length: 13 }, (_, i) => ({
    tmdb_id: 100 + i,
    title: `Unranked ${i + 1}`,
    year: 2020,
  }));
  const grid = unrankedGridHtml(unranked);
  assert.match(grid, /al-rank-grid--unranked/);
  assert.equal((grid.match(/data-add-logged="/g) || []).length, 13);
  assert.match(grid, /data-add-logged="112"/);
  assert.equal(unrankedGridHtml([]), '');

  const rankSource = readFileSync(new URL('../amc-a-lister/engine/rank.js', import.meta.url), 'utf8');
  assert.equal(rankSource.includes('slice(0, 12)'), false);
  assert.match(rankSource, /rankStackWithUnrankedHtml/);
  assert.match(rankSource, /state\.runQueue\(unranked\)/);
  assert.match(rankSource, /getElementById\('rank-unranked'\)/);
  // Kind state must keep the watch log. Passing only pruneRanks(...) left
  // state.watches undefined, so uniqueLogged was always [] and the button never rendered.
  assert.match(
    rankSource,
    /createKindState\(\s*await pruneRanks\('movies'[\s\S]*?auth\),\s*movieWatches/,
  );
  assert.match(
    rankSource,
    /createKindState\(\s*await pruneRanks\('tv'[\s\S]*?auth\),\s*tvWatches/,
  );
  assert.equal(rankSource.includes("createKindState(await pruneRanks('movies'"), false);

  const withUnranked = rankStackWithUnrankedHtml(
    ranked,
    unranked,
    { buttonLabel: 'Rank 13 unranked movies', unrankedLabel: 'Not ranked yet' },
  );
  const buttonAt = withUnranked.indexOf('id="rank-unranked"');
  const listAt = withUnranked.indexOf('id="rank-list"');
  const gridAt = withUnranked.indexOf('al-rank-grid--unranked');
  assert.ok(buttonAt >= 0 && listAt > buttonAt, 'Rank unranked button sits above the ranked grid');
  assert.ok(gridAt > listAt, 'unranked posters stay below the ranked grid');
  assert.match(withUnranked, /Rank 13 unranked movies/);
  assert.equal((withUnranked.match(/data-add-logged="/g) || []).length, 13);

  const noneUnranked = rankStackWithUnrankedHtml(ranked, [], {
    buttonLabel: 'Rank 0 unranked movies',
    unrankedLabel: 'Not ranked yet',
  });
  assert.equal(noneUnranked.includes('id="rank-unranked"'), false);
  assert.match(noneUnranked, /id="rank-list"/);
  assert.equal(noneUnranked.includes('al-rank-grid--unranked'), false);

  const css = readFileSync(new URL('../amc-a-lister/engine/app.css', import.meta.url), 'utf8');
  const gridCss = css.slice(css.indexOf('/* Rank stack and unranked'), css.indexOf('.al-rank-modal,'));
  const phoneCss = gridCss.slice(0, gridCss.indexOf('@media (min-width: 768px)'));
  assert.match(phoneCss, /repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(gridCss, /repeat\(auto-fill, minmax\(150px, 1fr\)\)/);
  assert.match(css, /\.al-rank-unranked-bar/);
}

console.log('amc alist rank tests passed');
