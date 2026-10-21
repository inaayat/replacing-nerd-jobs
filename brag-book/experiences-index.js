/**
 * Compact Experiences panel index (browser-safe ESM).
 */

import {
  experienceById,
  experienceVersions,
  experienceForEntry,
  careerJobGroupLabel,
} from './engine.js';
import { catalogJobIdsOnPostingResume, inferEntryJobId } from './resume-model.js';
import { displayMapLine } from './posting-requirement-mapping.js';

const SESSION_PANEL_LOOSE_OPEN_KEY = 'brag-book-panel-loose-open';

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

export function postingPrimaryCatalogJobId(store, posting) {
  if (!posting) return '';
  const inferred = inferEntryJobId(
    { company: posting.company, role: posting.title, jobId: '' },
    store,
  );
  if (inferred) return inferred;
  const onResume = catalogJobIdsOnPostingResume(posting, store);
  if (onResume.size === 1) return [...onResume][0];
  return '';
}

function mappedRequirementCountForEntry(store, posting, entryId) {
  if (!posting?.requirements?.length || !entryId) return 0;
  let count = 0;
  for (const req of posting.requirements) {
    const linked = (req.bullets || []).some((line) => line.entryId === entryId)
      || (req.entryIds || []).includes(entryId);
    if (linked) count += 1;
  }
  return count;
}

/**
 * Loose library bullets for the Experiences side panel (not in any experience).
 * Returns grouped rows: posting primary job first, then other jobs with labels.
 */
export function compactLooseBulletPanelGroups(store, {
  query = '',
  posting = null,
  primaryJobId = '',
} = {}) {
  const q = String(query || '').trim().toLowerCase();
  const jobsById = new Map((store?.jobs || []).map((job) => [job.id, job]));
  const byJob = new Map();

  for (const entry of store?.entries || []) {
    if (!entry?.id) continue;
    if (experienceForEntry(store, entry.id)) continue;
    const line = displayMapLine(entry.title);
    if (!line) continue;
    const jobId = entry.jobId || '';
    const job = jobsById.get(jobId);
    const jobLabel = job ? careerJobGroupLabel(job) : 'No role';
    const hay = [line, jobLabel, entry.title].join(' ').toLowerCase();
    if (q && !hay.includes(q)) continue;
    const mappedCount = posting ? mappedRequirementCountForEntry(store, posting, entry.id) : 0;
    const onResume = posting ? entryOnPostingResume(store, posting, entry.id) : false;
    let postingFact = '';
    if (posting) {
      const parts = [];
      if (mappedCount) parts.push(`${mappedCount} mapped`);
      if (onResume) parts.push('1 on resume');
      postingFact = parts.join(' · ');
    }
    const row = {
      entryId: entry.id,
      line,
      jobId,
      jobLabel,
      postingFact,
      onResume,
      mappedCount,
    };
    if (!byJob.has(jobId)) byJob.set(jobId, []);
    byJob.get(jobId).push(row);
  }

  const resolvedPrimary = primaryJobId || (posting ? postingPrimaryCatalogJobId(store, posting) : '');
  const jobIds = [...byJob.keys()];
  jobIds.sort((a, b) => {
    if (a === resolvedPrimary) return -1;
    if (b === resolvedPrimary) return 1;
    const labelA = jobsById.get(a) ? careerJobGroupLabel(jobsById.get(a)) : 'No role';
    const labelB = jobsById.get(b) ? careerJobGroupLabel(jobsById.get(b)) : 'No role';
    return labelA.localeCompare(labelB);
  });

  const groups = jobIds.map((jobId) => {
    const rows = byJob.get(jobId).sort((a, b) => a.line.localeCompare(b.line));
    return {
      jobId,
      jobLabel: jobsById.get(jobId) ? careerJobGroupLabel(jobsById.get(jobId)) : 'No role',
      isPrimary: Boolean(resolvedPrimary && jobId === resolvedPrimary),
      rows,
    };
  });

  const totalCount = groups.reduce((sum, group) => sum + group.rows.length, 0);
  return { totalCount, groups, primaryJobId: resolvedPrimary };
}

export function panelLooseSectionPageKey(posting) {
  return posting?.id ? `posting:${posting.id}` : 'catalog';
}

export function readPanelLooseSectionOpen(pageKey, { count } = {}) {
  try {
    const raw = sessionStorage.getItem(SESSION_PANEL_LOOSE_OPEN_KEY);
    const map = raw ? JSON.parse(raw) : null;
    if (map && Object.prototype.hasOwnProperty.call(map, pageKey)) {
      return Boolean(map[pageKey]);
    }
  } catch {
    /* ignore */
  }
  return count <= 8;
}

export function writePanelLooseSectionOpen(pageKey, open) {
  try {
    const raw = sessionStorage.getItem(SESSION_PANEL_LOOSE_OPEN_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[pageKey] = Boolean(open);
    sessionStorage.setItem(SESSION_PANEL_LOOSE_OPEN_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
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
export function selectedEntriesJobIds(store, entryIds) {
  const jobs = new Set();
  for (const id of entryIds || []) {
    const entry = store?.entries?.find((row) => row.id === id);
    if (entry?.jobId) jobs.add(entry.jobId);
  }
  return jobs;
}

/** Every experience id referenced on a posting requirement (coverage-only buckets). */
export function coveredExperienceIdsFromPostings(store) {
  const ids = new Set();
  for (const posting of store?.postings || []) {
    for (const req of posting?.requirements || []) {
      for (const id of req?.coveredExperienceIds || []) {
        const xpId = String(id || '').trim();
        if (xpId) ids.add(xpId);
      }
    }
  }
  return ids;
}

export function pruneOrphanExperiences(store, { keepExperienceIds = readSessionEmptyExperienceIds() } = {}, clock = Date.now) {
  const used = new Set(
    (store?.entries || [])
      .map((entry) => String(entry.experienceId || '').trim())
      .filter(Boolean),
  );
  for (const xpId of coveredExperienceIdsFromPostings(store)) used.add(xpId);
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
