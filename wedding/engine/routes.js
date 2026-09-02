/**
 * Hash routes and view metadata for the Wedding board UI.
 * Dependency-free ESM — safe in the browser and in tests.
 */

export const CLIP_STATUSES = ['saved', 'shortlist', 'chosen', 'archived'];

/** @typedef {{ kind: 'home' }} HomeView */
/** @typedef {{ kind: 'inbox' | 'all' | 'favorites' | 'shortlist' | 'chosen' | 'archived' }} CollectionView */
/** @typedef {{ kind: 'tag', id: string }} TagView */
/** @typedef {HomeView | CollectionView | TagView} View */

export function defaultView() {
  return { kind: 'home' };
}

export function viewHash(view) {
  if (!view || view.kind === 'home') return '#home';
  if (view.kind === 'tag') return `#tag/${encodeURIComponent(view.id)}`;
  return `#${view.kind}`;
}

export function parseViewHash(raw, { tagIds = [] } = {}) {
  const hash = String(raw || '#home').replace(/^#/, '').trim();
  if (!hash || hash === 'home') return defaultView();
  if (hash === 'inbox') return { kind: 'inbox' };
  if (hash === 'all') return { kind: 'all' };
  if (hash === 'favorites') return { kind: 'favorites' };
  if (hash === 'shortlist') return { kind: 'shortlist' };
  if (hash === 'chosen') return { kind: 'chosen' };
  if (hash === 'archived') return { kind: 'archived' };
  if (hash.startsWith('plan/')) return defaultView();
  if (hash.startsWith('tag/')) {
    const id = decodeURIComponent(hash.slice(4));
    if (tagIds.includes(id)) return { kind: 'tag', id };
  }
  if (hash.startsWith('b/')) {
    const id = decodeURIComponent(hash.slice(2));
    if (tagIds.includes(id)) return { kind: 'tag', id };
  }
  return defaultView();
}

export function viewTitle(view, board, { query = '' } = {}) {
  if (query.trim()) return 'Search';
  if (view.kind === 'home') return 'Home';
  if (view.kind === 'tag') {
    const tag = (board?.buckets || []).find((b) => b.id === view.id);
    return tag?.name || 'Tag';
  }
  return ({
    inbox: 'Inbox',
    all: 'Everything',
    favorites: 'Favorites',
    shortlist: 'Shortlist',
    chosen: 'Chosen',
    archived: 'Archived',
  })[view.kind] || 'Wedding';
}

export function viewCopy(view, { query = '' } = {}) {
  if (query.trim()) return `Notes and links that match “${query.trim()}”.`;
  if (view.kind === 'home') return 'Recent saves and a quick read on what is waiting to be tagged.';
  if (view.kind === 'inbox') return 'Drop a thought or a link. Tag it when a theme is actually a theme.';
  if (view.kind === 'all') return 'Every picture, pin, and clip in one collage. Notes without a picture sit underneath.';
  if (view.kind === 'favorites') return 'Hearted clips — the ones you keep coming back to.';
  if (view.kind === 'shortlist') return 'Strong contenders you are narrowing down.';
  if (view.kind === 'chosen') return 'Locked-in picks you have decided on.';
  if (view.kind === 'archived') return 'Out of the way, but not deleted.';
  if (view.kind === 'tag') return 'Everything tagged here. Tap another tag to switch, or Home to zoom out.';
  return '';
}

export function usesCollage(view, { query = '' } = {}) {
  if (query.trim()) return true;
  if (view.kind === 'home') return false;
  return view.kind === 'all' || view.kind === 'tag' || view.kind === 'favorites'
    || view.kind === 'shortlist' || view.kind === 'chosen';
}
