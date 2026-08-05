import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const TV_MARKERS = [
  'listTvWatches',
  'listTvWatchlist',
  'alist_tv_watches',
  'alist_tv_watchlist',
  'alist_tv_cache',
  'tvWatchFromRow',
];

function extractFunctionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing ${signature}`);
  const braceStart = source.indexOf('{', start);
  assert.ok(braceStart >= 0, `missing body for ${signature}`);

  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  throw new Error(`unclosed body for ${signature}`);
}

function assertNoTvInStatHandlers(file, signatures) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  for (const signature of signatures) {
    const body = extractFunctionBody(source, signature);
    for (const marker of TV_MARKERS) {
      assert.equal(
        body.includes(marker),
        false,
        `${file} ${signature} must not reference ${marker}`,
      );
    }
  }
}

assertNoTvInStatHandlers('../api/alist.js', [
  'async function handleSummary(',
  'async function handleLeaderboard(',
  'async function handleLeaderboardCompare(',
  'async function handleUserProfile(',
]);

assertNoTvInStatHandlers('../lib/a-list.js', [
  'export async function getLeaderboard(',
  'export async function compareUsers(',
  'export async function getUserPublicProfile(',
]);

console.log('tv stats isolation tests passed');
