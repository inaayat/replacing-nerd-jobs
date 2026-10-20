/**
 * Pre-Experiences backward-compat fingerprints for resume surfaces.
 * Browser-safe ESM — gate every Experiences phase on unchanged output here.
 */

import {
  activeResumeSnapshots,
  compileResumeDoc,
  postingById,
  resumeSnapshotToDoc,
} from './engine.js';
import { renderResumeHtml, resumeDocument } from './resume-template.js';

function stableStringify(value) {
  return JSON.stringify(value);
}

function postingResumeVariant(posting) {
  if (!posting?.resume) return null;
  const { updatedAt, fit, ...rest } = posting.resume;
  return { ...rest, fit: fit ? { ...fit } : null };
}

/** Stored resume-related book slices (excludes experience metadata and profile). */
export function resumePersistentRecords(store) {
  return {
    jobs: store?.jobs ?? [],
    education: store?.education ?? [],
    credentials: store?.credentials ?? [],
    additional: store?.additional ?? [],
    resumeSettings: store?.resumeSettings ?? null,
    basicsBackup: store?.basicsBackup ?? null,
    postings: (store?.postings ?? []).map((posting) => ({
      id: posting.id,
      title: posting.title,
      company: posting.company,
      resume: postingResumeVariant(posting),
      requirements: posting.requirements,
    })),
    resumeSnapshots: (store?.resumeSnapshots ?? []).map((row) => ({
      id: row.id,
      v: row.v,
      name: row.name,
      savedAt: row.savedAt,
      sourcePostingId: row.sourcePostingId,
      fit: row.fit,
      doc: row.doc,
      deletedAt: row.deletedAt,
    })),
  };
}

function compileHtml(store, posting) {
  const fit = posting?.resume?.fit;
  const droppedBulletIds = fit?.droppedBulletIds || [];
  const doc = compileResumeDoc(posting, store);
  const previewHtml = renderResumeHtml(doc, { droppedBulletIds });
  const printHtml = resumeDocument(previewHtml, { fittedVars: fit?.vars || {} });
  return {
    editorDoc: stableStringify(doc),
    previewHtml,
    printHtml,
  };
}

/** Editor compile + preview/print HTML for basics, postings, and saved snapshots. */
export function resumeRenderSignatures(store) {
  const signatures = {
    basics: compileHtml(store, null),
    postings: {},
    snapshots: {},
  };
  for (const posting of store?.postings || []) {
    if (!posting?.id) continue;
    signatures.postings[posting.id] = compileHtml(store, posting);
  }
  for (const snapshot of activeResumeSnapshots(store)) {
    const doc = resumeSnapshotToDoc(snapshot);
    const fit = snapshot.fit || {};
    const previewHtml = renderResumeHtml(doc, { droppedBulletIds: fit.droppedBulletIds || [] });
    signatures.snapshots[snapshot.id] = {
      editorDoc: stableStringify(doc),
      previewHtml,
      printHtml: resumeDocument(previewHtml, { fittedVars: fit.vars || {} }),
    };
  }
  return signatures;
}

export function assertResumeBackwardCompatEqual(before, after, label = '') {
  const prefix = label ? `${label}: ` : '';
  const beforeRecords = stableStringify(resumePersistentRecords(before));
  const afterRecords = stableStringify(resumePersistentRecords(after));
  if (beforeRecords !== afterRecords) {
    throw new Error(`${prefix}resume persistent records changed after upgrade`);
  }
  const beforeRender = resumeRenderSignatures(before);
  const afterRender = resumeRenderSignatures(after);
  if (stableStringify(beforeRender) !== stableStringify(afterRender)) {
    throw new Error(`${prefix}resume render signatures changed after upgrade`);
  }
}
