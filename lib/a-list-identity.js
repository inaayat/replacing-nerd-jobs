/**
 * Public-identity rules for A-Lister.
 *
 * Deliberately free of database imports so the rules that decide what leaves
 * the server can be unit-tested on their own.
 */

/**
 * The only name ever shown to other people. No fallback chain on purpose:
 * users.name and display_name are private, and email must never surface.
 * A user with no username cannot be public, so there is nothing to fall back to.
 */
export function publicDisplayName(membership) {
  const username = membership?.username?.trim();
  return username || null;
}

export function isPublicProfile(membership) {
  return membership?.public_profile === true && !!publicDisplayName(membership);
}

/**
 * Normalize and validate a public handle.
 * @returns {{ username: string | null } | { error: string }}
 */
export function normalizeUsername(raw) {
  const username = String(raw ?? '').trim().toLowerCase();
  if (!username) return { username: null };
  if (username.length < 3 || username.length > 24) {
    return { error: 'Username must be 3–24 characters.' };
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    return { error: 'Username can only use letters, numbers and underscores.' };
  }
  return { username };
}
