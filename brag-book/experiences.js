/**
 * Named experience grouping for resume bullets (metadata only). Browser-safe ESM.
 */

const TITLE_MAX = 200;
const ID_MAX = 64;
const TEXT_MAX = 8000;

function asString(value, max) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

function nowIso(clock = Date.now) {
  return new Date(clock()).toISOString();
}

function newId(prefix, clock = Date.now, random = Math.random) {
  const stamp = clock().toString(36);
  const extra = Math.floor(random() * 1e9).toString(36);
  return `${prefix}_${stamp}${extra}`;
}

export function experienceById(store, id) {
  const xpId = asString(id, ID_MAX);
  if (!xpId) return null;
  return (store?.experiences || []).find((row) => row.id === xpId && !row.deletedAt) || null;
}

export function entryIsLoose(entry, store) {
  if (!entry?.id) return false;
  const xpId = asString(entry.experienceId, ID_MAX);
  if (!xpId) return true;
  return !experienceById(store, xpId);
}

export function experienceForEntry(store, entryId) {
  const entry = (store?.entries || []).find((row) => row.id === entryId);
  if (!entry) return null;
  const xp = experienceById(store, entry.experienceId);
  return xp || null;
}

export function experienceVersions(store, experienceId) {
  const xpId = asString(experienceId, ID_MAX);
  if (!xpId || !experienceById(store, xpId)) return [];
  return (store?.entries || []).filter((entry) => asString(entry.experienceId, ID_MAX) === xpId);
}

export function effectiveExperienceKeyForEntry(entry) {
  const xpId = asString(entry?.experienceId, ID_MAX);
  if (xpId) return `xp:${xpId}`;
  return entry?.id ? `entry:${entry.id}` : '';
}

function jobById(store, jobId) {
  const id = asString(jobId, ID_MAX);
  if (!id) return null;
  return (store?.jobs || []).find((job) => job.id === id) || null;
}

function entryById(store, entryId) {
  return (store?.entries || []).find((row) => row.id === entryId) || null;
}

function replaceEntryExperienceId(store, entryId, experienceId, clock) {
  const entries = (store.entries || []).map((entry) => {
    if (entry.id !== entryId) return entry;
    return {
      ...entry,
      experienceId: asString(experienceId, ID_MAX),
      updatedAt: nowIso(clock),
    };
  });
  return { ...store, entries };
}

function replaceExperienceRecord(store, record, clock) {
  const list = store.experiences || [];
  const index = list.findIndex((row) => row.id === record.id);
  const next = list.slice();
  const row = {
    ...record,
    updatedAt: nowIso(clock),
  };
  if (index >= 0) next[index] = row;
  else next.push(row);
  return { ...store, experiences: next };
}

export function captureGroupingPlacements(store, entryIds) {
  const ids = new Set(entryIds || []);
  return (store?.entries || [])
    .filter((entry) => ids.has(entry.id))
    .map((entry) => ({
      entryId: entry.id,
      jobId: asString(entry.jobId, ID_MAX),
      experienceId: asString(entry.experienceId, ID_MAX),
    }));
}

export function appendGroupingBackup(store, {
  kind,
  entryIds,
  experienceIds,
  clock = Date.now,
  random = Math.random,
}) {
  const affectedEntries = new Set(entryIds || []);
  for (const xpId of experienceIds || []) {
    for (const entry of experienceVersions(store, xpId)) affectedEntries.add(entry.id);
  }
  const relatedExperiences = [];
  const seenXp = new Set();
  for (const entry of store.entries || []) {
    if (!affectedEntries.has(entry.id)) continue;
    const xpId = asString(entry.experienceId, ID_MAX);
    if (!xpId || seenXp.has(xpId)) continue;
    const xp = (store.experiences || []).find((row) => row.id === xpId);
    if (xp) {
      seenXp.add(xpId);
      relatedExperiences.push({ ...xp });
    }
  }
  const backup = {
    id: newId('bk', clock, random),
    kind: asString(kind, 80) || 'grouping',
    createdAt: nowIso(clock),
    experiences: relatedExperiences,
    placements: captureGroupingPlacements(store, [...affectedEntries]),
  };
  const backups = [...(store.experienceGroupingBackups || []), backup].slice(-5);
  return { store: { ...store, experienceGroupingBackups: backups }, backupId: backup.id };
}

function opResult(store, { changedEntryIds = [], changedExperienceIds = [] } = {}) {
  return { store, changedEntryIds, changedExperienceIds };
}

export function createExperience(store, { jobId, title }, clock = Date.now, random = Math.random) {
  const job = jobById(store, jobId);
  if (!job) throw new Error('Job required for a new experience.');
  const cleanTitle = asString(title, TITLE_MAX);
  if (!cleanTitle) throw new Error('Experience title required.');
  const id = newId('xp', clock, random);
  const createdAt = nowIso(clock);
  const record = {
    id,
    jobId: job.id,
    title: cleanTitle,
    createdAt,
    updatedAt: createdAt,
    deletedAt: '',
  };
  return opResult(replaceExperienceRecord(store, record, clock), {
    changedExperienceIds: [id],
  });
}

export function renameExperience(store, experienceId, title, clock = Date.now) {
  const xp = experienceById(store, experienceId);
  if (!xp) throw new Error('Experience not found.');
  const cleanTitle = asString(title, TITLE_MAX);
  if (!cleanTitle) throw new Error('Experience title required.');
  const next = replaceExperienceRecord(store, { ...xp, title: cleanTitle }, clock);
  return opResult(next, { changedExperienceIds: [xp.id] });
}

