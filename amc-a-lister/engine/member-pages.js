/**
 * Rank / watch-log pages on a public member profile.
 * Browser-safe ESM — no node: imports.
 */

export const MEMBER_PAGES = ['rank', 'log'];

export function normalizeMemberPage(page) {
  return page === 'rank' ? 'rank' : 'log';
}

export function memberProfilePage(search) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return normalizeMemberPage(params.get('page'));
}

/** Omit `page=log` so existing profile links stay the watch log. */
export function memberProfileUrl(userId, page) {
  const params = new URLSearchParams();
  params.set('user', String(userId || ''));
  if (normalizeMemberPage(page) === 'rank') params.set('page', 'rank');
  return `/amc-a-lister/member.html?${params}`;
}

export function flipMemberPage(page, direction) {
  const current = normalizeMemberPage(page);
  if (direction === 'prev') return current === 'log' ? 'rank' : 'log';
  return current === 'rank' ? 'log' : 'rank';
}

export function memberPageIndex(page) {
  return normalizeMemberPage(page) === 'rank' ? 1 : 2;
}

export function memberPageLabel(page) {
  return normalizeMemberPage(page) === 'rank' ? 'Rank' : 'Log';
}
