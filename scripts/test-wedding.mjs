/**
 * Tests for the Wedding board document (wedding/engine/model.js) and routes.
 *   node scripts/test-wedding.mjs
 */
import assert from 'node:assert/strict';
import {
  BOARD_LIMITS,
  SUGGESTED_BUCKETS,
  emptyBoard,
  normalizeBoard,
  isHttpUrl,
  cleanUrl,
  linkKind,
  addBucket,
  addClip,
  toggleClipTag,
  toggleClipFavorite,
  setClipStatus,
  clipsIn,
  inboxCount,
  bucketCount,
  filterClips,
  homeSummary,
  clipHasVisual,
  previewPresentation,
} from '../wedding/engine/model.js';
import {
  defaultView,
  viewHash,
  parseViewHash,
  viewTitle,
  usesCollage,
} from '../wedding/engine/routes.js';

function eq(actual, expected, msg) {
  assert.equal(actual, expected, msg);
}

const empty = emptyBoard();
eq(empty.v, 2, 'empty board version');
eq(empty.buckets.length, 0, 'starts with no buckets');
eq(empty.clips.length, 0, 'starts with no clips');
eq(empty.tasks, undefined, 'no planning tasks on board');
eq(SUGGESTED_BUCKETS.length, 6, 'starter tag names for empty state');

const migrated = normalizeBoard({
  v: 1,
  buckets: [{ id: 'b_old', name: 'Venue' }],
  clips: [{ id: 'c1', body: 'garden', bucketId: 'b_old' }],
  tasks: [{ id: 't1', title: 'old task', status: 'next' }],
  decisions: [{ id: 'd1', title: 'old decision', status: 'exploring' }],
});
eq(migrated.v, 2, 'v1 boards migrate to v2');
eq(migrated.clips[0].tagIds.join(','), 'b_old');
eq(migrated.tasks, undefined, 'legacy tasks drop on normalize');
eq(migrated.decisions, undefined, 'legacy decisions drop on normalize');

let board = emptyBoard();
board = addBucket(board, 'Venue');
board = addBucket(board, 'Looks');
const venueId = board.buckets[0].id;
const looksId = board.buckets[1].id;

board = addClip(board, { body: 'garden ceremony', tagIds: [venueId] });
board = addClip(board, { url: 'https://www.tiktok.com/@x/video/1', urlLabel: 'aisle walk' });
eq(inboxCount(board), 1);

const noteId = board.clips.find((c) => c.body.includes('garden')).id;
board = toggleClipTag(board, noteId, looksId);
eq(board.clips.find((c) => c.id === noteId).tagIds.length, 2);

board = toggleClipFavorite(board, board.clips[0].id);
board = setClipStatus(board, board.clips[0].id, 'shortlist');
eq(filterClips(board, { view: 'shortlist' }).length, 1);

const summary = homeSummary(board);
assert.ok(summary.total >= 2);
assert.ok(summary.recent.length >= 1);

eq(viewHash(defaultView()), '#home');
eq(parseViewHash('#plan/next').kind, 'home', 'legacy plan URLs fall back to home');
eq(viewTitle({ kind: 'home' }, empty), 'Home');
eq(usesCollage({ kind: 'all' }), true);
eq(usesCollage({ kind: 'home' }), false);

eq(linkKind('https://www.tiktok.com/@x/video/1'), 'tiktok');
eq(clipHasVisual({ body: 'note only', url: '' }), false);

console.log('wedding board tests passed');
