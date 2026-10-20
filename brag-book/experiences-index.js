/**
 * Compact Experiences panel index (browser-safe ESM).
 */

import {
  experienceById,
  experienceVersions,
  careerJobGroupLabel,
} from './engine.js';

export function experienceRepresentativeEntry(store, experienceId) {
  const versions = experienceVersions(store, experienceId);
  if (!versions.length) return null;
  return versions.reduce((best, entry) => {
    const a = String(entry.updatedAt || entry.createdAt || '');
    const b = String(best.updatedAt || best.createdAt || '');
    return a.localeCompare(b) >= 0 ? entry : best;
  });
}

function entryOnPostingResume(store, posting, entryId) {
  if (!posting?.id || !entryId) return false;
  const jobs = [...(store.jobs || []), ...((posting.resume?.localJobs) || [])];
  for (const job of jobs) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        if ((bullet.sourceEntryIds || []).includes(entryId)) return true;
      }
    }
  }
  return false;
}

function mappedRequirementCountForExperience(store, posting, experienceId) {
  if (!posting?.requirements?.length) return 0;
  const versionIds = new Set(experienceVersions(store, experienceId).map((e) => e.id));
  let count = 0;
  for (const req of posting.requirements) {
    const linked = (req.bullets || []).some((line) => versionIds.has(line.entryId))
      || (req.entryIds || []).some((id) => versionIds.has(id));
    if (linked) count += 1;
  }
  return count;
}

function onResumeCountForExperience(store, posting, experienceId) {
  if (!posting) return 0;
  return experienceVersions(store, experienceId)
    .filter((entry) => entryOnPostingResume(store, posting, entry.id)).length;
}

/**
 * One row per live experience for the compact panel index.
 */
export function compactExperienceIndex(store, {
  query = '',
  posting = null,
  includeEmpty = false,
} = {}) {
  const q = String(query || '').trim().toLowerCase();
  const jobsById = new Map((store?.jobs || []).map((job) => [job.id, job]));
  const rows = [];
  for (const xp of store?.experiences || []) {
    if (!xp?.id || xp.deletedAt) continue;
    const versions = experienceVersions(store, xp.id);
    if (!versions.length && !includeEmpty) continue;
    const rep = experienceRepresentativeEntry(store, xp.id);
    const preview = rep?.title || '';
    const job = jobsById.get(xp.jobId);
    const jobLabel = job ? careerJobGroupLabel(job) : 'No role';
    const hay = [xp.title, preview, jobLabel].join(' ').toLowerCase();
    if (q && !hay.includes(q)) continue;
    const mappedCount = posting ? mappedRequirementCountForExperience(store, posting, xp.id) : 0;
    const onResumeCount = posting ? onResumeCountForExperience(store, posting, xp.id) : 0;
    let postingFact = '';
    if (posting) {
      const parts = [];
      if (mappedCount) parts.push(`${mappedCount} mapped`);
      if (onResumeCount) parts.push(`${onResumeCount} on resume`);
      postingFact = parts.join(' · ');
    }
    rows.push({
      id: xp.id,
      title: xp.title || 'Experience',
      jobId: xp.jobId || '',
      jobLabel,
      versionCount: versions.length,
      preview,
      postingFact,
      updatedAt: xp.updatedAt || xp.createdAt || '',
    });
  }
  rows.sort((a, b) => a.title.localeCompare(b.title));
  return rows;
}

const SESSION_EMPTY_XP_KEY = 'brag-book-empty-xp-session';

export function readSessionEmptyExperienceIds() {
  try {
    const raw = sessionStorage.getItem(SESSION_EMPTY_XP_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

export function rememberSessionEmptyExperience(id) {
  const set = readSessionEmptyExperienceIds();
  set.add(id);
  try {
    sessionStorage.setItem(SESSION_EMPTY_XP_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export function forgetSessionEmptyExperience(id) {
  const set = readSessionEmptyExperienceIds();
  set.delete(id);
  try {
    sessionStorage.setItem(SESSION_EMPTY_XP_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

/** Soft-delete memberless experiences except ids kept for this browser session. */
export function pruneOrphanExperiences(store, { keepExperienceIds = readSessionEmptyExperienceIds() } = {}, clock = Date.now) {
  const used = new Set(
    (store?.entries || [])
      .map((entry) => String(entry.experienceId || '').trim())
      .filter(Boolean),
  );
  let changed = false;
  const experiences = (store.experiences || []).map((row) => {
    if (!row?.id || row.deletedAt) return row;
    if (used.has(row.id)) return row;
    if (keepExperienceIds.has(row.id)) return row;
    changed = true;
    return {
      ...row,
      deletedAt: new Date(clock()).toISOString(),
      updatedAt: new Date(clock()).toISOString(),
    };
  });
  if (!changed) return store;
  return { ...store, experiences };
}
