#!/usr/bin/env node
/**
 * Opt the three founding members back into the public leaderboard.
 *
 * The privacy work defaults public_profile to false, so everyone drops off the
 * leaderboard until they choose a handle. These three accounts were already
 * fully public before that change, so this restores the previous state — but on
 * the new terms: a username instead of a real name, and no seat, auditorium or
 * at-home watches in the public payload.
 *
 * Idempotent. Skips any account that has already set its own username, so
 * re-running can't clobber a member's later choice.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/alist-seed-usernames.js --dry-run
 *   DATABASE_URL=... node scripts/alist-seed-usernames.js
 */
import { neon } from '@neondatabase/serverless';
import { normalizeUsername } from '../lib/a-list-identity.js';

const dryRun = process.argv.includes('--dry-run');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required. Try: vercel env pull');
  process.exit(1);
}

// Matched on the name already stored for the account, since user ids differ
// between environments.
const MEMBERS = [
  { match: 'inaayat', username: 'inaayat' },
  { match: 'karan', username: 'karan' },
  { match: 'aditi', username: 'aditi' },
];

const sql = neon(process.env.DATABASE_URL);

for (const member of MEMBERS) {
  const check = normalizeUsername(member.username);
  if (check.error) {
    console.error(`✗ ${member.username}: ${check.error}`);
    process.exitCode = 1;
    continue;
  }
  const username = check.username;

  const rows = await sql`
    SELECT u.id, u.name, u.email, m.username, m.public_profile
    FROM users u
    LEFT JOIN alist_membership m ON m.user_id = u.id
    WHERE lower(u.name) LIKE ${`%${member.match}%`}
       OR lower(u.email) LIKE ${`%${member.match}%`}
  `;

  if (!rows.length) {
    console.warn(`? ${member.match}: no account found — skipped`);
    continue;
  }
  if (rows.length > 1) {
    console.warn(`? ${member.match}: matched ${rows.length} accounts — skipped, resolve by hand`);
    continue;
  }

  const user = rows[0];
  if (user.username && user.username !== username) {
    console.log(`= ${member.match}: already has username "${user.username}" — left alone`);
    continue;
  }

  const taken = await sql`
    SELECT user_id FROM alist_membership
    WHERE lower(username) = ${username} AND user_id <> ${user.id}
  `;
  if (taken.length) {
    console.error(`✗ ${member.match}: username "${username}" is taken by another account`);
    process.exitCode = 1;
    continue;
  }

  if (dryRun) {
    console.log(`~ ${member.match}: would set username="${username}", public_profile=true`);
    continue;
  }

  await sql`
    INSERT INTO alist_membership (user_id, username, public_profile)
    VALUES (${user.id}, ${username}, true)
    ON CONFLICT (user_id) DO UPDATE SET
      username = ${username},
      public_profile = true,
      updated_at = now()
  `;
  console.log(`✓ ${member.match}: username="${username}", public_profile=true`);
}

const live = await sql`
  SELECT username FROM alist_membership
  WHERE public_profile = true AND username IS NOT NULL
  ORDER BY username
`;
console.log(`\nOn the leaderboard now: ${live.map((r) => r.username).join(', ') || '(nobody)'}`);
