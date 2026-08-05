#!/usr/bin/env node
/** One-off: render amc-a-lister/icon.svg to PNG sizes for the web app manifest. */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(join(root, 'amc-a-lister/icon.svg'));
const outDir = join(root, 'amc-a-lister/icons');

for (const size of [192, 512]) {
  await sharp(svg, { density: Math.ceil((size / 64) * 96) })
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon-${size}.png`));
  console.log(`wrote icon-${size}.png`);
}
