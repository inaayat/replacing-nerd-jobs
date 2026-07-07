#!/usr/bin/env node
// Regenerates sporcle-spinoff/quizzes/index.json from the individual quiz
// files. Because the catalog manifest is derived — never hand-edited in a
// PR — two submissions can never collide on it: each submission only adds
// its own uniquely-named quiz file. Run by the build-quiz-index GitHub
// Action on every push to main that touches a quiz, and safe to run by hand.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUIZ_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'sporcle-spinoff', 'quizzes');
const INDEX_PATH = join(QUIZ_DIR, 'index.json');

const files = readdirSync(QUIZ_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
const entries = [];
for (const f of files) {
  let q;
  try {
    q = JSON.parse(readFileSync(join(QUIZ_DIR, f), 'utf8'));
  } catch (e) {
    console.error(`Skipping ${f}: invalid JSON (${e.message})`);
    continue;
  }
  // The filename is authoritative: the player fetches quizzes/<id>.json using
  // the id from this manifest, so it must equal the filename (an internal
  // "id" field in the file can be stale and is ignored here).
  const id = f.replace(/\.json$/, '');
  if (!q.title || !q.type) {
    console.error(`Skipping ${f}: missing "title" or "type"`);
    continue;
  }
  const entry = { id, title: q.title, type: q.type, blurb: q.blurb || '' };
  if (Array.isArray(q.tags) && q.tags.length) entry.tags = q.tags;
  if (q.submitted) entry.submitted = true;
  entries.push(entry);
}

// Deterministic from the files alone (no dependence on the previous index):
// alphabetical by title, tie-broken by id. The catalog groups by type, so
// this just sets a stable within-type order.
entries.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.id.localeCompare(b.id));

writeFileSync(INDEX_PATH, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`Wrote ${entries.length} quizzes to ${INDEX_PATH}`);
