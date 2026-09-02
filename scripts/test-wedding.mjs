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
  urlDomain,
  isImageUrl,
  linkKind,
  linkKindLabel,
  defaultUrlLabel,
  extractPastedUrl,
  clipDisplayLabel,
  addBucket,
  renameBucket,
  removeBucket,
  moveBucket,
  addClip,
  updateClip,
  removeClip,
  moveClip,
  toggleClipTag,
  toggleClipFavorite,
  setClipStatus,
  clipsIn,
  inboxCount,
  bucketCount,
  searchClips,
  seedSuggestedBuckets,
  isVideoFileUrl,
  mediaPreview,
  extractOpenGraph,
  localPreview,
  clipNeedsUnfurl,
  previewHref,
  previewPresentation,
  previewPaint,
  clipHasVisual,
  isStillMedia,
  pinterestPinId,
  pinterestThumbFromHtml,
  pinterestWidgetThumbnail,
  filterClips,
  sortClips,
  homeSummary,
  addTask,
  updateTask,
  removeTask,
  addDecision,
  updateDecision,
  removeDecision,
  tasksIn,
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
eq(empty.buckets.length, 0, 'starts with no buckets — they get built over time');
eq(empty.clips.length, 0, 'starts with no clips');
eq(empty.tasks.length, 0, 'starts with no tasks');
eq(SUGGESTED_BUCKETS.length, 6, 'a handful of starter names for the empty state');

const junk = normalizeBoard({ title: 'x'.repeat(200), buckets: 'nope', clips: null });
eq(junk.title.length, BOARD_LIMITS.title, 'title is clipped');
eq(junk.buckets.length, 0, 'bad buckets become none');
eq(junk.clips.length, 0, 'bad clips become none');

const migrated = normalizeBoard({
  v: 1,
  buckets: [{ id: 'b_old', name: 'Venue' }],
  clips: [{ id: 'c1', body: 'garden', bucketId: 'b_old' }],
});
eq(migrated.v, 2, 'v1 boards migrate to v2');
eq(migrated.clips[0].tagIds.join(','), 'b_old', 'bucketId becomes tagIds');
eq(migrated.clips[0].status, 'saved', 'migrated clips default to saved');

assert.equal(isHttpUrl('https://tiktok.com/@x/video/1'), true);
eq(cleanUrl('tiktok.com/@bride/video/9'), 'https://tiktok.com/@bride/video/9');

let board = emptyBoard();
board = addBucket(board, 'Venue');
board = addBucket(board, 'Looks');
const venueId = board.buckets[0].id;
const looksId = board.buckets[1].id;

board = addClip(board, { body: 'garden ceremony if it does not rain', tagIds: [venueId] });
eq(board.clips[0].tagIds[0], venueId);
eq(inboxCount(board), 0);

board = addClip(board, {
  body: '',
  url: 'https://www.tiktok.com/@x/video/1',
  urlLabel: 'aisle walk I like',
});
eq(board.clips[0].bucketId, undefined, 'v2 clips have tagIds not bucketId');
eq(inboxCount(board), 1);

const noteId = board.clips.find((c) => c.body.includes('garden')).id;
board = toggleClipTag(board, noteId, looksId);
eq(board.clips.find((c) => c.id === noteId).tagIds.includes(looksId), true);
eq(board.clips.find((c) => c.id === noteId).tagIds.includes(venueId), true, 'adding a tag keeps others');

board = moveClip(board, noteId, looksId);
eq(clipsIn(board, venueId).length, 0, 'moveClip replaces tags with one tag');
eq(clipsIn(board, looksId)[0].id, noteId);

board = toggleClipFavorite(board, board.clips[0].id);
eq(board.clips[0].favorite, true);

board = setClipStatus(board, board.clips[0].id, 'shortlist');
eq(board.clips[0].status, 'shortlist');

const filtered = filterClips(board, { view: 'shortlist' });
eq(filtered.length, 1);
eq(filterClips(board, { view: 'favorites' }).length, 1);

board = setClipStatus(board, board.clips[0].id, 'archived');
eq(inboxCount(board), 0, 'archived clips leave inbox counts');

const summary = homeSummary(board);
assert.ok(summary.inbox >= 0);
assert.ok(Array.isArray(summary.recent));

board = addTask(board, { title: 'Book venue tour', status: 'next' });
board = addTask(board, { title: 'Research florists', status: 'someday' });
eq(tasksIn(board, 'next').length, 1);
board = updateTask(board, board.tasks[0].id, { status: 'done' });
eq(tasksIn(board, 'done').length, 1);

const clipForDecision = board.clips.find((c) => c.url);
board = addDecision(board, { title: 'Indoor or garden?', clipIds: [clipForDecision.id] });
eq(board.decisions.length, 1);
board = updateDecision(board, board.decisions[0].id, { status: 'decided' });
eq(board.decisions[0].status, 'decided');
eq(board.decisions[0].decidedAt != null, true);

board = removeDecision(board, board.decisions[0].id);
eq(board.decisions.length, 0);

const leftover = clipsIn(board, looksId).length;
board = removeBucket(board, looksId);
eq(board.clips.every((c) => !c.tagIds.includes(looksId)), true);

const seeded = seedSuggestedBuckets(emptyBoard());
eq(seeded.buckets.length, SUGGESTED_BUCKETS.length);

const deadClip = normalizeBoard({
  buckets: [{ id: 'b_keep', name: 'Keep' }],
  clips: [
    { id: 'c1', body: 'ok', bucketId: 'b_gone' },
    { id: 'c2', body: '', url: 'not a url' },
  ],
});
eq(deadClip.clips.length, 1, 'empty / invalid clips drop');
eq(deadClip.clips[0].tagIds.length, 0, 'unknown bucket becomes untagged inbox');

eq(viewHash(defaultView()), '#home');
eq(parseViewHash('#inbox').kind, 'inbox');
eq(parseViewHash('#b/legacy', { tagIds: ['legacy'] }).kind, 'tag');
eq(viewTitle({ kind: 'home' }, empty), 'Home');
eq(usesCollage({ kind: 'all' }), true);
eq(usesCollage({ kind: 'home' }), false);
eq(usesCollage({ kind: 'plan', section: 'next' }), false);

eq(linkKind('https://www.tiktok.com/@x/video/1'), 'tiktok');
eq(previewPresentation({ url: 'https://www.tiktok.com/@x/video/1' }).mode, 'play');
eq(clipHasVisual({ body: 'garden if it rains', url: '' }), false);

console.log('wedding board tests passed');
