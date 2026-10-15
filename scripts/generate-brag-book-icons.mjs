#!/usr/bin/env node
/**
 * Render brag-book/icons/app-icon.svg to manifest PNG sizes.
 *   npm install --no-save sharp && node scripts/generate-brag-book-icons.mjs
 */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'brag-book/icons');
const svg = await readFile(join(dir, 'app-icon.svg'));

for (const size of [192, 512]) {
  await sharp(svg, { density: Math.ceil((size / 512) * 96) })
    .resize(size, size)
    .png()
    .toFile(join(dir, `icon-${size}.png`));
  console.log(`wrote icon-${size}.png`);
}

await sharp(svg, { density: 96 })
  .resize(512, 512)
  .png()
  .toFile(join(dir, 'icon-maskable-512.png'));
console.log('wrote icon-maskable-512.png');
