/**
 * Posting split view — bullets on one side, requirements on the other
 * (browser-safe ESM, imported by the page; keep it dependency-free).
 *
 * Nothing here changes the stored shape. A requirement "under" a bullet is the
 * same many-to-many link the requirement table writes: a `req.bullets[]` line
 * whose `entryId` is that library bullet. The resume, Prep cards, coverage
 * banner, and Unmapped count all keep reading that link unchanged.
 */

import {
  bulletEntry,
  careerJobGroupLabel,
  createSharedBullet,
  deleteBullet,
  deletePostingLocalBullet,
  entryById,
  experienceForEntry,
  postingById,
  requirementById,
  updateEntry,
  updatePostingResume,
} from './engine.js';
import { postingPrimaryCatalogJobId } from './experiences-index.js';
import { compileResumeDoc, visibleResumeBullets } from './resume-model.js';
import {
  displayMapLine,
  idempotentAddEntryToPostingResume,
  mapEntryToRequirement,
  requirementOrdinalsForPosting,
  requirementShortLabel,
  unmapEntryFromRequirement,
} from './posting-requirement-mapping.js';

export const SPLIT_DRAG_REQUIREMENT_TYPE = 'text/brag-requirement-id';
export const SPLIT_DRAG_ENTRY_TYPE = 'text/brag-entry-id';

export const SPLIT_BULLET_FILTERS = ['all', 'without-requirement'];

/** Entry ids in posting-resume order (visible bullets only, first source entry). */
export function postingResumeEntryOrder(store, posting) {
  const out = [];
  const seen = new Set();
  if (!posting) return out;
  let doc = null;
  try {
    doc = compileResumeDoc(posting, store);
  } catch {
    return out;
  }
  const dropped = new Set([
    ...(posting.resume?.fit?.droppedBulletIds || []),
    ...(doc?.fit?.droppedBulletIds || []),
  ]);
  for (const job of doc?.sections?.experience?.jobs || []) {
    if (job?.included === false) continue;
    for (const group of job.groups || []) {
      for (const bullet of visibleResumeBullets(group.bullets)) {
        if (dropped.has(bullet.id) || bullet.fitDropped) continue;
        const entryId = (bullet.sourceEntryIds || [])[0] || '';
        if (!entryId || seen.has(entryId)) continue;
        seen.add(entryId);
        out.push(entryId);
      }
    }
  }
  return out;
}

/**
 * The split-view model. One row per requirement (left) and one row per
 * bullet on this posting (right), each bullet carrying the requirements it
 * addresses — its purpose.
 */
