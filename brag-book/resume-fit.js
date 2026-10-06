/**
 * One-page fit for the classic-serif resume. Browser-safe ESM.
 *
 * Tighten spacing and body font first (floor 9.5pt), then drop lowest-priority
 * non-pinned bullets. Never drop a job's last remaining bullet.
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

/**
 * Drop order: priority 3, then 2; oldest job first; skip pinned and a job's last bullet.
 */
export function dropOrderFromDoc(doc) {
  const jobs = [...(doc?.sections?.experience?.jobs || [])].filter((job) => job.included !== false);
  const oldestFirst = jobs.slice().reverse();
  const ids = [];
  const dropped = new Set();

  const remaining = (job) => includedBullets(job).filter((b) => !dropped.has(b.id));

  for (const priority of [3, 2]) {
    for (const job of oldestFirst) {
      for (const bullet of includedBullets(job)) {
        if (dropped.has(bullet.id)) continue;
        if (bullet.pinned) continue;
        if ((bullet.priority ?? 1) !== priority) continue;
        if (remaining(job).length <= 1) continue;
        dropped.add(bullet.id);
        ids.push(bullet.id);
      }
    }
  }
  return ids;
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

  return {
    fits: over() <= 0,
    overflowPx: Math.max(0, over()),
    fontPt: fontPtFromVars(vars),
    bulletLineHeight: bulletLineHeightFromVars(vars),
    vars: { ...vars },
    droppedBulletIds,
    log,
  };
}

export function dropOrderNodes(root, doc) {
  const ids = dropOrderFromDoc(doc);
  return ids
    .map((id) => root.querySelector(`li[data-bullet-id="${CSS.escape ? CSS.escape(id) : id}"]`))
    .filter(Boolean);
}
