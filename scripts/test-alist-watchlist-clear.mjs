/**
 * Pure-function tests for clearing want-to-watch rows when a film is logged.
 * Run: node scripts/test-alist-watchlist-clear.mjs
 */
import assert from 'node:assert/strict';
import { watchlistItemMatchesLogged } from '../amc-a-lister/engine/watchlist-match.js';
import { watchlistMatchesLogged } from '../amc-a-lister/engine/watchlist-ui.js';

const item = { id: 'w1', title: 'Dune', tmdb_id: 438631 };
const other = { id: 'w2', title: 'Dune Part Two', tmdb_id: 693134 };
const unlinked = { id: 'w3', title: 'Dune', tmdb_id: null };

assert.equal(watchlistItemMatchesLogged(item, { tmdb_id: 438631, title: 'Dune' }), true);
assert.equal(watchlistItemMatchesLogged(item, { tmdb_id: 999, title: 'Other' }), false);
assert.equal(watchlistItemMatchesLogged(item, { watchlistId: 'w1' }), true);
assert.equal(watchlistItemMatchesLogged(unlinked, { title: 'dune', tmdb_id: null }), true);
assert.equal(watchlistItemMatchesLogged(other, { title: 'Dune', tmdb_id: null }), false);

assert.equal(
  watchlistMatchesLogged,
  watchlistItemMatchesLogged,
  'watchlist-ui re-exports the shared matcher',
);

console.log('alist watchlist-clear: ok');
