#!/usr/bin/env node
/**
 * Remove bundled movies-bill.json screenings from every account except the owner.
 *
 * Usage:
 *   ALIST_OWNER_EMAIL=you@example.com DATABASE_URL=... node scripts/cleanup-amc-seed.js
 *   node scripts/cleanup-amc-seed.js --dry-run
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes('--dry-run');
const ownerEmail = (process.env.ALIST_OWNER_EMAIL || 'inaayat@gmail.com').toLowerCase();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const seed = JSON.parse(readFileSync(join(__dirname, 'data/movies-bill.json'), 'utf8'));
const seedKeys = new Set(
  seed.map((w) => `${w.watched_on}|${(w.title || '').toLowerCase()}|${(w.location || '').toLowerCase()}`),
);

function watchKey(w) {
  const date = String(w.watched_on).slice(0, 10);
  return `${date}|${(w.title || '').toLowerCase()}|${(w.location || '').toLowerCase()}`;
}

const sql = neon(process.env.DATABASE_URL);

const owners = await sql`
  SELECT id, email, name FROM users WHERE lower(email) = ${ownerEmail}
`;
if (!owners.length) {
  console.error(`No user found for ALIST_OWNER_EMAIL=${ownerEmail}`);
  process.exit(1);
}
const ownerId = owners[0].id;

const users = await sql`
  SELECT u.id, u.email, u.name, COUNT(w.id)::int AS watch_count
  FROM users u
  LEFT JOIN alist_watches w ON w.user_id = u.id
  GROUP BY u.id, u.email, u.name
  ORDER BY watch_count DESC
`;

let totalDeleted = 0;

for (const user of users) {
  if (user.id === ownerId) {
    console.log(`keep owner ${user.email} (${user.watch_count} watches)`);
    continue;
  }

  const watches = await sql`
    SELECT id, watched_on::text AS watched_on, title, location
    FROM alist_watches
    WHERE user_id = ${user.id}
  `;

  const toDelete = watches.filter((w) => seedKeys.has(watchKey(w)));
  if (!toDelete.length) {
    console.log(`skip ${user.email || user.id} (0 seeded watches)`);
    continue;
  }

  console.log(`${dryRun ? 'would delete' : 'deleting'} ${toDelete.length} seeded watches from ${user.email || user.id}`);

  if (!dryRun) {
    for (const watch of toDelete) {
      await sql`DELETE FROM alist_watches WHERE id = ${watch.id}`;
    }
  }
  totalDeleted += toDelete.length;
}

console.log(`${dryRun ? 'would remove' : 'removed'} ${totalDeleted} seeded watches total`);
