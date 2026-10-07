/**
 * One-page fit for the classic-serif resume. Browser-safe ESM.
 *
 * Tighten spacing and body font first (floor 9.5pt), then hide included
 * bullets that are not pinned. A pinned bullet stays on the page. A role
 * keeps its last bullet so the job line does not vanish.
 */

export const PAGE_HEIGHT_IN = 10;
export const PAGE_HEIGHT_PX = PAGE_HEIGHT_IN * 96;
export const FONT_FLOOR_PT = 9.5;

export const FIT_STEPS = [
  { '--lh-bullet': '1.32' },
  { '--lh-bullet': '1.22' },
  { '--group-gap': '5pt', '--sec-gap': '6pt' },
  { '--lh-bullet': '1.17' },
  { '--fs': '9.75pt' },
  { '--fs': '9.5pt' },
];

export function fontPtFromVars(vars) {
  const raw = String(vars?.['--fs'] || '10pt').replace(/pt$/i, '');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 10;
}

export function bulletLineHeightFromVars(vars) {
  const n = Number(vars?.['--lh-bullet'] || 1.32);
  return Number.isFinite(n) ? n : 1.32;
}

function includedBullets(job) {
  return (job?.groups || []).flatMap((group) =>
    (group.bullets || []).filter((b) => b && b.included !== false && !b.hidden)
  );
}

function bulletIsPinned(bullet) {
  return Boolean(bullet?.pinned);
}

/**
 * Hide order: priority 3, then 2, then 1; oldest job first.
 * Never a pinned bullet, an excluded bullet, or a job's last remaining bullet.
 */
export function dropOrderFromDoc(doc) {
  const jobs = [...(doc?.sections?.experience?.jobs || [])].filter((job) => job.included !== false);
  const oldestFirst = jobs.slice().reverse();
  const ids = [];
  const dropped = new Set();

  const remaining = (job) => includedBullets(job).filter((b) => !dropped.has(b.id));

  for (const priority of [3, 2, 1]) {
    for (const job of oldestFirst) {
      for (const bullet of includedBullets(job)) {
        if (dropped.has(bullet.id)) continue;
        if (bulletIsPinned(bullet)) continue;
        if ((bullet.priority ?? 1) !== priority) continue;
        if (remaining(job).length <= 1) continue;
        dropped.add(bullet.id);
        ids.push(bullet.id);
      }
    }
  }
  return ids;
}

export function droppedBulletLabels(doc, ids) {
  const byId = new Map();
  for (const job of doc?.sections?.experience?.jobs || []) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        if (bullet?.id) byId.set(bullet.id, bullet);
      }
    }
  }
  return (ids || []).map((id) => {
    const bullet = byId.get(id);
    const lead = String(bullet?.lead || '').replace(/\*\*/g, '').trim();
    if (lead) return lead;
    const body = String(bullet?.body || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    if (!body) return 'Untitled bullet';
    return body.length > 80 ? `${body.slice(0, 77)}…` : body;
  });
}

export function fitStatusLine({
  fits = true,
  fontPt = 10,
  overflowPx = 0,
  droppedLabels = [],
  pinnedBlocked = false,
} = {}) {
  const names = (droppedLabels || []).map((label) => String(label || '').trim()).filter(Boolean);
  const hid = names.length ? ` Hid ${names.join('; ')}.` : '';
  if (!fits && pinnedBlocked) {
    return `Over one page: pinned bullets don't fit. Unpin or shorten a bullet.${hid}`;
  }
  if (!fits) {
    const lines = Math.max(1, Math.ceil((overflowPx || 0) / 16));
    const base = `Over by ${lines} line${lines === 1 ? '' : 's'} — hide or shorten bullets`;
    return names.length ? `${base}.${hid}` : base;
  }
  if (names.length) return `Fits on one page · ${fontPt}pt · hid ${names.join('; ')}`;
  return `Fits on one page · ${fontPt}pt`;
}

export function applyDroppedIds(doc, droppedBulletIds) {
  const dropped = new Set(droppedBulletIds || []);
  const jobs = (doc?.sections?.experience?.jobs || []).map((job) => ({
    ...job,
    groups: (job.groups || []).map((group) => ({
      ...group,
      bullets: (group.bullets || []).map((b) => (
        dropped.has(b.id) ? { ...b, fitDropped: true } : { ...b, fitDropped: false }
      )),
    })),
  }));
  return {
    ...doc,
    sections: {
      ...doc.sections,
      experience: { ...(doc.sections?.experience || {}), jobs },
    },
    fit: {
      ...(doc.fit || {}),
      droppedBulletIds: [...dropped],
    },
  };
}

function overflowPx(root, pageHeightPx) {
  return root.scrollHeight - pageHeightPx;
}

export function applyFitVars(root, vars) {
  for (const [key, value] of Object.entries(vars || {})) {
    root.style.setProperty(key, value);
  }
}

export function fitOnePage(root, { pageHeightPx = PAGE_HEIGHT_PX, dropOrder = [] } = {}) {
  const log = [];
  const vars = { '--lh-bullet': '1.32', '--fs': '10pt', '--group-gap': '9pt', '--sec-gap': '8pt' };
  applyFitVars(root, vars);
  const over = () => overflowPx(root, pageHeightPx);

  if (over() < 0 && root.scrollHeight < pageHeightPx * 0.88) {
    log.push({ loosened: true, over: over() });
  }

  for (const step of FIT_STEPS) {
    if (over() <= 0) break;
    Object.assign(vars, step);
    applyFitVars(root, step);
    log.push({ step, over: over() });
  }

  const droppedBulletIds = [];
  for (const item of dropOrder) {
    if (over() <= 0) break;
    const li = typeof item === 'string' ? root.querySelector(`li[data-bullet-id="${item}"]`) : item;
    if (!li || !li.parentNode) continue;
    if (li.getAttribute('data-pinned') === '1') continue;
    const job = li.closest('.job');
    const remaining = job ? job.querySelectorAll('li') : [];
    if (remaining.length <= 1) continue;
    const id = li.getAttribute('data-bullet-id') || '';
    const group = li.parentNode;
    li.remove();
    if (group && group.tagName === 'UL' && !group.querySelector('li')) {
      const subhead = group.previousElementSibling;
      if (subhead && subhead.classList.contains('subhead')) subhead.remove();
      group.remove();
    }
    droppedBulletIds.push(id);
    log.push({ dropped: id || (li.textContent || '').slice(0, 50), over: over() });
  }

  const stillOver = over() > 0;
  const pinnedBlocked = stillOver && Boolean(root.querySelector('li[data-pinned="1"]'));

  return {
    fits: !stillOver,
    overflowPx: Math.max(0, over()),
    fontPt: fontPtFromVars(vars),
    bulletLineHeight: bulletLineHeightFromVars(vars),
    vars: { ...vars },
    droppedBulletIds,
    pinnedBlocked,
    log,
  };
}

export function dropOrderNodes(root, doc) {
  const ids = dropOrderFromDoc(doc);
  return ids
    .map((id) => root.querySelector(`li[data-bullet-id="${CSS.escape ? CSS.escape(id) : id}"]`))
    .filter(Boolean);
}
