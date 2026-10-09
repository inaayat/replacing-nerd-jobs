/**
 * Immutable saved resume snapshots. Browser-safe ESM.
 */

import {
  additionalValueSpans,
  compileResumeDoc,
  resumeBulletSpans,
} from './resume-model.js';
import { CALADEA_HREF, TOKENS } from './resume-template.js';

export const RESUME_SNAPSHOT_SCHEMA = 1;
const SNAPSHOT_NAME_MAX = 120;

const STRIP_BULLET_KEYS = [
  'sourceEntryIds',
  'sourceBulletIds',
  'originalLead',
  'originalBody',
  'originalTitle',
  'hasOverride',
  'local',
  'hasLocalExtras',
];

function asString(value, max) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

function makeId(prefix, clock, random) {
  const stamp = clock().toString(36);
  const extra = Math.floor(random() * 1e9).toString(36);
  return `${prefix}_${stamp}${extra}`;
}

function cloneSpans(spans) {
  return (spans || []).map((span) => {
    const next = { text: String(span?.text ?? ''), bold: Boolean(span?.bold) };
    if (span?.italic) next.italic = true;
    return next;
  });
}

function normalizeFit(raw) {
  const vars = raw?.vars && typeof raw.vars === 'object' ? { ...raw.vars } : {};
  return {
    fontPt: Number(raw?.fontPt) || 10,
    bulletLineHeight: Number(raw?.bulletLineHeight) || 1.32,
    droppedBulletIds: Array.isArray(raw?.droppedBulletIds)
      ? [...new Set(raw.droppedBulletIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : [],
    droppedLabels: Array.isArray(raw?.droppedLabels)
      ? raw.droppedLabels.map((label) => String(label || '')).filter(Boolean)
      : [],
    fits: raw?.fits !== false,
    pinnedBlocked: Boolean(raw?.pinnedBlocked),
    vars,
  };
}

function normalizeEvent(raw, clock, random) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'delete' ? 'delete' : raw.kind === 'rename' ? 'rename' : '';
  if (!kind) return null;
  const at = asString(raw.at, 40) || nowIso(clock);
  const event = {
    id: asString(raw.id, 64) || makeId('rse', clock, random),
    kind,
    at,
  };
  if (kind === 'rename') {
    const name = asString(raw.name, SNAPSHOT_NAME_MAX);
    if (!name) return null;
    event.name = name;
  }
  return event;
}

function normalizeEvents(value, clock, random) {
  const byId = new Map();
  for (const item of Array.isArray(value) ? value : []) {
    const event = normalizeEvent(item, clock, random);
    if (!event) continue;
    byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) => {
    const ta = Date.parse(a.at) || 0;
    const tb = Date.parse(b.at) || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
}

function freezeBullet(bullet) {
  const rich = cloneSpans(resumeBulletSpans(bullet));
  const next = {
    ...bullet,
    lead: asString(bullet?.lead, 8000),
    body: asString(bullet?.body, 8000),
    rich,
  };
  for (const key of STRIP_BULLET_KEYS) delete next[key];
  return next;
}

function freezeAdditionalRow(row) {
  return {
    ...row,
    rich: cloneSpans(additionalValueSpans(row)),
  };
}

function freezeCompiledDoc(doc) {
  const cloned = structuredClone(doc);
  cloned.sections = {
    ...cloned.sections,
    experience: {
      ...(cloned.sections?.experience || {}),
      jobs: (cloned.sections?.experience?.jobs || []).map((job) => ({
        ...job,
        groups: (job.groups || []).map((group) => ({
          ...group,
          bullets: (group.bullets || []).map(freezeBullet),
        })),
      })),
    },
    additional: {
      ...(cloned.sections?.additional || {}),
      rows: (cloned.sections?.additional?.rows || []).map(freezeAdditionalRow),
    },
  };
  delete cloned.fit;
  return cloned;
}

function recoveryIdentity(snapshot) {
  return JSON.stringify({
    doc: snapshot?.doc,
    fit: snapshot?.fit,
    savedAt: snapshot?.savedAt,
    sourcePostingId: snapshot?.sourcePostingId,
    initialName: snapshot?.initialName,
  });
}

export function defaultResumeSnapshotName(posting, date = new Date()) {
  const company = asString(posting?.company, SNAPSHOT_NAME_MAX);
  const title = asString(posting?.title, SNAPSHOT_NAME_MAX);
  const when = date instanceof Date ? date : new Date(date);
  const ymd = Number.isFinite(when.getTime()) ? when.toISOString().slice(0, 10) : '';
  return [company, title, ymd].filter(Boolean).join(' – ');
}

export function snapshotDisplayName(snapshot) {
  if (!snapshot) return '';
  let name = asString(snapshot.initialName, SNAPSHOT_NAME_MAX)
    || asString(snapshot.name, SNAPSHOT_NAME_MAX);
  for (const event of snapshot.events || []) {
    if (event.kind === 'rename' && event.name) name = event.name;
  }
  return name;
}

export function snapshotIsDeleted(snapshot) {
  return (snapshot?.events || []).some((event) => event.kind === 'delete');
}

export function normalizeResumeSnapshot(raw, clock = Date.now, random = Math.random) {
  if (!raw || typeof raw !== 'object') return null;
  const id = asString(raw.id, 64);
  if (!id) return null;
  const initialName = asString(raw.initialName, SNAPSHOT_NAME_MAX)
    || asString(raw.name, SNAPSHOT_NAME_MAX);
  if (!initialName) return null;
  const savedAt = asString(raw.savedAt, 40) || nowIso(clock);
  const sourcePostingId = asString(raw.sourcePostingId, 64);
  const sourcePosting = {
    company: asString(raw.sourcePosting?.company, SNAPSHOT_NAME_MAX),
    title: asString(raw.sourcePosting?.title, SNAPSHOT_NAME_MAX),
  };
  const doc = raw.doc && typeof raw.doc === 'object' ? structuredClone(raw.doc) : null;
  if (!doc) return null;
  const events = normalizeEvents(raw.events, clock, random);
  const recoveryCopies = [];
  const seenRecovery = new Set();
  for (const copy of Array.isArray(raw.recoveryCopies) ? raw.recoveryCopies : []) {
    const normalized = normalizeResumeSnapshot(copy, clock, random);
    if (!normalized) continue;
    const key = recoveryIdentity(normalized);
    if (seenRecovery.has(key)) continue;
    seenRecovery.add(key);
    recoveryCopies.push(normalized);
  }
  const snapshot = {
    v: Number(raw.v) === RESUME_SNAPSHOT_SCHEMA ? RESUME_SNAPSHOT_SCHEMA : RESUME_SNAPSHOT_SCHEMA,
    id,
    name: snapshotDisplayName({ initialName, events }),
    initialName,
    savedAt,
    sourcePostingId,
    sourcePosting,
    renderer: {
      template: asString(raw.renderer?.template, 40) || 'classic-serif',
      templateVersion: Number(raw.renderer?.templateVersion) || 1,
      fontFamily: asString(raw.renderer?.fontFamily, 200) || TOKENS.font.family,
      fontHref: asString(raw.renderer?.fontHref, 2048) || CALADEA_HREF,
    },
    doc,
    fit: normalizeFit(raw.fit),
    events,
    recoveryCopies,
  };
  snapshot.name = snapshotDisplayName(snapshot);
  return snapshot;
}

export function normalizeResumeSnapshots(list, clock = Date.now, random = Math.random) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const snapshot = normalizeResumeSnapshot(item, clock, random);
    if (!snapshot || seen.has(snapshot.id)) continue;
    seen.add(snapshot.id);
    out.push(snapshot);
  }
  return out;
}

