import assert from 'node:assert/strict';
import { normalizeTheme } from '../amc-a-lister/engine/theme.js';

assert.equal(normalizeTheme('dark'), 'dark');
assert.equal(normalizeTheme('light'), 'light');
assert.equal(normalizeTheme(null), 'light');
assert.equal(normalizeTheme(''), 'light');

console.log('4 passed, 0 failed');
