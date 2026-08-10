import assert from 'node:assert/strict';
import { normalizeTitleKey } from '../lib/a-list.js';

assert.equal(normalizeTitleKey('  Dune  '), 'dune');
assert.equal(normalizeTitleKey(''), '');
assert.equal(normalizeTitleKey(null), '');

console.log('test-alist-watchlist.mjs: ok');
