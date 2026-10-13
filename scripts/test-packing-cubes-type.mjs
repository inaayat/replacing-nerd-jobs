import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cube = readFileSync(new URL('../packing-cubes/engine/cube.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../packing-cubes/index.html', import.meta.url), 'utf8');
const builder = readFileSync(new URL('../packing-cubes/builder.html', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../packing-cubes/cube.html', import.meta.url), 'utf8');

assert.match(cube, /--pc-display: "Fraunces"/, 'display face is Fraunces');
assert.match(cube, /--pc-mono: "IBM Plex Mono"/, 'UI face is IBM Plex Mono');
assert.match(cube, /--ink: #f4efe6/, 'warm cream ink');
assert.match(cube, /--bg: #0c0b09/, 'warm near-black ground');
assert.match(cube, /--accent: #e8c47a/, 'Plotmaniac gold');
assert.doesNotMatch(cube, /background-size:\s*72px 72px/, 'no Plotmaniac grid background');
assert.doesNotMatch(cube, /Atkinson Hyperlegible/, 'Atkinson is no longer the packing face');

for (const [name, html] of [['index', index], ['builder', builder], ['cube', detail]]) {
  assert.match(html, /family=Fraunces/, `${name} loads Fraunces`);
  assert.match(html, /family=IBM\+Plex\+Mono/, `${name} loads IBM Plex Mono`);
  assert.match(html, /content="#0c0b09"/, `${name} theme-color matches the ink ground`);
}

console.log('packing cubes type tests passed');
