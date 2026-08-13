#!/usr/bin/env node
/**
 * One More Column unit tests (pure functions, no secrets).
 * Spawns the same node --test glob the standalone OMC repo uses.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.execPath,
  [
    '--test',
    'one-more-column/engines/*.test.js',
    'one-more-column/engine/*.test.js',
    'one-more-column/lib/*.test.js',
  ],
  { cwd: ROOT, stdio: 'inherit' },
);

process.exit(result.status ?? 1);