export function moveEntryToExperience(
  store,
  entryId,
  experienceId,
  { allowCrossJob = false, clock = Date.now, random = Math.random } = {},
) {
  const entry = entryById(store, entryId);
  if (!entry) throw new Error('Bullet not found.');
  const destId = asString(experienceId, ID_MAX);
  const dest = destId ? experienceById(store, destId) : null;
  if (destId && !dest) throw new Error('Experience not found.');
  if (dest && dest.jobId && entry.jobId && dest.jobId !== entry.jobId && !allowCrossJob) {
    throw new Error('These bullets are under different jobs. Move them to one job first.');
  }
  let next = store;
  const changedEntryIds = [entryId];
  if (dest && dest.jobId && entry.jobId !== dest.jobId && allowCrossJob) {
    next = {
      ...next,
      entries: next.entries.map((row) => (
        row.id === entryId
          ? { ...row, jobId: dest.jobId, updatedAt: nowIso(clock) }
          : row
      )),
    };
  }
  next = replaceEntryExperienceId(next, entryId, destId, clock);
  return opResult(next, { changedEntryIds, changedExperienceIds: dest ? [dest.id] : [] });
}

export function removeEntryFromExperience(store, entryId, clock = Date.now) {
  const entry = entryById(store, entryId);
  if (!entry) throw new Error('Bullet not found.');
  const priorXp = asString(entry.experienceId, ID_MAX);
  const next = replaceEntryExperienceId(store, entryId, '', clock);
  return opResult(next, {
    changedEntryIds: [entryId],
    changedExperienceIds: priorXp ? [priorXp] : [],
  });
}

export function groupEntriesAsExperience(
  store,
  entryIds,
  { jobId, title },
  clock = Date.now,
  random = Math.random,
) {
  const ids = [...new Set((entryIds || []).filter(Boolean))];
  if (ids.length < 1) throw new Error('Select at least one bullet.');
  const entries = ids.map((id) => entryById(store, id)).filter(Boolean);
  if (entries.length !== ids.length) throw new Error('Bullet not found.');
  const jobs = new Set(entries.map((entry) => asString(entry.jobId, ID_MAX)).filter(Boolean));
  if (jobs.size > 1) {
    throw new Error('These bullets are under different jobs. Move them to one job first.');
  }
  const resolvedJobId = asString(jobId, ID_MAX) || [...jobs][0] || '';
  if (!resolvedJobId || !jobById(store, resolvedJobId)) {
    throw new Error('Job required for a new experience.');
  }
  let nextStore = store;
  const { store: backed, backupId } = appendGroupingBackup(nextStore, {
    kind: 'group.selected',
    entryIds: ids,
    clock,
    random,
  });
  nextStore = backed;
  const created = createExperience(nextStore, { jobId: resolvedJobId, title }, clock, random);
  nextStore = created.store;
  const xpId = created.changedExperienceIds[0];
  for (const id of ids) {
    const moved = moveEntryToExperience(nextStore, id, xpId, { clock, random });
    nextStore = moved.store;
  }
  nextStore = { ...nextStore, v: 4 };
  return {
    store: nextStore,
    experienceId: xpId,
    backupId,
    changedEntryIds: ids,
    changedExperienceIds: [xpId],
  };
}

export function draftExperienceVersion(
  store,
  experienceId,
  { copyFromEntryId } = {},
  clock = Date.now,
  random = Math.random,
) {
  const xp = experienceById(store, experienceId);
  if (!xp) throw new Error('Experience not found.');
  const source = copyFromEntryId ? entryById(store, copyFromEntryId) : null;
  const id = newId('en', clock, random);
  const createdAt = nowIso(clock);
  const title = 'New version';
  const entry = {
    id,
    kind: source?.kind || 'experience',
    title,
    rich: [{ text: title, bold: false }],
    role: source?.role || '',
    company: source?.company || '',
    jobId: xp.jobId,
    experienceId: xp.id,
    when: source?.when || '',
    tags: source ? [...(source.tags || [])] : [],
    situation: copyFromEntryId && source ? source.situation : '',
    task: copyFromEntryId && source ? source.task : '',
    action: copyFromEntryId && source ? source.action : '',
    result: copyFromEntryId && source ? source.result : '',
    notes: copyFromEntryId && source ? source.notes : '',
    createdAt,
    updatedAt: createdAt,
    legacyVersions: [],
  };
  return opResult(
    { ...store, entries: [...(store.entries || []), entry], v: 4 },
    { changedEntryIds: [id], changedExperienceIds: [xp.id] },
  );
}

export function ungroupExperience(store, experienceId, clock = Date.now, random = Math.random) {
  const xp = experienceById(store, experienceId);
  if (!xp) throw new Error('Experience not found.');
  const versions = experienceVersions(store, experienceId);
  let nextStore = store;
  const { store: backed } = appendGroupingBackup(nextStore, {
    kind: 'ungroup.experience',
    experienceIds: [experienceId],
    entryIds: versions.map((entry) => entry.id),
    clock,
    random,
  });
  nextStore = backed;
  for (const entry of versions) {
    nextStore = removeEntryFromExperience(nextStore, entry.id, clock).store;
  }
  nextStore = replaceExperienceRecord(nextStore, {
    ...xp,
    deletedAt: nowIso(clock),
  }, clock);
  return opResult(nextStore, {
    changedEntryIds: versions.map((entry) => entry.id),
    changedExperienceIds: [xp.id],
  });
}
