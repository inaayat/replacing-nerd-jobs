/**
 * Tests for the Wedding board document (wedding/engine/model.js).
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
  clipsIn,
  inboxCount,
  bucketCount,
  searchClips,
  seedSuggestedBuckets,
} from '../wedding/engine/model.js';

function eq(actual, expected, msg) {
  assert.equal(actual, expected, msg);
}

const empty = emptyBoard();
eq(empty.v, 1, 'empty board version');
eq(empty.buckets.length, 0, 'starts with no buckets — they get built over time');
eq(empty.clips.length, 0, 'starts with no clips');
eq(SUGGESTED_BUCKETS.length, 6, 'a handful of starter names for the empty state');

const junk = normalizeBoard({ title: 'x'.repeat(200), buckets: 'nope', clips: null });
eq(junk.title.length, BOARD_LIMITS.title, 'title is clipped');
eq(junk.buckets.length, 0, 'bad buckets become none');
eq(junk.clips.length, 0, 'bad clips become none');

assert.equal(isHttpUrl('https://tiktok.com/@x/video/1'), true);
assert.equal(isHttpUrl('http://example.com/a'), true);
assert.equal(isHttpUrl('tiktok.com/@x'), false, 'bare hosts are not lone URLs');
assert.equal(isHttpUrl('https://a.com and more'), false);
eq(cleanUrl('https://instagram.com/reel/abc'), 'https://instagram.com/reel/abc');
eq(cleanUrl('tiktok.com/@bride/video/9'), 'https://tiktok.com/@bride/video/9');
eq(cleanUrl('javascript:alert(1)'), null);
eq(cleanUrl('ftp://files.example'), null);
eq(urlDomain('https://www.pinterest.com/pin/1'), 'pinterest.com');

eq(linkKind('https://www.tiktok.com/@x/video/1'), 'tiktok');
eq(linkKind('https://vm.tiktok.com/ZMabc/'), 'tiktok');
eq(linkKind('https://www.instagram.com/reel/AbC/'), 'instagram');
eq(linkKind('https://youtu.be/dQw4w9wg'), 'youtube');
eq(linkKind('https://pin.it/abc'), 'pinterest');
eq(linkKind('https://images.example.com/look.jpg'), 'image');
eq(linkKind('https://i.imgur.com/abc'), 'image');
eq(linkKind('https://example.com/mood'), 'link');
eq(isImageUrl('https://cdn.example.com/veil.png?w=800'), true);
eq(isImageUrl('https://example.com/page'), false);
eq(linkKindLabel('tiktok'), 'TikTok');
eq(defaultUrlLabel('https://www.tiktok.com/@x/video/1'), 'TikTok');
eq(defaultUrlLabel('https://example.com/lookbook'), 'example.com');

const peeled = extractPastedUrl('  https://instagram.com/reel/zz  ');
eq(peeled.body, '', 'a lone paste becomes the URL, not the note');
eq(peeled.url, 'https://instagram.com/reel/zz');
const split = extractPastedUrl('this veil\nhttps://pin.it/abc');
eq(split.body, 'this veil', 'caption stays when the last line is a URL');
eq(split.url, 'https://pin.it/abc');

let board = emptyBoard();
board = addBucket(board, 'Venue');
board = addBucket(board, 'Looks');
eq(board.buckets.length, 2);
assert.throws(() => addBucket(board, 'venue'), /already/);
assert.throws(() => addBucket(board, '   '), /Name the bucket/);
const venueId = board.buckets[0].id;
const looksId = board.buckets[1].id;

board = renameBucket(board, venueId, 'The place');
eq(board.buckets[0].name, 'The place');
board = moveBucket(board, venueId, 'down');
eq(board.buckets[0].id, looksId, 'Looks moves to the top');
eq(board.buckets[1].id, venueId);

board = addClip(board, { body: 'garden ceremony if it does not rain', bucketId: venueId });
eq(board.clips.length, 1);
eq(board.clips[0].bucketId, venueId);
eq(inboxCount(board), 0);
eq(bucketCount(board, venueId), 1);

board = addClip(board, {
  body: '',
  url: 'https://www.tiktok.com/@x/video/1',
  urlLabel: 'aisle walk I like',
});
eq(board.clips[0].urlLabel, 'aisle walk I like', 'newest clip is first');
eq(board.clips[0].bucketId, null, 'no bucket → inbox');
eq(inboxCount(board), 1);
eq(clipDisplayLabel(board.clips[0]), 'aisle walk I like');

board = addClip(board, { body: 'https://www.instagram.com/reel/Look/' });
eq(board.clips[0].url, 'https://www.instagram.com/reel/Look/');
eq(board.clips[0].body, '', 'a pasted URL does not also fill the note');

board = addClip(board, { body: 'hair idea\nhttps://youtu.be/abc' });
eq(board.clips[0].body, 'hair idea');
eq(board.clips[0].url, 'https://youtu.be/abc');

assert.throws(() => addClip(board, { body: '   ' }), /note or paste a link/);

const noteId = board.clips.find((c) => c.body.includes('garden')).id;
board = moveClip(board, noteId, looksId);
eq(clipsIn(board, venueId).length, 0, 'moved out of venue');
eq(clipsIn(board, looksId)[0].id, noteId);

board = updateClip(board, noteId, { body: 'garden if the wind is kind', urlLabel: 'ignored without url' });
eq(board.clips.find((c) => c.id === noteId).body, 'garden if the wind is kind');
eq(board.clips.find((c) => c.id === noteId).urlLabel, '', 'label clears when there is no URL');

const hits = searchClips(board, 'AISLE');
eq(hits.length, 1, 'search matches URL text');
eq(searchClips(board, 'garden').length, 1);
eq(searchClips(board, 'nope-not-here').length, 0);

const dropped = board.clips[0].id;
board = removeClip(board, dropped);
assert.ok(!board.clips.some((c) => c.id === dropped));

const leftover = clipsIn(board, looksId).length;
board = removeBucket(board, looksId);
eq(board.buckets.some((b) => b.id === looksId), false);
eq(inboxCount(board) >= leftover, true, 'clips from a deleted bucket land in inbox');
eq(board.clips.every((c) => c.bucketId !== looksId), true);

const seeded = seedSuggestedBuckets(emptyBoard());
eq(seeded.buckets.length, SUGGESTED_BUCKETS.length);
const again = seedSuggestedBuckets(seeded);
eq(again.buckets.length, SUGGESTED_BUCKETS.length, 'seeding twice does not duplicate');

const deadClip = normalizeBoard({
  buckets: [{ id: 'b_keep', name: 'Keep' }],
  clips: [
    { id: 'c1', body: 'ok', bucketId: 'b_gone' },
    { id: 'c2', body: '', url: 'not a url' },
    { id: 'c3', body: '  ', url: '' },
  ],
});
eq(deadClip.clips.length, 1, 'empty / invalid clips drop');
eq(deadClip.clips[0].bucketId, null, 'unknown bucket becomes inbox');

console.log('wedding board tests passed');
