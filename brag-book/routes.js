/**
 * Hash routes for Brag Book. Browser-safe ESM.
 */

export function defaultView() {
  return { kind: 'log' };
}

export function viewHash(view) {
  if (!view || view.kind === 'log') {
    if (view?.id === 'new') return '#log/new';
    if (view?.id) return `#log/${encodeURIComponent(view.id)}`;
    return '#log';
  }
  if (view.kind === 'jobs') {
    if (view.id === 'new') return '#jobs/new';
    if (view.id && view.mode === 'prep') return `#jobs/${encodeURIComponent(view.id)}/prep`;
    if (view.id && view.mode === 'resume') return `#jobs/${encodeURIComponent(view.id)}/resume`;
    if (view.id) return `#jobs/${encodeURIComponent(view.id)}`;
    return '#jobs';
  }
  return '#log';
}

export function parseViewHash(raw, { entryIds = [], postingIds = [] } = {}) {
  const hash = String(raw || '#log').replace(/^#/, '').trim();
  if (!hash || hash === 'log' || hash === 'home' || hash === 'brag') return { kind: 'log' };
  if (hash === 'log/new') return { kind: 'log', id: 'new' };
  if (hash.startsWith('log/')) {
    const id = decodeURIComponent(hash.slice(4));
    if (id === 'new' || entryIds.includes(id)) return { kind: 'log', id };
    return { kind: 'log' };
  }
  if (hash === 'jobs' || hash === 'jobs/' || hash === 'postings') return { kind: 'jobs' };
  if (hash === 'jobs/new') return { kind: 'jobs', id: 'new' };
  if (hash.startsWith('jobs/')) {
    const rest = hash.slice(5);
    const [rawId, mode] = rest.split('/');
    const id = decodeURIComponent(rawId || '');
    if (id === 'new') return { kind: 'jobs', id: 'new' };
    if (!postingIds.includes(id)) return { kind: 'jobs' };
    if (mode === 'prep' || mode === 'resume') return { kind: 'jobs', id, mode };
    return { kind: 'jobs', id };
  }
  return { kind: 'log' };
}

export function viewTitle(view, store) {
  if (view.kind === 'log' && view.id === 'new') return 'New win';
  if (view.kind === 'log' && view.id) {
    const entry = (store?.entries || []).find((item) => item.id === view.id);
    return entry?.title || 'Win';
  }
  if (view.kind === 'log') return 'Brag sheet';
  if (view.kind === 'jobs' && view.id === 'new') return 'New posting';
  if (view.kind === 'jobs' && view.id) {
    const job = (store?.postings || []).find((item) => item.id === view.id);
    const name = job?.title || 'Posting';
    if (view.mode === 'prep') return `Prep · ${name}`;
    if (view.mode === 'resume') return `Resume · ${name}`;
    return name;
  }
  return 'Jobs';
}
