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

function ruleBlock(selector) {
  return css.match(new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{[^}]+\\}`))?.[0] || '';
}

const mapBulletActions = ruleBlock('.bb-post-map-bullet-actions');
assert.ok(mapBulletActions, 'posting map bullet action row');
assert.match(mapBulletActions, /justify-content:\s*flex-start/);
assert.doesNotMatch(mapBulletActions, /flex:\s*1/);
assert.doesNotMatch(mapBulletActions, /width:\s*100%/);
assert.doesNotMatch(mapBulletActions, /grid-template-columns:\s*1fr/);

const mapActionButtons = css.match(
  /\.bb-post-map-bullet-actions \.row-text-action\s*\{[^}]+\}/,
)?.[0] || '';
assert.ok(mapActionButtons, 'map bullet text actions sized to content');
assert.match(mapActionButtons, /width:\s*auto/);
assert.doesNotMatch(mapActionButtons, /flex:\s*1/);

assert.match(
  css,
  /@media \(pointer: coarse\)[\s\S]*\.bb-post-map-bullet-actions \.row-text-action[\s\S]*min-height:\s*32px/,
);

assert.match(
  readFileSync(new URL('../brag-book/posting-requirement-mapping-ui.js', import.meta.url), 'utf8'),
  /bb-post-map-bullet-actions bb-action-row/,
);
assert.match(
  readFileSync(new URL('../brag-book/posting-requirement-mapping-ui.js', import.meta.url), 'utf8'),
  /Details ↓/,
);

console.log('test-brag-book-button-layout.mjs: ok');
