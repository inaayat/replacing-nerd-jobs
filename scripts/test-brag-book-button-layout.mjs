/** Static checks for Brag Book action-row / toolbar button alignment. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');

assert.match(css, /\.bb-action-row/);
assert.match(css, /\.bb-exp-tools\.bb-action-row/);
assert.match(css, /\.bb-exp-panel-head-actions/);
assert.match(app, /bb-exp-tools bb-action-row/);
assert.match(app, /bb-exp-actions bb-action-row/);
assert.match(app, /Experience:/);
assert.match(app, /catalogBulkSelectMode/);

console.log('test-brag-book-button-layout.mjs: ok');