export function postingSplitViewModel(store, posting) {
  const live = postingById(store, posting?.id) || posting;
  const ordinals = requirementOrdinalsForPosting(live);
  const jobsById = new Map((store?.jobs || []).map((job) => [job.id, job]));

  /** @type {Map<string, Array<{ id: string, ordinal: string, text: string, short: string }>>} */
  const purposeByEntry = new Map();
  /** @type {Array<{ reqId: string, bullet: object }>} */
  const legacyLines = [];
  const requirements = [];

  for (const req of live?.requirements || []) {
    const meta = ordinals.get(req.id);
    const ordinal = meta?.ordinal || '';
    const entryIds = [];
    for (const line of req.bullets || []) {
      const entry = bulletEntry(store, line);
      if (!entry) {
        if (line?.text) legacyLines.push({ reqId: req.id, bullet: line });
        continue;
      }
      if (!entryIds.includes(entry.id)) entryIds.push(entry.id);
      if (!purposeByEntry.has(entry.id)) purposeByEntry.set(entry.id, []);
      const list = purposeByEntry.get(entry.id);
      if (!list.some((row) => row.id === req.id)) {
        list.push({ id: req.id, ordinal, text: req.text || '', short: requirementShortLabel(req.text) });
      }
    }
    requirements.push({
      id: req.id,
      ordinal,
      text: req.text || '',
      short: requirementShortLabel(req.text),
      req,
      entryIds,
      bulletCount: entryIds.length,
      questionCount: (req.questions || []).length,
      coveredExperienceIds: [...(req.coveredExperienceIds || [])],
    });
  }

  const resumeOrder = postingResumeEntryOrder(store, live);
  const onResume = new Set(resumeOrder);
  const orderedIds = [...resumeOrder];
  for (const row of requirements) {
    for (const entryId of row.entryIds) {
      if (!orderedIds.includes(entryId)) orderedIds.push(entryId);
    }
  }

  const bullets = [];
  for (const entryId of orderedIds) {
    const entry = entryById(store, entryId);
    if (!entry) continue;
    const xp = experienceForEntry(store, entry.id);
    const job = jobsById.get(entry.jobId);
    const purposes = (purposeByEntry.get(entry.id) || [])
      .slice()
      .sort((a, b) => a.ordinal.localeCompare(b.ordinal, undefined, { numeric: true }));
    bullets.push({
      key: `entry:${entry.id}`,
      entryId: entry.id,
      entry,
      line: displayMapLine(entry.title),
      requirements: purposes,
      requirementIds: purposes.map((row) => row.id),
      onResume: onResume.has(entry.id),
      experienceId: xp?.id || '',
      experienceTitle: xp?.title || '',
      jobId: entry.jobId || '',
      jobLabel: job ? careerJobGroupLabel(job) : '',
      draftSourceIds: entry.draftSourceIds || [],
      draftSources: draftSourceLines(store, entry),
      legacy: null,
    });
  }
  for (const { reqId, bullet } of legacyLines) {
    const meta = ordinals.get(reqId);
    bullets.push({
      key: `line:${reqId}:${bullet.id}`,
      entryId: '',
      entry: null,
      line: displayMapLine(bullet.text),
      requirements: meta
        ? [{ id: reqId, ordinal: meta.ordinal, text: meta.req.text || '', short: requirementShortLabel(meta.req.text) }]
        : [],
      requirementIds: [reqId],
      onResume: false,
      experienceId: '',
      experienceTitle: '',
      jobId: '',
      jobLabel: '',
      draftSourceIds: [],
      draftSources: [],
      legacy: { reqId, bulletId: bullet.id },
    });
  }

  const unaddressedRequirementIds = requirements
    .filter((row) => row.bulletCount === 0 && !row.coveredExperienceIds.length)
    .map((row) => row.id);
  const bulletsWithoutRequirement = bullets.filter((row) => !row.requirements.length).length;

  return {
    postingId: live?.id || '',
    requirements,
    bullets,
    unaddressedRequirementIds,
    counts: {
      requirements: requirements.length,
      addressedRequirements: requirements.length - unaddressedRequirementIds.length,
      bullets: bullets.length,
      bulletsWithoutRequirement,
    },
  };
}

export function filterSplitBullets(bullets, filter = 'all') {
  if (filter === 'without-requirement') return (bullets || []).filter((row) => !row.requirements.length);
  return bullets || [];
}

/** Requirements that are not yet under this bullet (candidates for the picker). */
export function requirementsAvailableForBullet(model, entryId) {
  const row = (model?.bullets || []).find((item) => item.entryId === entryId);
  const linked = new Set(row?.requirementIds || []);
  return (model?.requirements || []).filter((req) => !linked.has(req.id));
}

export function bulletAddressesRequirement(model, entryId, requirementId) {
  const row = (model?.bullets || []).find((item) => item.entryId === entryId);
  return Boolean(row && row.requirementIds.includes(requirementId));
}

/**
 * Put a requirement under a bullet. Same link the requirement table writes,
 * and the bullet is placed on this posting's resume if it is not there yet.
 * Idempotent: linking twice is one link.
 *
 * Placement happens *before* the link on purpose. The compile already projects
 * a requirement-linked bullet onto the resume, so placing afterwards would be
 * a no-op and removing the last requirement later would silently drop the
 * bullet from the resume. Placing first makes the bullet a real resume row
 * that survives any chip removal — nothing a user put on the resume disappears.
 */
export function linkRequirementToBullet(store, postingId, requirementId, entryId, clock = Date.now) {
  const posting = postingById(store, postingId);
  const req = requirementById(posting, requirementId);
  const entry = entryById(store, entryId);
  if (!posting || !req || !entry) return store;
  let next = idempotentAddEntryToPostingResume(store, postingId, entryId, clock);
  next = mapEntryToRequirement(next, postingId, requirementId, entryId, clock);
  return next;
}

