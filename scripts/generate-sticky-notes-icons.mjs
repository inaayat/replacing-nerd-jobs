#!/usr/bin/env node
/**
 * One-off: render sticky-notes/icons/app-icon.svg to the PNG sizes the web app
 * manifest needs. The PNGs are committed, so this only runs when the art
 * changes. Same shape as scripts/generate-alist-icons.mjs.
 *
 *   npm install --no-save sharp && node scripts/generate-sticky-notes-icons.mjs
 */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'sticky-notes/icons');
const svg = await readFile(join(dir, 'app-icon.svg'));

for (const size of [192, 512]) {
  await sharp(svg, { density: Math.ceil((size / 64) * 96) })
    .resize(size, size)
    .png()
    .toFile(join(dir, `icon-${size}.png`));
  console.log(`wrote icon-${size}.png`);
}
