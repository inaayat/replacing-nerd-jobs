/**
 * Hash routes for Brag Book. Browser-safe ESM.
 */

export function defaultView() {
  return { kind: 'home' };
}

export function viewHash(view) {
  if (!view || view.kind === 'home') return '#home';
  if (view.kind === 'log') {
    if (view.id === 'new') return '#experiences/new';
    if (view.id) return `#experiences/${encodeURIComponent(view.id)}`;
    return '#experiences';
  }
  if (view.kind === 'kb') {
    if (view.id === 'new') return '#kb/new';
    if (view.id) return `#kb/${encodeURIComponent(view.id)}`;
    return '#kb';
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

export function parseViewHash(raw, { entryIds = [], postingIds = [], knowledgeIds = [] } = {}) {
  const hash = String(raw || '').replace(/^#/, '').trim();
  if (!hash || hash === 'home' || hash === 'start' || hash === 'pick') return { kind: 'home' };
  if (hash === 'profile' || hash === 'resume-basics') return { kind: 'profile' };
  if (hash === 'log' || hash === 'brag' || hash === 'bullets' || hash === 'experiences') return { kind: 'log' };
  if (hash === 'log/new' || hash === 'experiences/new') return { kind: 'log', id: 'new' };
  if (hash.startsWith('log/') || hash.startsWith('experiences/')) {
    const id = decodeURIComponent(hash.slice(hash.indexOf('/') + 1));
    if (id === 'new' || entryIds.includes(id)) return { kind: 'log', id };
    return { kind: 'log' };
  }
  if (hash === 'kb' || hash === 'knowledge') return { kind: 'kb' };
  if (hash === 'kb/new') return { kind: 'kb', id: 'new' };
  if (hash.startsWith('kb/')) {
    const id = decodeURIComponent(hash.slice(3));
    if (id === 'new' || knowledgeIds.includes(id)) return { kind: 'kb', id };
    return { kind: 'kb' };
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
  if (view.kind === 'log' && view.id === 'new') return 'Add a resume line';
  if (view.kind === 'log' && view.id) {
    const entry = (store?.entries || []).find((item) => item.id === view.id);
    return entry?.title || 'Resume line';
  }
  if (view.kind === 'log') return 'Experiences';
  if (view.kind === 'kb' && view.id === 'new') return 'Add a note';
  if (view.kind === 'kb' && view.id) {
    const note = (store?.knowledge || []).find((item) => item.id === view.id);
    return note?.title || 'Note';
  }
  if (view.kind === 'kb') return 'Experiences';
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
  if (!view || (view.kind !== 'log' && view.kind !== 'kb')) return 'none';
  if (view.id === 'new') return 'catalog-add';
  if (view.id) return 'detail';
  return 'catalog';
}

export function hideBookRail(view, store) {
  if (!view) return true;
  if (view.kind === 'jobs') return Boolean(view.id) || !(store?.postings || []).length;
  if (view.kind === 'log' || view.kind === 'kb') return false;
  return true;
}
