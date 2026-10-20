/** Experiences UI must not use window prompt/alert/confirm. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bragBook = join(root, 'brag-book');

const nativeDialog = /\b(window\.)?(prompt|confirm|alert)\s*\(/;

const experienceModules = readdirSync(bragBook)
  .filter((name) => /^experience(s)?(-|$)/.test(name) && name.endsWith('.js'));

for (const file of experienceModules) {
  const text = readFileSync(join(bragBook, file), 'utf8');
  assert.doesNotMatch(
    text,
    nativeDialog,
    `${file} must not call prompt/alert/confirm`,
  );
}

const appPath = join(bragBook, 'app.js');
const app = readFileSync(appPath, 'utf8');
const start = app.indexOf('function experienceCreateFormUi');
const end = app.indexOf('function bulkEntryForm');
assert.ok(start >= 0 && end > start, 'experience UI region in app.js');
const experienceRegion = app.slice(start, end);
assert.doesNotMatch(experienceRegion, nativeDialog, 'app.js experience catalog region');

const versionStart = app.indexOf('function resumeExperienceVersionMenu');
const versionEnd = app.indexOf('function resumeBulletEditor');
assert.ok(versionStart >= 0 && versionEnd > versionStart);
const versionRegion = app.slice(versionStart, versionEnd);
assert.doesNotMatch(versionRegion, nativeDialog, 'app.js version swap menu');

console.log('test-brag-book-experiences-no-native-dialogs.mjs: ok');
