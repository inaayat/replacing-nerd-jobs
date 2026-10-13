/**
 * Rank / Stats / watch-log pages on a public member profile.
 * Browser-safe ESM — no node: imports.
 *
 * Display order is Rank → Stats → Log. Default URLs stay on the log so
 * existing `member.html?user=` links keep working.
 */

export const MEMBER_PAGES = ['rank', 'stats', 'log'];

export function normalizeMemberPage(page) {
  if (page === 'rank' || page === 'stats' || page === 'log') return page;
  return 'log';
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
  const normalized = normalizeMemberPage(page);
  if (normalized !== 'log') params.set('page', normalized);
  return `/amc-a-lister/member.html?${params}`;
}

export function flipMemberPage(page, direction) {
  const current = normalizeMemberPage(page);
  const index = MEMBER_PAGES.indexOf(current);
  const delta = direction === 'prev' ? -1 : 1;
  const next = (index + delta + MEMBER_PAGES.length) % MEMBER_PAGES.length;
  return MEMBER_PAGES[next];
}

export function memberPageIndex(page) {
  return MEMBER_PAGES.indexOf(normalizeMemberPage(page)) + 1;
}

export function memberPageLabel(page) {
  const labels = { rank: 'Rank', stats: 'Stats', log: 'Log' };
  return labels[normalizeMemberPage(page)];
}
