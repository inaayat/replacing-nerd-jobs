import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveTheme, themeColorFor, THEME_KEY } from '../packing-cubes/engine/theme.js';

const cube = readFileSync(new URL('../packing-cubes/engine/cube.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../packing-cubes/index.html', import.meta.url), 'utf8');
const builder = readFileSync(new URL('../packing-cubes/builder.html', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../packing-cubes/cube.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../packing-cubes/engine/app.js', import.meta.url), 'utf8');
const builderJs = readFileSync(new URL('../packing-cubes/engine/builder.js', import.meta.url), 'utf8');

assert.equal(resolveTheme(null, true), 'light');
assert.equal(resolveTheme(null, false), 'dark');
assert.equal(resolveTheme('dark', true), 'dark');
assert.equal(resolveTheme('light', false), 'light');
assert.equal(resolveTheme('nope', true), 'light');
assert.equal(themeColorFor('light'), '#f3f4f6');
assert.equal(themeColorFor('dark'), '#0c0b09');
assert.equal(THEME_KEY, 'packing-cubes-theme');

assert.match(cube, /--pc-display: "Fraunces"/, 'display face is Fraunces');
assert.match(cube, /--pc-mono: "IBM Plex Mono"/, 'UI face is IBM Plex Mono');
assert.match(cube, /--accent: #e8c47a/, 'dark mode keeps Plotmaniac gold');
assert.match(cube, /html\[data-theme="light"\][\s\S]*--accent: #2f6b4f/, 'light mode uses original packing green');
assert.match(cube, /html\[data-theme="light"\][\s\S]*--bg: #f3f4f6/, 'light mode uses the original pale ground');
assert.match(cube, /html\[data-theme="light"\][\s\S]*--ink: #23282d/, 'light mode ink is the original dark grey');
assert.match(cube, /#pc-theme-toggle/, 'theme toggle is styled');
assert.doesNotMatch(cube, /background-size:\s*72px 72px/, 'no Plotmaniac grid background');
assert.doesNotMatch(cube, /Atkinson Hyperlegible/, 'Atkinson is no longer the packing face');

assert.match(app, /initThemeToggle/, 'app wires the header toggle');
assert.match(builderJs, /initThemeToggle/, 'builder page wires the header toggle');

for (const [name, html] of [['index', index], ['builder', builder], ['cube', detail]]) {
  assert.match(html, /family=Fraunces/, `${name} loads Fraunces`);
  assert.match(html, /family=IBM\+Plex\+Mono/, `${name} loads IBM Plex Mono`);
  assert.match(html, /packing-cubes-theme/, `${name} boots theme from localStorage`);
  assert.match(html, /prefers-color-scheme: light/, `${name} falls back to the system scheme`);
  assert.match(html, /id="pc-theme-toggle"/, `${name} has the header toggle`);
}

console.log('packing cubes type tests passed');
