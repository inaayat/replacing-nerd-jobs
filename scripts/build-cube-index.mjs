#!/usr/bin/env node
// Regenerates packing-cubes/cubes/index.json from individual cube files.
// Run by the build-cube-index GitHub Action on every push to main that
// touches a cube file, and safe to run by hand.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CUBE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'packing-cubes', 'cubes');
const INDEX_PATH = join(CUBE_DIR, 'index.json');

const files = readdirSync(CUBE_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
const entries = [];
for (const f of files) {
  let c;
  try {
    c = JSON.parse(readFileSync(join(CUBE_DIR, f), 'utf8'));
  } catch (e) {
    console.error(`Skipping ${f}: invalid JSON (${e.message})`);
    continue;
  }
  const id = f.replace(/\.json$/, '');
  if (!c.title) {
    console.error(`Skipping ${f}: missing "title"`);
    continue;
  }
  const entry = { id, title: c.title, blurb: c.blurb || '' };
  if (Array.isArray(c.tags) && c.tags.length) entry.tags = c.tags;
  if (c.submitted) entry.submitted = true;
  entries.push(entry);
}

entries.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.id.localeCompare(b.id));

writeFileSync(INDEX_PATH, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`Wrote ${entries.length} cubes to ${INDEX_PATH}`);