export function resumeSnapshotToDoc(snapshot) {
  if (!snapshot?.doc) return null;
  const doc = structuredClone(snapshot.doc);
  doc.fit = {
    ...(doc.fit || {}),
    ...normalizeFit(snapshot.fit),
    fitVars: snapshot.fit?.vars || {},
  };
  return doc;
}

export function activeResumeSnapshots(storeOrList) {
  const list = Array.isArray(storeOrList)
    ? storeOrList
    : (storeOrList?.resumeSnapshots || []);
  return list
    .filter((row) => row && !snapshotIsDeleted(row))
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.savedAt) || 0;
      const tb = Date.parse(b.savedAt) || 0;
      if (tb !== ta) return tb - ta;
      return String(a.id).localeCompare(String(b.id));
    });
}

export function resumeSnapshotById(storeOrList, id, { includeDeleted = false } = {}) {
  const needle = String(id || '').trim();
  if (!needle) return null;
  const list = Array.isArray(storeOrList)
    ? storeOrList
    : (storeOrList?.resumeSnapshots || []);
  const row = list.find((item) => item?.id === needle);
  if (!row) return null;
  if (!includeDeleted && snapshotIsDeleted(row)) return null;
  return row;
}

export function freezeResumeSnapshot(store, posting, { name, fit }, clock = Date.now, random = Math.random) {
  const trimmed = asString(name, SNAPSHOT_NAME_MAX);
  if (!trimmed) throw new Error('Snapshot name is required.');
  if (!posting?.id) throw new Error('Posting is required.');
  const compiled = compileResumeDoc(posting, store);
  const doc = freezeCompiledDoc(compiled);
  const snapshot = normalizeResumeSnapshot({
    v: RESUME_SNAPSHOT_SCHEMA,
    id: makeId('rs', clock, random),
    name: trimmed,
    initialName: trimmed,
    savedAt: nowIso(clock),
    sourcePostingId: posting.id,
    sourcePosting: {
      company: asString(posting.company, SNAPSHOT_NAME_MAX),
      title: asString(posting.title, SNAPSHOT_NAME_MAX),
    },
    renderer: {
      template: 'classic-serif',
      templateVersion: 1,
      fontFamily: TOKENS.font.family,
      fontHref: CALADEA_HREF,
    },
    doc,
    fit: normalizeFit(fit),
    events: [],
    recoveryCopies: [],
  }, clock, random);
  return snapshot;
}

