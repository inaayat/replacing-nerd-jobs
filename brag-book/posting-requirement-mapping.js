/**
 * Posting requirement ↔ experience/bullet mapping (browser-safe ESM).
 * Persistence stays entry-based; experience buckets may record coverage-only rows.
 */

import {
  addEntryBullet,
  addExperienceCoverage,
  bulletEntry,
  careerJobGroupLabel,
  deleteBullet,
  entryById,
  experienceById,
  experienceForEntry,
  experienceVersions,
  placeLibraryBullet,
  postingById,
  requirementById,
  removeExperienceCoverage,
} from './engine.js';

export function displayMapLine(text) {
  return String(text || '').replace(/^\s*[-*•–—●▪‣∙]\s+/, '').trim() || String(text || '').trim();
}

/**
 * Grouped search: experiences first, then individual bullets.
 */
export function searchPostingMapTargets(store, query = '', { limit = 24 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const jobsById = new Map((store?.jobs || []).map((job) => [job.id, job]));
  const experiences = [];
  for (const xp of store?.experiences || []) {
    if (!xp?.id || xp.deletedAt) continue;
    const versions = experienceVersions(store, xp.id);
    const job = jobsById.get(xp.jobId);
    const jobLabel = job ? careerJobGroupLabel(job) : 'No role';
    const hay = [xp.title, jobLabel, ...versions.map((v) => v.title)].join(' ').toLowerCase();
    if (q && !hay.includes(q)) continue;
    experiences.push({
      kind: 'experience',
      experienceId: xp.id,
      title: xp.title || 'Experience',
      versionCount: versions.length,
      jobId: xp.jobId || '',
      jobLabel,
    });
  }
  experiences.sort((a, b) => a.title.localeCompare(b.title));

  const bullets = [];
  for (const entry of store?.entries || []) {
    if (!entry?.id) continue;
    const line = displayMapLine(entry.title);
    if (!line) continue;
    const xp = experienceForEntry(store, entry.id);
    const job = jobsById.get(entry.jobId);
    const jobLabel = job ? careerJobGroupLabel(job) : 'No role';
    const sublabel = xp?.title ? xp.title : jobLabel;
    const hay = [line, sublabel, jobLabel].join(' ').toLowerCase();
    if (q && !hay.includes(q)) continue;
    bullets.push({
      kind: 'bullet',
      entryId: entry.id,
      line,
      experienceId: xp?.id || '',
      sublabel,
      jobId: entry.jobId || '',
    });
  }
  bullets.sort((a, b) => a.line.localeCompare(b.line));

  return {
    experiences: experiences.slice(0, limit),
    bullets: bullets.slice(0, limit),
  };
}

export function requirementLinkedEntryIds(req) {
  return new Set((req?.bullets || []).map((line) => line.entryId).filter(Boolean));
}

export function requirementMappingBuckets(store, req) {
  const byExperience = new Map();
  const otherBullets = [];
  for (const bullet of req?.bullets || []) {
    const entry = bulletEntry(store, bullet);
    if (!entry) {
      otherBullets.push({ bullet, entry: null });
      continue;
    }
    const xp = experienceForEntry(store, entry.id);
    if (!xp) {
      otherBullets.push({ bullet, entry });
      continue;
    }
    if (!byExperience.has(xp.id)) {
      byExperience.set(xp.id, { experience: xp, lines: [] });
    }
    byExperience.get(xp.id).lines.push({ bullet, entry });
  }
  for (const xpId of req?.coveredExperienceIds || []) {
    if (byExperience.has(xpId)) continue;
    const xp = experienceById(store, xpId);
    if (xp) byExperience.set(xp.id, { experience: xp, lines: [] });
  }
  const experienceBuckets = [...byExperience.values()]
    .map(({ experience, lines }) => {
      const versions = experienceVersions(store, experience.id);
      const selectedIds = new Set(lines.map((row) => row.entry.id));
      return {
        experienceId: experience.id,
        title: experience.title || 'Experience',
        jobId: experience.jobId || '',
        totalVersions: versions.length,
        selectedCount: selectedIds.size,
        versions: versions.map((entry) => ({
          entry,
          selected: selectedIds.has(entry.id),
          bullet: lines.find((row) => row.entry.id === entry.id)?.bullet || null,
        })),
        lines,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
  return { experienceBuckets, otherBullets };
}

export function idempotentAddEntryToPostingResume(store, postingId, entryId, clock = Date.now) {
  const entry = entryById(store, entryId);
  const posting = postingById(store, postingId);
  if (!entry?.jobId || !posting) return store;
  return placeLibraryBullet(store, {
    postingId,
    jobId: entry.jobId,
    groupId: '',
    entryId: entry.id,
  }, clock);
}

export function mapExperienceBucketToRequirement(
  store,
  postingId,
  requirementId,
  experienceId,
  clock = Date.now,
) {
  const req = requirementById(postingById(store, postingId), requirementId);
  if (!req || !experienceById(store, experienceId)) return store;
  return addExperienceCoverage(store, postingId, requirementId, experienceId, clock);
}

export function mapEntryToRequirement(
  store,
  postingId,
  requirementId,
  entryId,
  clock = Date.now,
) {
  const entry = entryById(store, entryId);
  const req = requirementById(postingById(store, postingId), requirementId);
  if (!entry || !req) return store;
  const linked = requirementLinkedEntryIds(req);
  let next = store;
  if (!linked.has(entryId)) {
    next = addEntryBullet(next, postingId, requirementId, entryId, '', clock);
  }
  const xp = experienceForEntry(next, entryId);
  if (xp) {
    next = addExperienceCoverage(next, postingId, requirementId, xp.id, clock);
  }
  return next;
}

export function setRequirementEntryMapped(
  store,
  postingId,
  requirementId,
  entryId,
  mapped,
  clock = Date.now,
) {
  const req = requirementById(postingById(store, postingId), requirementId);
  if (!req) return store;
  const linked = requirementLinkedEntryIds(req);
  if (mapped) {
    if (linked.has(entryId)) {
      return idempotentAddEntryToPostingResume(store, postingId, entryId, clock);
    }
    let next = mapEntryToRequirement(store, postingId, requirementId, entryId, clock);
    next = idempotentAddEntryToPostingResume(next, postingId, entryId, clock);
    return next;
  }
  const line = (req.bullets || []).find((row) => row.entryId === entryId);
  if (!line) return store;
  return deleteBullet(store, postingId, requirementId, line.id, clock);
}

export function unmapExperienceBucketFromRequirement(
  store,
  postingId,
  requirementId,
  experienceId,
  clock = Date.now,
) {
  const req = requirementById(postingById(store, postingId), requirementId);
  if (!req) return store;
  const versionIds = new Set(experienceVersions(store, experienceId).map((entry) => entry.id));
  let next = store;
  for (const bullet of [...(req.bullets || [])]) {
    if (bullet.entryId && versionIds.has(bullet.entryId)) {
      next = deleteBullet(next, postingId, requirementId, bullet.id, clock);
    }
  }
  next = removeExperienceCoverage(next, postingId, requirementId, experienceId, clock);
  return next;
}

export function unmapEntryFromRequirement(
  store,
  postingId,
  requirementId,
  entryId,
  clock = Date.now,
) {
  const req = requirementById(postingById(store, postingId), requirementId);
  if (!req) return store;
  const line = (req.bullets || []).find((row) => row.entryId === entryId);
  if (!line) return store;
  return deleteBullet(store, postingId, requirementId, line.id, clock);
}

/** Display ordinals R1, R2, … for a posting's requirements (stable order). */
export function requirementOrdinalsForPosting(posting) {
  const map = new Map();
  for (const [index, req] of (posting?.requirements || []).entries()) {
    if (req?.id) map.set(req.id, { ordinal: `R${index + 1}`, index, req });
  }
  return map;
}

export function requirementShortLabel(text, maxLen = 52) {
  const trimmed = String(text || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Requirement';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

/** True when the requirement has at least one mapped bullet or experience coverage. */
export function requirementHasMapping(req) {
  if ((req?.bullets || []).length > 0) return true;
  if ((req?.coveredExperienceIds || []).length > 0) return true;
  return false;
}

/** Loose mapped bullets (no experience) that warrant the \"No experience\" group in the UI. */
export function requirementLooseMappedBullets(store, req) {
  const { otherBullets } = requirementMappingBuckets(store, req);
  return otherBullets.filter((row) => row.entry?.id);
}

export function postingMapShowsLooseGroup(store, req) {
  return requirementLooseMappedBullets(store, req).length > 0;
}

/**
 * By-experience view: one group per mapped experience (plus optional loose bucket).
 * Sorted by number of requirements covered, descending.
 */
export function postingExperienceViewGroups(store, posting) {
  const ordinals = requirementOrdinalsForPosting(posting);
  /** @type {Map<string, { experienceId: string, title: string, jobId: string, requirements: Array<{ req, ordinal: string, text: string }>, bucketsByReq: Map<string, object> }>} */
  const byExperience = new Map();
  /** @type {Array<{ req, bullet, entry }>} */
  const looseRows = [];

  for (const req of posting?.requirements || []) {
    const { experienceBuckets, otherBullets } = requirementMappingBuckets(store, req);
    for (const bucket of experienceBuckets) {
      let group = byExperience.get(bucket.experienceId);
      if (!group) {
        group = {
          experienceId: bucket.experienceId,
          title: bucket.title,
          jobId: bucket.jobId,
          requirements: [],
          bucketsByReq: new Map(),
        };
        byExperience.set(bucket.experienceId, group);
      }
      const meta = ordinals.get(req.id);
      if (meta && !group.requirements.some((row) => row.req.id === req.id)) {
        group.requirements.push({
          req,
          ordinal: meta.ordinal,
          text: req.text || '',
        });
      }
      group.bucketsByReq.set(req.id, bucket);
    }
    for (const row of otherBullets) {
      if (row.entry) looseRows.push({ req, bullet: row.bullet, entry: row.entry });
    }
  }

  const experienceGroups = [...byExperience.values()]
    .map((group) => {
      group.requirements.sort((a, b) => a.ordinal.localeCompare(b.ordinal, undefined, { numeric: true }));
      return {
        ...group,
        coversCount: group.requirements.length,
      };
    })
    .sort((a, b) => (
      b.coversCount - a.coversCount
      || a.title.localeCompare(b.title)
    ));

  return { experienceGroups, looseRows };
}

export function entryMappedOnRequirement(req, entryId) {
  return (req?.bullets || []).some((line) => line.entryId === entryId);
}

export function setEntryMappedAcrossRequirements(
  store,
  postingId,
  requirements,
  entryId,
  mapped,
  clock = Date.now,
) {
  let next = store;
  for (const req of requirements) {
    next = setRequirementEntryMapped(next, postingId, req.id, entryId, mapped, clock);
  }
  return next;
}