/** Take a requirement out from under a bullet. The bullet stays on the resume and in the bank. */
export function unlinkRequirementFromBullet(store, postingId, requirementId, entryId, clock = Date.now) {
  return unmapEntryFromRequirement(store, postingId, requirementId, entryId, clock);
}

/** Replace a bullet's requirement set with exactly `requirementIds` (used by multi-pick). */
export function setBulletRequirements(store, postingId, entryId, requirementIds, clock = Date.now) {
  const posting = postingById(store, postingId);
  if (!posting) return store;
  const wanted = new Set(requirementIds || []);
  let next = store;
  for (const req of posting.requirements || []) {
    const linked = (req.bullets || []).some((line) => line.entryId === entryId);
    if (wanted.has(req.id) && !linked) {
      next = linkRequirementToBullet(next, postingId, req.id, entryId, clock);
    } else if (!wanted.has(req.id) && linked) {
      next = unlinkRequirementFromBullet(next, postingId, req.id, entryId, clock);
    }
  }
  return next;
}

/**
 * Write a brand-new bullet into the bank and onto this posting's resume.
 * Optionally start it under one or more requirements. Returns the new entry id
 * so the caller can focus it; the entry exists even when it could not be
 * placed on the resume (no job yet).
 */
/**
 * Which job a new bullet is filed under. The dropdown's current value wins,
 * because choosing a job does not rebuild the form.
 */
export function resolveComposeJobId({
  selectValue = '',
  composeJobId = '',
  primaryJobId = '',
  jobs = [],
} = {}) {
  const picked = String(selectValue || '').trim();
  if (picked) return picked;
  const remembered = String(composeJobId || '').trim();
  if (remembered) return remembered;
  const primary = String(primaryJobId || '').trim();
  if (primary) return primary;
  if (jobs.length === 1 && jobs[0]?.id) return jobs[0].id;
  return '';
}

export const BLANK_BULLET_TITLE = 'Blank bullet';

/** A bullet opened so you can tailor new wording from bullets you already wrote. */
export function entryIsDraftBullet(entry) {
  return Array.isArray(entry?.draftSourceIds) && entry.draftSourceIds.length > 0;
}

function draftSourceLines(store, entry) {
  const out = [];
  for (const id of entry?.draftSourceIds || []) {
    const src = entryById(store, id);
    if (!src) continue;
    out.push({ entryId: id, line: displayMapLine(src.title) });
  }
  return out;
}

/** The written bullets a draft is drawing from. A draft contributes its sources, not itself. */
function materialEntryIds(entry) {
  if (!entry?.id) return [];
  if (entryIsDraftBullet(entry)) return entry.draftSourceIds.filter((id) => id !== entry.id);
  return [entry.id];
}

/**
 * Dragging one bullet onto another starts a blank bullet you can draft, and
 * leaves both originals in place. Dropping onto a blank adds another source
 * instead of nesting a second blank.
 */
export function draftBulletFromBullets(store, postingId, sourceEntryId, targetEntryId, clock = Date.now) {
  const source = entryById(store, sourceEntryId);
  const target = entryById(store, targetEntryId);
  const posting = postingById(store, postingId);
  if (!source || !target || !posting || source.id === target.id) {
    return { store, entryId: '', created: false };
  }
  if (entryIsDraftBullet(target)) {
    const ids = [...new Set([...target.draftSourceIds, ...materialEntryIds(source)])].filter((id) => id !== target.id);
    const same = ids.length === target.draftSourceIds.length
      && ids.every((id, index) => id === target.draftSourceIds[index]);
    if (same) return { store, entryId: target.id, created: false };
    return {
      store: updateEntry(store, target.id, { draftSourceIds: ids }, clock),
      entryId: target.id,
      created: false,
    };
  }
  if (entryIsDraftBullet(source)) {
    const ids = [...new Set([...source.draftSourceIds, ...materialEntryIds(target)])].filter((id) => id !== source.id);
    const same = ids.length === source.draftSourceIds.length
      && ids.every((id, index) => id === source.draftSourceIds[index]);
    if (same) return { store, entryId: source.id, created: false };
    return {
      store: updateEntry(store, source.id, { draftSourceIds: ids }, clock),
      entryId: source.id,
      created: false,
    };
  }
  const jobId = target.jobId || source.jobId || postingPrimaryCatalogJobId(store, posting);
  const created = addBulletToPosting(store, postingId, {
    title: BLANK_BULLET_TITLE,
    jobId,
    draftSourceIds: [...new Set([...materialEntryIds(source), ...materialEntryIds(target)])],
  }, clock);
  return { store: created.store, entryId: created.entryId, created: Boolean(created.entryId) };
}