export function renameResumeSnapshotRecord(snapshot, name, clock = Date.now, random = Math.random) {
  const trimmed = asString(name, SNAPSHOT_NAME_MAX);
  if (!trimmed || !snapshot) return snapshot;
  const event = {
    id: makeId('rse', clock, random),
    kind: 'rename',
    at: nowIso(clock),
    name: trimmed,
  };
  const next = {
    ...snapshot,
    events: normalizeEvents([...(snapshot.events || []), event], clock, random),
  };
  next.name = snapshotDisplayName(next);
  return next;
}

export function deleteResumeSnapshotRecord(snapshot, clock = Date.now, random = Math.random) {
  if (!snapshot) return snapshot;
  const event = {
    id: makeId('rse', clock, random),
    kind: 'delete',
    at: nowIso(clock),
  };
  const next = {
    ...snapshot,
    events: normalizeEvents([...(snapshot.events || []), event], clock, random),
  };
  next.name = snapshotDisplayName(next);
  return next;
}

function mergeRecoveryCopies(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const copy of list || []) {
      if (!copy) continue;
      const key = recoveryIdentity(copy);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(structuredClone(copy));
    }
  }
  return out;
}

export function mergeResumeSnapshotRecord(base, local, remote) {
  if (!local && !remote) return null;
  if (!local) return structuredClone(remote);
  if (!remote) return structuredClone(local);
  const canonical = structuredClone(local);
  const recoveryCopies = mergeRecoveryCopies(
    base?.recoveryCopies,
    local.recoveryCopies,
    remote.recoveryCopies,
  );
  const localDoc = JSON.stringify(local.doc);
  const remoteDoc = JSON.stringify(remote.doc);
  if (localDoc !== remoteDoc) {
    recoveryCopies.push(structuredClone(remote));
  }
  if (base && JSON.stringify(base.doc) !== localDoc && JSON.stringify(base.doc) !== remoteDoc) {
    recoveryCopies.push(structuredClone(base));
  }
  const events = normalizeEvents(
    [...(base?.events || []), ...(local.events || []), ...(remote.events || [])],
    Date.now,
    Math.random,
  );
  return {
    ...canonical,
    events,
    recoveryCopies: mergeRecoveryCopies(recoveryCopies),
    name: snapshotDisplayName({ ...canonical, events }),
  };
}

export function mergeResumeSnapshotLists(base, local, remote) {
  const ids = new Set();
  for (const list of [base, local, remote]) {
    for (const row of list || []) {
      if (row?.id) ids.add(row.id);
    }
  }
  const out = [];
  for (const id of ids) {
    const merged = mergeResumeSnapshotRecord(
      (base || []).find((row) => row.id === id),
      (local || []).find((row) => row.id === id),
      (remote || []).find((row) => row.id === id),
    );
    if (merged) out.push(merged);
  }
  return out;
}

export function preserveResumeSnapshotLists(incoming, current) {
  const saved = Array.isArray(current) ? current : [];
  const next = Array.isArray(incoming) ? incoming : [];
  if (!saved.length) return next;
  return mergeResumeSnapshotLists([], next, saved);
}
