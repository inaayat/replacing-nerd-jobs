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
assert.equal(parseViewHash('#plan/next').kind, 'plan');
assert.equal(parseViewHash('#plan/next').section, 'next');
assert.equal(parseViewHash('#favorites').kind, 'favorites');

let board = emptyBoard();
board = addBucket(board, 'Venue');
const id = board.buckets[0].id;
assert.equal(parseViewHash(`#tag/${id}`, { tagIds: [id] }).kind, 'tag');
assert.equal(parseViewHash(`#b/${id}`, { tagIds: [id] }).kind, 'tag', 'legacy b/ hash works');

assert.match(viewCopy({ kind: 'home' }), /Recent inspiration/);
assert.equal(viewTitle({ kind: 'plan', section: 'decisions' }, board), 'Decisions');
assert.equal(usesCollage({ kind: 'shortlist' }), true);

console.log('wedding routes tests passed');