/** Keep the drafted wording and stop showing the source bullets under it. */
export function clearDraftSources(store, entryId, clock = Date.now) {
  if (!entryById(store, entryId)) return store;
  return updateEntry(store, entryId, { draftSourceIds: [] }, clock);
}

export function addBulletToPosting(store, postingId, {
  title,
  rich = null,
  jobId = '',
  requirementIds = [],
  draftSourceIds = [],
} = {}, clock = Date.now) {
  const text = String(title || '').trim();
  if (!text || !postingById(store, postingId)) return { store, entryId: '', placed: false };
  // Without explicit spans the entry normalizer parses `**bold**` markers in the text.
  const created = createSharedBullet(store, {
    title: text,
    ...(Array.isArray(rich) && rich.length ? { rich } : {}),
    jobId: jobId || '',
    kind: 'experience',
    ...(draftSourceIds.length ? { draftSourceIds } : {}),
  }, clock);
  if (!created.entryId) return { store, entryId: '', placed: false };
  let next = idempotentAddEntryToPostingResume(created.store, postingId, created.entryId, clock);
  for (const requirementId of requirementIds || []) {
    next = mapEntryToRequirement(next, postingId, requirementId, created.entryId, clock);
  }
  const onResume = postingResumeEntryOrder(next, postingById(next, postingId)).includes(created.entryId);
  return { store: next, entryId: created.entryId, placed: onResume };
}

/**
 * Several new bullets, the same idea as pasting requirement lines: each line
 * is saved to the bank and placed on this posting, with no requirement yet.
 */
export function addBulletsToPosting(store, postingId, titles, { jobId = '' } = {}, clock = Date.now) {
  let next = store;
  const entryIds = [];
  for (const title of titles || []) {
    const result = addBulletToPosting(next, postingId, { title, jobId }, clock);
    next = result.store;
    if (result.entryId) entryIds.push(result.entryId);
  }
  return { store: next, entryIds };
}

/**
 * Take one bullet off this posting only. The bank record stays.
 * Requirement links go too, otherwise compile would project the bullet back
 * onto the resume. A shared basics row is excluded from this posting rather
 * than deleted from Resume basics.
 */
export function removeBulletFromPosting(store, postingId, entryId, clock = Date.now) {
  const posting = postingById(store, postingId);
  if (!posting || !entryId || !entryById(store, entryId)) return store;
  let next = store;
  for (const req of posting.requirements || []) {
    for (const line of req.bullets || []) {
      if (line?.entryId === entryId && line.id) {
        next = deleteBullet(next, postingId, req.id, line.id, clock);
      }
    }
  }
  const live = postingById(next, postingId);
  for (const job of live?.resume?.localJobs || []) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        if ((bullet.sourceEntryIds || []).includes(entryId)) {
          next = deletePostingLocalBullet(next, postingId, job.id, group.id, bullet.id, clock);
        }
      }
    }
  }
  const after = postingById(next, postingId);
  let doc = null;
  try {
    doc = compileResumeDoc(after, next);
  } catch {
    doc = null;
  }
  const exclude = new Set(after?.resume?.excludedBulletIds || []);
  let added = false;
  for (const job of doc?.sections?.experience?.jobs || []) {
    for (const group of job.groups || []) {
      for (const bullet of visibleResumeBullets(group.bullets)) {
        if (bullet?.id && (bullet.sourceEntryIds || []).includes(entryId) && !exclude.has(bullet.id)) {
          exclude.add(bullet.id);
          added = true;
        }
      }
    }
  }
  if (added) next = updatePostingResume(next, postingId, { excludedBulletIds: [...exclude] }, clock);
  return next;
}

/** Open requirements first, then ones that already have a bullet. Stored order is kept inside each group, so R-numbers do not change. Bullets keep resume order. */
export function splitRequirementDisplayOrder(requirements) {
  const open = [];
  const mapped = [];
  for (const row of requirements || []) {
    (row.bulletCount > 0 ? mapped : open).push(row);
  }
  return [...open, ...mapped];
}

