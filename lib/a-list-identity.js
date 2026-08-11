/**
 * Public-identity rules for A-Lister.
 *
 * Deliberately free of database imports so the rules that decide what leaves
 * the server can be unit-tested on their own.
 */

/** "Inaayat Gill" -> "Inaayat". Never a surname, never an email. */
export function firstNameOf(name) {
  const first = String(name ?? '').trim().split(/\s+/)[0];
  // An email in the name field would leak an address through the back door.
  if (!first || first.includes('@')) return null;
  return first;
}

/**
 * The name other people see. Username first; failing that the member's first
 * name; failing that a neutral placeholder.
 *
 * This only ever applies to members who have opted in — the opt-in is what
 * protects people, not the handle. Email is never part of the chain, and the
 * surname is never included, so the most an opted-in member can expose by
 * leaving the field blank is a first name.
 */
export function publicDisplayName(membership, user = null) {
  const username = membership?.username?.trim();
  if (username) return username;
  return firstNameOf(user?.name ?? membership?.name) || 'Member';
}

/** Opting in is the gate. A username is optional. */
export function isPublicProfile(membership) {
  return membership?.public_profile === true;
}

/**
 * Normalize and validate a public handle. An empty value is valid and clears
 * the handle, falling the member back to their first name.
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
