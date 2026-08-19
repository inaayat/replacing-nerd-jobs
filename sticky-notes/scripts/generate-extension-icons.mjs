#!/usr/bin/env node
/**
 * One-off: render sticky-notes/icon.svg to PNG sizes for the Chrome extension.
 * Uses `magick` (ImageMagick) or macOS `sips`.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = join(root, 'icon.svg');
const outDir = join(root, 'extension', 'icons');

const sizes = [16, 48, 128];

function has(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(svg)) {
  console.error('Missing', svg);
  process.exit(1);
}

for (const size of sizes) {
  const out = join(outDir, `icon-${size}.png`);
  if (has('magick')) {
    execSync(`magick -background none "${svg}" -resize ${size}x${size} "${out}"`);
  } else if (has('convert')) {
    execSync(`convert -background none "${svg}" -resize ${size}x${size} "${out}"`);
  } else if (has('sips')) {
  execSync(`sips -z ${size} ${size} "${svg}" --out "${out}"`);
  } else {
    console.error('Need ImageMagick (magick/convert) or macOS sips to generate icons.');
    process.exit(1);
  }
  console.log('Wrote', out);
}
