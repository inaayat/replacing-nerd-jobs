/** Posting resume library bullet typeahead panel (opaque, fixed layer, keyboard). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');

const pickerSrc = appSource.slice(
  appSource.indexOf('function libraryBulletPicker'),
  appSource.indexOf('function addSubheadingButton'),
);

assert.match(pickerSrc, /libraryPickHighlightFragment/);
assert.match(pickerSrc, /position:\s*fixed|positionList/);
assert.match(pickerSrc, /LIB_PICK_MAX_HEIGHT_PX/);
assert.match(pickerSrc, /ArrowDown/);
assert.match(pickerSrc, /ArrowUp/);
assert.match(pickerSrc, /Escape/);
assert.match(pickerSrc, /pointerdown/);
assert.match(pickerSrc, /displayExperienceLine\(entry\.title\)/);
assert.doesNotMatch(pickerSrc, /addEventListener\('blur'/);

assert.match(css, /\.bb-lib-picks[\s\S]*background:\s*#fff/);
assert.match(css, /\.bb-lib-picks[\s\S]*box-shadow/);
assert.match(css, /\.bb-lib-picks[\s\S]*max-height:\s*320px/);
assert.match(css, /\.bb-lib-picks[\s\S]*overscroll-behavior:\s*contain/);
assert.match(css, /\.bb-lib-picks[\s\S]*z-index:\s*120/);
assert.match(css, /\.bb-lib-choice[\s\S]*-webkit-line-clamp:\s*3/);
assert.match(css, /\.bb-lib-mark/);

console.log('test-brag-book-lib-picker.mjs: ok');
