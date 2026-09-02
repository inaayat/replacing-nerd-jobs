/**
 * Wedding route hash parsing.
 *   node scripts/test-wedding-routes.mjs
 */
import assert from 'node:assert/strict';
import {
  defaultView,
  viewHash,
  parseViewHash,
  viewTitle,
  viewCopy,
  usesCollage,
} from '../wedding/engine/routes.js';
import { emptyBoard, addBucket } from '../wedding/engine/model.js';

assert.equal(viewHash(defaultView()), '#home');
assert.equal(parseViewHash('#favorites').kind, 'favorites');
assert.equal(parseViewHash('#plan/someday').kind, 'home', 'plan hash redirects home');

let board = emptyBoard();
board = addBucket(board, 'Venue');
const id = board.buckets[0].id;
assert.equal(parseViewHash(`#tag/${id}`, { tagIds: [id] }).kind, 'tag');

assert.match(viewCopy({ kind: 'home' }), /Recent saves/);
assert.equal(viewTitle({ kind: 'favorites' }, board), 'Favorites');
assert.equal(usesCollage({ kind: 'shortlist' }), true);

console.log('wedding routes tests passed');