/** Bring an existing bank bullet onto this posting (resume placement only; no requirement yet). */
export function addLibraryBulletToPosting(store, postingId, entryId, clock = Date.now) {
  const entry = entryById(store, entryId);
  if (!entry) return { store, placed: false, reason: 'missing' };
  if (!entry.jobId) return { store, placed: false, reason: 'no-job' };
  const already = postingResumeEntryOrder(store, postingById(store, postingId)).includes(entryId);
  if (already) return { store, placed: false, reason: 'already' };
  const next = idempotentAddEntryToPostingResume(store, postingId, entryId, clock);
  const placed = postingResumeEntryOrder(next, postingById(next, postingId)).includes(entryId);
  return { store: next, placed, reason: placed ? '' : 'not-placed' };
}

/** Bank bullets that are not on this posting yet, for the "From bank" search. */
export function searchBankBulletsForPosting(store, posting, query = '', { limit = 12 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const model = postingSplitViewModel(store, posting);
  const onPosting = new Set(model.bullets.map((row) => row.entryId).filter(Boolean));
  const jobsById = new Map((store?.jobs || []).map((job) => [job.id, job]));
  const out = [];
  for (const entry of store?.entries || []) {
    if (!entry?.id || onPosting.has(entry.id)) continue;
    const line = displayMapLine(entry.title);
    if (!line) continue;
    const xp = experienceForEntry(store, entry.id);
    const job = jobsById.get(entry.jobId);
    const jobLabel = job ? careerJobGroupLabel(job) : 'No role';
    const hay = [line, xp?.title || '', jobLabel].join(' ').toLowerCase();
    if (!hay.includes(q)) continue;
    out.push({
      entryId: entry.id,
      line,
      jobId: entry.jobId || '',
      jobLabel,
      experienceTitle: xp?.title || '',
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Decode a drag payload; the two sides accept each other's rows. */
export function readSplitDragPayload(dataTransfer) {
  if (!dataTransfer) return null;
  const types = Array.from(dataTransfer.types || []);
  const read = (type) => {
    try {
      return String(dataTransfer.getData(type) || '').trim();
    } catch {
      return '';
    }
  };
  if (types.includes(SPLIT_DRAG_REQUIREMENT_TYPE)) {
    const id = read(SPLIT_DRAG_REQUIREMENT_TYPE);
    return id ? { kind: 'requirement', id } : null;
  }
  if (types.includes(SPLIT_DRAG_ENTRY_TYPE)) {
    const id = read(SPLIT_DRAG_ENTRY_TYPE);
    return id ? { kind: 'entry', id } : null;
  }
  return null;
}

/** Whether a drag hovering over a row may drop there. */
export function splitDropAccepts(payloadKind, targetKind) {
  return (payloadKind === 'requirement' && targetKind === 'bullet')
    || (payloadKind === 'entry' && targetKind === 'requirement')
    || (payloadKind === 'entry' && targetKind === 'bullet');
}

/**
 * A requirement drop links that requirement to the bullet. A bullet dropped
 * on a bullet starts (or extends) a blank draft. A bullet dropped on a
 * requirement links, the same as the other direction.
 */
export function applySplitDrop(store, postingId, payload, target, clock = Date.now) {
  if (!payload || !target || !splitDropAccepts(payload.kind, target.kind)) return store;
  if (payload.kind === 'entry' && target.kind === 'bullet') {
    return draftBulletFromBullets(store, postingId, payload.id, target.id, clock).store;
  }
  if (payload.kind === 'requirement') {
    return linkRequirementToBullet(store, postingId, payload.id, target.id, clock);
  }
  return linkRequirementToBullet(store, postingId, target.id, payload.id, clock);
}

/** Which posting view the requirements area opens in. */
export const POSTING_VIEW_MODES = ['split', 'requirement', 'experience'];
export const DEFAULT_POSTING_VIEW_MODE = 'split';

export function normalizePostingViewMode(value) {
  return POSTING_VIEW_MODES.includes(value) ? value : DEFAULT_POSTING_VIEW_MODE;
}

export { requirementShortLabel };
