/**
 * Hash routes for Brag Book. Browser-safe ESM.
 */

export function defaultView() {
  return { kind: 'home' };
}

export function viewHash(view) {
  if (!view || view.kind === 'home') return '#home';
  if (view.kind === 'log') {
    if (view.id === 'new') return '#log/new';
    if (view.id) return `#log/${encodeURIComponent(view.id)}`;
    return '#log';
  }
  if (view.kind === 'profile') return '#profile';
  if (view.kind === 'jobs') {
    if (view.id === 'new') return '#jobs/new';
    if (view.id && view.mode === 'prep') return `#jobs/${encodeURIComponent(view.id)}/prep`;
    if (view.id && view.mode === 'resume') return `#jobs/${encodeURIComponent(view.id)}/resume`;
    if (view.id && view.mode === 'bullet') {
      const base = `#jobs/${encodeURIComponent(view.id)}/bullet`;
      if (!view.reqId) return base;
      const req = `${base}/${encodeURIComponent(view.reqId)}`;
      return view.bulletId ? `${req}/${encodeURIComponent(view.bulletId)}` : req;
    }
    if (view.id && view.mode === 'fill') {
      const base = `#jobs/${encodeURIComponent(view.id)}/fill`;
      return view.reqId ? `${base}/${encodeURIComponent(view.reqId)}` : base;
    }
    if (view.id) return `#jobs/${encodeURIComponent(view.id)}`;
    return '#jobs';
  }
  return '#home';
}

export function parseViewHash(raw, { entryIds = [], postingIds = [] } = {}) {
  const hash = String(raw || '').replace(/^#/, '').trim();
  if (!hash || hash === 'home' || hash === 'start' || hash === 'pick') return { kind: 'home' };
  if (hash === 'profile' || hash === 'resume-basics') return { kind: 'profile' };
  if (hash === 'log' || hash === 'brag') return { kind: 'log' };
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
    const [rawId, mode, rawReq, rawBullet] = rest.split('/');
    const id = decodeURIComponent(rawId || '');
    if (id === 'new') return { kind: 'jobs', id: 'new' };
    if (!postingIds.includes(id)) return { kind: 'jobs' };
    if (mode === 'prep' || mode === 'resume') return { kind: 'jobs', id, mode };
    if (mode === 'bullet') {
      const reqId = rawReq ? decodeURIComponent(rawReq) : '';
      const bulletId = rawBullet ? decodeURIComponent(rawBullet) : '';
      if (reqId && bulletId) return { kind: 'jobs', id, mode: 'bullet', reqId, bulletId };
      if (reqId) return { kind: 'jobs', id, mode: 'bullet', reqId };
      return { kind: 'jobs', id };
    }
    if (mode === 'fill') {
      const reqId = rawReq ? decodeURIComponent(rawReq) : '';
      return reqId ? { kind: 'jobs', id, mode: 'fill', reqId } : { kind: 'jobs', id, mode: 'fill' };
    }
    return { kind: 'jobs', id };
  }
  return { kind: 'home' };
}

export function viewTitle(view, store) {
  if (!view || view.kind === 'home') return 'Brag Book';
  if (view.kind === 'profile') return 'Resume basics';
  if (view.kind === 'log' && view.id === 'new') return 'Add experiences';
  if (view.kind === 'log' && view.id) {
    const entry = (store?.entries || []).find((item) => item.id === view.id);
    return entry?.title || 'Win';
  }
  if (view.kind === 'log') return 'The book';
  if (view.kind === 'jobs' && view.id === 'new') return 'New job posting';
  if (view.kind === 'jobs' && view.id) {
    const job = (store?.postings || []).find((item) => item.id === view.id);
    const name = job?.title || 'Posting';
    if (view.mode === 'prep') return `Prep · ${name}`;
    if (view.mode === 'resume') return `Resume · ${name}`;
    if (view.mode === 'bullet') return `Experience · ${name}`;
    if (view.mode === 'fill') return name;
    return name;
  }
  return 'Job postings';
}

export function logLayout(view) {
  if (!view || view.kind !== 'log') return 'none';
  if (view.id === 'new') return 'catalog-add';
  if (view.id) return 'detail';
  return 'catalog';
}

export function hideBookRail(view, store) {
  if (!view) return true;
  if (view.kind === 'jobs') return Boolean(view.id) || !(store?.postings || []).length;
  if (view.kind === 'log') return false;
  return true;
}
