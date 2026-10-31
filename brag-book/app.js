import { buildExperiencesPanel } from './experiences-panel.js';
import { buildExperiencePicker } from './experience-picker.js';
import {
  buildExperienceCreateForm,
  buildBulkExperienceBar,
  bulkAssignEntriesToExperience,
} from './experiences-forms.js';
import {
  pruneOrphanExperiences,
  forgetSessionEmptyExperience,
  rememberSessionEmptyExperience,
  selectedEntriesJobIds,
  compactLooseBulletPanelGroups,
  postingPrimaryCatalogJobId,
  panelLooseSectionPageKey,
  readPanelLooseSectionOpen,
  writePanelLooseSectionOpen,
} from './experiences-index.js';
import {
  experiencesUiEnabled,
  readPanelCollapsed,
  writePanelCollapsed,
  librarySectionKey,
  libraryCollapsibleSectionKeys,
  readCollapsedLibrarySectionsFromSession,
  writeCollapsedLibrarySectionsToSession,
  catalogSectionsAllCollapsed,
} from './experiences-ui.js';
import { experiencesDualColumnMediaQuery } from './experiences-layout.js';
import {
  buildRequirementMappingStack,
  buildPostingMapSearchResults,
  appendPostingMapSearchCreateRows,
  requirementBucketKey,
  postingMapAddBulletFocusKey,
  mapExperienceBucketToRequirement,
  mapEntryToRequirement,
  searchPostingMapTargets,
} from './posting-requirement-mapping-ui.js';
import {
  idempotentAddEntryToPostingResume,
  requirementHasMapping,
} from './posting-requirement-mapping.js';
import { buildPostingExperienceView } from './posting-experience-view-ui.js';
import { refreshFloatingOverlays } from './floating-overlay.js';
import {
  STORE_KEY,
  POSTING_STATUSES,
  postingStatus,
  postingStatusLabel,
  sortPostingsByStatus,
  SAMPLE_JD,
  emptyStore,
  normalizeStore,
  addEntry,
  addEntries,
  updateEntry,
  deleteEntry,
  addKnowledge,
  addKnowledgeNotes,
  updateKnowledge,
  deleteKnowledge,
  addPosting,
  updatePosting,
  deletePosting,
  addRequirement,
  addRequirements,
  updateRequirement,
  deleteRequirement,
  addEntryBullet,
  createEntryBullet,
  updateBullet,
  deleteBullet,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  answerQuestionFromEntry,
  parseRequirements,
  parseExperiences,
  parseKnowledge,
  cleanPastedText,
  searchEntries,
  searchKnowledge,
  experienceCatalog,
  experienceCatalogGroups,
  libraryCatalogGroups,
  experienceRequirementCoverageCount,
  groupEntriesAsExperience,
  renameExperience,
  ungroupExperience,
  swapPostingResumeExperienceVersion,
  experienceVersionSwapMenu,
  experienceById,
  createExperience,
  draftExperienceVersion,
  experienceVersions,
  moveEntryToExperience,
  removeEntryFromExperience,
  experienceDetailPatch,
  postingsUsingEntry,
  KNOWLEDGE_SAVE_MS,
  noteKnowledgeInput,
  mergeBook,
  suggestEntries,
  linkedEntries,
  bulletEntry,
  linkedBulletLine,
  compileResumeText,
  resumeTextToWordHtml,
  compileResumeDoc,
  compileResumePreviewDoc,
  compiledRoleShowsDuplicateWarning,
  applyImportedResume,
  careerNeedsSeed,
  seedStarterResume,
  updatePostingResume,
  replacePostingResume,
  updateCareerJob,
  moveCareerJob,
  addCareerJob,
  deleteCareerJob,
  addCareerGroup,
  deleteCareerGroup,
  deleteCareerBullet,
  moveCareerBullet,
  moveCareerGroup,
  stepResumeBullet,
  applyResumeDrag,
  moveDragRow,
  dropIndexAtY,
  addResumeGroup,
  removeResumeGroup,
  moveResumeGroup,
  updatePostingLocalJob,
  deletePostingLocalJob,
  addPostingLocalGroup,
  deletePostingLocalGroup,
  deletePostingLocalBullet,
  movePostingLocalBullet,
  movePostingLocalGroup,
  movePostingJob,
  addPostingLocalEducation,
  updatePostingLocalEducation,
  deletePostingLocalEducation,
  addPostingLocalCredential,
  updatePostingLocalCredential,
  deletePostingLocalCredential,
  addPostingLocalAdditional,
  deletePostingLocalAdditional,
  startPostingResumeFresh,
  resetPostingResumeToBasics,
  choosePostingResumeMode,
  localJobById,
  updateResumeSettings,
  updateEducationItem,
  addEducationItem,
  deleteEducationItem,
  moveEducationItem,
  updateCredentialItem,
  addCredentialItem,
  deleteCredentialItem,
  moveCredentialItem,
  addAdditionalRow,
  deleteAdditionalRow,
  moveAdditionalRow,
  editResumeAdditionalRow,
  additionalValueSpans,
  spansToMarkdown,
  isResumeDoc,
  visibleResumeDoc,
  moveKey,
  toggleId,
  clearJobTitle,
  hideResumeRow,
  restoreHiddenResumeRows,
  hiddenResumeRowCount,
  replaceBasicsWithPosting,
  restorePreviousBasics,
  basicsReplaceConfirm,
  basicsRestoreConfirm,
  hasBasicsBackup,
  libraryBulletChoices,
  placeLibraryBullet,
  assignEntryJob,
  placeJobOnResume,
  addPostingResumeJob,
  catalogJobIdsOnPostingResume,
  suggestJobSetup,
  applyJobSetup,
  dismissJobSetup,
  resumeTakenEntryIds,
  visibleResumeBullets,
  adoptCompiledJob,
  resumeBulletSpans,
  applyResumeBulletEdit,
  createSharedBullet,
  saveSharedBullet,
  DEFAULT_SECTION_ORDER,
  compilePrep,
  prepCoverage,
  unmappedPostingResumeBullets,
  listingSummary,
  postingsByRecentActivity,
  starFill,
  bookIsEmpty,
  BOOK_MAX_CHARS,
  serializeBook,
  saveResumeSnapshot,
  startPostingResumeFromSnapshot,
  postingResumeOverwriteConfirm,
  renameResumeSnapshot,
  deleteResumeSnapshot,
  resumeSnapshotById,
  activeResumeSnapshots,
  resumeSnapshotToDoc,
  defaultResumeSnapshotName,
  asUrl,
  titleFromJobUrl,
  hostFromJobUrl,
  updateProfile,
  normalizeBookRevision,
  accountStoreKey,
  accountOutboxKey,
  LOCAL_STORE_KEY,
  shouldPullRemoteBook,
  shouldBlockEmptyOverwrite,
  roleIsCollapsed,
  toggleRoleCollapsed,
  resumeRoleSummary,
  isRoleHeaderToggleTarget,
} from './engine.js';
import { renderResumeHtml, resumeDocument } from './resume-template.js';
import {
  buildBookExportDocument,
  exportBookJsonFilename,
  exportBookJsonText,
} from './book-export.js';
import {
  fitOnePage,
  dropOrderFromDoc,
  applyDroppedIds,
  droppedBulletLabels,
  fitStatusLine,
  PAGE_HEIGHT_PX,
  RESUME_PAGE_WIDTH_PX,
  resumePreviewScale,
  resumePreviewWrapHeight,
  resumeEditorMaxHeight,
} from './resume-fit.js';
import { resumeDocxBlob } from './resume-docx.js';
import { parseViewHash, viewHash, viewTitle } from './routes.js';
import { bookPagePlan, experienceRowSpec, sharedBulletSpec, SHARED_BULLET_FIELDS, STAR_FIELDS, experienceAdderChrome, nextExperienceAdderOpen, resumeBulletArrows, resumeGroupChrome, visibleNodes, homeStartCards, JOB_CATALOG_SAVE_MS, jobCatalogEditEffects, jobCatalogFocusKeys, requirementPager, visibleRequirementRows, nextRequirementIndex, prevRequirementIndex, clampRequirementIndex, requirementPagerQuery } from './book-view.js';
import {
  applyKnowledgeEnter,
  applyKnowledgeHeadingBreak,
  applyKnowledgeHeadingMarker,
  applyKnowledgeListMarker,
  applyKnowledgeMarkdownTables,
  applyKnowledgeTab,
  groupKnowledgeBlocks,
  insertKnowledgeBlocks,
  knowledgeDocForEditor,
  knowledgeDocFromLegacy,
  knowledgeEditEffects,
  knowledgeMarkShortcut,
  knowledgePasteDoc,
  knowledgePlainText,
  knowledgeRichSpans,
  normalizeKnowledgeDoc,
  setKnowledgeHeading,
} from './knowledge-doc.js';
import { loadBook, saveBook } from './store.js';
import {
  createBookSaveController,
  mergeConcurrentBooks,
  retainLocalConflictValues,
} from './save-controller.js';
import { initAuth, refreshToken, renderBragSignIn, wireAuthLink } from './auth.js';
import './engine/pwa.js';
import { initBragBookPwa } from './pwa.js';

/** False while offline — editor is read-only; mid-save outbox still flushes on reconnect. */
let networkOnlineForEdits = true;

const root = document.getElementById('app');
const localMode = new URLSearchParams(location.search).has('local');
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'application/json';
fileInput.hidden = true;
document.body.appendChild(fileInput);
const resumeFileInput = document.createElement('input');
resumeFileInput.type = 'file';
resumeFileInput.accept = 'application/json';
resumeFileInput.hidden = true;
document.body.appendChild(resumeFileInput);

let store = emptyStore();
let auth = null;
let unlocked = false;
let bookRevision = null;
let lastServerBook = null;
let saveController = null;
let bookPushing = false;
let cacheUserId = '';
let outboxBaseBook = null;
let syncConflict = null;
let legacyBrowserBackup = null;
let saveStatusNote = '';
let query = '';
let knowledgeQuery = '';
let knowledgeSaveState = null;
let statusNote = '';
let expandedBulletKey = '';
let expandedAdderKey = '';
let draftResumeGroupId = '';
let resumeRowDrag = null;
let collapsedResumeRoles = [];
let pendingJobEntryId = '';
let questionComposerKey = '';
const openQuestionIds = new Set();
let resumeFit = { fits: true, fontPt: 10, bulletLineHeight: 1.32, droppedBulletIds: [], droppedLabels: [], pinnedBlocked: false, overflowPx: 0, vars: {} };
let resumePreviewTimer = null;
let resumeFitPostingId = null;
let resumeSnapshotSaveOpen = null;
let resumeSnapshotStartOpen = null;
/** Posting still on the first-time resume chooser: pick a saved copy inline. */
let resumeSnapshotChooserOpen = null;
let resumeSnapshotApplyToPostingId = null;
let resumeSnapshotRenameOpen = null;
/** Posting ids with the unmapped resume panel expanded this session (not persisted). */
const unmappedResumePanelExpanded = new Set();
/** Resume bullet entry ids with STAR expanded this session (not persisted). */
const expandedExperienceStar = new Set();
const expandedExperienceDetails = new Set();
const expandedExperienceNotes = new Set();
/** Role group keys collapsed this session (`jobId` or `__none__`). */
const collapsedExperienceGroups = new Set();
/** Experience / loose subsection keys within a job group (Experiences UI). */
const collapsedLibrarySections = new Set();
/** Multi-select for Group as experience / panel add-to-resume. */
const selectedCatalogEntryIds = new Set();
const collapsedExpPanelJobs = new Set();
const collapsedExpPanelExperiences = new Set();
const collapsedExpPanelLooseSummary = new Set();
let experiencesPanelQuery = '';
let experiencesPanelJobFilter = '';
/** Entry id chosen in Experiences panel for requirement mapping on a posting. */
let postingMapTargetEntryId = '';
/** @type {{ kind: 'experience', experienceId: string } | { kind: 'bullet', entryId: string } | null} */
let postingMapPick = null;
const requirementMapSearchByKey = new Map();
const requirementMapSearchActiveByKey = new Map();
const POSTING_REQ_VIEW_MODE_KEY = 'bb-posting-req-view';
/** Requirement row to scroll/highlight after jumping from By experience view. */
let postingRequirementHighlightReqId = '';
/** Last viewed requirement index per posting (session only). */
const requirementPagerIndexByJob = {};

function readPostingRequirementViewMode(postingId) {
  try {
    return sessionStorage.getItem(`${POSTING_REQ_VIEW_MODE_KEY}:${postingId}`) === 'experience'
      ? 'experience'
      : 'requirement';
  } catch {
    return 'requirement';
  }
}

function writePostingRequirementViewMode(postingId, mode) {
  try {
    sessionStorage.setItem(`${POSTING_REQ_VIEW_MODE_KEY}:${postingId}`, mode);
  } catch { /* ignore */ }
}

function jumpToRequirementFromExperienceView(postingId, reqId) {
  writePostingRequirementViewMode(postingId, 'requirement');
  postingRequirementHighlightReqId = reqId;
  const job = store.postings.find((item) => item.id === postingId);
  const index = job?.requirements?.findIndex((req) => req.id === reqId);
  if (index >= 0) requirementPagerIndexByJob[postingId] = index;
  render({ preserveScroll: true });
}

function clearOtherRequirementMapSearches(keepKey) {
  for (const key of requirementMapSearchByKey.keys()) {
    if (key === keepKey) continue;
    requirementMapSearchByKey.set(key, '');
    requirementMapSearchActiveByKey.set(key, -1);
  }
}
let experiencesPanelSearchActiveIndex = -1;
const expandedRequirementBuckets = new Set();
/** After + Add bullet, focus the new version editor (`post-map-version-<entryId>`). */
let postingMapFocusVersionEntryId = '';
let catalogBulkSelectMode = false;
let openExperiencePickerEntryId = '';
let experiencePickerSearch = '';
let experiencePickerActiveIndex = -1;
let experiencePickerCreateFormOpen = false;
let activePanelExperienceId = '';
let activePanelLooseEntryId = '';
let panelDragOverExperienceId = '';
let panelExperienceCreateOpen = false;
let experienceRenameId = '';
let experienceUngroupPendingId = '';
let experienceSectionMenuId = '';
let bulkAddMenuOpen = false;
let bulkAddSearch = '';
let bulkAddActiveIndex = -1;
let bulkAddCreateOpen = false;
/** @type {{ postingId: string, bulletId: string, toEntryId: string } | null} */
let versionSwapTransferPick = null;
/** Jobs catalog on Resume bullets expanded this session (not persisted). */
let jobsCatalogExpanded = false;
let experiencesMobileDrawerOpen = false;
/** Resume bullet id with the Versions ▾ menu open (session only). */
let expandedVersionSwapBulletId = '';

function mediaMatches(query) {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function storeCacheKey() {
  if (localMode) return LOCAL_STORE_KEY;
  return accountStoreKey(cacheUserId);
}

function loadCached() {
  try {
    let raw = localStorage.getItem(storeCacheKey());
    if (!raw && localMode) raw = localStorage.getItem(STORE_KEY);
    return pruneOrphanExperiences(normalizeStore(JSON.parse(raw || 'null')));
  } catch {
    return emptyStore();
  }
}

function loadLegacyBrowserBackup() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const backup = normalizeStore(JSON.parse(raw || 'null'));
    return bookIsEmpty(backup) ? null : backup;
  } catch {
    return null;
  }
}

function withStarterCareer(next) {
  return careerNeedsSeed(next) ? seedStarterResume(next) : next;
}

function cacheStore({ warnOnFailure = false } = {}) {
  const payload = JSON.stringify(store);
  try {
    localStorage.setItem(storeCacheKey(), payload);
    if (localMode) localStorage.setItem(STORE_KEY, payload);
  } catch {
    if (warnOnFailure) setNote('Could not mirror this edit in browser storage. Cloud save will continue.');
  }
}

function readOutbox() {
  const key = accountOutboxKey(cacheUserId);
  if (!key) return null;
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeOutbox(snapshot) {
  const key = accountOutboxKey(cacheUserId);
  if (!key || !snapshot) return;
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    setNote('Could not mirror this edit in browser storage. Cloud save will continue.');
  }
}

function clearOutboxStorage() {
  const key = accountOutboxKey(cacheUserId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    setNote('Saved to the cloud, but could not clear the browser recovery copy.');
  }
}

function rememberServerBook(data) {
  bookRevision = data?.revision ?? normalizeBookRevision(data?.updatedAt);
  if (data?.book) {
    lastServerBook = normalizeStore(data.book);
    outboxBaseBook = lastServerBook;
  }
  saveController?.setRevision(bookRevision);
}

function paintSaveStatus(payload) {
  const status = typeof payload === 'string' ? payload : payload?.status;
  if (status === 'saved') {
    paintKnowledgeStatus('Saved');
    saveStatusNote = 'Saved to your account.';
  } else if (status === 'saving' || status === 'dirty') {
    paintKnowledgeStatus('Saving…');
  } else if (status === 'retrying' || status === 'error') {
    const message = payload?.message || 'Couldn\'t save — retrying…';
    paintKnowledgeStatus(message);
    saveStatusNote = message;
  } else if (status === 'conflict') {
    paintKnowledgeStatus('Not saved — review conflict');
    saveStatusNote = payload?.message || 'Another tab saved different text. Your edits are kept on this device.';
    paintSyncConflictNotice();
  }
  const legal = document.querySelector('.legal');
  if (legal && !localMode && auth?.token) {
    legal.textContent = status === 'saved'
      ? 'Saved to your account.'
      : (saveStatusNote || 'Saving to your account…');
  }
}

function ensureSaveController() {
  if (saveController) return saveController;
  saveController = createBookSaveController({
    initialRevision: bookRevision,
    save: performCloudSave,
    persistPending: (snapshot) => {
      writeOutbox({
        userId: cacheUserId,
        baseRevision: bookRevision,
        baseBook: outboxBaseBook || lastServerBook || store,
        book: snapshot.book,
        localVersion: snapshot.localVersion,
        updatedAt: new Date().toISOString(),
      });
      cacheStore({ warnOnFailure: true });
    },
    clearPending: clearOutboxStorage,
    onStatus: paintSaveStatus,
    onConflict: reconcileSaveConflict,
  });
  return saveController;
}

function reconcileSaveConflict(error, localBook) {
  const remote = normalizeStore(error.book);
  const base = error.baseBook ? normalizeStore(error.baseBook) : (outboxBaseBook || lastServerBook || remote);
  const merged = mergeConcurrentBooks(base, localBook, remote);
  rememberServerBook({
    book: remote,
    revision: error.revision,
    updatedAt: error.updatedAt,
  });
  if (!merged.conflicts.length) {
    syncConflict = null;
    store = normalizeStore(merged.book);
    cacheStore({ warnOnFailure: true });
    return { book: store, conflicts: [], retry: true };
  }
  store = normalizeStore(retainLocalConflictValues(merged.book, merged.conflicts));
  syncConflict = {
    remote,
    revision: error.revision,
    updatedAt: error.updatedAt,
    conflicts: merged.conflicts,
  };
  cacheStore({ warnOnFailure: true });
  return { book: store, conflicts: merged.conflicts, retry: false };
}

async function performCloudSave(request) {
  if (localMode || !auth?.token) return { revision: bookRevision, book: store };
  if (shouldBlockEmptyOverwrite(request.book, lastServerBook)) {
    const latest = await loadBook(auth.token);
    throw Object.assign(new Error('Save blocked because the account copy is not empty. Your local copy is preserved.'), {
      status: 409,
      conflict: true,
      book: latest.book,
      updatedAt: latest.updatedAt,
      revision: latest.revision,
      baseBook: outboxBaseBook || lastServerBook || normalizeStore(latest.book),
    });
  }
  let token = auth.token;
  const attempt = async () => saveBook(token, request.book, {
    keepalive: request.keepalive,
    revision: request.revision,
    updatedAt: normalizeBookRevision(request.revision) ? null : bookRevision,
  });
  try {
    const data = await attempt();
    rememberServerBook(data);
    return { revision: data.revision, book: data.book };
  } catch (err) {
    if (err.status === 401 && auth?.client) {
      await refreshToken(auth);
      token = auth.token;
      const data = await saveBook(token, request.book, {
        keepalive: request.keepalive,
        revision: request.revision,
      });
      rememberServerBook(data);
      return { revision: data.revision, book: data.book };
    }
    if (err.status === 409) {
      const latest = err.book
        ? { book: err.book, updatedAt: err.updatedAt, revision: err.revision }
        : await loadBook(auth.token);
      const remote = normalizeStore(latest.book);
      const base = outboxBaseBook || lastServerBook || remote;
      throw Object.assign(new Error('Another tab saved different text. Your edits are kept on this device.'), {
        status: 409,
        conflict: true,
        book: latest.book,
        updatedAt: latest.updatedAt,
        revision: latest.revision,
        baseBook: base,
      });
    }
    throw err;
  }
}

function saveStore() {
  cacheStore({ warnOnFailure: true });
  if (localMode || !auth?.token) return;
  if (!networkOnlineForEdits) return;
  ensureSaveController().markDirty(store);
}

async function flushSave(reason = 'blur', { keepalive = false } = {}) {
  if (localMode || !auth?.token) return true;
  return ensureSaveController().flush(reason, store, { keepalive });
}

async function adoptServerBook(data, note) {
  store = normalizeStore(data.book);
  rememberServerBook(data);
  outboxBaseBook = lastServerBook;
  cacheStore();
  saveController?.setConfirmed(store, bookRevision);
  render();
  if (note) setNote(note);
}

async function pushStore(options = {}) {
  if (bookPushing) {
    return flushSave(options.keepalive ? 'pagehide' : 'blur', { keepalive: options.keepalive });
  }
  bookPushing = true;
  try {
    return await flushSave(options.keepalive ? 'pagehide' : 'blur', { keepalive: options.keepalive });
  } finally {
    bookPushing = false;
  }
}

async function pullBookIfClean() {
  if (localMode || !auth?.token || !unlocked) return;
  const controller = saveController;
  const dirty = controller ? controller.state.localVersion > controller.state.confirmedVersion : false;
  const visible = !document.visibilityState || document.visibilityState === 'visible';
  if (!shouldPullRemoteBook({
    dirty,
    persistPending: dirty || controller?.state.status === 'saving',
    pushing: controller?.state.status === 'saving',
    visible,
  })) return;
  try {
    const data = await loadBook(auth.token);
    if (!shouldPullRemoteBook({
      dirty,
      persistPending: dirty || controller?.state.status === 'saving',
      pushing: controller?.state.status === 'saving',
      visible: !document.visibilityState || document.visibilityState === 'visible',
    })) return;
    if (data.created) return;
    const remoteRev = data.revision ?? normalizeBookRevision(data.updatedAt);
    if (remoteRev != null && remoteRev === bookRevision) return;
    if (remoteRev == null && bookRevision == null) return;
    await adoptServerBook(data, 'Loaded a newer copy saved elsewhere.');
  } catch {
    /* keep the local copy if the cloud is unavailable */
  }
}

function resumeOutboxAfterBoot(remote, data) {
  const outbox = readOutbox();
  if (!outbox?.book || outbox.userId !== cacheUserId) return remote;
  const base = outbox.baseBook ? normalizeStore(outbox.baseBook) : remote;
  const merged = mergeConcurrentBooks(base, outbox.book, remote);
  outboxBaseBook = remote;
  store = normalizeStore(
    merged.conflicts.length
      ? retainLocalConflictValues(merged.book, merged.conflicts)
      : merged.book,
  );
  bookRevision = data.revision ?? bookRevision;
  if (merged.conflicts.length) {
    syncConflict = {
      remote,
      revision: bookRevision,
      updatedAt: data.updatedAt,
      conflicts: merged.conflicts,
    };
    ensureSaveController().restorePending(store, {
      nextRevision: bookRevision,
      restoredVersion: outbox.localVersion,
      conflictMessage: 'Another tab saved different text. Your edits are kept on this device.',
    });
  } else {
    ensureSaveController().markDirty(store);
    void flushSave('navigation');
  }
  return store;
}

function currentView() {
  return parseViewHash(location.hash, {
    entryIds: store.entries.map((entry) => entry.id),
    postingIds: store.postings.map((job) => job.id),
    knowledgeIds: (store.knowledge || []).map((note) => note.id),
    snapshotIds: (store.resumeSnapshots || []).map((row) => row.id),
  });
}

function go(view) {
  void flushSave('navigation');
  const hash = viewHash(view);
  if (location.hash === hash) render();
  else location.hash = hash;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'ref' && typeof value === 'function') value(node);
    else if (key === 'checked' || key === 'hidden' || key === 'disabled' || key === 'selected') node[key] = Boolean(value);
    else if (key === 'value' && 'value' in node) node.value = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function btn(label, attrs) {
  return el('button', { type: 'button', class: 'btn', ...attrs }, label);
}

function field(label, control) {
  return el('label', { class: 'field' }, [el('span', {}, label), control]);
}

function displayExperienceLine(text) {
  return String(text || '').replace(/^\s*[-*•–—●▪‣∙]\s+/, '').trim() || String(text || '').trim();
}

function richPreview(className, text, rich) {
  const shown = displayExperienceLine(text);
  const node = el('div', { class: className });
  const useRich = shown === String(text || '').trim() ? rich : null;
  fillRich(node, useRich, shown);
  return node;
}

function fillRich(node, rich, plain) {
  node.replaceChildren();
  const spans = rich?.length ? rich : [{ text: plain || '', bold: false }];
  for (const span of spans) {
    const parts = String(span.text || '').split('\n');
    parts.forEach((part, index) => {
      if (part) {
        let painted = document.createTextNode(part);
        if (span.italic) {
          const em = document.createElement('em');
          em.append(painted);
          painted = em;
        }
        if (span.bold) {
          const strong = document.createElement('strong');
          strong.append(painted);
          painted = strong;
        }
        node.append(painted);
      }
      if (index < parts.length - 1) node.append(document.createElement('br'));
    });
  }
  node.dataset.empty = node.textContent.trim() ? 'false' : 'true';
}

function readRich(node) {
  const spans = [];
  const push = (text, bold, italic) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    if (last && last.bold === bold && Boolean(last.italic) === italic) last.text += text;
    else {
      const span = { text, bold };
      if (italic) span.italic = true;
      spans.push(span);
    }
  };
  const walk = (parent, bold, italic) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === 3) {
        push(child.nodeValue.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n'), bold, italic);
      } else if (child.nodeType === 1) {
        const tag = child.tagName;
        const weight = child.style?.fontWeight;
        const nextBold = bold || tag === 'B' || tag === 'STRONG' || weight === 'bold' || Number(weight) >= 600;
        const nextItalic = italic || tag === 'I' || tag === 'EM' || child.style?.fontStyle === 'italic';
        if (tag === 'BR') push('\n', bold, italic);
        else {
          if ((tag === 'DIV' || tag === 'P') && spans.length && !spans[spans.length - 1].text.endsWith('\n')) {
            push('\n', false, false);
          }
          walk(child, nextBold, nextItalic);
        }
      }
    }
  };
  walk(node, false, false);
  return spans;
}

function trimEditableTail(node) {
  const sel = document.getSelection();
  const caretInside = (el) => sel && node.contains(sel.anchorNode) && (el === sel.anchorNode || el.contains(sel.anchorNode));
  let child = node.lastChild;
  while (child) {
    const prev = child.previousSibling;
    const tag = child.nodeType === 1 ? child.tagName : '';
    const emptyBlock = tag === 'BR' || ((tag === 'DIV' || tag === 'P') && !child.textContent.replace(/\u00a0/g, '').trim());
    if (!emptyBlock || caretInside(child)) break;
    child.remove();
    child = prev;
  }
}

function caretOffset(node) {
  const sel = document.getSelection();
  if (!sel?.rangeCount || !node.contains(sel.anchorNode)) return (node.textContent || '').length;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(node);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

function setCaretOffset(node, offset) {
  const sel = document.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let left = Math.max(0, offset);
  let last = null;
  while (walker.nextNode()) {
    last = walker.currentNode;
    if (left <= last.nodeValue.length) {
      range.setStart(last, left);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    left -= last.nodeValue.length;
  }
  if (last) {
    range.setStart(last, last.nodeValue.length);
  } else {
    range.selectNodeContents(node);
  }
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function editableNeedsFlatten(node) {
  return [...node.childNodes].some((child) => {
    if (child.nodeType !== 1) return false;
    const tag = child.tagName;
    return tag !== 'BR' && tag !== 'STRONG' && tag !== 'B' && tag !== 'EM' && tag !== 'I';
  });
}

function insertPlainText(text) {
  if (document.execCommand('insertText', false, text)) return;
  const sel = document.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function tidySpans(spans) {
  const out = [];
  const push = (text, bold, italic) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.bold === bold && Boolean(last.italic) === italic) last.text += text;
    else {
      const span = { text, bold };
      if (italic) span.italic = true;
      out.push(span);
    }
  };
  let broke = false;
  for (const span of spans) {
    for (const bit of String(span.text || '').split(/(\n+)/)) {
      if (!bit) continue;
      if (/^\n+$/.test(bit)) {
        if (out.length) broke = true;
        continue;
      }
      if (broke) {
        push('\n', false, false);
        broke = false;
      }
      push(bit, Boolean(span.bold), Boolean(span.italic));
    }
  }
  while (out.length && /\n$/.test(out[out.length - 1].text)) {
    out[out.length - 1].text = out[out.length - 1].text.replace(/\n+$/, '');
    if (!out[out.length - 1].text) out.pop();
  }
  if (out[0]) out[0].text = out[0].text.replace(/^[ \t]*[-*•–—●▪‣∙][ \t]+/, '');
  return out.filter((span) => span.text);
}

function flattenEditable(node, offset) {
  const spans = tidySpans(readRich(node));
  const plain = spans.map((span) => span.text).join('');
  fillRich(node, spans.length ? spans : null, plain);
  setCaretOffset(node, offset ?? plain.length);
}

function bindRichKeys(node, { onChange, onSubmit, italic = false } = {}) {
  const changed = () => {
    trimEditableTail(node);
    node.dataset.empty = node.textContent.trim() ? 'false' : 'true';
    onChange?.(readRich(node));
  };
  node.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = cleanPastedText(event.clipboardData?.getData('text/plain') || '');
    if (!text) return;
    const start = caretOffset(node);
    insertPlainText(text);
    if (editableNeedsFlatten(node)) flattenEditable(node, start + text.length);
    changed();
  });
  node.addEventListener('focus', () => {
    if (!editableNeedsFlatten(node)) return;
    flattenEditable(node, caretOffset(node));
    changed();
  });
  node.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === 'b') {
      event.preventDefault();
      document.execCommand('bold');
      changed();
      return;
    }
    if (italic && (event.metaKey || event.ctrlKey) && key === 'i') {
      event.preventDefault();
      document.execCommand('italic');
      changed();
      return;
    }
    if (onSubmit && event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      onSubmit(readRich(node));
    }
  });
  node.addEventListener('input', changed);
}

function richLine(attrs, { text, rich, onChange, onSubmit, italic = false } = {}) {
  const node = el('div', { contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', ...attrs });
  fillRich(node, rich, text);
  bindRichKeys(node, { onChange, onSubmit, italic });
  return node;
}

function setNote(text) {
  statusNote = text;
  const node = document.getElementById('status-note');
  if (node) {
    node.textContent = text;
    if (syncConflict) paintSyncConflictNotice();
  }
}

function statusLine() {
  const node = el('p', { class: 'status', id: 'status-note' }, statusNote || '');
  if (syncConflict) fillSyncConflictNotice(node);
  return node;
}

function fillSyncConflictNotice(node) {
  node.replaceChildren(
    document.createTextNode('Another tab saved different text. Your edits are still here on this device. '),
    btn('Keep my edits', {
      class: 'btn ghost compact-action',
      onClick: async () => {
        const kept = syncConflict;
        syncConflict = null;
        setNote('Saving your kept edits…');
        const saved = await ensureSaveController().retryNow();
        if (saved) setNote('Saved your kept edits to your account.');
        else if (kept) syncConflict = kept;
      },
    }),
    document.createTextNode(' '),
    btn('Use saved copy', {
      class: 'btn ghost compact-action',
      onClick: () => {
        const conflict = syncConflict;
        syncConflict = null;
        if (!conflict) return;
        void adoptServerBook({
          book: conflict.remote,
          revision: conflict.revision,
          updatedAt: conflict.updatedAt,
        }, 'Loaded the copy already saved by the other tab.');
      },
    }),
  );
}

function paintSyncConflictNotice() {
  statusNote = 'Another tab saved different text. Your edits are still here on this device.';
  const node = document.getElementById('status-note');
  if (node) fillSyncConflictNotice(node);
}

function exportBookJson() {
  try {
    downloadText(exportBookJsonFilename(store), exportBookJsonText(store), 'application/json');
    setNote('Downloaded a JSON copy you can re-import with Import book.');
  } catch (err) {
    setNote(err?.message || 'Could not export JSON.');
  }
}

function exportBookPdf() {
  const html = buildBookExportDocument(store);
  const win = window.open('', '_blank');
  if (!win) {
    downloadText(`${exportBookJsonFilename(store).replace(/\.json$/i, '')}-export.html`, html, 'text/html');
    setNote('Download the HTML and use Print → Save as PDF.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  setNote('Use the print dialog → Save as PDF.');
}

function downloadLegacyBrowserBackup() {
  if (!legacyBrowserBackup) return;
  downloadText(
    'brag-book-browser-backup.json',
    JSON.stringify(legacyBrowserBackup, null, 2),
    'application/json',
  );
  setNote('Downloaded the older browser backup. Review it, then use Import book if it contains missing edits.');
}

function importStore(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || ''));
      const looksLikeBook = Array.isArray(data?.entries) || Array.isArray(data?.postings);
      if (isResumeDoc(data) && !looksLikeBook) {
        applyResumeImport(data);
        return;
      }
      store = normalizeStore(data);
      saveStore();
      go({ kind: 'home' });
      setNote('Imported the book.');
    } catch {
      setNote('That file was not a Brag Book JSON.');
    }
  };
  reader.readAsText(file);
}

function applyResumeImport(data) {
  store = applyImportedResume(store, data);
  saveStore();
  const posting = store.postings[0];
  if (posting) go({ kind: 'jobs', id: posting.id, mode: 'resume' });
  else go({ kind: 'profile' });
  setNote('Imported the resume. It is saved on this account. Open Resume on a posting to tailor a one-page copy.');
}

function importResumeFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || ''));
      if (!isResumeDoc(data)) {
        setNote('That file is not a resume JSON. Use the classic-serif schema (see brag-book/data/john-doe-resume.json).');
        return;
      }
      applyResumeImport(data);
    } catch {
      setNote('That file was not valid resume JSON.');
    }
  };
  reader.readAsText(file);
}

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadText(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function markSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'mark');
  svg.setAttribute('viewBox', '0 9 420 67');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <path class="arc" d="M8 70 C 70 70, 92 62, 126 48 S 186 18, 214 14 S 268 22, 302 40 S 368 70, 412 70"/>
    <circle cx="8" cy="70" r="3.5"/>
    <circle cx="214" cy="14" r="3.5"/>
    <circle cx="412" cy="70" r="3.5"/>
  `;
  return svg;
}

function countRow() {
  const summary = listingSummary(store);
  return el('div', { class: 'counts' }, [
    chip(summary.postings, 'postings'),
    chip(summary.entries, 'resume bullets'),
    chip(summary.knowledge || 0, 'pages'),
  ]);
}

function toolbar(view) {
  if (view.kind === 'home') return homeHero();
  if (view.kind === 'profile') {
    return el('header', { class: 'hero is-compact' }, [
      el('div', { class: 'hero-row' }, [
        el('div', { class: 'crumb' }, [
          el('button', {
            type: 'button',
            class: 'context-back',
            onClick: () => go({ kind: 'home' }),
          }, '← Start'),
          el('strong', { class: 'page-title' }, 'Resume basics'),
        ]),
        el('div', { class: 'actions' }, [
          btn('Saved resumes', { class: 'btn ghost compact-action', onClick: () => go({ kind: 'snapshots' }) }),
          btn('Import resume (JSON)', {
            class: 'btn ghost compact-action',
            onClick: () => resumeFileInput.click(),
          }),
        ]),
      ]),
      statusLine(),
    ]);
  }
  if (view.kind === 'snapshots') {
    return el('header', { class: 'hero is-compact' }, [
      el('div', { class: 'hero-row' }, [
        el('div', { class: 'crumb' }, [
          el('button', {
            type: 'button',
            class: 'context-back',
            onClick: () => go(view.id ? { kind: 'snapshots' } : { kind: 'home' }),
          }, view.id ? '← Saved resumes' : '← Start'),
          el('strong', { class: 'page-title' }, viewTitle(view, store)),
        ]),
      ]),
      statusLine(),
    ]);
  }
  const hasRecord = view.kind === 'jobs' && Boolean(view.id && view.id !== 'new');
  const pageTitle = viewTitle(view, store);
  return el('header', { class: 'hero is-compact' }, [
    el('div', { class: 'hero-row' }, [
      el('div', { class: 'crumb' }, [
        hasRecord
          ? el('button', {
            type: 'button',
            class: 'context-back',
            onClick: () => go({ kind: 'jobs' }),
          }, '← Job postings')
          : null,
        el('strong', { class: 'page-title' }, pageTitle),
      ]),
      el('div', { class: 'actions' }, [
        view.kind === 'jobs'
          ? btn('+ New posting', {
            class: 'btn ghost compact-action',
            onClick: () => go({ kind: 'jobs', id: 'new' }),
          })
          : null,
      ]),
    ]),
    statusLine(),
  ]);
}

function homeHero() {
  return el('header', { class: 'hero is-home' }, [
    el('p', { class: 'eyebrow' }, [el('span', { class: 'beta-pill' }, 'beta'), ' Interview prep']),
    el('h1', { class: 'mast-title' }, 'Brag Book'),
    markSvg(),
    el('p', { class: 'lede' }, 'Paste a job posting. Turn each requirement into a resume bullet, a question they might ask, and a STAR answer. Then copy a resume and walk the cue cards.'),
    countRow(),
    statusLine(),
  ]);
}

function homeView() {
  const summary = listingSummary(store);
  const recentJobs = postingsByRecentActivity(store, 4);
  const lineCount = summary.entries;
  const noteCount = summary.knowledge || 0;
  const snapshotCount = activeResumeSnapshots(store).length;
  const cards = homeStartCards();
  const cardBody = {
    postings: {
      className: 'start-card is-primary',
      kicker: 'The loop',
      title: store.postings.length ? 'Open a posting' : 'New job posting',
      copy: store.postings.length
        ? `${summary.postings} on file. Paste another, or keep adding experiences, questions, and STAR answers.`
        : 'Paste the description. We pull the requirements. You add an experience, a resume bullet, and a question with a STAR answer.',
      onClick: () => go({ kind: 'jobs', id: store.postings.length ? undefined : 'new' }),
    },
    resume: {
      className: 'start-card',
      kicker: 'One page',
      title: 'Resume basics',
      copy: store.jobs.length
        ? `${store.jobs.length} role${store.jobs.length === 1 ? '' : 's'} on the classic-serif resume. Edit the John Doe starter, import JSON, or tailor a posting copy.`
        : 'A John Doe starter fills the classic-serif page. Edit it, or import JSON, then open a posting to export a one-page PDF.',
      onClick: () => go({ kind: 'profile' }),
    },
    snapshots: {
      className: 'start-card',
      kicker: 'Point in time',
      title: 'Saved Resumes',
      copy: snapshotCount
        ? `${snapshotCount} saved cop${snapshotCount === 1 ? 'y' : 'ies'}. Open an immutable resume to print, download, rename, or remove it from the bank.`
        : 'Open the bank of immutable resume copies saved from job postings.',
      onClick: () => go({ kind: 'snapshots' }),
    },
    book: {
      className: 'start-card',
      kicker: 'The book',
      title: 'Resume bullets & knowledge',
      copy: lineCount || noteCount
        ? `${lineCount} resume line${lineCount === 1 ? '' : 's'} and ${noteCount} knowledge page${noteCount === 1 ? '' : 's'}. STAR, job, and role sit on each line.`
        : 'Resume lines with STAR, job, and role beside them, plus pages for what you learn about a job or a project.',
      onClick: () => go(cards.find((card) => card.combined).view),
    },
  };
  return el('div', {}, [
    el('div', { class: 'start-grid is-focus' }, cards.map((card) => {
      const body = cardBody[card.key];
      return el('button', {
        type: 'button',
        class: body.className,
        'data-home-card': card.key,
        onClick: body.onClick,
      }, [
        el('span', { class: 'kicker' }, body.kicker),
        el('strong', {}, body.title),
        el('p', {}, body.copy),
      ]);
    })),
    recentJobs.length ? el('section', { class: 'recent' }, [
      el('h2', {}, 'Recent postings'),
      el('div', { class: 'plot-cards' }, recentJobs.map((job) => {
        const cover = prepCoverage(store, job);
        return el('button', {
          type: 'button',
          class: 'plot-card',
          onClick: () => go({ kind: 'jobs', id: job.id }),
        }, [
          el('span', { class: 'kicker' }, postingStatusLabel(job.status)),
          el('strong', {}, job.title),
          el('p', {}, [job.company, cover.hints[0] || `${cover.withAnswer}/${cover.total || 0} answered`].filter(Boolean).join(' · ')),
        ]);
      })),
    ]) : null,
    el('div', { class: 'actions' }, [
      el('details', { class: 'bb-export-menu' }, [
        el('summary', { class: 'btn ghost' }, 'Export book'),
        el('div', { class: 'bb-export-menu-panel' }, [
          btn('Export as JSON', { class: 'btn ghost', onClick: (event) => { event.preventDefault(); exportBookJson(); } }),
          btn('Export as PDF', { class: 'btn ghost', onClick: (event) => { event.preventDefault(); exportBookPdf(); } }),
        ]),
      ]),
      btn('Import book', { class: 'btn ghost', onClick: () => fileInput.click() }),
      btn('Import resume (JSON)', { class: 'btn ghost', onClick: () => resumeFileInput.click() }),
      legacyBrowserBackup
        ? btn('Download older browser backup', {
          class: 'btn ghost',
          onClick: downloadLegacyBrowserBackup,
        })
        : null,
    ]),
  ]);
}

function chip(n, label) {
  return el('span', { class: 'chip' }, [el('strong', {}, String(n)), ` ${label}`]);
}

function patchEntry(id, patch) {
  const next = experienceDetailPatch(patch);
  if (!Object.keys(next).length) return;
  store = updateEntry(store, id, next);
  saveStore();
}

function cellInput(label, value, focusKey, onValue) {
  return el('input', {
    class: 'bb-cell-input',
    value: value || '',
    'aria-label': label,
    placeholder: label,
    'data-focus-key': focusKey,
    onInput: (event) => onValue(event.target.value),
  });
}

function experienceTools(view) {
  const addingLine = view.kind === 'log' && view.id === 'new';
  const allSectionsCollapsed = experiencesUiEnabled()
    && catalogSectionsAllCollapsed(store, collapsedLibrarySections);
  return el('div', { class: 'bb-exp-tools bb-action-row' }, [
    el('input', {
      class: 'search bb-exp-tools-search',
      type: 'search',
      placeholder: 'Search resume bullets, companies, STAR…',
      value: query,
      'aria-label': 'Search resume bullets',
      'data-focus-key': 'book-search',
      onInput: (event) => {
        query = event.target.value;
        const scroll = captureScroll();
        render({ focusKey: 'book-search', preserveScroll: true });
        restoreScroll(scroll);
      },
    }),
    experiencesUiEnabled()
      ? btn(catalogBulkSelectMode ? 'Done' : 'Select', {
        type: 'button',
        class: 'btn ghost compact-action',
        onClick: () => {
          catalogBulkSelectMode = !catalogBulkSelectMode;
          if (!catalogBulkSelectMode) {
            selectedCatalogEntryIds.clear();
            bulkAddMenuOpen = false;
            bulkAddCreateOpen = false;
            bulkAddSearch = '';
          }
          render({ preserveScroll: true });
        },
      })
      : null,
    experiencesUiEnabled() && libraryCollapsibleSectionKeys(store).length
      ? btn(allSectionsCollapsed ? 'Expand all' : 'Collapse all', {
        type: 'button',
        class: 'row-text-action bb-exp-catalog-collapse-all',
        onClick: () => setAllCatalogSectionsCollapsed(!allSectionsCollapsed),
      })
      : null,
    btn(addingLine ? 'Close' : '+ Add resume bullet', {
      class: 'btn ghost compact-action',
      onClick: () => go(addingLine ? { kind: 'log' } : { kind: 'log', id: 'new' }),
    }),
  ]);
}

function fitArea(node) {
  const fit = () => {
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight || 0}px`;
  };
  node.addEventListener('input', fit);
  queueMicrotask(fit);
}

function experienceLineCell(entry) {
  return richLine({
    class: 'experience-compose bb-exp-line',
    'aria-label': 'Resume line',
    'data-focus-key': `exp-line-${entry.id}`,
  }, {
    text: entry.title,
    rich: entry.rich,
    onChange: (spans) => {
      const text = spans.map((span) => span.text).join('');
      if (!text.trim()) return;
      patchEntry(entry.id, { title: text, rich: spans });
    },
  });
}

function experienceTextAction(label, { expanded, controls, className = '', onClick }) {
  return btn(label, {
    type: 'button',
    class: `row-text-action bb-exp-action${expanded ? ' is-on' : ''}${className ? ` ${className}` : ''}`,
    'aria-expanded': expanded ? 'true' : 'false',
    'aria-controls': controls,
    onClick: (event) => {
      event.preventDefault();
      onClick(event);
    },
  });
}

function flushExperienceNotesEdits(entry, article) {
  if (!entry || !article) return;
  const notes = article.querySelector(`[data-focus-key="exp-notes-${entry.id}"]`);
  if (!notes) return;
  const value = String(notes.value ?? '');
  if (value !== String(entry.notes || '')) patchEntry(entry.id, { notes: value });
}

function flushExperienceDetailsEdits(entry, article) {
  if (!entry || !article) return;
  const tags = article.querySelector(`[data-focus-key="exp-tags-${entry.id}"]`);
  if (tags) {
    const value = String(tags.value ?? '');
    const current = (entry.tags || []).join(', ');
    if (value !== current) patchEntry(entry.id, { tags: value });
  }
  const select = article.querySelector(`[data-focus-key="exp-jobId-${entry.id}"]`);
  if (select) {
    const value = String(select.value ?? '');
    if (value !== String(entry.jobId || '')) {
      store = saveSharedBullet(store, entry.id, { jobId: value });
      saveStore();
    }
  }
}

function flushExperienceEntryEdits(entry, article) {
  flushExperienceStarEdits(entry, article);
  flushExperienceNotesEdits(entry, article);
  flushExperienceDetailsEdits(entry, article);
}

function flushExperienceGroupEntries(group) {
  for (const row of group.rows || []) {
    const entry = (store.entries || []).find((item) => item.id === row.id);
    if (!entry) continue;
    const article = document.querySelector(`.bb-exp-row[data-entry-id="${entry.id}"]`);
    flushExperienceEntryEdits(entry, article);
  }
}

function toggleExperiencePanel(entry, article, kind) {
  const map = {
    star: expandedExperienceStar,
    details: expandedExperienceDetails,
    notes: expandedExperienceNotes,
  };
  const set = map[kind];
  if (!set) return;
  const open = set.has(entry.id);
  if (open) {
    if (kind === 'star') flushExperienceStarEdits(entry, article);
    else if (kind === 'notes') flushExperienceNotesEdits(entry, article);
    else flushExperienceDetailsEdits(entry, article);
    void flushSave('blur');
    set.delete(entry.id);
  } else {
    set.add(entry.id);
  }
  const scroll = captureScroll();
  render();
  restoreScroll(scroll);
}

function jobOptionLabel(job) {
  return [job.company, job.title].filter(Boolean).join(' · ') || 'Untitled job';
}

function sharedJobSelect({
  jobId = '',
  focusKey,
  pendingKey = '',
  onChange,
} = {}) {
  const pending = pendingJobEntryId === pendingKey && pendingKey;
  const select = el('select', {
    class: 'bb-job-select',
    'aria-label': 'Job',
    value: pending ? '__new__' : (jobId || ''),
    'data-focus-key': focusKey,
    onChange: (event) => {
      const value = event.target.value;
      if (value === '__new__') {
        pendingJobEntryId = pendingKey || '__draft__';
        render({ focusKey: `${focusKey}-company` });
        return;
      }
      pendingJobEntryId = pendingJobEntryId === pendingKey ? '' : pendingJobEntryId;
      onChange(value);
    },
  }, [
    el('option', { value: '', selected: !jobId || undefined }, 'Unassigned'),
    ...store.jobs.map((job) => el('option', {
      value: job.id,
      selected: jobId === job.id || undefined,
    }, jobOptionLabel(job))),
    el('option', { value: '__new__' }, '+ New job'),
  ]);
  if (!pending) return select;
  const company = el('input', {
    class: 'bb-cell-input',
    placeholder: 'Company',
    'aria-label': 'New job company',
    'data-focus-key': `${focusKey}-company`,
  });
  const title = el('input', {
    class: 'bb-cell-input',
    placeholder: 'Title',
    'aria-label': 'New job title',
    'data-focus-key': `${focusKey}-title`,
  });
  return el('div', { class: 'bb-new-job' }, [
    select,
    company,
    title,
    btn('Add job', {
      class: 'btn ghost compact-action',
      onClick: () => {
        const companyName = company.value.trim();
        const titleName = title.value.trim();
        if (!companyName && !titleName) return;
        store = addCareerJob(store, { company: companyName, title: titleName, onResume: false });
        const added = store.jobs[store.jobs.length - 1];
        pendingJobEntryId = '';
        if (added) onChange(added.id);
        else render();
      },
    }),
  ]);
}

function experienceJobSelect(entry) {
  return sharedJobSelect({
    jobId: entry.jobId || '',
    focusKey: `exp-jobId-${entry.id}`,
    pendingKey: entry.id,
    onChange: (value) => {
      store = saveSharedBullet(store, entry.id, { jobId: value });
      saveStore();
      render({ focusKey: `exp-jobId-${entry.id}` });
    },
  });
}

function sharedBulletForm(entry, {
  focusPrefix,
  showLine = false,
  showNotes = true,
  onPatch,
} = {}) {
  const spec = sharedBulletSpec(entry);
  const prefix = focusPrefix || `exp-${spec.id || 'draft'}`;
  const patch = (partial) => onPatch(partial);
  const star = STAR_FIELDS.map((item) => {
    const area = el('textarea', {
      class: 'bb-inline-area',
      rows: '2',
      'aria-label': item.label,
      placeholder: item.label,
      'data-focus-key': `${prefix}-${item.key}`,
      onInput: (event) => patch({ [item.key]: event.target.value }),
    }, spec[item.key] || '');
    fitArea(area);
    return field(item.label, area);
  });
  const notes = showNotes ? el('textarea', {
    class: 'bb-inline-area',
    rows: '2',
    'aria-label': 'Notes',
    placeholder: 'Extra color, links, or a longer version.',
    'data-focus-key': `${prefix}-notes`,
    onInput: (event) => patch({ notes: event.target.value }),
  }, spec.notes || '') : null;
  if (notes) fitArea(notes);
  const line = showLine ? richLine({
    class: 'experience-compose bb-exp-line',
    'aria-label': 'Resume line',
    'data-focus-key': `${prefix}-title`,
  }, {
    text: spec.title,
    rich: spec.rich,
    onChange: (spans) => {
      const text = spans.map((span) => span.text).join('');
      if (!text.trim()) return;
      patch({ title: text, rich: spans });
    },
  }) : null;
  return el('div', { class: 'bb-shared-bullet' }, [
    line,
    field('Job', sharedJobSelect({
      jobId: spec.jobId,
      focusKey: `${prefix}-jobId`,
      pendingKey: spec.id || prefix,
      onChange: (value) => patch({ jobId: value }),
    })),
    el('div', { class: 'experience-star bb-star-stack' }, star),
    notes ? field('Notes', notes) : null,
  ]);
}

function experienceControl(entry, control) {
  const focusKey = `exp-${control.key}-${entry.id}`;
  if (control.kind === 'job') return experienceJobSelect(entry);
  if (control.column === 'lead') {
    return cellInput(control.label, control.value, focusKey, (value) => patchEntry(entry.id, { [control.key]: value }));
  }
  const area = el('textarea', {
    class: 'bb-inline-area',
    rows: '2',
    'aria-label': control.label,
    placeholder: control.label,
    'data-focus-key': focusKey,
    onInput: (event) => patchEntry(entry.id, { [control.key]: event.target.value }),
  }, control.value || '');
  fitArea(area);
  return el('label', { class: 'bb-star-cell' }, [
    el('span', {}, control.label),
    area,
  ]);
}

function flushExperienceStarEdits(entry, article) {
  if (!entry || !article) return;
  const patch = {};
  for (const key of ['situation', 'task', 'action', 'result']) {
    const field = article.querySelector(`[data-focus-key="exp-${key}-${entry.id}"]`);
    if (!field) continue;
    const value = String(field.value ?? '');
    if (value !== String(entry[key] || '')) patch[key] = value;
  }
  if (Object.keys(patch).length) patchEntry(entry.id, patch);
  void flushSave('blur');
}

function experienceDetailsPanel(entry, { expanded, panelId }) {
  const links = postingsUsingEntry(store, entry.id);
  return el('div', {
    class: 'bb-exp-panel bb-exp-panel-details',
    id: panelId,
    hidden: expanded ? undefined : true,
  }, [
    field('Job', experienceJobSelect(entry)),
    field('Tags', cellInput('Tags', (entry.tags || []).join(', '), `exp-tags-${entry.id}`, (value) => patchEntry(entry.id, { tags: value }))),
    links.length ? el('div', { class: 'bb-exp-links' }, [
      el('span', { class: 'tiny' }, 'Used on'),
      ...links.map((job) => btn([job.title, job.company].filter(Boolean).join(' · '), {
        class: 'btn ghost compact-action',
        onClick: () => go({ kind: 'jobs', id: job.id }),
      })),
    ]) : el('p', { class: 'tiny' }, 'Not pinned on a posting yet.'),
    btn('Delete bullet', {
      class: 'row-text-action is-danger',
      onClick: () => {
        if (!confirm('Remove this resume bullet? Postings that used it will drop the link.')) return;
        store = deleteEntry(store, entry.id);
        saveStore();
        go({ kind: 'log' });
      },
    }),
  ]);
}

function experienceNotesPanel(entry, { expanded, panelId }) {
  const notes = el('textarea', {
    class: 'bb-inline-area',
    rows: '2',
    'aria-label': 'Notes',
    placeholder: 'Extra color, links, or a longer version.',
    'data-focus-key': `exp-notes-${entry.id}`,
    onInput: (event) => patchEntry(entry.id, { notes: event.target.value }),
  }, entry.notes || '');
  fitArea(notes);
  return el('div', {
    class: 'bb-exp-panel bb-exp-panel-notes',
    id: panelId,
    hidden: expanded ? undefined : true,
  }, [field('Notes', notes)]);
}

function experienceCreateFormUi({
  jobId = '',
  lockJob = false,
  defaultName = '',
  focusKey = 'xp-inline-name',
  submitLabel = 'Save',
  onSubmit,
  onCancel,
}) {
  return buildExperienceCreateForm({
    el,
    btn,
    store,
    jobId,
    lockJob,
    defaultName,
    focusKey,
    submitLabel,
    onSubmit,
    onCancel,
    onRender: (opts) => render(opts),
  });
}

function assignExperienceCreate({
  title,
  jobId,
  entryIds = [],
  experienceId = '',
  rememberEmpty = false,
}) {
  try {
    if (experienceId && entryIds.length) {
      const result = bulkAssignEntriesToExperience(store, entryIds, { experienceId, jobId });
      store = result.store;
      saveStore();
      return result;
    }
    if (!entryIds.length) {
      const created = createExperience(store, { jobId, title });
      store = created.store;
      const xpId = created.changedExperienceIds[0];
      if (rememberEmpty) rememberSessionEmptyExperience(xpId);
      saveStore();
      return { store, experienceId: xpId, entryIds: [] };
    }
    const result = bulkAssignEntriesToExperience(store, entryIds, {
      newTitle: title,
      jobId,
    });
    store = result.store;
    saveStore();
    return result;
  } catch (error) {
    setNote(error.message || 'Could not save that experience.');
    return null;
  }
}

function experienceMembershipPicker(entry) {
  if (!experiencesUiEnabled()) return null;
  return buildExperiencePicker({
    el,
    btn,
    store,
    entry,
    anchorFocusKey: `exp-xp-${entry.id}`,
    openEntryId: openExperiencePickerEntryId,
    pickerSearch: experiencePickerSearch,
    pickerActiveIndex: experiencePickerActiveIndex,
    pickerCreateFormOpen: experiencePickerCreateFormOpen,
    onOpenPicker: (id) => { openExperiencePickerEntryId = id || ''; },
    onPickerSearch: (value) => {
      experiencePickerSearch = value;
      experiencePickerActiveIndex = -1;
    },
    onPickerActiveIndex: (index) => { experiencePickerActiveIndex = index; },
    onPickerCreateFormOpen: (open) => { experiencePickerCreateFormOpen = open; },
    onStore: (next) => { store = next; },
    onSave: () => saveStore(),
    onRender: (opts) => render(opts),
    setNote,
    renderCreateForm: () => experienceCreateFormUi({
      jobId: entry.jobId || '',
      lockJob: Boolean(entry.jobId),
      defaultName: experiencePickerSearch,
      focusKey: `xp-create-${entry.id}`,
      onSubmit: ({ title, jobId }) => {
        const result = assignExperienceCreate({
          title,
          jobId,
          entryIds: [entry.id],
        });
        if (!result) return;
        openExperiencePickerEntryId = '';
        experiencePickerCreateFormOpen = false;
        experiencePickerActiveIndex = -1;
        setNote('Created experience and assigned this bullet.');
        render({ focusKey: `exp-xp-${entry.id}`, preserveScroll: true });
      },
      onCancel: () => {
        experiencePickerCreateFormOpen = false;
        render({ focusKey: `xp-search-${entry.id}`, preserveScroll: true });
      },
    }),
    onCreateAndAssign: ({ title, jobId, entryId }) => {
      const result = assignExperienceCreate({ title, jobId, entryIds: [entryId] });
      if (!result) return;
      openExperiencePickerEntryId = '';
      experiencePickerCreateFormOpen = false;
      experiencePickerActiveIndex = -1;
      setNote('Created experience and assigned this bullet.');
      render({ focusKey: `exp-xp-${entryId}`, preserveScroll: true });
    },
  });
}

function experienceRow(entry) {
  const spec = experienceRowSpec(entry);
  const starControls = spec.controls.filter((control) => control.column === 'star');
  const starOpen = expandedExperienceStar.has(entry.id);
  const detailsOpen = expandedExperienceDetails.has(entry.id);
  const notesOpen = expandedExperienceNotes.has(entry.id);
  const starPanelId = `exp-star-${entry.id}`;
  const detailsPanelId = `exp-details-${entry.id}`;
  const notesPanelId = `exp-notes-${entry.id}`;
  const fill = starFill(entry);
  const starLabel = fill.ready ? 'STAR' : `STAR ${fill.filled}/${fill.total}`;
  const highlight = (activePanelExperienceId && entry.experienceId === activePanelExperienceId)
    || activePanelLooseEntryId === entry.id;
  return el('article', {
    class: `bb-exp-row${highlight ? ' is-xp-highlight' : ''}`,
    'data-entry-id': spec.id,
    'data-experience-id': entry.experienceId || '',
    'data-star': starOpen ? 'always' : 'hidden',
  }, [
    experienceLineCell(entry),
    el('div', { class: 'bb-exp-actions bb-action-row row-icons' }, [
      experienceMembershipPicker(entry),
      experienceTextAction(detailsOpen ? 'Details ↑' : 'Details ↓', {
        expanded: detailsOpen,
        controls: detailsPanelId,
        className: 'bb-exp-action-details',
        onClick: (event) => toggleExperiencePanel(entry, event.currentTarget.closest('.bb-exp-row'), 'details'),
      }),
      experienceTextAction(starOpen ? 'STAR ↑' : starLabel, {
        expanded: starOpen,
        controls: starPanelId,
        className: `bb-exp-action-star${fill.ready ? ' is-ready' : ''}`,
        onClick: (event) => toggleExperiencePanel(entry, event.currentTarget.closest('.bb-exp-row'), 'star'),
      }),
      experienceTextAction(notesOpen ? 'Notes ↑' : 'Notes', {
        expanded: notesOpen,
        controls: notesPanelId,
        className: 'bb-exp-action-notes',
        onClick: (event) => toggleExperiencePanel(entry, event.currentTarget.closest('.bb-exp-row'), 'notes'),
      }),
    ]),
    experienceDetailsPanel(entry, { expanded: detailsOpen, panelId: detailsPanelId }),
    el('div', {
      class: 'bb-exp-panel bb-exp-panel-star',
      id: starPanelId,
      hidden: starOpen ? undefined : true,
    }, [
      el('div', { class: 'bb-exp-stargrid bb-star-stack' }, starControls.map((control) => experienceControl(entry, control))),
    ]),
    experienceNotesPanel(entry, { expanded: notesOpen, panelId: notesPanelId }),
  ]);
}

function experienceGroupHeader(group) {
  const groupKey = group.jobId || '__none__';
  const expanded = !collapsedExperienceGroups.has(groupKey);
  const title = [group.label, group.dates].filter(Boolean).join(' · ');
  const bodyId = `exp-group-${groupKey}`;
  return el('header', { class: 'bb-exp-group-head', 'data-job-id': groupKey }, [
    el('button', {
      type: 'button',
      class: 'bb-exp-group-toggle',
      'aria-expanded': expanded ? 'true' : 'false',
      'aria-controls': bodyId,
      onClick: (event) => {
        event.preventDefault();
        if (expanded) {
          flushExperienceGroupEntries(group);
          void flushSave('blur');
          collapsedExperienceGroups.add(groupKey);
        } else {
          collapsedExperienceGroups.delete(groupKey);
        }
        const scroll = captureScroll();
        render();
        restoreScroll(scroll);
      },
    }, [
      el('span', { class: 'bb-chevron bb-exp-group-chevron', 'aria-hidden': 'true' }),
      el('span', { class: 'bb-exp-group-title' }, title),
      el('span', { class: 'bb-exp-group-count' }, `${group.count}`),
    ]),
  ]);
}

function persistCollapsedLibrarySections() {
  writeCollapsedLibrarySectionsToSession(collapsedLibrarySections);
}

function hydrateCollapsedLibrarySectionsFromSession() {
  const saved = readCollapsedLibrarySectionsFromSession();
  if (!saved.size) return;
  collapsedLibrarySections.clear();
  for (const key of saved) collapsedLibrarySections.add(key);
}

function toggleLibrarySection(sectionKey, expanded) {
  if (expanded) collapsedLibrarySections.add(sectionKey);
  else collapsedLibrarySections.delete(sectionKey);
  persistCollapsedLibrarySections();
  const scroll = captureScroll();
  render({ preserveScroll: true });
  restoreScroll(scroll);
}

function setAllCatalogSectionsCollapsed(collapsed) {
  const scroll = captureScroll();
  const keys = libraryCollapsibleSectionKeys(store);
  if (collapsed) {
    for (const key of keys) collapsedLibrarySections.add(key);
  } else {
    for (const key of keys) collapsedLibrarySections.delete(key);
  }
  for (const group of libraryCatalogGroups(store, { query: '' })) {
    collapsedExperienceGroups.delete(group.jobId || '__none__');
  }
  persistCollapsedLibrarySections();
  render({ preserveScroll: true });
  restoreScroll(scroll);
}

function experienceSectionRenameRow(xp) {
  const input = el('input', {
    type: 'text',
    class: 'bb-exp-section-rename-input',
    value: xp.title || '',
    'aria-label': 'Experience name',
    'data-focus-key': `xp-rename-${xp.id}`,
  });
  const saveRename = () => {
    const name = String(input.value || '').trim();
    if (!name || name === xp.title) {
      experienceRenameId = '';
      render({ preserveScroll: true });
      return;
    }
    store = renameExperience(store, xp.id, name).store;
    experienceRenameId = '';
    experienceSectionMenuId = '';
    saveStore();
    render({ preserveScroll: true });
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); saveRename(); }
    if (event.key === 'Escape') {
      event.preventDefault();
      experienceRenameId = '';
      render({ preserveScroll: true });
    }
  });
  return el('div', { class: 'bb-exp-section-rename bb-action-row' }, [
    input,
    btn('Save', { type: 'button', class: 'btn compact-action', onClick: saveRename }),
    btn('Cancel', {
      type: 'button',
      class: 'btn ghost compact-action',
      onClick: () => {
        experienceRenameId = '';
        render({ preserveScroll: true });
      },
    }),
  ]);
}

function experienceSectionOverflowMenu(xp) {
  if (!xp || !experiencesUiEnabled()) return null;
  const menuOpen = experienceSectionMenuId === xp.id;
  const more = btn('⋯', {
    type: 'button',
    class: 'btn ghost bb-exp-section-more compact-action',
    title: 'Experience actions',
    'aria-label': 'Experience actions',
    'aria-expanded': menuOpen ? 'true' : 'false',
    onClick: (event) => {
      event.stopPropagation();
      experienceSectionMenuId = menuOpen ? '' : xp.id;
      if (!menuOpen) experienceUngroupPendingId = '';
      render({ preserveScroll: true });
    },
  });
  if (!menuOpen) return el('div', { class: 'bb-exp-section-menu-wrap' }, [more]);
  const menuItems = experienceUngroupPendingId === xp.id
    ? [
      el('p', { class: 'tiny bb-exp-section-menu-hint' }, 'Ungroup? Bullets stay loose under the same job.'),
      btn('Ungroup', {
        type: 'button',
        class: 'bb-exp-section-menu-item',
        onClick: () => {
          store = ungroupExperience(store, xp.id).store;
          experienceUngroupPendingId = '';
          experienceSectionMenuId = '';
          saveStore();
          setNote('Ungrouped. Bullets are loose under the same job.');
          render({ preserveScroll: true });
        },
      }),
      btn('Cancel', {
        type: 'button',
        class: 'bb-exp-section-menu-item',
        onClick: () => {
          experienceUngroupPendingId = '';
          render({ preserveScroll: true });
        },
      }),
    ]
    : [
      btn('Rename', {
        type: 'button',
        class: 'bb-exp-section-menu-item',
        onClick: () => {
          experienceSectionMenuId = '';
          experienceRenameId = xp.id;
          experienceUngroupPendingId = '';
          render({ preserveScroll: true, focusKey: `xp-rename-${xp.id}` });
        },
      }),
      btn('Ungroup…', {
        type: 'button',
        class: 'bb-exp-section-menu-item',
        onClick: () => {
          experienceUngroupPendingId = xp.id;
          render({ preserveScroll: true });
        },
      }),
    ];
  const menu = el('div', {
    class: 'bb-exp-section-menu',
    role: 'menu',
    'aria-label': 'Experience actions',
  }, menuItems);
  return el('div', { class: 'bb-exp-section-menu-wrap' }, [more, menu]);
}

function experienceSectionHeader(jobKey, section, { bodyId = '' } = {}) {
  const sectionKey = librarySectionKey(jobKey, section);
  const expanded = !collapsedLibrarySections.has(sectionKey);
  const resolvedBodyId = bodyId || `exp-section-${sectionKey.replace(/[^a-z0-9_-]/gi, '-')}`;
  if (section.kind === 'loose' && section.label) {
    const looseIds = section.rows.map((row) => row.id);
    const allLooseSelected = looseIds.length > 0 && looseIds.every((id) => selectedCatalogEntryIds.has(id));
    const someLooseSelected = looseIds.some((id) => selectedCatalogEntryIds.has(id));
    return el('header', { class: 'bb-exp-section-row bb-exp-section-loose' }, [
      catalogBulkSelectMode && looseIds.length
        ? el('label', { class: 'bb-exp-loose-select-all' }, [
          el('input', {
            type: 'checkbox',
            checked: allLooseSelected,
            ref: (node) => {
              if (node) node.indeterminate = !allLooseSelected && someLooseSelected;
            },
            'aria-label': 'Select all loose bullets in this section',
            onChange: () => {
              if (allLooseSelected) looseIds.forEach((id) => selectedCatalogEntryIds.delete(id));
              else looseIds.forEach((id) => selectedCatalogEntryIds.add(id));
              render({ preserveScroll: true });
            },
          }),
          el('span', { class: 'bb-exp-loose-select-label' }, 'Select all'),
        ])
        : null,
      el('button', {
        type: 'button',
        class: 'bb-exp-section-row-toggle',
        'aria-expanded': expanded ? 'true' : 'false',
        'aria-controls': resolvedBodyId,
        onClick: (event) => {
          event.preventDefault();
          toggleLibrarySection(sectionKey, expanded);
        },
      }, [
        el('span', { class: 'bb-chevron bb-exp-section-chevron', 'aria-hidden': 'true' }),
        el('span', { class: 'bb-exp-section-row-title' }, section.label),
        el('span', { class: 'bb-exp-section-row-meta' }, `${section.rows.length} bullet${section.rows.length === 1 ? '' : 's'}`),
      ]),
    ]);
  }
  if (section.kind !== 'experience') return null;
  const xp = (store.experiences || []).find((row) => row.id === section.experienceId);
  const renaming = xp && experienceRenameId === xp.id;
  return el('div', { class: 'bb-exp-section-row-wrap', 'data-experience-id': section.experienceId || '' }, [
    el('header', { class: 'bb-exp-section-row bb-exp-section-xp' }, [
      renaming
        ? experienceSectionRenameRow(xp)
        : el('button', {
          type: 'button',
          class: 'bb-exp-section-row-toggle',
          'aria-expanded': expanded ? 'true' : 'false',
          'aria-controls': resolvedBodyId,
          onClick: (event) => {
            event.preventDefault();
            toggleLibrarySection(sectionKey, expanded);
          },
        }, [
          el('span', { class: 'bb-chevron bb-exp-section-chevron', 'aria-hidden': 'true' }),
          el('span', { class: 'bb-exp-section-row-title' }, section.label),
          el('span', { class: 'bb-exp-section-row-meta' }, `${section.versionCount} version${section.versionCount === 1 ? '' : 's'}`),
        ]),
      renaming ? null : experienceSectionOverflowMenu(xp),
    ]),
  ]);
}

function bulkExperienceBar() {
  if (!catalogBulkSelectMode || !experiencesUiEnabled()) return null;
  const selectedIds = [...selectedCatalogEntryIds];
  if (!selectedIds.length) return null;
  const jobIds = [...selectedEntriesJobIds(store, selectedIds)];
  const singleJobId = jobIds.length === 1 ? jobIds[0] : '';
  return buildBulkExperienceBar({
    el,
    btn,
    store,
    selectedEntryIds: selectedCatalogEntryIds,
    menuOpen: bulkAddMenuOpen,
    menuSearch: bulkAddSearch,
    menuActiveIndex: bulkAddActiveIndex,
    createOpen: bulkAddCreateOpen,
    onToggleMenu: () => {
      bulkAddMenuOpen = !bulkAddMenuOpen;
      if (!bulkAddMenuOpen) {
        bulkAddCreateOpen = false;
        bulkAddSearch = '';
        bulkAddActiveIndex = -1;
      }
      render({
        preserveScroll: true,
        focusKey: bulkAddMenuOpen && singleJobId ? 'bulk-xp-search' : undefined,
      });
    },
    onMenuSearch: (value) => {
      bulkAddSearch = value;
      bulkAddActiveIndex = -1;
      render({ preserveScroll: true, focusKey: 'bulk-xp-search' });
    },
    onMenuActiveIndex: (index) => {
      bulkAddActiveIndex = index;
      render({ preserveScroll: true, focusKey: 'bulk-xp-search' });
    },
    onOpenCreate: () => {
      bulkAddCreateOpen = true;
      render({ preserveScroll: true, focusKey: 'xp-bulk-create-name' });
    },
    onCloseCreate: () => {
      bulkAddCreateOpen = false;
      render({ preserveScroll: true, focusKey: 'bulk-xp-search' });
    },
    onAssignExisting: (experienceId) => {
      const ids = [...selectedCatalogEntryIds];
      const result = assignExperienceCreate({
        jobId: singleJobId,
        entryIds: ids,
        experienceId,
      });
      if (!result) return;
      selectedCatalogEntryIds.clear();
      bulkAddMenuOpen = false;
      bulkAddCreateOpen = false;
      bulkAddSearch = '';
      setNote('Added selected bullets to that experience.');
      render({ preserveScroll: true });
    },
    onCreateAndAssign: ({ title, jobId }) => {
      const ids = [...selectedCatalogEntryIds];
      const result = assignExperienceCreate({ title, jobId, entryIds: ids });
      if (!result) return;
      selectedCatalogEntryIds.clear();
      bulkAddMenuOpen = false;
      bulkAddCreateOpen = false;
      bulkAddSearch = '';
      setNote('Created experience and assigned selected bullets.');
      render({ preserveScroll: true });
    },
    onCancelBulk: () => {
      selectedCatalogEntryIds.clear();
      bulkAddMenuOpen = false;
      bulkAddCreateOpen = false;
      bulkAddSearch = '';
      render({ preserveScroll: true });
    },
    renderCreateForm: () => experienceCreateFormUi({
      jobId: singleJobId,
      lockJob: Boolean(singleJobId),
      defaultName: bulkAddSearch,
      focusKey: 'xp-bulk-create-name',
      submitLabel: 'Create & assign',
      onSubmit: ({ title, jobId }) => {
        const ids = [...selectedCatalogEntryIds];
        const result = assignExperienceCreate({ title, jobId, entryIds: ids });
        if (!result) return;
        selectedCatalogEntryIds.clear();
        bulkAddMenuOpen = false;
        bulkAddCreateOpen = false;
        bulkAddSearch = '';
        setNote('Created experience and assigned selected bullets.');
        render({ preserveScroll: true });
      },
      onCancel: () => {
        bulkAddCreateOpen = false;
        render({ preserveScroll: true, focusKey: 'bulk-xp-search' });
      },
    }),
  });
}

function selectPanelLooseEntry(entryId) {
  if (!entryId) {
    activePanelLooseEntryId = '';
    render({ preserveScroll: true });
    return;
  }
  if (activePanelLooseEntryId === entryId) {
    activePanelLooseEntryId = '';
    render({ preserveScroll: true });
    return;
  }
  activePanelLooseEntryId = entryId;
  activePanelExperienceId = '';
  const entry = store.entries.find((row) => row.id === entryId);
  if (entry?.jobId) {
    collapsedExperienceGroups.delete(entry.jobId);
  } else {
    collapsedExperienceGroups.delete('__none__');
  }
  render({ preserveScroll: true });
}

function selectPanelExperience(experienceId) {
  if (!experienceId) {
    activePanelExperienceId = '';
    render({ preserveScroll: true });
    return;
  }
  if (activePanelExperienceId === experienceId) {
    activePanelExperienceId = '';
    render({ preserveScroll: true });
    return;
  }
  activePanelExperienceId = experienceId;
  activePanelLooseEntryId = '';
  const xp = experienceById(store, experienceId);
  if (xp?.jobId) {
    const jobKey = xp.jobId;
    collapsedExperienceGroups.delete(jobKey);
    collapsedLibrarySections.delete(librarySectionKey(jobKey, {
      kind: 'experience',
      experienceId,
    }));
  } else if (xp && !xp.jobId) {
    collapsedExperienceGroups.delete('__none__');
  }
  render({ preserveScroll: true });
}

function dropEntryOnExperience(experienceId, event) {
  panelDragOverExperienceId = '';
  const entryId = event?.dataTransfer?.getData?.('text/brag-entry-id') || '';
  if (!entryId || !experienceId) return;
  const entry = store.entries.find((item) => item.id === entryId);
  const xp = experienceById(store, experienceId);
  if (!entry || !xp || entry.jobId !== xp.jobId) {
    setNote('That bullet and experience must share the same job.');
    render({ preserveScroll: true });
    return;
  }
  store = moveEntryToExperience(store, entryId, experienceId).store;
  forgetSessionEmptyExperience(experienceId);
  saveStore();
  setNote('Moved bullet to that experience.');
  render({ focusKey: `exp-xp-${entryId}`, preserveScroll: true });
}

function addLibraryEntriesToPostingResume(posting, entryIds) {
  if (!posting?.id || !entryIds?.length) return;
  let next = store;
  let placed = 0;
  for (const entryId of entryIds) {
    const entry = next.entries.find((item) => item.id === entryId);
    if (!entry?.jobId) continue;
    const before = JSON.stringify(next);
    next = placeLibraryBullet(next, {
      postingId: posting.id,
      jobId: entry.jobId,
      groupId: '',
      entryId,
    });
    if (JSON.stringify(next) !== before) placed += 1;
  }
  if (placed) {
    store = next;
    selectedCatalogEntryIds.clear();
    saveStore();
    setNote(`Added ${placed} bullet${placed === 1 ? '' : 's'} to this posting’s resume.`);
    render();
  } else {
    setNote('Those bullets are already on the resume or could not be placed.');
  }
}

function experiencesPanelForPage(page, posting = null) {
  if (!experiencesUiEnabled()) return null;
  const collapsed = readPanelCollapsed();
  const rail = el('button', {
    type: 'button',
    class: 'bb-exp-panel-rail',
    'aria-label': 'Expand Experiences panel',
    onClick: () => {
      writePanelCollapsed(false);
      render({ preserveScroll: true });
    },
  }, '▸ Experiences');
  if (collapsed && mediaMatches(experiencesDualColumnMediaQuery())) {
    return rail;
  }
  const loosePageKey = panelLooseSectionPageKey(posting);
  const primaryJobId = posting ? postingPrimaryCatalogJobId(store, posting) : '';
  const looseGroups = compactLooseBulletPanelGroups(store, {
    posting,
    primaryJobId,
  });
  const looseOpen = readPanelLooseSectionOpen(loosePageKey, { count: looseGroups.totalCount });

  function panelMapSearchResults() {
    const q = String(experiencesPanelQuery || '').trim();
    const targets = q ? searchPostingMapTargets(store, q) : { experiences: [], bullets: [] };
    const panelJobId = posting ? postingPrimaryCatalogJobId(store, posting) : '';
    const built = buildPostingMapSearchResults({
      el,
      btn,
      onPickExperience: (experienceId) => {
        if (posting) {
          postingMapPick = { kind: 'experience', experienceId };
          postingMapTargetEntryId = '';
          setNote('Choose a requirement and tap Map here.');
        } else {
          selectPanelExperience(experienceId);
        }
        experiencesPanelSearchActiveIndex = -1;
        render({ preserveScroll: true, focusKey: 'exp-panel-search' });
      },
      onPickBullet: (entryId) => {
        if (posting) {
          postingMapPick = { kind: 'bullet', entryId };
          postingMapTargetEntryId = entryId;
          setNote('Choose a requirement and tap Map here.');
        } else {
          selectPanelLooseEntry(entryId);
        }
        experiencesPanelSearchActiveIndex = -1;
        render({ preserveScroll: true, focusKey: 'exp-panel-search' });
      },
    }, targets, { activeIndex: experiencesPanelSearchActiveIndex });
    const createRowIndex = built.optionIndex;
    const listChildren = [...built.nodes];
    if (q) {
      appendPostingMapSearchCreateRows({ el, btn }, listChildren, {
        query: experiencesPanelQuery,
        activeIndex: experiencesPanelSearchActiveIndex,
        startIndex: createRowIndex,
        jobId: panelJobId,
        onCreateExperienceFromQuery: ({ title, jobId }) => {
          const resolvedJobId = jobId || panelJobId;
          if (!resolvedJobId) {
            setNote('Link this posting to a job before creating an experience.');
            return;
          }
          const trimmed = String(title || '').trim();
          if (!trimmed) return;
          const created = createExperience(store, { jobId: resolvedJobId, title: trimmed });
          store = created.store;
          const xpId = created.changedExperienceIds[0];
          rememberSessionEmptyExperience(xpId);
          saveStore();
          if (posting) {
            postingMapPick = { kind: 'experience', experienceId: xpId };
            postingMapTargetEntryId = '';
            setNote('Experience created. Choose a requirement and tap Map here.');
          } else {
            selectPanelExperience(xpId);
            setNote('Created experience.');
          }
          experiencesPanelSearchActiveIndex = -1;
          render({ preserveScroll: true, focusKey: 'exp-panel-search' });
        },
        onAddLooseBulletFromQuery: ({ title, jobId }) => {
          if (!posting) {
            setNote('Open a job posting to add a bullet from here.');
            return;
          }
          const resolvedJobId = jobId || panelJobId;
          if (!resolvedJobId) {
            setNote('Link this posting to a job before adding a bullet.');
            return;
          }
          const trimmed = String(title || '').trim();
          if (!trimmed) return;
          let next = addEntry(store, {
            title: trimmed,
            jobId: resolvedJobId,
            rich: [{ text: trimmed, bold: false }],
          });
          const entryId = next.entries[next.entries.length - 1]?.id;
          if (!entryId) return;
          store = next;
          saveStore();
          postingMapPick = { kind: 'bullet', entryId };
          postingMapTargetEntryId = entryId;
          experiencesPanelSearchActiveIndex = -1;
          setNote('Bullet created. Choose a requirement and tap Map here.');
          render({ preserveScroll: true, focusKey: 'exp-panel-search' });
        },
      });
    }
    return el('div', { class: 'bb-post-map-results', role: 'listbox' }, listChildren);
  }

  function renderPanelLooseBulletRow(row) {
    const entry = store.entries.find((item) => item.id === row.entryId);
    if (!entry) return null;
    const active = activePanelLooseEntryId === entry.id;
    return el('div', {
      class: `bb-exp-index-row bb-exp-loose-row${active ? ' is-active' : ''}`,
      draggable: 'true',
      'data-entry-id': entry.id,
      onDragstart: (event) => {
        if (event.dataTransfer) {
          event.dataTransfer.setData('text/brag-entry-id', entry.id);
          event.dataTransfer.effectAllowed = 'move';
        }
      },
      onClick: (event) => {
        if (event.target.closest('button, a, select, input, label')) return;
        selectPanelLooseEntry(entry.id);
      },
    }, [
      el('div', { class: 'bb-exp-index-line1' }, [
        el('span', { class: 'bb-exp-index-title' }, displayExperienceLine(row.line)),
      ]),
      row.postingFact
        ? el('p', { class: 'tiny bb-exp-index-fact' }, row.postingFact)
        : null,
      el('div', {
        class: 'bb-exp-panel-loose-actions bb-action-row',
        onClick: (event) => event.stopPropagation(),
      }, [
        experienceMembershipPicker(entry),
        posting
          ? btn('+ Map', {
            type: 'button',
            class: 'btn ghost compact-action',
            onClick: () => {
              postingMapPick = { kind: 'bullet', entryId: entry.id };
              postingMapTargetEntryId = entry.id;
              setNote('Choose a requirement and tap Map here.');
              render({ preserveScroll: true });
            },
          })
          : null,
        posting
          ? (row.onResume
            ? el('span', { class: 'tiny bb-exp-panel-loose-on-resume' }, 'On resume ✓')
            : btn('+ Add to resume', {
              type: 'button',
              class: 'btn ghost compact-action',
              onClick: () => addLibraryEntriesToPostingResume(posting, [entry.id]),
            }))
          : null,
      ]),
    ]);
  }

  const panel = buildExperiencesPanel({
    el,
    btn,
    store,
    posting,
    panelQuery: experiencesPanelQuery,
    activeExperienceId: activePanelExperienceId,
    activeLooseEntryId: activePanelLooseEntryId,
    dragOverExperienceId: panelDragOverExperienceId,
    onRender: (opts) => render(opts || { preserveScroll: true }),
    onSave: () => saveStore(),
    setNote,
    setStore: (next) => { store = next; },
    displayExperienceLine,
    onPanelQueryChange: (value) => {
      experiencesPanelQuery = value;
      experiencesPanelSearchActiveIndex = -1;
      render({ preserveScroll: true, focusKey: 'exp-panel-search' });
    },
    onClosePanelSearch: () => {
      experiencesPanelQuery = '';
      experiencesPanelSearchActiveIndex = -1;
      render({ preserveScroll: true });
    },
    onSelectExperience: selectPanelExperience,
    onSelectLooseEntry: selectPanelLooseEntry,
    onDragOverExperience: (id) => {
      panelDragOverExperienceId = id || '';
      render({ preserveScroll: true });
    },
    onDropOnExperience: dropEntryOnExperience,
    onStartPanelCreate: () => {
      panelExperienceCreateOpen = true;
      render({ preserveScroll: true, focusKey: 'xp-panel-create-name' });
    },
    renderPanelCreateForm: () => experienceCreateFormUi({
      jobId: '',
      lockJob: false,
      focusKey: 'xp-panel-create-name',
      submitLabel: 'Create',
      onSubmit: ({ title, jobId }) => {
        const result = assignExperienceCreate({
          title,
          jobId,
          entryIds: [],
          rememberEmpty: true,
        });
        if (!result) return;
        panelExperienceCreateOpen = false;
        activePanelExperienceId = result.experienceId;
        setNote('Created experience. Drag or assign bullets from the list.');
        render({ preserveScroll: true, focusKey: 'exp-panel-search' });
      },
      onCancel: () => {
        panelExperienceCreateOpen = false;
        render({ preserveScroll: true, focusKey: 'exp-panel-search' });
      },
    }),
    panelCreateOpen: panelExperienceCreateOpen,
    renderPanelQueryResults: String(experiencesPanelQuery || '').trim()
      ? panelMapSearchResults()
      : null,
    looseSection: {
      totalCount: looseGroups.totalCount,
      groups: looseGroups.groups,
      open: looseOpen,
      onToggleOpen: () => {
        writePanelLooseSectionOpen(loosePageKey, !looseOpen);
        render({ preserveScroll: true });
      },
    },
    renderLooseBulletRow: renderPanelLooseBulletRow,
  });
  const close = btn('×', {
    type: 'button',
    class: 'bb-exp-panel-close',
    'aria-label': 'Collapse Experiences panel',
    onClick: () => {
      if (mediaMatches('(max-width: 720px)')) {
        experiencesMobileDrawerOpen = false;
      } else {
        writePanelCollapsed(true);
      }
      render({ preserveScroll: true });
    },
  });
  const panelHead = typeof panel.querySelector === 'function'
    ? panel.querySelector('.bb-exp-panel-head-actions')
    : null;
  if (panelHead?.append) panelHead.append(close);
  return panel;
}

function experienceCatalogRow(entry) {
  const row = experienceRow(entry);
  if (!experiencesUiEnabled()) return row;
  const children = [];
  if (catalogBulkSelectMode) {
    const selected = selectedCatalogEntryIds.has(entry.id);
    children.push(el('label', { class: 'bb-exp-row-check' }, [
      el('input', {
        type: 'checkbox',
        checked: selected,
        'aria-label': 'Select for bulk move',
        onChange: (event) => {
          if (event.target.checked) selectedCatalogEntryIds.add(entry.id);
          else selectedCatalogEntryIds.delete(entry.id);
          render({ preserveScroll: true });
        },
      }),
    ]));
  }
  children.push(row);
  return el('div', {
    class: 'bb-exp-row-wrap',
    draggable: 'true',
    'data-entry-id': entry.id,
    onDragstart: (event) => {
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/brag-entry-id', entry.id);
        event.dataTransfer.effectAllowed = 'move';
      }
    },
  }, children);
}

function experienceTable(view) {
  const grouped = experiencesUiEnabled();
  const groups = grouped
    ? libraryCatalogGroups(store, { query })
    : experienceCatalogGroups(store, { query });
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const catalog = el('section', { class: 'panel bb-book-catalog' }, [
    experienceTools(view),
    total
      ? el('div', { class: 'bb-exp-list' }, groups.flatMap((group) => {
        const groupKey = group.jobId || '__none__';
        const groupExpanded = !collapsedExperienceGroups.has(groupKey);
        const bodyId = `exp-group-${groupKey}`;
        const renderRows = (rows) => rows.map((row) => {
          const entry = store.entries.find((item) => item.id === row.id);
          return entry ? experienceCatalogRow(entry) : null;
        });
        if (!grouped) {
          return [
            experienceGroupHeader(group),
            groupExpanded
              ? el('div', { class: 'bb-exp-group-body', id: bodyId, 'data-group-id': groupKey }, renderRows(group.rows))
              : null,
          ];
        }
        return [
          experienceGroupHeader(group),
          groupExpanded
            ? el('div', { class: 'bb-exp-group-body', id: bodyId, 'data-group-id': groupKey }, (() => {
              const sections = group.sections || [];
              const experienceSections = sections.filter((section) => section.kind === 'experience');
              const looseSections = sections.filter((section) => section.kind !== 'experience');
              const renderSection = (section) => {
                const sectionKey = librarySectionKey(groupKey, section);
                const sectionExpanded = !collapsedLibrarySections.has(sectionKey);
                const sectionBodyId = `exp-section-${sectionKey.replace(/[^a-z0-9_-]/gi, '-')}`;
                if (section.kind === 'loose' && !section.label) {
                  return renderRows(section.rows);
                }
                const head = experienceSectionHeader(groupKey, section, { bodyId: sectionBodyId });
                return [
                  head,
                  sectionExpanded
                    ? el('div', { class: 'bb-exp-section-body', id: sectionBodyId }, renderRows(section.rows))
                    : null,
                ];
              };
              const nodes = [];
              if (experienceSections.length) {
                nodes.push(el('div', { class: 'bb-exp-section-list' },
                  experienceSections.flatMap((section) => renderSection(section))));
              }
              for (const section of looseSections) {
                nodes.push(...renderSection(section));
              }
              return nodes;
            })())
            : null,
        ];
      }))
      : el('p', { class: 'empty' }, query
        ? 'Nothing matches that.'
        : 'No resume bullets yet. Add a resume bullet — pick a job, and STAR sits on the row.'),
  ]);
  const panel = experiencesPanelForPage('catalog');
  const bulkBar = bulkExperienceBar();
  if (!panel) {
    return el('div', { class: 'bb-book-catalog-wrap' }, [catalog, bulkBar].filter(Boolean));
  }
  const mobileOpen = experiencesMobileDrawerOpen;
  return el('div', { class: `bb-book-dual${mobileOpen ? ' is-drawer-open' : ''}` }, [
    el('div', { class: 'bb-book-catalog-wrap' }, [catalog, bulkBar].filter(Boolean)),
    panel,
    el('button', {
      type: 'button',
      class: 'bb-exp-mobile-toggle',
      onClick: () => {
        experiencesMobileDrawerOpen = !experiencesMobileDrawerOpen;
        render();
      },
    }, 'Experiences'),
  ]);
}

function bulkEntryForm({ compact = false } = {}) {
  const paste = el('textarea', {
    class: compact ? 'bb-add-paste' : 'tall',
    rows: compact ? '7' : undefined,
    placeholder: 'One resume bullet per line, or a STAR block:\n\n- Led **3** associates on access reviews\n- Shipped packing cubes sync\n\nTitle: Multiplexed the API\nSituation: Twelve functions already used.\nTask: Add another signed-in app.\nAction: Branched ?route= on the existing handler.\nResult: Stayed on Hobby.',
    'data-focus-key': 'book-paste',
  });
  const draft = {};
  const addToBook = () => {
    const drafts = parseExperiences(paste.value).map((item) => ({ ...item, ...draft }));
    if (!drafts.length) {
      setNote('Paste at least one resume bullet — one per line, or a STAR block.');
      return;
    }
    store = addEntries(store, drafts);
    saveStore();
    render({ focusKey: 'book-paste' });
    setNote(`Added ${drafts.length} resume bullet${drafts.length === 1 ? '' : 's'}. They are in the list.`);
  };
  return el('section', { class: compact ? 'panel bb-add-compact' : 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, 'Add resume bullets'),
        el('p', { class: 'tiny' }, 'Paste many at once. **bold** is kept. Pick a job and STAR here — every line uses the same shared form.'),
      ]),
    ]),
    el('div', { class: 'panel-body' }, [
      compact
        ? null
        : el('p', { class: 'lede' }, 'Dump resume lines. Each line becomes a TL;DR a posting can reuse. Use **this** for bold.'),
      sharedBulletForm(draft, {
        focusPrefix: 'book-bulk',
        showLine: false,
        onPatch: (patch) => { Object.assign(draft, patch); },
      }),
      field('Paste resume bullets', paste),
      el('div', { class: 'actions' }, [
        btn('Add to the book', {
          class: 'btn',
          onClick: addToBook,
        }),
        compact
          ? btn('Done', { class: 'btn ghost', onClick: () => go({ kind: 'log' }) })
          : btn('Cancel', { class: 'btn ghost', onClick: () => go({ kind: 'log' }) }),
      ]),
    ]),
  ]);
}

function jobList(selectedId) {
  return el('aside', { class: 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('h2', {}, 'Postings'),
      el('span', { class: 'tiny' }, `${store.postings.length}`),
    ]),
    store.postings.length
      ? el('div', { class: 'list' }, sortPostingsByStatus(store.postings).map((job) => {
        const cover = prepCoverage(store, job);
        return el('div', {
          class: `row is-job${selectedId === job.id ? ' is-on' : ''}`,
        }, [
          el('button', {
            type: 'button',
            class: 'row-main',
            onClick: () => go({ kind: 'jobs', id: job.id }),
          }, [
            el('div', { class: 'row-title' }, job.title),
            el('div', { class: 'row-meta' }, [job.company, `${cover.withAnswer}/${cover.total || 0} answered`].filter(Boolean).join(' · ')),
          ]),
          el('select', {
            class: `row-status is-${postingStatus(job.status)}`,
            'aria-label': `Status for ${job.title}`,
            onClick: (event) => event.stopPropagation(),
            onChange: (event) => {
              store = updatePosting(store, job.id, { status: event.target.value });
              saveStore();
              render();
            },
          }, POSTING_STATUSES.map((status) =>
            el('option', {
              value: status,
              selected: postingStatus(job.status) === status || undefined,
            }, postingStatusLabel(status))
          )),
        ]);
      }))
      : el('p', { class: 'empty' }, 'No postings yet. Paste a job description — that is the start of the loop.'),
  ]);
}

function bulkKnowledgeForm() {
  const paste = el('textarea', {
    class: 'bb-add-paste',
    rows: '8',
    placeholder: 'One note per blank line.\n\nNeon Auth\nSame JWT as Packing Cubes. Session lives in localStorage.\n\nHobby-plan functions\nTwelve serverless functions max. Branch ?route= instead of adding api/*.js.',
    'data-focus-key': 'kb-paste',
  });
  const add = () => {
    const drafts = parseKnowledge(paste.value);
    if (!drafts.length) {
      setNote('Paste at least one note. Blank lines split notes; the first line is the title.');
      return;
    }
    store = addKnowledgeNotes(store, drafts);
    saveStore();
    render({ focusKey: 'kb-paste' });
    setNote(`Added ${drafts.length} knowledge note${drafts.length === 1 ? '' : 's'}.`);
  };
  return el('section', { class: 'panel bb-add-compact' }, [
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, 'Add knowledge'),
        el('p', { class: 'tiny' }, 'Free-form. **bold** is kept. Blank lines start a new note.'),
      ]),
    ]),
    el('div', { class: 'panel-body' }, [
      field('Paste notes', paste),
      el('div', { class: 'actions' }, [
        btn('Add to knowledge', { class: 'btn', onClick: add }),
        btn('Done', { class: 'btn ghost', onClick: () => go({ kind: 'kb' }) }),
      ]),
    ]),
  ]);
}

function paintKnowledgeStatus(text) {
  const node = document.getElementById('kb-save-state');
  if (node) node.textContent = text;
}

function scheduleKnowledgeSave(noteId, patch) {
  store = updateKnowledge(store, noteId, patch);
  knowledgeSaveState = noteKnowledgeInput(knowledgeSaveState, noteId, patch, Date.now());
  paintKnowledgeStatus('Saving…');
  saveStore();
}

function createKnowledgePage() {
  store = addKnowledge(store, { title: 'Untitled', body: '' });
  const created = store.knowledge[0];
  saveStore();
  go({ kind: 'kb', id: created?.id });
  paintKnowledgeStatus('Saved');
}

function appendKnowledgeSpans(parent, spans) {
  if (!spans?.length) {
    parent.append(document.createElement('br'));
    return;
  }
  for (const span of spans) {
    let node = document.createTextNode(span.text);
    if (span.code) {
      const code = document.createElement('code');
      code.append(node);
      node = code;
    }
    if (span.italic) {
      const em = document.createElement('em');
      em.append(node);
      node = em;
    }
    if (span.bold) {
      const strong = document.createElement('strong');
      strong.append(node);
      node = strong;
    }
    parent.append(node);
  }
}

function paintKnowledgeTable(block) {
  const wrap = document.createElement('div');
  wrap.className = 'bb-kb-table-scroll';
  wrap.dataset.kbBlock = String(block.index);
  const table = document.createElement('table');
  table.className = 'bb-kb-table';
  const aligns = block.align || [];
  for (let rowIndex = 0; rowIndex < (block.rows || []).length; rowIndex += 1) {
    const row = block.rows[rowIndex];
    const tr = document.createElement('tr');
    for (let colIndex = 0; colIndex < (row.cells || []).length; colIndex += 1) {
      const cell = row.cells[colIndex];
      const tag = rowIndex === 0 ? 'th' : 'td';
      const node = document.createElement(tag);
      const align = aligns[colIndex] || 'left';
      if (align !== 'left') node.setAttribute('align', align);
      appendKnowledgeSpans(node, cell.spans || []);
      tr.append(node);
    }
    table.append(tr);
  }
  wrap.append(table);
  return wrap;
}

function paintKnowledgeList(items) {
  const ul = document.createElement('ul');
  for (const item of items) {
    const li = document.createElement('li');
    li.dataset.kbBlock = String(item.index);
    appendKnowledgeSpans(li, item.spans);
    if (item.children?.length) li.append(paintKnowledgeList(item.children));
    ul.append(li);
  }
  return ul;
}

function paintKnowledgeDoc(node, doc) {
  const grouped = groupKnowledgeBlocks(knowledgeDocForEditor(doc));
  const children = grouped.map((block) => {
    if (block.kind === 'ul') return paintKnowledgeList(block.items);
    if (block.kind === 'table') return paintKnowledgeTable(block);
    const tag = block.type === 'h1' || block.type === 'h2' || block.type === 'h3' ? block.type : 'p';
    const node = document.createElement(tag);
    node.dataset.kbBlock = String(block.index);
    appendKnowledgeSpans(node, block.spans);
    return node;
  });
  node.replaceChildren(...children);
}

function knowledgeBrIsBreak(node) {
  for (let sib = node.nextSibling; sib; sib = sib.nextSibling) {
    if (sib.nodeType === 3 && sib.nodeValue.replace(/\u00a0/g, '').length) return true;
    if (sib.nodeType === 1 && sib.tagName !== 'BR') return true;
  }
  return false;
}

function readKnowledgeInline(node) {
  const spans = [];
  const push = (text, bold, italic, code = false) => {
    const value = String(text || '').replace(/\u00a0/g, ' ');
    if (!value) return;
    const last = spans[spans.length - 1];
    if (last && last.bold === bold && last.italic === italic && last.code === code) last.text += value;
    else spans.push({ text: value, bold, italic, code });
  };
  const walk = (parent, bold, italic, code = false) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === 3) push(child.nodeValue, bold, italic, code);
      else if (child.nodeType === 1) {
        const tag = child.tagName;
        if (tag === 'UL' || tag === 'OL' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT') continue;
        // A lone or trailing <br> is the caret placeholder browsers insert in an
        // empty block. Treating it as a newline would save a blank paragraph
        // on every keystroke. A break with text after it is a real line split.
        if (tag === 'BR') {
          if (knowledgeBrIsBreak(child)) push('\n', bold, italic, code);
        } else {
          const weight = child.style?.fontWeight;
          const nextBold = bold || tag === 'B' || tag === 'STRONG' || weight === 'bold' || Number(weight) >= 600;
          const nextItalic = italic || tag === 'I' || tag === 'EM' || child.style?.fontStyle === 'italic';
          const nextCode = code || tag === 'CODE';
          walk(child, nextBold, nextItalic, nextCode);
        }
      }
    }
  };
  walk(node, false, false, false);
  return spans;
}

function readKnowledgeTable(tableEl) {
  const align = [];
  const rows = [];
  for (const tr of tableEl.querySelectorAll('tr')) {
    const cells = [];
    for (const cell of tr.querySelectorAll('th, td')) {
      if (!rows.length) {
        const raw = String(cell.getAttribute('align') || 'left').toLowerCase();
        align.push(raw === 'center' || raw === 'right' ? raw : 'left');
      }
      cells.push({ spans: readKnowledgeInline(cell) });
    }
    if (cells.length) rows.push({ cells });
  }
  return { type: 'table', align, rows };
}

function readKnowledgeDoc(root) {
  const blocks = [];
  const consume = (parent, indent) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === 3) {
        const text = child.nodeValue.replace(/\u00a0/g, ' ');
        if (text.trim()) blocks.push({ type: 'p', indent: 0, spans: [{ text, bold: false, italic: false }] });
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT') continue;
      if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
        blocks.push({ type: tag.toLowerCase(), indent: 0, spans: readKnowledgeInline(child) });
        continue;
      }
      if (tag === 'DIV' && child.classList?.contains('bb-kb-table-scroll')) {
        const table = child.querySelector('table');
        if (table) blocks.push(readKnowledgeTable(table));
        continue;
      }
      if (tag === 'TABLE') {
        blocks.push(readKnowledgeTable(child));
        continue;
      }
      if (tag === 'UL' || tag === 'OL') {
        consume(child, indent);
        continue;
      }
      if (tag === 'LI') {
        blocks.push({ type: 'li', indent, spans: readKnowledgeInline(child) });
        for (const list of child.children) {
          if (list.tagName === 'UL' || list.tagName === 'OL') consume(list, indent + 1);
        }
        continue;
      }
      const lists = [...(child.children || [])].filter((el) => el.tagName === 'UL' || el.tagName === 'OL');
      const spans = readKnowledgeInline(child);
      if (spans.length || !lists.length) blocks.push({ type: 'p', indent: 0, spans });
      for (const list of lists) consume(list, indent);
    }
  };
  consume(root, 0);
  return normalizeKnowledgeDoc(blocks, { keepEmpty: true });
}

function knowledgeBlockOf(node) {
  if (!node) return null;
  const el = node.nodeType === 1 ? node : node.parentElement;
  return el?.closest?.('[data-kb-block]') || null;
}

function knowledgeCaret(root) {
  const sel = document.getSelection?.();
  if (!sel?.rangeCount || !root.contains(sel.anchorNode)) return { index: 0, offset: 0 };
  const block = knowledgeBlockOf(sel.anchorNode);
  if (!block || !root.contains(block)) return { index: 0, offset: 0 };
  const index = Number(block.dataset.kbBlock) || 0;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(block);
  pre.setEnd(range.startContainer, range.startOffset);
  const holder = document.createElement('div');
  holder.append(pre.cloneContents());
  for (const list of holder.querySelectorAll('ul, ol')) list.remove();
  return { index, offset: holder.textContent.length };
}

function setKnowledgeCaret(root, caret) {
  const sel = document.getSelection?.();
  if (!sel) return;
  const block = root.querySelector(`[data-kb-block="${Number(caret?.index) || 0}"]`);
  if (!block) return;
  const offset = Math.max(0, Number(caret?.offset) || 0);
  const range = document.createRange();
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let left = offset;
  let last = null;
  while (walker.nextNode()) {
    const owner = walker.currentNode.parentElement?.closest?.('[data-kb-block]');
    if (owner !== block) continue;
    last = walker.currentNode;
    if (left <= last.nodeValue.length) {
      range.setStart(last, left);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    left -= last.nodeValue.length;
  }
  if (last) range.setStart(last, last.nodeValue.length);
  else range.setStart(block, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function knowledgeEditor(note) {
  const title = el('input', {
    class: 'bb-kb-title',
    maxlength: '4000',
    value: note.title === 'Untitled' ? '' : note.title,
    placeholder: 'Page title',
    'aria-label': 'Page title',
    'data-focus-key': `kb-title-${note.id}`,
    onInput: (event) => scheduleKnowledgeSave(note.id, { title: event.target.value.trim() || 'Untitled' }),
  });
  const body = el('div', {
    class: 'bb-kb-body bb-kb-doc',
    contenteditable: 'true',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': 'Page',
    'data-focus-key': `kb-body-${note.id}`,
  });
  paintKnowledgeDoc(body, note.doc?.length ? note.doc : knowledgeDocFromLegacy(note.body, note.rich));
  const saveBody = (doc) => {
    const plan = knowledgeEditEffects('input');
    if (!plan.save) return;
    const blocks = normalizeKnowledgeDoc(doc, { keepEmpty: true });
    const hasTableText = (block) => block.type === 'table'
      && (block.rows || []).some((row) => (row.cells || []).some((cell) => (cell.spans || []).some((span) => span.text)));
    const stored = blocks.some((block) => block.type === 'li' || hasTableText(block) || (block.spans || []).some((span) => span.text))
      ? blocks
      : [];
    scheduleKnowledgeSave(note.id, {
      doc: stored,
      body: knowledgePlainText(stored),
      rich: knowledgeRichSpans(stored),
    });
    if (plan.render) render();
  };
  const commitDom = () => saveBody(readKnowledgeDoc(body));
  const applyStructural = (next) => {
    if (!next?.changed) return;
    const plan = knowledgeEditEffects('keydown');
    paintKnowledgeDoc(body, next.doc);
    setKnowledgeCaret(body, next.caret);
    if (plan.save) saveBody(next.doc);
    if (plan.render) render();
  };
  body.addEventListener('paste', (event) => {
    event.preventDefault();
    const html = event.clipboardData?.getData('text/html') || '';
    const text = String(event.clipboardData?.getData('text/plain') || '').replace(/\u00a0/g, ' ');
    const pasted = knowledgePasteDoc(html, text);
    if (!pasted.length) return;
    const next = insertKnowledgeBlocks(readKnowledgeDoc(body), knowledgeCaret(body), pasted);
    if (next.changed) applyStructural(next);
  });
  body.addEventListener('keydown', (event) => {
    const shortcut = knowledgeMarkShortcut(event);
    if (shortcut) {
      event.preventDefault();
      event.stopPropagation();
      document.execCommand(shortcut.command);
      const plan = knowledgeEditEffects('keydown');
      if (plan.save) commitDom();
      if (plan.render) render();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const block = knowledgeBlockOf(document.getSelection?.()?.anchorNode);
      if (block?.tagName === 'LI') {
        applyStructural(applyKnowledgeTab(readKnowledgeDoc(body), knowledgeCaret(body), event.shiftKey));
      }
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      const block = knowledgeBlockOf(document.getSelection?.()?.anchorNode);
      if (block?.tagName === 'LI') {
        event.preventDefault();
        applyStructural(applyKnowledgeEnter(readKnowledgeDoc(body), knowledgeCaret(body)));
        return;
      }
      if (block?.tagName === 'H1' || block?.tagName === 'H2' || block?.tagName === 'H3') {
        event.preventDefault();
        applyStructural(applyKnowledgeHeadingBreak(readKnowledgeDoc(body), knowledgeCaret(body)));
      }
    }
  });
  body.addEventListener('input', () => {
    const caret = knowledgeCaret(body);
    const doc = readKnowledgeDoc(body);
    const tabled = applyKnowledgeMarkdownTables(doc);
    if (tabled.changed) {
      applyStructural({ ...tabled, caret });
      return;
    }
    const headed = applyKnowledgeHeadingMarker(doc, caret);
    if (headed.changed) {
      applyStructural(headed);
      return;
    }
    const marked = applyKnowledgeListMarker(doc, caret);
    if (marked.changed) applyStructural(marked);
    else commitDom();
  });
  const markButton = (label, command) => btn(label, {
    class: 'btn ghost compact-action bb-kb-mark',
    onMouseDown: (event) => {
      event.preventDefault();
      body.focus();
      document.execCommand(command);
      const plan = knowledgeEditEffects('toolbar');
      if (plan.save) commitDom();
      if (plan.render) render();
    },
  });
  const headingButton = (label, level) => btn(label, {
    class: 'btn ghost compact-action bb-kb-mark',
    onMouseDown: (event) => {
      event.preventDefault();
      const plan = knowledgeEditEffects('toolbar');
      const next = setKnowledgeHeading(readKnowledgeDoc(body), knowledgeCaret(body), level);
      if (next.changed) {
        paintKnowledgeDoc(body, next.doc);
        setKnowledgeCaret(body, next.caret);
        if (plan.save) saveBody(next.doc);
      }
      if (plan.render) render();
    },
  });
  return el('div', { class: 'bb-kb-editor' }, [
    el('div', { class: 'bb-kb-editor-bar' }, [
      el('span', { class: 'bb-kb-status', id: 'kb-save-state' }, 'Saved'),
      markButton('Bold', 'bold'),
      markButton('Italic', 'italic'),
      headingButton('H1', 1),
      headingButton('H2', 2),
      headingButton('H3', 3),
      btn('Delete', {
        class: 'btn ghost compact-action is-danger',
        onClick: () => {
          if (!confirm('Delete this page?')) return;
          store = deleteKnowledge(store, note.id);
          saveStore();
          const next = store.knowledge[0];
          go(next ? { kind: 'kb', id: next.id } : { kind: 'kb' });
        },
      }),
    ]),
    el('div', { class: 'bb-kb-sheet' }, [title, body]),
  ]);
}

function knowledgeWorkspace(view) {
  const pages = searchKnowledge(store, knowledgeQuery);
  const selected = (store.knowledge || []).find((item) => item.id === view.id) || null;
  const list = el('aside', { class: 'bb-kb-list' }, [
    el('div', { class: 'bb-kb-list-bar' }, [
      el('input', {
        class: 'search',
        type: 'search',
        placeholder: 'Search pages',
        value: knowledgeQuery,
        'aria-label': 'Search knowledge',
        'data-focus-key': 'kb-search',
        onInput: (event) => { knowledgeQuery = event.target.value; render({ focusKey: 'kb-search' }); },
      }),
      btn('+ New page', {
        class: 'btn compact-action',
        onClick: () => createKnowledgePage(),
      }),
    ]),
    pages.length
      ? el('div', { class: 'list' }, pages.map((note) => el('button', {
        type: 'button',
        class: `row${selected?.id === note.id ? ' is-on' : ''}`,
        onClick: () => go({ kind: 'kb', id: note.id }),
      }, [
        el('div', { class: 'row-title' }, note.title || 'Untitled'),
        el('div', { class: 'row-meta' }, (note.body || 'Empty page').slice(0, 80)),
      ])))
      : el('p', { class: 'empty' }, knowledgeQuery ? 'No page matches that.' : 'No pages yet.'),
  ]);
  const editor = selected
    ? knowledgeEditor(selected)
    : el('div', { class: 'bb-kb-editor is-empty' }, [
      el('p', { class: 'empty' }, 'Pick a page, or start a new one.'),
      btn('+ New page', { class: 'btn', onClick: () => createKnowledgePage() }),
    ]);
  return el('div', { class: 'bb-kb' }, [list, editor]);
}

async function copyText(text, ok = 'Copied.') {
  try {
    await navigator.clipboard.writeText(text);
    setNote(ok);
  } catch {
    setNote('Select and copy.');
  }
}

function jobLinkBar(job) {
  if (!job.url) return el('p', { class: 'tiny' }, 'No posting link saved yet — paste still works.');
  return el('div', { class: 'job-link' }, [
    el('a', { class: 'job-link-url', href: job.url, target: '_blank', rel: 'noopener noreferrer' }, job.url),
    el('div', { class: 'actions' }, [
      el('a', { class: 'btn ghost', href: job.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open'),
      btn('Copy link', { class: 'btn ghost', onClick: () => copyText(job.url, 'Copied the posting link.') }),
    ]),
  ]);
}

function pullRequirements(job, text, { replace = false } = {}) {
  const lines = parseRequirements(text);
  if (!lines.length && String(text || '').trim()) lines.push(String(text).trim());
  if (!lines.length) {
    setNote('Paste the job description. Requirement lines become rows. Try Use sample.');
    return 0;
  }
  if (replace) {
    for (const req of [...job.requirements]) store = deleteRequirement(store, job.id, req.id);
  }
  store = addRequirements(store, job.id, lines);
  store = updatePosting(store, job.id, { sourceText: text });
  saveStore();
  return lines.length;
}

function jobForm() {
  const form = el('form', {
    class: 'panel',
    onSubmit: (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.url = asUrl(data.url);
      if (!data.title) data.title = titleFromJobUrl(data.url);
      if (!data.title) data.title = 'New job posting';
      store = addPosting(store, data);
      const job = store.postings[0];
      const count = pullRequirements(job, data.sourceText);
      if (count) {
        go({ kind: 'jobs', id: job.id });
        setNote(`Pulled ${count} requirement${count === 1 ? '' : 's'} into the table. Add an experience beside each one.`);
      } else {
        go({ kind: 'jobs', id: job.id });
        setNote('Saved the posting. Paste the job description to pull requirement rows.');
      }
    },
  });
  form.append(
    el('div', { class: 'panel-head' }, [
      el('h2', {}, 'Paste the job posting'),
      el('span', { class: 'tiny' }, 'Bullets become rows. We do not fetch the link yet.'),
    ]),
    el('div', { class: 'panel-body' }, [
      el('div', { class: 'grid-3' }, [
        field('Role', el('input', { name: 'title', maxlength: '160', placeholder: 'Product engineer' })),
        field('Company', el('input', { name: 'company', maxlength: '160', placeholder: 'Beep boop' })),
        field('Posting link', el('input', { name: 'url', type: 'url', placeholder: 'https://…' })),
      ]),
      field('Job description',
        el('textarea', { name: 'sourceText', class: 'tall', placeholder: SAMPLE_JD })
      ),
      el('div', { class: 'actions' }, [
        el('button', { type: 'submit', class: 'btn' }, 'Pull requirements'),
        btn('Cancel', { class: 'btn ghost', onClick: () => go({ kind: 'jobs' }) }),
      ]),
    ])
  );
  return form;
}

function coverageBanner(job) {
  const cover = prepCoverage(store, job);
  const chip = (value, total, label) => el('span', { class: 'progress-chip' }, [
    el('strong', {}, `${value}/${total || 0}`),
    ` ${label}`,
  ]);
  return el('div', { class: 'banner banner-progress' }, [
    el('p', { class: 'banner-hint' }, cover.hints[0] || `${cover.withAnswer}/${cover.total || 0} requirements have an answer`),
    el('div', { class: 'progress-chips' }, [
      chip(cover.withBullet, cover.total, 'resume bullets'),
      chip(cover.withQuestion, cover.total, 'questions'),
      chip(cover.withAnswer, cover.total, 'answers'),
    ]),
  ]);
}

function jobMeta(job) {
  return el('div', {}, [
    jobLinkBar(job),
    el('div', { class: 'grid-2' }, [
      field('Role', el('input', {
        value: job.title,
        onInput: (event) => { store = updatePosting(store, job.id, { title: event.target.value }); saveStore(); },
      })),
      field('Company', el('input', {
        value: job.company,
        onInput: (event) => { store = updatePosting(store, job.id, { company: event.target.value }); saveStore(); },
      })),
    ]),
    el('div', { class: 'grid-2' }, [
      field('Posting link', el('input', {
        type: 'url',
        value: job.url,
        placeholder: 'https://',
        onInput: (event) => { store = updatePosting(store, job.id, { url: event.target.value }); saveStore(); },
        onBlur: () => render(),
      })),
      field('Status', el('select', {
        onChange: (event) => { store = updatePosting(store, job.id, { status: event.target.value }); saveStore(); render(); },
      }, POSTING_STATUSES.map((status) =>
        el('option', { value: status, selected: postingStatus(job.status) === status || undefined }, postingStatusLabel(status))
      ))),
    ]),
  ]);
}

function pasteMore(job) {
  const source = el('textarea', {
    class: 'tall',
    placeholder: SAMPLE_JD,
    'aria-label': 'Job description',
  });
  return el('div', { class: 'paste-more' }, [
    field('Job description', source),
    el('p', { class: 'tiny' }, 'Each requirement line becomes a row. The sample shows the shape.'),
    el('div', { class: 'actions' }, [
      btn('Use sample', {
        class: 'btn ghost',
        onClick: () => {
          source.value = SAMPLE_JD;
          source.focus();
        },
      }),
      btn('Pull requirements', {
        class: 'btn',
        onClick: () => {
          const count = pullRequirements(job, source.value);
          if (count) {
            render();
            setNote(`Added ${count} requirement${count === 1 ? '' : 's'}.`);
          }
        },
      }),
    ]),
  ]);
}

function latestQuestion(jobId, reqId) {
  const job = store.postings.find((item) => item.id === jobId);
  const requirement = job?.requirements.find((item) => item.id === reqId);
  return requirement?.questions[requirement.questions.length - 1] || null;
}

function requirementQuestions(job, req) {
  const box = el('div', { class: 'requirement-questions' });
  if (req.questions.length) {
    box.append(el('div', { class: 'requirement-subhead' }, [
      el('span', {}, `Potential questions (${req.questions.length})`),
    ]));
  }
  for (const question of req.questions) {
    const answered = Boolean(question.answer || starFill(question).filled);
    const text = el('input', { value: question.text, placeholder: 'They might ask…', 'aria-label': 'Question' });
    const answer = el('textarea', {
      rows: '2',
      placeholder: 'Short answer, or fill STAR below.',
      'aria-label': 'Answer',
    }, question.answer);
    answer.value = question.answer;
    const fields = {
      situation: el('textarea', { rows: '2', placeholder: 'What was going on?', 'aria-label': 'Situation' }, question.situation),
      task: el('textarea', { rows: '2', placeholder: 'What were you responsible for?', 'aria-label': 'Task' }, question.task),
      action: el('textarea', { rows: '2', placeholder: 'What did you do?', 'aria-label': 'Action' }, question.action),
      result: el('textarea', { rows: '2', placeholder: 'What changed?', 'aria-label': 'Result' }, question.result),
    };
    Object.values(fields).forEach(fitArea);
    const save = () => {
      if (!text.value.trim()) return;
      store = updateQuestion(store, job.id, req.id, question.id, {
        text: text.value,
        answer: answer.value,
        situation: fields.situation.value,
        task: fields.task.value,
        action: fields.action.value,
        result: fields.result.value,
      });
      saveStore();
    };
    [text, answer, ...Object.values(fields)].forEach((node) => node.addEventListener('input', save));
    const stories = linkedEntries(store, req);
    box.append(el('div', { class: 'table-question-line' }, [
      el('details', {
        class: 'table-question',
        open: openQuestionIds.has(question.id),
        onToggle: (event) => {
          if (event.target.open) openQuestionIds.add(question.id);
          else openQuestionIds.delete(question.id);
        },
      }, [
        el('summary', {}, [
          el('span', { class: 'table-question-text' }, question.text),
          el('span', { class: answered ? 'question-status is-answered' : 'question-status' }, answered ? 'Answered' : 'Needs answer'),
        ]),
        el('div', { class: 'table-question-body' }, [
          field('Question', text),
          field('Answer', answer),
          el('div', { class: 'table-question-star' }, [
            ['situation', 'Situation'],
            ['task', 'Task'],
            ['action', 'Action'],
            ['result', 'Result'],
          ].map(([key, label]) => field(label, fields[key]))),
          stories.length
            ? el('div', { class: 'actions' }, [
              btn('Use first experience', {
                class: 'btn ghost',
                onClick: () => {
                  store = answerQuestionFromEntry(store, job.id, req.id, question.id, stories[0].id);
                  saveStore();
                  render();
                  setNote('Used the experience as this answer.');
                },
              }),
            ])
            : null,
        ]),
      ]),
      el('div', { class: 'row-icons' }, [
        btn('×', {
          class: 'icon-quiet is-danger',
          title: 'Delete question',
          'aria-label': 'Delete question',
          onClick: () => {
            if (!confirm('Delete this question?')) return;
            openQuestionIds.delete(question.id);
            store = deleteQuestion(store, job.id, req.id, question.id);
            saveStore();
            render();
          },
        }),
      ]),
    ]));
  }
  const composerKey = `${job.id}:${req.id}`;
  if (questionComposerKey === composerKey) {
    const fresh = el('input', {
      class: 'question-add-input',
      placeholder: 'They might ask…',
      'aria-label': 'Potential question',
      'data-focus-key': `add-q-${req.id}`,
    });
    const add = () => {
      if (!fresh.value.trim()) return;
      store = addQuestion(store, job.id, req.id, fresh.value);
      const created = latestQuestion(job.id, req.id);
      if (created) openQuestionIds.add(created.id);
      saveStore();
      render({ focusKey: `add-q-${req.id}` });
      setNote('Question added under the requirement.');
    };
    fresh.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        questionComposerKey = '';
        render();
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      add();
    });
    box.append(el('div', { class: 'question-add' }, [
      fresh,
      btn('+', { class: 'btn ghost', title: 'Add question', 'aria-label': 'Add question', onClick: add }),
    ]));
  }
  return box;
}

function experienceEditor(job, req, bullet) {
  const entry = bulletEntry(store, bullet);
  const detail = entry || bullet;
  const commit = (patch) => {
    if (entry) {
      store = saveSharedBullet(store, entry.id, patch);
    } else {
      const created = createSharedBullet(store, {
        title: bullet.text,
        rich: bullet.rich,
        notes: bullet.notes,
        situation: bullet.situation,
        task: bullet.task,
        action: bullet.action,
        result: bullet.result,
        ...patch,
      });
      store = created.store;
      if (created.entryId) {
        store = updateBullet(store, job.id, req.id, bullet.id, { entryId: created.entryId, text: bullet.text, rich: bullet.rich });
      }
    }
    saveStore();
  };
  return el('div', { class: 'experience-editor' }, [
    el('div', { class: 'experience-editor-head' }, [
      el('div', {}, [
        el('strong', {}, entry ? 'Shared experience' : 'Experience details'),
        el('p', { class: 'tiny' }, entry
          ? 'Job, STAR, and notes update everywhere this resume bullet is used.'
          : 'This older line is saved only on this requirement.'),
      ]),
      btn('Close', {
        class: 'btn ghost compact-action',
        onClick: () => { expandedBulletKey = ''; render(); },
      }),
    ]),
    sharedBulletForm(detail, {
      focusPrefix: `req-${bullet.id}`,
      showLine: false,
      onPatch: commit,
    }),
    el('div', { class: 'actions experience-actions' }, [
      btn('Remove here', {
        class: 'btn ghost',
        onClick: () => {
          if (!confirm('Remove this experience from this requirement? It will stay in the Brag Book.')) return;
          store = deleteBullet(store, job.id, req.id, bullet.id);
          expandedBulletKey = '';
          saveStore();
          render();
        },
      }),
      entry
        ? btn('Delete from Brag Book', {
          class: 'btn danger',
          onClick: () => {
            if (!confirm('Delete this experience from the Brag Book and every requirement using it?')) return;
            store = deleteEntry(store, entry.id);
            expandedBulletKey = '';
            saveStore();
            render();
          },
        })
        : btn('Delete', {
          class: 'btn danger',
          onClick: () => {
            if (!confirm('Delete this experience?')) return;
            store = deleteBullet(store, job.id, req.id, bullet.id);
            expandedBulletKey = '';
            saveStore();
            render();
          },
        }),
    ]),
  ]);
}

function experienceAdder(job, req) {
  const wrap = el('div', { class: 'experience-add' });
  const adderKey = `${job.id}:${req.id}`;
  const chrome = experienceAdderChrome(expandedAdderKey === adderKey);
  const draft = {};
  const fresh = richLine({
    class: 'experience-compose',
    'data-placeholder': 'Search experiences, or type a new one',
    'aria-label': 'Add an experience',
    'data-focus-key': `add-exp-${req.id}`,
  }, {
    onChange: () => {
      activeIndex = -1;
      showMatches();
    },
    onSubmit: (spans) => {
      if (activeIndex >= 0 && choices[activeIndex]) addExisting(choices[activeIndex]);
      else if (chrome.open || (plain() && !choices.length)) addNew(spans);
      else openForm();
    },
  });
  const matches = el('div', { class: 'experience-matches', hidden: true, role: 'listbox' });
  const linked = new Set(req.bullets.map((bullet) => bullet.entryId).filter(Boolean));
  let choices = [];
  let activeIndex = -1;

  const openForm = () => {
    expandedAdderKey = nextExperienceAdderOpen('new', chrome.open) ? adderKey : '';
    render({ focusKey: `add-exp-${req.id}` });
  };
  const closeForm = () => {
    expandedAdderKey = nextExperienceAdderOpen('cancel', chrome.open) ? adderKey : '';
    render({ focusKey: `add-exp-${req.id}` });
  };
  const addExisting = (entry) => {
    expandedAdderKey = nextExperienceAdderOpen('pick', chrome.open) ? adderKey : '';
    store = addEntryBullet(store, job.id, req.id, entry.id);
    saveStore();
    render({ focusKey: `add-exp-${req.id}` });
    setNote('Linked the existing experience.');
  };
  const plain = () => fresh.textContent.replace(/\u00a0/g, ' ').trim();
  const addNew = (spans = readRich(fresh)) => {
    const text = spans.map((span) => span.text).join('').trim();
    if (!text) return;
    const exact = store.entries.find((entry) =>
      entry.kind === 'experience'
      && entry.title.toLowerCase() === text.toLowerCase()
      && !linked.has(entry.id)
    );
    if (exact) {
      addExisting(exact);
      return;
    }
    expandedAdderKey = nextExperienceAdderOpen('save', chrome.open) ? adderKey : '';
    store = createEntryBullet(store, job.id, req.id, text, undefined, spans, draft);
    saveStore();
    render({ focusKey: `add-exp-${req.id}` });
    setNote('Added the experience here and to the Brag Book.');
  };
  const paintMatches = () => {
    matches.replaceChildren(...choices.map((entry, index) =>
      el('button', {
        type: 'button',
        class: `experience-match${index === activeIndex ? ' is-active' : ''}`,
        role: 'option',
        onMouseDown: (event) => event.preventDefault(),
        onClick: () => addExisting(entry),
      }, [
        el('span', {}, entry.title),
        el('small', {}, [entry.role, entry.when, starFill(entry).ready ? 'STAR ready' : 'Add STAR'].filter(Boolean).join(' · ')),
      ])
    ));
    matches.hidden = !choices.length;
  };
  const showMatches = () => {
    const value = plain();
    const pool = value
      ? searchEntries(store, value)
      : (suggestEntries(store, req).length
        ? suggestEntries(store, req)
        : store.entries);
    choices = pool
      .filter((entry) => entry.kind === 'experience' && !linked.has(entry.id))
      .slice(0, 6);
    if (activeIndex >= choices.length) activeIndex = choices.length - 1;
    paintMatches();
  };
  const hideMatches = () => {
    matches.hidden = true;
    activeIndex = -1;
  };
  fresh.addEventListener('focus', () => {
    activeIndex = -1;
    showMatches();
    if (window.matchMedia?.('(max-width: 860px)')?.matches) {
      fresh.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
  wrap.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (wrap.contains(document.activeElement)) return;
      hideMatches();
    }, 0);
  });
  fresh.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && choices.length) {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, choices.length - 1);
      paintMatches();
      return;
    }
    if (event.key === 'ArrowUp' && choices.length) {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      paintMatches();
      return;
    }
    if (event.key === 'Escape') hideMatches();
  });
  wrap.append(...visibleNodes(
    el('div', { class: 'table-add' }, [
      fresh,
      btn(chrome.addLabel, {
        class: 'btn ghost',
        onClick: () => chrome.open || (plain() && !choices.length) ? addNew() : openForm(),
      }),
      chrome.showCancel ? btn('Cancel', { class: 'btn ghost', onClick: closeForm }) : null,
    ]),
    matches,
    chrome.showForm ? sharedBulletForm(draft, {
      focusPrefix: `add-${req.id}`,
      showLine: false,
      onPatch: (patch) => { Object.assign(draft, patch); },
    }) : null,
  ));
  return wrap;
}

function requirementExperiencesCell(job, req) {
  if (!experiencesUiEnabled()) {
    const bullets = el('div', { class: 'table-bullets' });
    for (const bullet of req.bullets) {
      const bulletKey = `${job.id}:${req.id}:${bullet.id}`;
      const isOpen = expandedBulletKey === bulletKey;
      const linked = linkedBulletLine(store, bullet);
      const shown = displayExperienceLine(linked.text);
      const line = richLine({
        class: 'bullet-copy is-marked',
        'aria-label': 'Experience',
      }, {
        text: shown,
        rich: shown === String(linked.text || '').trim() ? linked.rich : null,
        onChange: (spans) => {
          const text = spans.map((span) => span.text).join('');
          if (!text.trim()) return;
          store = updateBullet(store, job.id, req.id, bullet.id, { text, rich: spans });
          saveStore();
        },
      });
      const entry = bulletEntry(store, bullet);
      bullets.append(el('div', { class: 'bullet-link bb-posting-bullet' }, [
        el('span', { class: 'bullet-mark', 'aria-hidden': 'true' }, '•'),
        line,
        el('div', { class: 'bb-posting-bullet-actions bb-action-row' }, [
          entry ? experienceMembershipPicker(entry) : null,
          btn(isOpen ? 'Close ↑' : 'Details ↓', {
            class: 'bullet-open',
            'aria-expanded': String(isOpen),
            onClick: () => {
              expandedBulletKey = isOpen ? '' : bulletKey;
              render({ preserveScroll: true });
            },
          }),
          btn('Unmap', {
            class: 'btn ghost compact-action',
            onClick: () => {
              if (!confirm('Remove this experience from this requirement? It will stay in the Brag Book.')) return;
              store = deleteBullet(store, job.id, req.id, bullet.id);
              saveStore();
              render({ preserveScroll: true });
            },
          }),
        ]),
      ]));
      if (isOpen) bullets.append(experienceEditor(job, req, bullet));
    }
    bullets.append(experienceAdder(job, req));
    return el('div', { class: 'bullets-stack' }, [bullets]);
  }

  const mapKey = `${job.id}:${req.id}`;
  const searchValue = requirementMapSearchByKey.get(mapKey) || '';
  const mappingDeps = {
    el,
    btn,
    store,
    searchValue,
    searchActiveIndex: requirementMapSearchActiveByKey.get(mapKey) ?? -1,
    onSearchActiveIndexChange: (index) => {
      requirementMapSearchActiveByKey.set(mapKey, index);
      render({ preserveScroll: true, focusKey: `post-map-${req.id}` });
    },
    createExperienceJobId: postingPrimaryCatalogJobId(store, job) || '',
    onCreateExperienceFromQuery: ({ title, jobId }) => {
      const resolvedJobId = jobId || postingPrimaryCatalogJobId(store, job);
      if (!resolvedJobId) {
        setNote('Link this posting to a job before creating an experience.');
        return;
      }
      const trimmed = String(title || '').trim();
      if (!trimmed) return;
      const created = createExperience(store, { jobId: resolvedJobId, title: trimmed });
      const xpId = created.changedExperienceIds[0];
      store = created.store;
      rememberSessionEmptyExperience(xpId);
      store = mapExperienceBucketToRequirement(store, job.id, req.id, xpId);
      expandedRequirementBuckets.add(requirementBucketKey(job.id, req.id, xpId));
      requirementMapSearchActiveByKey.set(mapKey, -1);
      saveStore();
      render({
        preserveScroll: true,
        focusKey: postingMapAddBulletFocusKey(job.id, req.id, xpId),
      });
      setNote('Created experience on this requirement.');
    },
    onAddLooseBulletFromQuery: ({ title, jobId }) => {
      const resolvedJobId = jobId || postingPrimaryCatalogJobId(store, job);
      if (!resolvedJobId) {
        setNote('Link this posting to a job before adding a bullet.');
        return;
      }
      const trimmed = String(title || '').trim();
      if (!trimmed) return;
      let next = addEntry(store, {
        title: trimmed,
        jobId: resolvedJobId,
        rich: [{ text: trimmed, bold: false }],
      });
      const entryId = next.entries[next.entries.length - 1]?.id;
      if (!entryId) return;
      next = mapEntryToRequirement(next, job.id, req.id, entryId);
      next = idempotentAddEntryToPostingResume(next, job.id, entryId);
      store = next;
      const liveReq = store.postings.find((p) => p.id === job.id)?.requirements
        ?.find((row) => row.id === req.id);
      const bulletLine = liveReq?.bullets?.find((line) => line.entryId === entryId);
      if (bulletLine) {
        expandedBulletKey = `${job.id}:${req.id}:${bulletLine.id}`;
      }
      requirementMapSearchActiveByKey.set(mapKey, -1);
      saveStore();
      render({
        preserveScroll: true,
        focusKey: `post-map-version-${entryId}`,
      });
      setNote('Added loose bullet to this requirement.');
    },
    linkedBulletLine,
    displayExperienceLine,
    richLine,
    experienceEditor,
    expandedBulletKey,
    updateEntry,
    updateBullet,
    addBulletFocusKey: postingMapFocusVersionEntryId
      ? `post-map-version-${postingMapFocusVersionEntryId}`
      : '',
    onAddBullet: (postingJob, liveReq, { experienceId }) => {
      let next = store;
      const primaryJobId = postingPrimaryCatalogJobId(next, postingJob);
      try {
        if (experienceId) {
          const versions = experienceVersions(next, experienceId);
          const copyFromEntryId = versions[0]?.id || '';
          const drafted = draftExperienceVersion(
            next,
            experienceId,
            copyFromEntryId ? { copyFromEntryId } : {},
          );
          next = drafted.store;
          const entryId = drafted.changedEntryIds[0];
          next = mapEntryToRequirement(next, postingJob.id, liveReq.id, entryId);
          next = idempotentAddEntryToPostingResume(next, postingJob.id, entryId);
          postingMapFocusVersionEntryId = entryId;
          expandedRequirementBuckets.add(requirementBucketKey(postingJob.id, liveReq.id, experienceId));
        } else {
          if (!primaryJobId) {
            setNote('Link this posting to a job before adding a loose bullet.');
            return;
          }
          next = addEntry(next, {
            title: 'New bullet',
            jobId: primaryJobId,
            rich: [{ text: 'New bullet', bold: false }],
          });
          const entryId = next.entries[next.entries.length - 1]?.id;
          if (!entryId) return;
          next = mapEntryToRequirement(next, postingJob.id, liveReq.id, entryId);
          next = idempotentAddEntryToPostingResume(next, postingJob.id, entryId);
          postingMapFocusVersionEntryId = entryId;
        }
        store = next;
        saveStore();
        render({
          preserveScroll: true,
          focusKey: `post-map-version-${postingMapFocusVersionEntryId}`,
        });
        postingMapFocusVersionEntryId = '';
      } catch (error) {
        setNote(error.message || 'Could not add that bullet.');
      }
    },
    onSearchFocus: () => {
      let otherOpen = false;
      for (const key of requirementMapSearchByKey.keys()) {
        if (key !== mapKey && String(requirementMapSearchByKey.get(key) || '').trim()) {
          otherOpen = true;
          break;
        }
      }
      if (!otherOpen) return;
      clearOtherRequirementMapSearches(mapKey);
      render({ preserveScroll: true });
    },
    onSearchChange: (value, { focusSearch = true } = {}) => {
      clearOtherRequirementMapSearches(mapKey);
      requirementMapSearchByKey.set(mapKey, value);
      requirementMapSearchActiveByKey.set(mapKey, -1);
      render({
        preserveScroll: true,
        ...(focusSearch ? { focusKey: `post-map-${req.id}` } : {}),
      });
    },
    focusKey: `post-map-${req.id}`,
    setExpandedBulletKey: (key) => { expandedBulletKey = key; },
    onSave: (next) => {
      store = next;
      saveStore();
    },
    onRender: (opts) => render(opts),
    isBucketExpanded: (bKey) => expandedRequirementBuckets.has(bKey),
    toggleBucketExpanded: (bKey) => {
      if (expandedRequirementBuckets.has(bKey)) expandedRequirementBuckets.delete(bKey);
      else expandedRequirementBuckets.add(bKey);
    },
    onPickExperience: (experienceId) => {
      store = mapExperienceBucketToRequirement(store, job.id, req.id, experienceId);
      expandedRequirementBuckets.delete(requirementBucketKey(job.id, req.id, experienceId));
      requirementMapSearchByKey.set(mapKey, '');
      saveStore();
      render({ preserveScroll: true, focusKey: `post-map-${req.id}` });
      setNote('Experience added. Expand the row to pick versions.');
    },
    onPickBullet: (entryId) => {
      store = mapEntryToRequirement(store, job.id, req.id, entryId);
      store = idempotentAddEntryToPostingResume(store, job.id, entryId);
      const entry = store.entries.find((row) => row.id === entryId);
      if (entry?.experienceId) {
        expandedRequirementBuckets.delete(requirementBucketKey(job.id, req.id, entry.experienceId));
      }
      requirementMapSearchByKey.set(mapKey, '');
      saveStore();
      render({ preserveScroll: true, focusKey: `post-map-${req.id}` });
      setNote('Bullet mapped to this requirement.');
    },
  };
  return el('div', { class: 'bullets-stack' }, [
    buildRequirementMappingStack(mappingDeps, job, req),
  ]);
}

function applyPostingMapPickToRequirement(job, req) {
  if (!postingMapPick) return false;
  if (postingMapPick.kind === 'bullet') {
    const entryId = postingMapPick.entryId;
    if (req.bullets.some((line) => line.entryId === entryId)) {
      setNote('That bullet is already on this requirement.');
      return true;
    }
    store = mapEntryToRequirement(store, job.id, req.id, entryId);
    store = idempotentAddEntryToPostingResume(store, job.id, entryId);
    const entry = store.entries.find((row) => row.id === entryId);
    if (entry?.experienceId) {
      expandedRequirementBuckets.delete(requirementBucketKey(job.id, req.id, entry.experienceId));
    }
    postingMapPick = null;
    postingMapTargetEntryId = '';
    saveStore();
    render({ preserveScroll: true });
    setNote('Mapped resume bullet to this requirement.');
    return true;
  }
  if (postingMapPick.kind === 'experience') {
    store = mapExperienceBucketToRequirement(store, job.id, req.id, postingMapPick.experienceId);
    expandedRequirementBuckets.delete(requirementBucketKey(job.id, req.id, postingMapPick.experienceId));
    postingMapPick = null;
    saveStore();
    render({ preserveScroll: true });
    setNote('Experience added to this requirement.');
    return true;
  }
  return false;
}

function requirementTableRow(job, req) {
  const requirement = el('textarea', {
    class: 'table-req-text',
    rows: '1',
    'aria-label': 'Requirement',
    title: 'Edit requirement — saves when you leave the field',
    onInput: (event) => {
      const text = event.target.value;
      if (text === req.text) return;
      store = updateRequirement(store, job.id, req.id, { text: text.trim() ? text : req.text });
      saveStore();
    },
    onBlur: (event) => {
      const text = event.target.value.trim();
      if (!text || text === req.text) return;
      store = updateRequirement(store, job.id, req.id, { text });
      saveStore();
      setNote('Requirement saved.');
    },
  }, req.text);
  requirement.value = req.text;
  const composerKey = `${job.id}:${req.id}`;
  const showMapHere = experiencesUiEnabled()
    && (postingMapPick || postingMapTargetEntryId);

  const mapped = requirementHasMapping(req);
  return el('tr', {
    class: `job-table-row${mapped ? ' is-requirement-mapped' : ''}`,
    'data-requirement-id': req.id,
    'data-requirement-mapped': mapped ? 'true' : 'false',
  }, [
    el('td', { class: 'requirement-cell', 'data-label': 'Requirement' }, [
      el('div', { class: 'requirement-line' }, [
        requirement,
        showMapHere
          ? btn('Map here', {
            type: 'button',
            class: 'btn ghost compact-action bb-req-map-here',
            onClick: () => {
              if (postingMapPick) {
                applyPostingMapPickToRequirement(job, req);
                return;
              }
              const entryId = postingMapTargetEntryId;
              const already = req.bullets.some((line) => line.entryId === entryId);
              if (already) {
                setNote('That bullet is already on this requirement.');
                return;
              }
              store = mapEntryToRequirement(store, job.id, req.id, entryId);
              store = idempotentAddEntryToPostingResume(store, job.id, entryId);
              postingMapTargetEntryId = '';
              saveStore();
              render({ preserveScroll: true });
              setNote('Mapped resume bullet to this requirement.');
            },
          })
          : null,
        el('div', { class: 'row-icons' }, [
          btn('?', {
            class: 'icon-quiet',
            title: 'Add a question',
            'aria-label': 'Add a question',
            onClick: () => {
              const opening = questionComposerKey !== composerKey;
              questionComposerKey = opening ? composerKey : '';
              render(opening ? { focusKey: `add-q-${req.id}` } : undefined);
            },
          }),
          btn('×', {
            class: 'icon-quiet is-danger',
            title: 'Delete requirement',
            'aria-label': 'Delete requirement',
            onClick: () => {
              if (!confirm('Delete this requirement and its questions? Experiences stay in the Brag Book.')) return;
              store = deleteRequirement(store, job.id, req.id);
              saveStore();
              render();
            },
          }),
        ]),
      ]),
      req.questions.length || questionComposerKey === composerKey
        ? requirementQuestions(job, req)
        : null,
    ]),
    el('td', { class: 'bullets-cell', 'data-label': 'Experiences' }, [
      requirementExperiencesCell(job, req),
    ]),
  ]);
}

function postingRequirementViewToggle(job) {
  const mode = readPostingRequirementViewMode(job.id);
  const setMode = (next) => {
    writePostingRequirementViewMode(job.id, next);
    render({ preserveScroll: true });
  };
  return el('div', {
    class: 'bb-posting-view-toggle',
    role: 'group',
    'aria-label': 'Requirements table view',
  }, [
    btn('By requirement', {
      type: 'button',
      class: `bb-seg-btn${mode === 'requirement' ? ' is-on' : ''}`,
      'aria-pressed': mode === 'requirement' ? 'true' : 'false',
      onClick: () => setMode('requirement'),
    }),
    btn('By experience', {
      type: 'button',
      class: `bb-seg-btn${mode === 'experience' ? ' is-on' : ''}`,
      'aria-pressed': mode === 'experience' ? 'true' : 'false',
      onClick: () => setMode('experience'),
    }),
  ]);
}

function postingExperienceViewPanel(job) {
  const primaryJobId = postingPrimaryCatalogJobId(store, job);
  return buildPostingExperienceView({
    el,
    btn,
    store,
    displayExperienceLine,
    richLine,
    experienceEditor,
    expandedBulletKey,
    setExpandedBulletKey: (key) => { expandedBulletKey = key; },
    updateEntry,
    linkedBulletLine,
    onSave: (next) => {
      store = next;
      saveStore();
    },
    onRender: (opts) => render(opts),
    onJumpToRequirement: (reqId) => jumpToRequirementFromExperienceView(job.id, reqId),
    onAddBullet: (postingJob, liveReq, { experienceId }) => {
      let next = store;
      try {
        if (experienceId) {
          const versions = experienceVersions(next, experienceId);
          const copyFromEntryId = versions[0]?.id || '';
          const drafted = draftExperienceVersion(
            next,
            experienceId,
            copyFromEntryId ? { copyFromEntryId } : {},
          );
          next = drafted.store;
          const entryId = drafted.changedEntryIds[0];
          next = mapEntryToRequirement(next, postingJob.id, liveReq.id, entryId);
          next = idempotentAddEntryToPostingResume(next, postingJob.id, entryId);
          postingMapFocusVersionEntryId = entryId;
          expandedRequirementBuckets.add(requirementBucketKey(postingJob.id, liveReq.id, experienceId));
        } else if (!primaryJobId) {
          setNote('Link this posting to a job before adding a loose bullet.');
          return;
        } else {
          next = addEntry(next, {
            title: 'New bullet',
            jobId: primaryJobId,
            rich: [{ text: 'New bullet', bold: false }],
          });
          const entryId = next.entries[next.entries.length - 1]?.id;
          if (!entryId) return;
          next = mapEntryToRequirement(next, postingJob.id, liveReq.id, entryId);
          next = idempotentAddEntryToPostingResume(next, postingJob.id, entryId);
          postingMapFocusVersionEntryId = entryId;
        }
        store = next;
        saveStore();
        render({
          preserveScroll: true,
          focusKey: `post-map-version-${postingMapFocusVersionEntryId}`,
        });
        postingMapFocusVersionEntryId = '';
      } catch (error) {
        setNote(error.message || 'Could not add that bullet.');
      }
    },
  }, job);
}

function setRequirementPagerIndex(job, index) {
  requirementPagerIndexByJob[job.id] = clampRequirementIndex(index, (job.requirements || []).length);
}

function bindRequirementPagerSwipe(node, job, page) {
  let startX = 0;
  let startY = 0;
  node.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
  }, { passive: true });
  node.addEventListener('touchend', (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    if (event.target?.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    const next = dx < 0
      ? nextRequirementIndex(page.index, page.total)
      : prevRequirementIndex(page.index, page.total);
    if (next === page.index) return;
    setRequirementPagerIndex(job, next);
    render({ preserveScroll: true });
  }, { passive: true });
}

function requirementPagerBar(job, page) {
  const goTo = (index) => {
    setRequirementPagerIndex(job, index);
    render({ preserveScroll: true });
  };
  return el('div', { class: 'bb-req-pager', 'aria-label': 'Requirement pager' }, [
    el('div', { class: 'bb-req-pager-nav' }, [
      btn('Previous', {
        class: 'btn ghost compact-action',
        disabled: page.index <= 0,
        onClick: () => goTo(prevRequirementIndex(page.index, page.total)),
      }),
      el('span', { class: 'bb-req-pager-label', 'aria-live': 'polite' }, page.label),
      btn('Next', {
        class: 'btn ghost compact-action',
        disabled: page.index >= page.total - 1,
        onClick: () => goTo(nextRequirementIndex(page.index, page.total)),
      }),
    ]),
    el('select', {
      class: 'bb-req-pager-jump',
      'aria-label': 'Jump to requirement',
      onChange: (event) => goTo(Number(event.target.value)),
    }, (job.requirements || []).map((req, index) =>
      el('option', {
        value: String(index),
        selected: index === page.index || undefined,
      }, `${index + 1}. ${String(req.text || 'Requirement').slice(0, 48)}`)
    )),
    el('div', { class: 'bb-req-pager-dots', role: 'tablist', 'aria-label': 'Requirements' },
      (job.requirements || []).map((req, index) =>
        el('button', {
          type: 'button',
          class: `bb-req-dot${index === page.index ? ' is-on' : ''}${page.empty[index] ? ' is-empty' : ''}`,
          role: 'tab',
          'aria-selected': index === page.index ? 'true' : 'false',
          title: page.empty[index] ? `${req.text || 'Requirement'} — no bullets` : (req.text || 'Requirement'),
          'aria-label': page.empty[index]
            ? `Requirement ${index + 1}, no bullets assigned`
            : `Requirement ${index + 1}`,
          onClick: () => goTo(index),
        })
      )
    ),
  ]);
}

function requirementTable(job) {
  const wrap = el('div', { class: 'bb-posting-requirements-wrap' });
  if (experiencesUiEnabled()) {
    wrap.append(postingRequirementViewToggle(job));
    if (readPostingRequirementViewMode(job.id) === 'experience') {
      wrap.append(postingExperienceViewPanel(job));
      return wrap;
    }
  }
  const mobile = mediaMatches(requirementPagerQuery());
  const highlightId = postingRequirementHighlightReqId;
  if (highlightId) {
    const jump = (job.requirements || []).findIndex((req) => req.id === highlightId);
    if (jump >= 0) setRequirementPagerIndex(job, jump);
  }
  const page = requirementPager(job.requirements, requirementPagerIndexByJob[job.id] || 0);
  if (mobile) requirementPagerIndexByJob[job.id] = page.index;
  const shown = visibleRequirementRows(job.requirements, { mobile, index: page.index });
  const table = el('table', { class: 'job-table' });
  table.append(el('thead', {}, [
    el('tr', {}, [
      el('th', {}, 'Job requirement'),
      el('th', {}, 'Experiences'),
    ]),
  ]));
  const body = el('tbody');
  for (const req of shown) {
    body.append(requirementTableRow(job, req));
  }
  table.append(body);
  const tableWrap = el('div', { class: 'job-table-wrap' }, [table]);
  if (mobile && page.total) {
    bindRequirementPagerSwipe(tableWrap, job, page);
    wrap.append(requirementPagerBar(job, page));
  }
  wrap.append(tableWrap);
  return wrap;
}

function unmappedResumeBulletsPanel(job) {
  const rows = unmappedPostingResumeBullets(store, job);
  const count = rows.length;
  const open = unmappedResumePanelExpanded.has(job.id);
  const bodyId = `bb-unmapped-body-${job.id}`;
  const toggle = () => {
    if (unmappedResumePanelExpanded.has(job.id)) unmappedResumePanelExpanded.delete(job.id);
    else unmappedResumePanelExpanded.add(job.id);
    render();
  };
  return el('section', { class: 'bb-unmapped-resume', 'aria-label': 'Unmapped resume bullets' }, [
    el('button', {
      type: 'button',
      class: `bb-unmapped-toggle${open ? ' is-open' : ''}`,
      'aria-expanded': open ? 'true' : 'false',
      'aria-controls': bodyId,
      onClick: toggle,
    }, [
      el('span', { class: 'bb-unmapped-chevron', 'aria-hidden': 'true' }, '▸'),
      el('span', { class: 'bb-unmapped-title' }, 'Unmapped resume bullets'),
      el('span', {
        class: `bb-unmapped-count${count ? '' : ' is-zero'}`,
        'aria-label': `${count} unmapped`,
      }, String(count)),
    ]),
    el('div', {
      class: 'bb-unmapped-body',
      id: bodyId,
      hidden: !open,
    }, [
      el('p', { class: 'tiny bb-unmapped-lede' }, 'On this posting’s resume but not tied to any requirement row.'),
      el('ul', { class: 'bb-unmapped-list' }, rows.map((row) => {
        const entry = row.entryId
          ? store.entries.find((item) => item.id === row.entryId)
          : null;
        return el('li', {
          class: 'bb-unmapped-row',
          draggable: entry && experiencesUiEnabled() ? 'true' : undefined,
          onDragstart: entry ? (event) => {
            if (event.dataTransfer) {
              event.dataTransfer.setData('text/brag-entry-id', entry.id);
              event.dataTransfer.effectAllowed = 'move';
            }
          } : undefined,
        }, [
          el('span', { class: 'bb-unmapped-role-icon', 'aria-hidden': 'true' }, '◦'),
          el('span', { class: 'bb-unmapped-text' }, row.text),
          el('div', { class: 'bb-unmapped-actions bb-action-row' }, [
            entry ? experienceMembershipPicker(entry) : null,
            btn('Map to requirement', {
              type: 'button',
              class: 'btn ghost compact-action',
              onClick: () => {
                if (!entry?.id) return;
                postingMapTargetEntryId = entry.id;
                setNote('Pick a requirement row and tap Map here.');
                render({ preserveScroll: true });
              },
            }),
          ]),
        ]);
      })),
    ]),
  ]);
}

function jobDetailsDisclosure(job) {
  return el('details', { class: 'utility-box' }, [
    el('summary', {}, 'Job details'),
    el('div', { class: 'utility-body' }, [
      jobMeta(job),
      el('div', { class: 'actions' }, [
        btn('Delete posting', {
          class: 'btn danger',
          onClick: () => {
            if (!confirm('Delete this posting? The book stays.')) return;
            store = deletePosting(store, job.id);
            saveStore();
            go({ kind: 'jobs' });
          },
        }),
      ]),
    ]),
  ]);
}

function pasteMoreDisclosure(job) {
  return el('details', { class: 'utility-box' }, [
    el('summary', {}, '+ Paste more requirements'),
    el('div', { class: 'utility-body' }, [pasteMore(job)]),
  ]);
}

function jobDetail(job) {
  const workspace = el('section', { class: 'panel job-workspace' });
  workspace.append(
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, job.title),
        el('p', { class: 'tiny' }, [job.company, hostFromJobUrl(job.url), postingStatusLabel(job.status)].filter(Boolean).join(' · ')),
      ]),
      el('div', { class: 'actions' }, [
        btn('Prep', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'prep' }) }),
        btn('Resume', { class: 'btn', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'resume' }) }),
      ]),
    ]),
    unmappedResumeBulletsPanel(job),
    el('div', { class: 'workspace-status' }, [coverageBanner(job)]),
    job.requirements.length
      ? requirementTable(job)
      : el('div', { class: 'panel-body empty-posting' }, [
        el('p', { class: 'empty' }, 'Paste the job description. Each requirement becomes a row, then add an experience beside it.'),
        pasteMore(job),
      ]),
    el('div', { class: 'workspace-utilities' }, [
      job.requirements.length ? pasteMoreDisclosure(job) : null,
      jobDetailsDisclosure(job),
    ])
  );
  if (!experiencesUiEnabled()) return workspace;
  const panel = experiencesPanelForPage('posting', job);
  if (!panel) return workspace;
  return el('div', { class: `bb-book-dual bb-posting-dual${experiencesMobileDrawerOpen ? ' is-drawer-open' : ''}` }, [
    workspace,
    panel,
    el('button', {
      type: 'button',
      class: 'bb-exp-mobile-toggle',
      onClick: () => {
        experiencesMobileDrawerOpen = !experiencesMobileDrawerOpen;
        render();
      },
    }, 'Experiences'),
  ]);
}

function prepKey(jobId) {
  return `brag-book-prep-i:${jobId}`;
}

function prepView(job) {
  const cards = compilePrep(store, job);
  let index = Number(sessionStorage.getItem(prepKey(job.id)) || '0');
  index = Math.min(Math.max(index, 0), Math.max(cards.length - 1, 0));
  const card = cards[index];
  const wrap = el('section', { class: 'panel' });
  wrap.append(el('div', { class: 'panel-head' }, [
    el('h2', {}, `Cue card ${cards.length ? index + 1 : 0} of ${cards.length}`),
    btn('Back to posting', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id }) }),
  ]));
  if (!card) {
    wrap.append(el('p', { class: 'empty' }, 'Add a requirement first, then walk the cards. Arrow keys once you have some.'));
    return wrap;
  }
  const step = (next) => {
    sessionStorage.setItem(prepKey(job.id), String(next));
    render();
  };
  wrap.append(el('div', { class: 'panel-body' }, [
    coverageBanner(job),
    el('p', { class: 'kicker' }, job.company || 'Interview'),
    el('h3', {}, card.text),
    card.questions.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'They might ask'),
      ...card.questions.map((question) => el('div', { class: 'q-card' }, [
        el('p', {}, `? ${question.text}`),
        question.script || question.answer
          ? el('pre', { class: 'tiny' }, question.script || question.answer)
          : el('p', { class: 'tiny' }, 'No STAR answer yet. Jump back and write one on this question.'),
      ])),
    ]) : el('p', { class: 'empty' }, 'No question on this requirement yet. Add one, then come back.'),
    card.bulletDetails.some((bullet) => bullet.script || bullet.notes) ? el('div', {}, [
      el('p', { class: 'subhead' }, 'Experience details'),
      ...card.bulletDetails
        .filter((bullet) => bullet.script || bullet.notes)
        .map((bullet) => el('div', { class: 'story' }, [
          el('div', { class: 'row-title' }, bullet.text),
          el('pre', { class: 'tiny' }, bullet.script || bullet.notes),
        ])),
    ]) : null,
    card.stories.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'Linked experiences'),
      ...card.stories.map((story) => el('div', { class: 'story' }, [
        el('div', { class: 'row-title' }, story.title),
        el('pre', { class: 'tiny' }, story.script || story.notes || 'Open the book and fill STAR.'),
      ])),
    ]) : null,
    card.bullets.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'Resume bullet'),
      ...card.bullets.map((text) => el('p', {}, `• ${text}`)),
    ]) : null,
    el('div', { class: 'actions' }, [
      btn('Edit in the table', {
        class: 'btn ghost',
        onClick: () => go({ kind: 'jobs', id: job.id }),
      }),
    ]),
    el('p', { class: 'tiny prep-keyboard-hint' }, '← → on the keyboard walks the cards.'),
    el('div', { class: 'prep-nav' }, [
      btn('Previous', { class: 'btn ghost', disabled: index <= 0, onClick: () => step(index - 1) }),
      btn('Next', { class: 'btn ghost', disabled: index >= cards.length - 1, onClick: () => step(index + 1) }),
    ]),
  ]));
  wrap.dataset.prepJob = job.id;
  wrap.dataset.prepIndex = String(index);
  wrap.dataset.prepMax = String(cards.length - 1);
  return wrap;
}

function sectionOrderFor(posting) {
  if (posting?.resume?.sectionOrder?.length) return posting.resume.sectionOrder.slice();
  if (store.resumeSettings?.sectionOrder?.length) return store.resumeSettings.sectionOrder.slice();
  return DEFAULT_SECTION_ORDER.slice();
}

function showCredentialsFor(posting) {
  if (posting?.resume?.showCredentials === true || posting?.resume?.showCredentials === false) {
    return posting.resume.showCredentials;
  }
  return store.resumeSettings?.showCredentials !== false;
}

function livePosting(id) {
  return store.postings.find((item) => item.id === id) || null;
}

function paintFitChip() {
  const node = document.getElementById('resume-fit-chip');
  if (!node) return;
  const dropped = resumeFit.droppedBulletIds || [];
  node.textContent = fitStatusLine(resumeFit);
  node.className = !resumeFit.fits || dropped.length ? 'bb-fit-chip is-warn' : 'bb-fit-chip';
  root.querySelectorAll('[data-bullet-wrap]').forEach((wrap) => {
    const id = wrap.getAttribute('data-bullet-wrap');
    wrap.classList.toggle('is-dropped', dropped.includes(id));
  });
}

function paintResumeSnapshotSaveButton(postingId) {
  const node = document.getElementById('resume-save-copy');
  if (!node) return;
  node.disabled = !resumeFitReadyForPosting(postingId);
}

function paintPreviewFitWarning(page) {
  if (!page?.ownerDocument) return;
  page.querySelector('.bb-fit-warn')?.remove();
  if (resumeFit.fits || !resumeFit.pinnedBlocked) return;
  const banner = page.ownerDocument.createElement('p');
  banner.className = 'bb-fit-warn';
  banner.textContent = fitStatusLine(resumeFit);
  page.prepend(banner);
}

function scaleResumeFrame(wrap, frame) {
  if (!wrap || !frame) return;
  const scale = resumePreviewScale(wrap.clientWidth);
  const scaledWidth = RESUME_PAGE_WIDTH_PX * scale;
  const offset = Math.max(0, (wrap.clientWidth - scaledWidth) / 2);
  frame.style.transform = `translateX(${offset}px) scale(${scale})`;
  wrap.style.height = `${resumePreviewWrapHeight(scale)}px`;
  const preview = wrap.closest('.bb-resume-preview');
  const editor = preview?.parentElement?.querySelector('.bb-resume-editor');
  if (!editor) return;
  const sideBySide = window.matchMedia?.('(min-width: 1024px)')?.matches === true;
  const locked = resumeEditorMaxHeight(preview.offsetHeight, { sideBySide });
  editor.style.height = locked;
  editor.style.maxHeight = locked;
}

async function refreshResumePreview(posting) {
  const frame = document.getElementById('resume-preview-frame');
  const wrap = document.getElementById('resume-preview-wrap');
  if (!frame) return;
  const scrollBeforePreview = pendingResumeScrollRestore
    || (isResumeEditorView() ? captureScroll() : null);
  const current = posting?.id ? livePosting(posting.id) : posting;
  const doc = posting?.id ? compileResumePreviewDoc(current, store) : compileResumeDoc(current, store);
  const html = resumeDocument(renderResumeHtml(doc, { droppedBulletIds: [] }));
  await new Promise((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  const page = frame.contentDocument?.getElementById('page');
  if (!page) return;
  try { await frame.contentDocument.fonts.ready; } catch { /* ignore */ }
  const result = fitOnePage(page, {
    pageHeightPx: PAGE_HEIGHT_PX,
    dropOrder: dropOrderFromDoc(doc),
  });
  resumeFit = {
    ...result,
    droppedLabels: droppedBulletLabels(doc, result.droppedBulletIds),
  };
  resumeFitPostingId = current?.id || 'basics';
  paintResumeSnapshotSaveButton(current?.id);
  paintPreviewFitWarning(page);
  if (current?.id) {
    store = updatePostingResume(store, current.id, {
      fit: {
        fontPt: result.fontPt,
        bulletLineHeight: result.bulletLineHeight,
        droppedBulletIds: result.droppedBulletIds,
        fits: result.fits,
      },
    });
    saveStore();
  }
  paintFitChip();
  scaleResumeFrame(wrap, frame);
  if (scrollBeforePreview) restoreScroll(scrollBeforePreview);
  scheduleResumeScrollRestore(scrollBeforePreview);
  frame.contentDocument?.addEventListener('click', (event) => {
    const li = event.target.closest?.('li[data-bullet-id]');
    const jobNode = event.target.closest?.('[data-job-id]');
    const bulletId = li?.getAttribute('data-bullet-id');
    const jobId = li?.getAttribute('data-job-id') || jobNode?.getAttribute('data-job-id');
    if (!bulletId && !jobId) return;
    const focusKey = bulletId ? `rb-${bulletId}-line` : `rj-${jobId}-company`;
    if (jobId && roleIsCollapsed(collapsedResumeRoles, current?.id, jobId)) {
      collapsedResumeRoles = toggleRoleCollapsed(collapsedResumeRoles, current?.id, jobId);
      render({ focusKey });
      return;
    }
    const field = root.querySelector(`[data-focus-key="${focusKey}"]`)
      || root.querySelector(`[data-focus-key="rb-${bulletId}-body"]`)
      || root.querySelector(`[data-focus-key="rb-${bulletId}-lead"]`);
    field?.focus();
    root.querySelectorAll('.bb-rb.is-on').forEach((node) => node.classList.remove('is-on'));
    if (bulletId) root.querySelector(`[data-bullet-wrap="${bulletId}"]`)?.classList.add('is-on');
  });
}

function scheduleResumePreview(posting) {
  if (resumePreviewTimer) clearTimeout(resumePreviewTimer);
  resumePreviewTimer = setTimeout(() => {
    resumePreviewTimer = null;
    refreshResumePreview(posting);
  }, 140);
}

function exportResumePdf(posting) {
  const frame = document.getElementById('resume-preview-frame');
  if (frame?.contentWindow) {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setNote('Use the print dialog → Save as PDF.');
    return;
  }
  const doc = posting ? compileResumePreviewDoc(posting, store) : compileResumeDoc(posting, store);
  const html = resumeDocument(renderResumeHtml(doc, { droppedBulletIds: resumeFit.droppedBulletIds }), {
    fittedVars: resumeFit.vars,
    print: true,
  });
  const win = window.open('', '_blank');
  if (!win) {
    downloadText('resume.html', html, 'text/html');
    setNote('Download the HTML and print it.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function exportResumeDocx(posting) {
  const compiled = posting ? compileResumePreviewDoc(posting, store) : compileResumeDoc(posting, store);
  const doc = applyDroppedIds(
    visibleResumeDoc(compiled, { includeFitDrops: true }),
    resumeFit.droppedBulletIds || []
  );
  doc.fit = {
    fontPt: resumeFit.fontPt,
    bulletLineHeight: resumeFit.bulletLineHeight,
    droppedBulletIds: resumeFit.droppedBulletIds || [],
    fits: resumeFit.fits,
  };
  const name = (posting?.title || store.profile?.name || 'resume').replace(/[^\w.-]+/g, '_');
  downloadBlob(`${name}.docx`, resumeDocxBlob(doc));
  setNote('Downloaded a Word resume.');
}

function snapshotFitPayload() {
  return {
    fontPt: resumeFit.fontPt,
    bulletLineHeight: resumeFit.bulletLineHeight,
    droppedBulletIds: resumeFit.droppedBulletIds || [],
    droppedLabels: resumeFit.droppedLabels || [],
    fits: resumeFit.fits,
    pinnedBlocked: resumeFit.pinnedBlocked,
    vars: { ...(resumeFit.vars || {}) },
  };
}

function resumeFitReadyForPosting(postingId) {
  return resumeFitPostingId === postingId
    && resumeFit.vars
    && Object.keys(resumeFit.vars).length > 0;
}

function bookPayloadUsage() {
  try {
    return serializeBook(store).json.length;
  } catch {
    return JSON.stringify(store).length;
  }
}

function snapshotFileBase(snapshot) {
  return (snapshot?.name || snapshot?.initialName || 'saved_resume').replace(/[^\w.-]+/g, '_');
}

function exportResumeSnapshotPdf(snapshot) {
  const frame = document.getElementById('resume-snapshot-frame');
  if (frame?.contentWindow) {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setNote('Use the print dialog → Save as PDF.');
    return;
  }
  const doc = resumeSnapshotToDoc(snapshot);
  const html = resumeDocument(
    renderResumeHtml(doc, { droppedBulletIds: snapshot.fit.droppedBulletIds }),
    { fittedVars: snapshot.fit.vars, print: true },
  );
  const win = window.open('', '_blank');
  if (!win) {
    downloadText(`${snapshotFileBase(snapshot)}.html`, html, 'text/html');
    setNote('Download the HTML and print it.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function exportResumeSnapshotDocx(snapshot) {
  downloadBlob(`${snapshotFileBase(snapshot)}.docx`, resumeDocxBlob(resumeSnapshotToDoc(snapshot)));
  setNote('Downloaded a Word resume.');
}

async function refreshResumeSnapshotPreview(snapshot) {
  const frame = document.getElementById('resume-snapshot-frame');
  const wrap = document.getElementById('resume-snapshot-wrap');
  if (!frame || !snapshot) return;
  const doc = resumeSnapshotToDoc(snapshot);
  const html = resumeDocument(
    renderResumeHtml(doc, { droppedBulletIds: snapshot.fit.droppedBulletIds }),
    { fittedVars: snapshot.fit.vars },
  );
  await new Promise((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  try { await frame.contentDocument?.fonts?.ready; } catch { /* ignore */ }
  scaleResumeFrame(wrap, frame);
}

function savedResumesBank() {
  const rows = activeResumeSnapshots(store);
  const usage = bookPayloadUsage();
  const capWarn = usage >= BOOK_MAX_CHARS * 0.8;
  const list = el('div', { class: 'bb-snapshot-list' }, rows.length
    ? rows.map((row) => {
      const source = [row.sourcePosting?.company, row.sourcePosting?.title].filter(Boolean).join(' · ');
      const saved = row.savedAt ? new Date(row.savedAt).toLocaleDateString() : '';
      return el('div', { class: 'bb-snapshot-row' }, [
        el('div', { class: 'bb-snapshot-meta' }, [
          el('strong', {}, row.name || row.initialName),
          el('span', { class: 'tiny mono' }, [saved, source ? ` · ${source}` : ''].filter(Boolean).join('')),
        ]),
        el('div', { class: 'bb-snapshot-actions' }, [
          btn('Open', {
            class: 'btn ghost compact-action',
            onClick: () => go({ kind: 'snapshots', id: row.id }),
          }),
        ]),
      ]);
    })
    : [el('p', { class: 'empty tiny' }, 'No saved copies yet. On a posting’s Resume page, use Save a copy.')]);
  return el('section', { class: 'panel bb-snapshot-bank' }, [
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, 'Saved resumes'),
        el('p', { class: 'tiny' }, 'Immutable copies of posting resumes — what you saved is what you get.'),
      ]),
      btn('Back', { class: 'btn ghost', onClick: () => go({ kind: 'home' }) }),
    ]),
    capWarn ? el('p', { class: 'tiny bb-snapshot-cap-warn' }, 'This book is getting large. Saved copies count toward the 1.5 MB account limit — export or delete older snapshots if saves start failing.') : null,
    el('div', { class: 'panel-body' }, [list]),
  ]);
}

function savedResumeDetail(snapshotId) {
  const snapshot = resumeSnapshotById(store, snapshotId, { includeDeleted: true });
  if (!snapshot || snapshotIsDeleted(snapshot)) {
    queueMicrotask(() => go({ kind: 'snapshots' }));
    return el('section', { class: 'panel' }, [
      el('div', { class: 'panel-body empty' }, 'That saved resume is no longer in the bank.'),
    ]);
  }
  const source = [snapshot.sourcePosting?.company, snapshot.sourcePosting?.title].filter(Boolean).join(' · ');
  const saved = snapshot.savedAt ? new Date(snapshot.savedAt).toLocaleString() : '';
  const applyPosting = resumeSnapshotApplyToPostingId
    ? (store.postings || []).find((row) => row.id === resumeSnapshotApplyToPostingId)
    : null;
  const renameOpen = resumeSnapshotRenameOpen === snapshot.id;
  const renameInput = el('input', {
    class: 'bb-snapshot-rename-input',
    value: snapshot.name || snapshot.initialName,
    'aria-label': 'Saved resume name',
  });
  const frame = el('iframe', {
    id: 'resume-snapshot-frame',
    class: 'bb-resume-frame',
    title: 'Saved resume preview',
  });
  const preview = el('div', { class: 'bb-resume-preview' }, [
    el('div', { class: 'bb-resume-preview-wrap', id: 'resume-snapshot-wrap' }, [frame]),
  ]);
  return el('section', { class: 'panel bb-snapshot-detail' }, [
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, snapshot.name || snapshot.initialName),
        el('p', { class: 'tiny' }, [saved, source ? ` · ${source}` : ''].filter(Boolean).join(' · ')),
      ]),
      el('div', { class: 'bb-snapshot-actions' }, [
        applyPosting ? btn('Use as starting point', {
          class: 'btn',
          onClick: () => {
            applySnapshotToPosting(applyPosting, snapshot.id);
            go({ kind: 'jobs', id: applyPosting.id, mode: 'resume' });
          },
        }) : null,
        btn('Back to saved resumes', { class: 'btn ghost', onClick: () => go({ kind: 'snapshots' }) }),
        btn('Print / PDF', { class: 'btn', onClick: () => exportResumeSnapshotPdf(snapshot) }),
        btn('Download Word', { class: 'btn ghost', onClick: () => exportResumeSnapshotDocx(snapshot) }),
        renameOpen
          ? null
          : btn('Rename', { class: 'btn ghost', onClick: () => { resumeSnapshotRenameOpen = snapshot.id; render(); } }),
        btn('Delete', {
          class: 'btn ghost',
          onClick: () => {
            if (!confirm('Delete this saved copy from the bank? The frozen data stays in your book for recovery.')) return;
            store = deleteResumeSnapshot(store, snapshot.id);
            saveStore();
            resumeSnapshotRenameOpen = null;
            go({ kind: 'snapshots' });
            setNote('Removed from saved resumes.');
          },
        }),
      ]),
    ]),
    renameOpen ? el('div', { class: 'bb-snapshot-save' }, [
      field('Name', renameInput),
      el('div', { class: 'actions' }, [
        btn('Save name', {
          class: 'btn',
          onClick: () => {
            const name = renameInput.value.trim();
            if (!name) {
              setNote('Name is required.');
              return;
            }
            store = renameResumeSnapshot(store, snapshot.id, name);
            saveStore();
            resumeSnapshotRenameOpen = null;
            render();
            setNote('Renamed saved resume.');
          },
        }),
        btn('Cancel', {
          class: 'btn ghost',
          onClick: () => {
            resumeSnapshotRenameOpen = null;
            render();
          },
        }),
      ]),
    ]) : null,
    el('div', { class: 'panel-body' }, [preview]),
  ]);
}

function snapshotIsDeleted(snapshot) {
  return (snapshot?.events || []).some((event) => event.kind === 'delete');
}

function applySnapshotToPosting(posting, snapshotId, { fromChooser = false } = {}) {
  const snapshot = resumeSnapshotById(store, snapshotId);
  if (!snapshot || !posting) return;
  const onChooseScreen = fromChooser || posting.resume?.mode === 'choose';
  if (!onChooseScreen && !confirm(postingResumeOverwriteConfirm(snapshot, posting))) return;
  try {
    const result = startPostingResumeFromSnapshot(store, posting.id, snapshotId, {
      fit: snapshotFitPayload(),
    });
    if (!result.changed) {
      setNote('Could not load that saved resume.');
      return;
    }
    store = result.store;
    saveStore();
    void flushSave('navigation');
    resumeSnapshotStartOpen = null;
    resumeSnapshotChooserOpen = null;
    resumeSnapshotApplyToPostingId = null;
    render();
    setNote(onChooseScreen
      ? 'This posting’s resume now starts from your saved copy. The header still comes from Resume basics.'
      : 'Loaded the saved resume onto this posting. Your previous version was saved in Saved resumes.');
  } catch (err) {
    setNote(err?.message || 'Could not load that saved resume.');
  }
}

function resumeSnapshotStartPanel(posting) {
  const rows = activeResumeSnapshots(store);
  return el('div', { class: 'bb-snapshot-save bb-snapshot-start' }, [
    el('p', { class: 'tiny' }, 'Pick a saved resume to copy onto this posting. The current resume is auto-saved first.'),
    rows.length
      ? el('div', { class: 'bb-snapshot-list bb-snapshot-start-list' }, rows.map((row) => el('div', { class: 'bb-snapshot-row' }, [
        el('div', { class: 'bb-snapshot-meta' }, [
          el('strong', {}, row.name || row.initialName),
          el('span', { class: 'tiny' }, [
            row.sourcePosting?.company,
            row.savedAt ? new Date(row.savedAt).toLocaleDateString() : '',
          ].filter(Boolean).join(' · ')),
        ]),
        el('div', { class: 'bb-snapshot-actions' }, [
          btn('Use as starting point', {
            class: 'btn compact-action',
            onClick: () => applySnapshotToPosting(posting, row.id),
          }),
        ]),
      ])))
      : el('p', { class: 'empty tiny' }, 'No saved resumes yet. Use Save a copy first.'),
    el('div', { class: 'actions' }, [
      btn('Cancel', {
        class: 'btn ghost compact-action',
        onClick: () => {
          resumeSnapshotStartOpen = null;
          render();
        },
      }),
    ]),
  ]);
}

function snapshotSaveForm(posting) {
  const input = el('input', {
    class: 'bb-snapshot-name-input',
    value: defaultResumeSnapshotName(posting, new Date()),
    'aria-label': 'Saved resume name',
  });
  return el('div', { class: 'bb-snapshot-save' }, [
    el('p', { class: 'tiny' }, 'Saves a point-in-time copy of this resume layout and one-page fit. Live edits will not change it.'),
    field('Name', input),
    el('div', { class: 'actions' }, [
      btn('Save copy', {
        class: 'btn',
        onClick: () => {
          const name = input.value.trim();
          if (!name) {
            setNote('Name is required.');
            return;
          }
          try {
            const result = saveResumeSnapshot(store, posting.id, {
              name,
              fit: snapshotFitPayload(),
            });
            store = result.store;
            saveStore();
            resumeSnapshotSaveOpen = null;
            go({ kind: 'snapshots', id: result.snapshot.id });
            setNote('Saved a copy of this resume.');
          } catch (err) {
            setNote(err?.message || 'Could not save this copy.');
          }
        },
      }),
      btn('Cancel', {
        class: 'btn ghost',
        onClick: () => {
          resumeSnapshotSaveOpen = null;
          render();
        },
      }),
    ]),
  ]);
}

function resumePreviewPane() {
  const chip = el('p', { class: 'bb-fit-chip', id: 'resume-fit-chip' }, 'Measuring one page…');
  const frame = el('iframe', {
    id: 'resume-preview-frame',
    class: 'bb-resume-frame',
    title: 'Resume preview',
  });
  const wrap = el('div', { class: 'bb-resume-preview-wrap', id: 'resume-preview-wrap' }, [frame]);
  return el('div', { class: 'bb-resume-preview' }, [chip, wrap]);
}

function resumeSectionOrder(posting) {
  const order = sectionOrderFor(posting);
  const labels = {
    experience: 'Work Experience',
    credentials: 'Credentials',
    education: 'Education',
    additional: 'Additional Info',
  };
  return el('div', { class: 'bb-resume-order' }, [
    el('p', { class: 'subhead' }, 'Section order'),
    ...order.map((key, index) => el('div', { class: 'bb-order-row' }, [
      el('span', {}, labels[key] || key),
      el('div', { class: 'actions' }, [
        btn('↑', {
          class: 'btn ghost compact-action',
          disabled: index === 0,
          'aria-label': `Move ${labels[key]} up`,
          onClick: () => {
            if (!posting) {
              store = updateResumeSettings(store, { sectionOrder: moveKey(order, key, -1) });
            } else {
              store = updatePostingResume(store, posting.id, { sectionOrder: moveKey(order, key, -1) });
            }
            saveStore();
            render();
          },
        }),
        btn('↓', {
          class: 'btn ghost compact-action',
          disabled: index === order.length - 1,
          'aria-label': `Move ${labels[key]} down`,
          onClick: () => {
            if (!posting) {
              store = updateResumeSettings(store, { sectionOrder: moveKey(order, key, 1) });
            } else {
              store = updatePostingResume(store, posting.id, { sectionOrder: moveKey(order, key, 1) });
            }
            saveStore();
            render();
          },
        }),
      ]),
    ])),
  ]);
}

function careerJobById(id) {
  return (store.jobs || []).find((job) => job.id === id) || null;
}

function isSharedJob(id) {
  return Boolean(careerJobById(id));
}

function isLocalOnlyJob(posting, id) {
  if (!posting) return false;
  return Boolean(localJobById(posting.resume, id)) && !isSharedJob(id);
}

function isLocalResumeRow(posting, key, id) {
  return Boolean(posting && (posting.resume?.[key] || []).some((item) => item.id === id));
}

function additionalRowRecord(posting, rowId) {
  if (posting) {
    const local = (livePosting(posting.id)?.resume?.localAdditional || []).find((item) => item.id === rowId);
    if (local) return local;
  }
  return (store.additional || []).find((item) => item.id === rowId) || null;
}

function hideSharedResumeRow(posting, kind, id) {
  store = replacePostingResume(store, posting.id, hideResumeRow(livePosting(posting.id).resume, kind, id));
  saveStore();
  render();
  setNote('Hidden on this posting. Resume basics is unchanged.');
}

function postingRowDeletes(posting, { local, kind, id, localDelete, sharedDelete, confirmText }) {
  return [
    btn('Delete', {
      class: 'btn ghost compact-action is-danger',
      onClick: () => {
        if (posting && local) {
          localDelete();
          saveStore();
          render();
          return;
        }
        if (posting) {
          hideSharedResumeRow(posting, kind, id);
          return;
        }
        if (!confirm(confirmText)) return;
        sharedDelete();
        saveStore();
        render();
      },
    }),
    posting && !local ? btn('Delete from Resume basics too', {
      class: 'btn ghost compact-action is-danger',
      onClick: () => {
        if (!confirm(`${confirmText} Other postings that still show it will lose it.`)) return;
        sharedDelete();
        saveStore();
        render();
      },
    }) : null,
  ];
}

function bulletCount(career) {
  return (career.groups || []).reduce((sum, group) => sum + (group.bullets || []).length, 0);
}

function resumeSectionHead(title, action) {
  return el('div', { class: 'bb-section-head' }, [
    el('h3', {}, title),
    action || null,
  ]);
}

function resumeMoveBtns(label, { index, length, onMove, disableUp, disableDown }) {
  const upOff = disableUp ?? index <= 0;
  const downOff = disableDown ?? index >= length - 1;
  return el('div', { class: 'actions bb-order-btns' }, [
    btn('↑', {
      class: 'btn ghost compact-action',
      title: `Move ${label} up`,
      'aria-label': `Move ${label} up`,
      disabled: upOff,
      onClick: () => onMove(-1),
    }),
    btn('↓', {
      class: 'btn ghost compact-action',
      title: `Move ${label} down`,
      'aria-label': `Move ${label} down`,
      disabled: downOff,
      onClick: () => onMove(1),
    }),
  ]);
}

const LIB_PICK_MAX_HEIGHT_PX = 320;

function libraryPickHighlightFragment(text, query) {
  const hay = String(text || '');
  const needle = String(query || '').trim();
  if (!needle) return document.createTextNode(hay);
  const frag = document.createDocumentFragment();
  const lower = hay.toLowerCase();
  const nLower = needle.toLowerCase();
  let i = 0;
  while (i < hay.length) {
    const at = lower.indexOf(nLower, i);
    if (at < 0) {
      frag.append(document.createTextNode(hay.slice(i)));
      break;
    }
    if (at > i) frag.append(document.createTextNode(hay.slice(i, at)));
    frag.append(el('mark', { class: 'bb-lib-mark' }, hay.slice(at, at + needle.length)));
    i = at + needle.length;
  }
  return frag;
}

function libraryBulletPicker(posting, career, group) {
  const wrap = el('div', { class: 'bb-lib-pick' });
  const listId = `lib-picks-${group?.id || career.id}`;
  const query = el('input', {
    type: 'search',
    placeholder: 'Search resume bullets',
    'aria-label': 'Search resume bullets',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': listId,
    'data-focus-key': `pick-${group?.id || career.id}`,
  });
  const list = el('div', {
    class: 'bb-lib-picks',
    id: listId,
    role: 'listbox',
    hidden: true,
  });
  let activeIndex = -1;
  let docCloseListener = null;
  let scrollListener = null;
  const linkedJobId = career.jobId && career.jobId !== career.id ? career.jobId : career.id;
  const anchorEl = () => query.closest('.bb-job-card') || wrap;

  const searchChoices = () => {
    const q = query.value.trim();
    if (!q) return { q, choices: [] };
    const taken = resumeTakenEntryIds(store, posting || null, { includeExcluded: !posting });
    return { q, choices: libraryBulletChoices(store, { query: q, takenIds: taken, jobId: linkedJobId }) };
  };

  const detachOpenListeners = () => {
    if (docCloseListener) {
      document.removeEventListener('pointerdown', docCloseListener, true);
      docCloseListener = null;
    }
    if (scrollListener) {
      scrollListener.target?.removeEventListener('scroll', scrollListener.fn);
      scrollListener = null;
    }
  };

  const positionList = () => {
    if (list.hidden) return;
    const inputRect = query.getBoundingClientRect();
    const cardRect = anchorEl().getBoundingClientRect();
    const spaceBelow = window.innerHeight - inputRect.bottom;
    const spaceAbove = inputRect.top;
    const openUp = spaceBelow < Math.min(LIB_PICK_MAX_HEIGHT_PX, 180) && spaceAbove > spaceBelow;
    list.classList.toggle('is-above', openUp);
    list.style.left = `${cardRect.left}px`;
    list.style.width = `${cardRect.width}px`;
    if (openUp) {
      list.style.top = 'auto';
      list.style.bottom = `${window.innerHeight - inputRect.top + 4}px`;
    } else {
      list.style.top = `${inputRect.bottom + 4}px`;
      list.style.bottom = 'auto';
    }
  };

  const closeList = () => {
    list.hidden = true;
    query.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
    detachOpenListeners();
  };

  const openList = () => {
    list.hidden = false;
    query.setAttribute('aria-expanded', 'true');
    positionList();
    if (!docCloseListener) {
      docCloseListener = (event) => {
        if (wrap.contains(event.target) || list.contains(event.target)) return;
        closeList();
      };
      document.addEventListener('pointerdown', docCloseListener, true);
    }
    const scrollRoot = query.closest('.bb-resume-editor');
    if (scrollRoot && !scrollListener) {
      const fn = () => positionList();
      scrollRoot.addEventListener('scroll', fn, { passive: true });
      scrollListener = { target: scrollRoot, fn };
    }
  };

  const pickEntry = (entry) => {
    store = placeLibraryBullet(store, {
      postingId: posting?.id || null,
      jobId: career.id,
      groupId: group?.id || '',
      entryId: entry.id,
    });
    query.value = '';
    closeList();
    saveStore();
    const added = compileResumeDoc(posting || null, store).sections.experience.jobs
      .find((job) => job.id === career.id);
    const bullets = (added?.groups || []).flatMap((item) => item.bullets || []);
    const linked = bullets.find((bullet) => (bullet.sourceEntryIds || []).includes(entry.id));
    render({ focusKey: linked ? `rb-${linked.id}-line` : `pick-${group?.id || career.id}` });
  };

  const createFromSearch = () => {
    if (!posting) return;
    const { q, choices } = searchChoices();
    if (!q || choices.length) return;
    const created = createSharedBullet(store, { title: q, jobId: career.id });
    store = created.store;
    if (created.entryId) {
      store = placeLibraryBullet(store, {
        postingId: posting.id,
        jobId: career.id,
        groupId: group?.id || '',
        entryId: created.entryId,
      });
    }
    query.value = '';
    closeList();
    saveStore();
    render({ focusKey: `pick-${group?.id || career.id}` });
  };

  const setActive = (next, { choices = [] } = {}) => {
    const max = choices.length - 1;
    if (max < 0) {
      activeIndex = -1;
      return;
    }
    activeIndex = Math.max(0, Math.min(next, max));
    list.querySelectorAll('.bb-lib-choice').forEach((node, index) => {
      const on = index === activeIndex;
      node.classList.toggle('is-active', on);
      node.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) node.scrollIntoView({ block: 'nearest' });
    });
  };

  const paint = () => {
    const { q, choices } = searchChoices();
    activeIndex = -1;
    if (!q) {
      list.replaceChildren(el('p', { class: 'bb-lib-picks-hint' }, 'Type to search resume bullets.'));
      openList();
      return;
    }
    if (!choices.length) {
      list.replaceChildren(el('p', { class: 'bb-lib-picks-hint' }, 'No matching resume bullets.'));
      openList();
      return;
    }
    list.replaceChildren(...choices.map((entry, index) => {
      const row = el('button', {
        type: 'button',
        class: 'bb-lib-choice',
        role: 'option',
        id: `${listId}-opt-${index}`,
        'aria-selected': 'false',
        onPointerdown: (event) => {
          event.preventDefault();
          pickEntry(entry);
        },
      }, libraryPickHighlightFragment(displayExperienceLine(entry.title), q));
      return row;
    }));
    openList();
  };

  query.addEventListener('input', paint);
  query.addEventListener('focus', paint);
  query.addEventListener('keydown', (event) => {
    const { q, choices } = searchChoices();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeList();
      return;
    }
    if (event.key === 'ArrowDown' && choices.length) {
      event.preventDefault();
      if (list.hidden) openList();
      setActive(activeIndex + 1, { choices });
      return;
    }
    if (event.key === 'ArrowUp' && choices.length) {
      event.preventDefault();
      if (list.hidden) openList();
      setActive(activeIndex <= 0 ? choices.length - 1 : activeIndex - 1, { choices });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && choices[activeIndex]) pickEntry(choices[activeIndex]);
      else createFromSearch();
    }
  });
  wrap.append(
    query,
    btn('+ New', {
      class: 'btn ghost compact-action',
      onClick: createFromSearch,
    }),
    list,
  );
  return wrap;
}

function addSubheadingButton(posting, career, { afterId } = {}) {
  return btn(afterId ? '+ Sub-heading here' : '+ Sub-heading', {
    class: 'btn ghost compact-action',
    onClick: () => {
      const added = addResumeGroup(store, posting?.id || null, career, { afterId });
      store = added.store;
      if (added.groupId) draftResumeGroupId = added.groupId;
      saveStore();
      render({ focusKey: added.groupId ? `rg-${added.groupId}-heading` : `rj-${career.id}-company` });
    },
  });
}

function resumeExperienceVersionMenu(posting, bullet) {
  if (!posting?.id || !experiencesUiEnabled()) return null;
  const entryId = (bullet.sourceEntryIds || [])[0];
  if (!entryId) return null;
  const menu = experienceVersionSwapMenu(store, posting.id, bullet.id);
  if (!menu?.choices?.length || menu.choices.length < 2) return null;
  const popoverId = `bb-version-menu-${bullet.id}`;
  let open = expandedVersionSwapBulletId === bullet.id;
  const close = () => {
    expandedVersionSwapBulletId = '';
    render();
  };
  const toggle = btn(`Versions ${menu.choices.length} ▾`, {
    type: 'button',
    class: 'btn ghost compact-action bb-version-swap',
    'aria-expanded': open ? 'true' : 'false',
    'aria-controls': popoverId,
    onClick: () => {
      expandedVersionSwapBulletId = open ? '' : bullet.id;
      render();
    },
  });
  if (!open) return toggle;
  const pendingPick = versionSwapTransferPick
    && versionSwapTransferPick.postingId === posting.id
    && versionSwapTransferPick.bulletId === bullet.id
    ? versionSwapTransferPick
    : null;
  const applyVersionSwap = (transferRequirementLinks) => {
    if (!pendingPick?.toEntryId) return;
    const swapped = swapPostingResumeExperienceVersion(store, {
      postingId: posting.id,
      resumeBulletId: bullet.id,
      toEntryId: pendingPick.toEntryId,
      transferRequirementLinks,
    });
    if (!swapped.ok) {
      setNote(swapped.note || 'That version is already on this resume.');
      return;
    }
    store = swapped.store;
    expandedVersionSwapBulletId = '';
    versionSwapTransferPick = null;
    saveStore();
    scheduleResumePreview(posting);
    render({ focusKey: `rb-${bullet.id}-line`, preserveScroll: true });
    setNote(transferRequirementLinks
      ? 'Swapped version and moved requirement links for this row.'
      : 'Swapped version on this resume row.');
  };
  const listBody = pendingPick
    ? [
      el('p', { class: 'tiny bb-version-swap-prompt' }, 'Move this row’s requirement links to the chosen version? Other on-resume versions stay as they are.'),
      btn('Yes, move links', {
        type: 'button',
        class: 'bb-version-swap-choice',
        onClick: () => applyVersionSwap(true),
      }),
      btn('No, swap only', {
        type: 'button',
        class: 'bb-version-swap-choice',
        onClick: () => applyVersionSwap(false),
      }),
      btn('Cancel', {
        type: 'button',
        class: 'bb-version-swap-choice',
        onClick: () => {
          versionSwapTransferPick = null;
          render({ preserveScroll: true, focusKey: `rb-${bullet.id}-line` });
        },
      }),
    ]
    : menu.choices.map((choice) => {
      const disabled = choice.onResume && choice.onResumeBulletId !== bullet.id;
      return btn(choice.onResume ? `${choice.title} · On resume` : choice.title, {
        type: 'button',
        class: `bb-version-swap-choice${disabled ? ' is-disabled' : ''}`,
        disabled,
        onClick: () => {
          if (disabled) {
            setNote('That version is already on this resume.');
            return;
          }
          if (choice.entryId === entryId) {
            close();
            return;
          }
          versionSwapTransferPick = {
            postingId: posting.id,
            bulletId: bullet.id,
            toEntryId: choice.entryId,
          };
          render({ preserveScroll: true, focusKey: `rb-${bullet.id}-line` });
        },
      });
    });
  const list = el('div', {
    class: 'bb-version-swap-menu',
    id: popoverId,
    role: 'menu',
  }, listBody);
  return el('div', { class: 'bb-version-swap-wrap' }, [toggle, list]);
}

function resumeBulletEditor(posting, career, group, bullet, bulletIndex = 0, groups = []) {
  const dropped = (resumeFit.droppedBulletIds || []).includes(bullet.id);
  const shared = isSharedJob(career.id);
  const localBullet = Boolean(bullet.local) || isLocalOnlyJob(posting, career.id);
  const canEdit = !posting || shared || localBullet || Boolean(career.local);
  const shownSpans = resumeBulletSpans(bullet);
  const lineText = shownSpans.map((span) => span.text).join('');
  const commitWording = (spans) => {
    store = adoptCompiledJob(store, posting?.id || null, career);
    const adoptedLocal = Boolean(posting && localJobById(livePosting(posting.id)?.resume, career.id) && !isSharedJob(career.id));
    store = applyResumeBulletEdit(store, {
      postingId: posting?.id || null,
      jobId: career.id,
      groupId: group.id,
      bullet,
      spans,
      local: localBullet || adoptedLocal,
    });
    saveStore();
    scheduleResumePreview(posting);
  };
  const line = richLine({
    class: 'bb-rb-line',
    'aria-label': 'Bullet',
    'aria-multiline': 'true',
    'data-focus-key': `rb-${bullet.id}-line`,
  }, {
    text: lineText,
    rich: shownSpans,
    italic: true,
    onChange: commitWording,
  });
  const wrap = el('div', {
    class: `bb-rb${bullet.included === false ? ' is-excluded' : ''}${dropped ? ' is-dropped' : ''}${bullet.hasOverride ? ' is-override' : ''}`,
    dataset: { bulletWrap: bullet.id },
  }, [
    el('div', { class: 'bb-rb-tools' }, [
      el('label', { class: 'bb-check' }, [
        el('input', {
          type: 'checkbox',
          checked: bullet.included !== false,
          disabled: !posting,
          'data-focus-key': `rb-${bullet.id}-include`,
          onChange: () => {
            if (!posting) return;
            store = updatePostingResume(store, posting.id, {
              excludedBulletIds: toggleId(posting.resume.excludedBulletIds, bullet.id),
            });
            saveStore();
            render();
          },
        }),
        ' Include',
      ]),
      el('label', { class: 'bb-check' }, [
        el('input', {
          type: 'checkbox',
          checked: Boolean(bullet.pinned),
          disabled: !posting,
          'data-focus-key': `rb-${bullet.id}-pin`,
          onChange: () => {
            if (!posting) return;
            store = updatePostingResume(store, posting.id, {
              pinnedBulletIds: toggleId(posting.resume.pinnedBulletIds, bullet.id),
            });
            saveStore();
            render();
          },
        }),
        ' Pin',
      ]),
      dropped ? el('span', { class: 'tiny' }, 'Hidden to fit') : null,
      bullet.hasOverride ? el('span', { class: 'tiny' }, 'This posting only') : null,
      posting ? resumeExperienceVersionMenu(posting, bullet) : null,
      canEdit ? resumeMoveBtns('bullet', {
        index: bulletIndex,
        length: group.bullets.length,
        ...(posting
          ? resumeBulletArrows(bulletIndex, visibleResumeBullets(group.bullets).length, {
            groupIndex: groups.findIndex((item) => item.id === group.id),
            groupCount: groups.length,
          })
          : {
            disableUp: bulletIndex <= 0 && groups.findIndex((item) => item.id === group.id) <= 0,
            disableDown: bulletIndex >= group.bullets.length - 1
              && groups.findIndex((item) => item.id === group.id) >= groups.length - 1,
          }),
        onMove: (delta) => {
          store = stepResumeBullet(store, posting?.id || null, career, group.id, bullet.id, delta);
          saveStore();
          render({ focusKey: `rb-${bullet.id}-line` });
        },
      }) : null,
      canEdit ? btn(localBullet || !posting ? 'Remove' : (bullet.included !== false ? 'Remove' : 'Delete'), {
        class: 'btn ghost compact-action is-danger',
        onClick: () => {
          if (posting && localBullet) {
            store = deletePostingLocalBullet(store, posting.id, career.id, group.id, bullet.id);
            saveStore();
            render();
            setNote('Removed this bullet from this posting only.');
            return;
          }
          if (posting) {
            store = updatePostingResume(store, posting.id, {
              excludedBulletIds: toggleId(posting.resume.excludedBulletIds, bullet.id),
            });
            saveStore();
            render();
            setNote('Hidden on this posting. It stays in Resume basics.');
            return;
          }
          if (!confirm('Delete this bullet from the shared career history?')) return;
          store = deleteCareerBullet(store, career.id, group.id, bullet.id);
          saveStore();
          render();
        },
      }) : null,
    ]),
    field('Bullet', line),
  ]);
  return wrap;
}

function resumeJobIds(posting) {
  return catalogJobIdsOnPostingResume(posting || null, store);
}

function addRoleButton(posting, { afterId } = {}) {
  const placed = resumeJobIds(posting);
  const choices = (store.jobs || []).filter((job) => !placed.has(job.id));
  return el('select', {
    class: 'bb-add-role',
    'aria-label': 'Add role',
    onChange: (event) => {
      const value = event.target.value;
      event.target.value = '';
      if (!value) return;
      if (value === '__new__') {
        store = addCareerJob(store, { onResume: false });
        const added = store.jobs[store.jobs.length - 1];
        if (!added) return;
        store = addPostingResumeJob(store, posting?.id || null, added.id, { afterId });
        saveStore();
        render({ focusKey: `rj-${added.id}-company` });
        setNote('Added a new job and placed it on this resume.');
        return;
      }
      store = addPostingResumeJob(store, posting?.id || null, value, { afterId });
      saveStore();
      render({ focusKey: `rj-${value}-company` });
      setNote(posting ? 'Added that job and its mapped bullets to this posting.' : 'Added that job to Resume basics.');
    },
  }, [
    el('option', { value: '', disabled: true, selected: true }, '+ Add role'),
    ...choices.map((job) => el('option', { value: job.id }, jobOptionLabel(job))),
    el('option', { value: '__new__' }, '+ New job'),
  ]);
}

function resumeGroupHeadingInput(posting, career, group, { shared, localOnly }) {
  const heading = el('input', {
    value: group.heading,
    placeholder: 'Optional italic sub-heading',
    'aria-label': 'Group heading',
    'data-focus-key': `rg-${group.id}-heading`,
  });
  heading.addEventListener('input', () => {
    if (posting && (localOnly || group.local)) {
      const job = localJobById(livePosting(posting.id).resume, career.id);
      const groupsNext = (job?.groups || career.groups).map((item) => (
        item.id === group.id ? { ...item, heading: heading.value } : item
      ));
      store = updatePostingLocalJob(store, posting.id, career.id, { groups: groupsNext });
    } else if (posting) {
      store = updatePostingResume(store, posting.id, { groupHeadings: { [group.id]: heading.value } });
    } else if (shared) {
      store = updateCareerJob(store, career.id, {
        groups: career.groups.map((item) => (item.id === group.id ? { ...item, heading: heading.value } : item)),
      });
    }
    saveStore();
    scheduleResumePreview(posting);
  });
  return heading;
}

function dragEventElement(target) {
  if (!target) return null;
  return target.nodeType === 1 ? target : target.parentElement;
}

function dragHandleBlocked(target) {
  const node = dragEventElement(target);
  if (!node?.closest) return true;
  if (node.closest('.bb-drag-handle')) return false;
  return Boolean(node.closest('input, textarea, select, [contenteditable="true"]'));
}

function resumeDragHandle(label) {
  return el('button', {
    type: 'button',
    class: 'bb-drag-handle',
    draggable: 'true',
    title: `Drag ${label}`,
    'aria-label': `Drag ${label}`,
  }, '⠇');
}

function resumeDragRow(kind, id, label, child) {
  return el('div', {
    class: 'bb-drag-row',
    dataset: { dragKind: kind, dragId: id },
  }, [resumeDragHandle(label), child]);
}

function resumeDragRowsIn(list) {
  return [...list.querySelectorAll(':scope > .bb-drag-row')];
}

function placeResumeDropLine(list, clientY) {
  const items = resumeDragRowsIn(list);
  const index = dropIndexAtY(items.map((node) => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, height: rect.height };
  }), clientY);
  const line = list.querySelector(':scope > .bb-drop-line');
  if (!line) return index;
  line.hidden = false;
  const anchor = items[index] || null;
  if (anchor) list.insertBefore(line, anchor);
  else list.append(line);
  return index;
}

function clearResumeRowDrag(list) {
  const line = list.querySelector(':scope > .bb-drop-line');
  if (line) line.hidden = true;
  list.querySelectorAll('.bb-drag-row.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
  if (resumeRowDrag?.list === list) resumeRowDrag = null;
}

function commitResumeRowDrag(list, posting, career, toIndex) {
  const session = resumeRowDrag;
  if (!session || session.list !== list || session.committed) return;
  session.committed = true;
  const items = resumeDragRowsIn(list);
  const fromIndex = items.indexOf(session.row);
  const current = items.map((node) => ({ kind: node.dataset.dragKind, id: node.dataset.dragId }));
  const next = fromIndex < 0 ? current : moveDragRow(current, fromIndex, toIndex);
  const same = next.length === current.length && next.every((row, index) => (
    row.kind === current[index].kind && row.id === current[index].id
  ));
  const focusKey = session.row?.dataset?.dragKind === 'heading'
    ? `rg-${session.row.dataset.dragId}-heading`
    : `rb-${session.row?.dataset?.dragId}-line`;
  clearResumeRowDrag(list);
  if (same || fromIndex < 0) return;
  store = applyResumeDrag(store, posting?.id || null, career, next);
  saveStore();
  render({ focusKey });
}

function bindResumeRowDrag(list, { posting, career }) {
  list.append(el('div', { class: 'bb-drop-line', hidden: true, 'aria-hidden': 'true' }));
  list.addEventListener('dragstart', (event) => {
    const node = dragEventElement(event.target);
    const handle = node?.closest?.('.bb-drag-handle');
    if (!handle || !list.contains(handle) || dragHandleBlocked(event.target)) {
      event.preventDefault();
      return;
    }
    if (resumeRowDrag?.active && resumeRowDrag.kind === 'pointer' && resumeRowDrag.list === list) {
      event.preventDefault();
      return;
    }
    const row = handle.closest('.bb-drag-row');
    if (!row) {
      event.preventDefault();
      return;
    }
    resumeRowDrag = { kind: 'native', list, row, active: true, committed: false };
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${row.dataset.dragKind}:${row.dataset.dragId}`);
  });
  list.addEventListener('dragover', (event) => {
    if (!resumeRowDrag || resumeRowDrag.list !== list || resumeRowDrag.kind !== 'native') return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    placeResumeDropLine(list, event.clientY);
  });
  list.addEventListener('drop', (event) => {
    if (!resumeRowDrag || resumeRowDrag.kind !== 'native' || resumeRowDrag.list !== list) return;
    event.preventDefault();
    commitResumeRowDrag(list, posting, career, placeResumeDropLine(list, event.clientY));
  });
  list.addEventListener('dragend', () => {
    if (resumeRowDrag?.kind === 'native' && resumeRowDrag.list === list) clearResumeRowDrag(list);
  });
  list.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    const node = dragEventElement(event.target);
    const handle = node?.closest?.('.bb-drag-handle');
    if (!handle || !list.contains(handle) || dragHandleBlocked(event.target)) return;
    const row = handle.closest('.bb-drag-row');
    if (!row) return;
    resumeRowDrag = {
      kind: 'pointer',
      list,
      row,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      committed: false,
    };
    if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
  });
  list.addEventListener('pointermove', (event) => {
    const session = resumeRowDrag;
    if (!session || session.kind !== 'pointer' || session.list !== list || session.pointerId !== event.pointerId) return;
    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;
    if (!session.active && dx * dx + dy * dy < 16) return;
    session.active = true;
    session.row.classList.add('is-dragging');
    placeResumeDropLine(list, event.clientY);
    event.preventDefault();
  });
  list.addEventListener('pointerup', (event) => {
    const session = resumeRowDrag;
    if (!session || session.kind !== 'pointer' || session.list !== list || session.pointerId !== event.pointerId) return;
    if (!session.active) {
      clearResumeRowDrag(list);
      return;
    }
    commitResumeRowDrag(list, posting, career, placeResumeDropLine(list, event.clientY));
  });
  list.addEventListener('pointercancel', () => {
    if (resumeRowDrag?.kind === 'pointer' && resumeRowDrag.list === list) clearResumeRowDrag(list);
  });
}

function resumeJobGroupBlocks(posting, career, groups, { allowStructure, shared, localOnly }) {
  const chrome = resumeGroupChrome(groups, draftResumeGroupId, Boolean(posting));
  const paintBullets = (group) => (
    (posting ? visibleResumeBullets(group.bullets) : group.bullets)
      .map((bullet, bulletIndex) => {
        const editor = resumeBulletEditor(posting, career, group, bullet, bulletIndex, groups);
        return allowStructure ? resumeDragRow('bullet', bullet.id, 'bullet', editor) : editor;
      })
  );
  const paintHeading = (group, groupIndex) => {
    const head = el('div', { class: 'bb-group-head' }, [
    field('Sub-heading', resumeGroupHeadingInput(posting, career, group, { shared, localOnly })),
    allowStructure ? resumeMoveBtns('sub-heading', {
      index: groupIndex,
      length: groups.length,
      onMove: (delta) => {
        store = moveResumeGroup(store, posting?.id || null, career.id, group.id, delta);
        saveStore();
        render({ focusKey: `rg-${group.id}-heading` });
      },
    }) : null,
    allowStructure ? btn('Remove sub-heading', {
      class: 'btn ghost compact-action is-danger',
      onClick: () => {
        if (posting) {
          store = removeResumeGroup(store, posting.id, career, group.id);
          if (draftResumeGroupId === group.id) draftResumeGroupId = '';
          saveStore();
          render();
          return;
        }
        const n = (group.bullets || []).length;
        if (groups.length === 1) {
          if (n && !confirm('Clear this sub-heading? The bullets stay on the role.')) return;
          store = updateCareerJob(store, career.id, {
            groups: career.groups.map((item) => (item.id === group.id ? { ...item, heading: '' } : item)),
          });
          saveStore();
          render();
          return;
        }
        if (n && !confirm('Remove this sub-heading? Its bullets move onto the role above or below.')) return;
        const sink = groups[groupIndex === 0 ? 1 : groupIndex - 1];
        let next = store;
        if (n && sink) {
          next = updateCareerJob(next, career.id, {
            groups: career.groups.map((item) => {
              if (item.id === sink.id) return { ...item, bullets: [...item.bullets, ...group.bullets] };
              if (item.id === group.id) return { ...item, bullets: [] };
              return item;
            }),
          });
        }
        store = deleteCareerGroup(next, career.id, group.id);
        saveStore();
        render();
      },
    }) : null,
  ]);
    return allowStructure ? resumeDragRow('heading', group.id, 'sub-heading', head) : head;
  };

  // Bullets in an unnamed group belong to the nearest heading above them.
  // They paint with that heading, and a heading with no name stays hidden.
  const parts = [];
  const leading = [];
  const sections = [];
  groups.forEach((group, groupIndex) => {
    if (chrome.showHeading(group)) {
      const prior = group.id && sections.find((section) => section.group.id === group.id);
      if (prior) {
        prior.absorbed.push(group);
        return;
      }
      sections.push({ group, groupIndex, absorbed: [] });
      return;
    }
    if (sections.length) sections[sections.length - 1].absorbed.push(group);
    else leading.push(group);
  });
  for (const group of leading) parts.push(...paintBullets(group));
  for (const section of sections) {
    parts.push(paintHeading(section.group, section.groupIndex));
    parts.push(...paintBullets(section.group));
    for (const group of section.absorbed) parts.push(...paintBullets(group));
    if (allowStructure) {
      parts.push(el('div', { class: 'bb-add-row' }, [
        libraryBulletPicker(posting, career, section.group),
        addSubheadingButton(posting, career, { afterId: section.group.id }),
      ]));
    }
  }
  if (allowStructure && (chrome.showDefaultAdd || !groups.length)) {
    parts.push(el('div', { class: 'bb-add-row' }, [
      libraryBulletPicker(posting, career, groups[0] || null),
      addSubheadingButton(posting, career),
    ]));
  }
  return parts;
}

function resumeRoleRows(posting, career, groups, options) {
  const blocks = resumeJobGroupBlocks(posting, career, groups, options);
  const list = el('div', { class: 'bb-drag-list' }, blocks);
  if (options.allowStructure) bindResumeRowDrag(list, { posting, career });
  return list;
}

function resumeJobEditor(posting, career) {
  const shared = isSharedJob(career.id);
  const localOnly = Boolean(career.local) || isLocalOnlyJob(posting, career.id);
  const company = el('input', {
    value: career.company,
    placeholder: 'Company',
    'aria-label': 'Company',
    'data-focus-key': `rj-${career.id}-company`,
  });
  const title = el('input', {
    value: career.title,
    placeholder: 'Title',
    'aria-label': 'Job title',
    'data-focus-key': `rj-${career.id}-title`,
  });
  const dates = el('input', {
    value: [career.start, career.end].filter(Boolean).join(' – '),
    placeholder: 'October 2021 – Present',
    'aria-label': 'Dates',
    'data-focus-key': `rj-${career.id}-dates`,
  });
  const location = el('input', {
    value: career.location,
    placeholder: 'Example City, ST',
    'aria-label': 'Location',
    'data-focus-key': `rj-${career.id}-location`,
  });
  const catalogId = career.jobId && career.jobId !== career.id
    ? career.jobId
    : (isSharedJob(career.id) ? career.id : '');
  const sharedTitle = () => (store.jobs || []).find((job) => job.id === (catalogId || career.id))?.title || career.originalTitle || '';
  const tailoredNote = el('span', { class: 'tiny' }, 'tailored for this posting');
  const resetTitle = btn('Reset to job title', {
    class: 'btn ghost compact-action',
    onClick: () => {
      if (!posting) return;
      store = replacePostingResume(store, posting.id, clearJobTitle(livePosting(posting.id).resume, career.id));
      saveStore();
      render({ focusKey: `rj-${career.id}-title` });
    },
  });
  const titleTailor = el('div', {
    class: 'bb-title-tailor',
    hidden: !career.titleTailored,
  }, [tailoredNote, resetTitle]);
  const stampJob = () => {
    const [start, end] = dates.value.split(/\s+[–-]\s+/);
    const sharedPatch = {
      company: company.value,
      location: location.value,
      start: (start || dates.value).trim(),
      end: (end || '').trim(),
    };
    store = adoptCompiledJob(store, posting?.id || null, career);
    const nowShared = isSharedJob(career.id);
    const nowCatalog = catalogId || (nowShared ? career.id : '');
    const nowLocal = Boolean(posting && localJobById(livePosting(posting.id)?.resume, career.id) && !nowShared);
    if (nowCatalog) {
      store = updateCareerJob(store, nowCatalog, posting ? sharedPatch : { ...sharedPatch, title: title.value });
      if (posting) {
        const source = sharedTitle();
        if (title.value === source) {
          store = replacePostingResume(store, posting.id, clearJobTitle(livePosting(posting.id).resume, career.id));
        } else {
          store = updatePostingResume(store, posting.id, { jobTitles: { [career.id]: title.value } });
        }
        titleTailor.hidden = title.value === source;
      }
    } else if (posting && nowLocal) {
      store = updatePostingLocalJob(store, posting.id, career.id, { ...sharedPatch, title: title.value });
    } else return;
    saveStore();
    scheduleResumePreview(posting);
  };
  [company, title, dates, location].forEach((node) => node.addEventListener('input', stampJob));
  const jobs = (compileResumeDoc(posting, store).sections.experience.jobs || []);
  const jobIndex = jobs.findIndex((item) => item.id === career.id);
  const groups = career.groups || [];
  const allowStructure = Boolean(posting) || shared;
  const collapsed = roleIsCollapsed(collapsedResumeRoles, posting?.id, career.id);
  const summary = resumeRoleSummary(career);
  const toggleRole = () => {
    collapsedResumeRoles = toggleRoleCollapsed(collapsedResumeRoles, posting?.id, career.id);
    render();
  };
  const onHeadActivate = (event) => {
    const target = event.target;
    const tag = target?.tagName || '';
    const interactive = Boolean(target?.closest?.('.bb-job-controls, input, textarea, select, a, label, button:not(.bb-job-fold)'));
    if (!isRoleHeaderToggleTarget(tag, interactive) && target?.closest?.('.bb-job-fold') == null) return;
    if (event.type === 'keydown') event.preventDefault();
    toggleRole();
  };
  return el('div', {
    class: `bb-job-card is-role${career.included === false ? ' is-excluded' : ''}${collapsed ? ' is-collapsed' : ''}`,
  }, [
    el('div', {
      class: 'bb-job-head',
      onClick: onHeadActivate,
    }, [
      el('button', {
        type: 'button',
        class: 'bb-job-fold',
        'aria-expanded': collapsed ? 'false' : 'true',
        'aria-controls': `role-body-${career.id}`,
        'aria-label': collapsed
          ? `Expand ${summary.title}`
          : `Collapse ${summary.title}`,
        onClick: (event) => {
          event.stopPropagation();
          toggleRole();
        },
      }, [
        el('span', { class: 'bb-job-chevron', 'aria-hidden': 'true' }, collapsed ? '▸' : '▾'),
        el('span', { class: 'bb-job-summary' }, [
          el('strong', {}, summary.title),
          collapsed
            ? el('span', { class: 'tiny' }, ` · ${summary.bullets} bullet${summary.bullets === 1 ? '' : 's'}`)
            : null,
        ]),
      ]),
      el('div', { class: 'bb-job-controls' }, [
        el('label', { class: 'bb-check' }, [
          el('input', {
            type: 'checkbox',
            checked: career.included !== false,
            disabled: !posting,
            'data-focus-key': `rj-${career.id}-include`,
            onChange: () => {
              if (!posting) return;
              store = updatePostingResume(store, posting.id, {
                excludedJobIds: toggleId(posting.resume.excludedJobIds, career.id),
              });
              saveStore();
              render();
            },
          }),
          ' Include this role',
        ]),
        localOnly ? el('span', { class: 'tiny' }, 'This posting only') : null,
        posting && compiledRoleShowsDuplicateWarning(career, posting, store)
          ? el('span', { class: 'tiny bb-role-dup-warn' }, 'This role appears twice')
          : null,
        allowStructure ? resumeMoveBtns('role', {
          index: jobIndex,
          length: jobs.length,
          onMove: (delta) => {
            if (posting) store = movePostingJob(store, posting.id, career.id, delta);
            else store = moveCareerJob(store, career.id, delta);
            saveStore();
            render({ focusKey: `rj-${career.id}-company` });
          },
        }) : null,
        allowStructure ? btn('Remove', {
          class: 'btn ghost compact-action is-danger',
          onClick: () => {
            if (posting && localOnly) {
              const n = bulletCount(career);
              if (!confirm(n
                ? `Remove this role and its ${n} bullet${n === 1 ? '' : 's'} from this posting’s resume? Resume basics is unchanged.`
                : 'Remove this role from this posting’s resume? Resume basics is unchanged.')) return;
              store = deletePostingLocalJob(store, posting.id, career.id);
              saveStore();
              render();
              return;
            }
            if (posting) {
              store = updatePostingResume(store, posting.id, {
                excludedJobIds: toggleId(posting.resume.excludedJobIds, career.id),
              });
              saveStore();
              render();
              setNote('Hidden on this posting. It stays in Resume basics.');
              return;
            }
            if (!confirm('Take this role off Resume basics? The job stays in your Jobs list.')) return;
            store = updateCareerJob(store, career.id, { onResume: false });
            saveStore();
            render();
            setNote('Removed this role from Resume basics. The job is still in Jobs.');
          },
        }) : null,
      ]),
    ]),
    el('div', {
      class: 'bb-job-body',
      id: `role-body-${career.id}`,
      hidden: collapsed,
    }, [
    el('div', { class: 'grid-2' }, [
      field('Company', company),
      field('Dates', dates),
    ]),
    el('div', { class: 'grid-2' }, [
      el('div', {}, [
        field('Title', title),
        posting && shared ? titleTailor : null,
      ]),
      field('Location', location),
    ]),
    resumeRoleRows(posting, career, groups, { allowStructure, shared, localOnly }),
    ]),
  ]);
}

function jobCatalogRow(job) {
  const keys = jobCatalogFocusKeys(job.id);
  const company = el('input', {
    value: job.company || '',
    placeholder: 'Company',
    'aria-label': 'Company',
    'data-focus-key': keys.company,
  });
  const title = el('textarea', {
    class: 'bb-job-title',
    rows: '1',
    value: job.title || '',
    placeholder: 'Title',
    'aria-label': 'Job title',
    'data-focus-key': keys.title,
  });
  fitArea(title);
  const dates = el('input', {
    value: [job.start, job.end].filter(Boolean).join(' – '),
    placeholder: 'October 2021 – Present',
    'aria-label': 'Dates',
    'data-focus-key': keys.dates,
  });
  const location = el('input', {
    value: job.location || '',
    placeholder: 'Location',
    'aria-label': 'Location',
    'data-focus-key': keys.location,
  });
  const stamp = () => {
    const [start, end] = dates.value.split(/\s+[–-]\s+/);
    store = updateCareerJob(store, job.id, {
      company: company.value,
      title: title.value,
      location: location.value,
      start: (start || dates.value).trim(),
      end: (end || '').trim(),
    });
    saveStore();
  };
  [company, title, dates, location].forEach((node) => {
    node.addEventListener('input', () => {
      const plan = jobCatalogEditEffects('input');
      if (!plan.save) return;
      stamp();
      if (plan.render) render();
    });
    node.addEventListener('blur', () => {
      const plan = jobCatalogEditEffects('blur');
      if (plan.render) render();
    });
  });
  const jobField = (label, control) => el('label', { class: 'bb-job-field' }, [
    el('span', {}, label),
    control,
  ]);
  return el('div', { class: 'bb-job-catalog-row', dataset: { jobId: job.id } }, [
    jobField('Company', company),
    jobField('Title', title),
    jobField('Dates', dates),
    jobField('Location', location),
    el('div', { class: 'bb-job-row-actions' }, [
      job.onResume === false ? el('span', { class: 'tiny' }, 'Not on Resume basics') : null,
      btn('Delete', {
        class: 'btn ghost compact-action is-danger',
        onClick: () => {
          const linked = (store.entries || []).filter((entry) => entry.jobId === job.id).length;
          if (!confirm(linked
            ? `Delete this job? ${linked} resume bullet${linked === 1 ? '' : 's'} will become Unassigned.`
            : 'Delete this job?')) return;
          for (const entry of store.entries || []) {
            if (entry.jobId === job.id) store = assignEntryJob(store, entry.id, '');
          }
          store = deleteCareerJob(store, job.id);
          saveStore();
          render();
        },
      }),
    ]),
  ]);
}

function flushJobCatalogEdits(section) {
  if (!section) return;
  for (const row of section.querySelectorAll('.bb-job-catalog-row')) {
    const jobId = row.dataset?.jobId;
    const job = (store.jobs || []).find((item) => item.id === jobId);
    if (!job) continue;
    const keys = jobCatalogFocusKeys(job.id);
    const company = row.querySelector(`[data-focus-key="${keys.company}"]`);
    const title = row.querySelector(`[data-focus-key="${keys.title}"]`);
    const dates = row.querySelector(`[data-focus-key="${keys.dates}"]`);
    const location = row.querySelector(`[data-focus-key="${keys.location}"]`);
    if (!company || !title || !dates || !location) continue;
    const [start, end] = String(dates.value || '').split(/\s+[–-]\s+/);
    const patch = {
      company: company.value,
      title: title.value,
      location: location.value,
      start: (start || dates.value).trim(),
      end: (end || '').trim(),
    };
    const same = patch.company === (job.company || '')
      && patch.title === (job.title || '')
      && patch.location === (job.location || '')
      && patch.start === (job.start || '')
      && patch.end === (job.end || '');
    if (!same) {
      store = updateCareerJob(store, job.id, patch);
      saveStore();
    }
  }
}

function toggleJobsCatalog(section) {
  if (jobsCatalogExpanded) {
    flushJobCatalogEdits(section);
    void flushSave('blur');
    jobsCatalogExpanded = false;
  } else {
    jobsCatalogExpanded = true;
  }
  const scroll = captureScroll();
  render();
  restoreScroll(scroll);
}

function jobCatalogSection() {
  const expanded = jobsCatalogExpanded;
  const panelId = 'bb-jobs-catalog-body';
  const jobCount = (store.jobs || []).length;
  const catalogToggle = el('button', {
    type: 'button',
    class: 'bb-jobs-catalog-toggle',
    'aria-expanded': expanded ? 'true' : 'false',
    'aria-controls': panelId,
    onClick: (event) => {
      event.preventDefault();
      toggleJobsCatalog(event.currentTarget.closest('.bb-jobs-catalog'));
    },
  }, [
    el('span', { class: 'bb-jobs-catalog-chevron', 'aria-hidden': 'true' }),
    el('span', { class: 'bb-jobs-catalog-title' }, 'Jobs'),
    el('span', { class: 'bb-jobs-catalog-count' }, String(jobCount)),
  ]);
  const catalogBody = el('div', {
    class: 'bb-jobs-catalog-body',
    id: panelId,
    hidden: expanded ? undefined : true,
  }, [
    el('p', { class: 'tiny bb-jobs-catalog-lede' }, 'Company and title, plus optional dates and location. Resume bullets and resume roles use this list.'),
    store.jobs.length
      ? el('div', { class: 'bb-job-catalog-list' }, store.jobs.map((job) => jobCatalogRow(job)))
      : el('p', { class: 'empty' }, 'No jobs yet. Add one before you tie a resume bullet to it.'),
  ]);
  return el('section', { class: 'panel bb-jobs-catalog' }, [
    el('div', { class: 'panel-head bb-jobs-catalog-head' }, [
      catalogToggle,
      btn('+ New job', {
        class: 'btn ghost compact-action',
        onClick: () => {
          jobsCatalogExpanded = true;
          store = addCareerJob(store, { onResume: false });
          const added = store.jobs[store.jobs.length - 1];
          saveStore();
          const scroll = captureScroll();
          render({ focusKey: added ? `job-co-${added.id}` : undefined });
          restoreScroll(scroll);
        },
      }),
    ]),
    catalogBody,
  ]);
}

function jobSetupPrompt() {
  const suggestion = suggestJobSetup(store);
  if (!suggestion.needed) return null;
  const picked = new Set(suggestion.proposals.map((proposal) => proposal.id));
  const rows = suggestion.proposals.map((proposal) => {
    const box = el('input', {
      type: 'checkbox',
      checked: true,
      onChange: (event) => {
        if (event.target.checked) picked.add(proposal.id);
        else picked.delete(proposal.id);
      },
    });
    return el('label', { class: 'bb-check bb-job-setup-row' }, [
      box,
      el('span', {}, [
        el('strong', {}, [proposal.company, proposal.title].filter(Boolean).join(' · ') || 'Untitled job'),
        proposal.sources.length > 1
          ? el('span', { class: 'tiny' }, ` Merges ${proposal.sources.join(', ')}`)
          : null,
      ]),
    ]);
  });
  return el('section', { class: 'panel bb-job-setup' }, [
    el('h2', {}, 'Set up your jobs'),
    el('p', { class: 'tiny' }, 'These company and role pairs can become jobs. Near-duplicates are merged. Nothing is saved until you create them.'),
    ...rows,
    el('div', { class: 'actions' }, [
      btn('Create these jobs', {
        class: 'btn',
        onClick: () => {
          store = applyJobSetup(store, { proposalIds: [...picked] });
          saveStore();
          render();
          setNote('Saved the jobs you kept. Resume bullets now point at them.');
        },
      }),
      btn('Not now', {
        class: 'btn ghost',
        onClick: () => {
          store = dismissJobSetup(store);
          saveStore();
          render();
        },
      }),
    ]),
  ]);
}

function resumeEditorPane(posting, doc) {
  const profile = store.profile || {};
  const stampProfile = (key, value) => {
    store = updateProfile(store, { [key]: value });
    saveStore();
    scheduleResumePreview(posting);
  };
  const credToggle = el('label', { class: 'bb-check' }, [
    el('input', {
      type: 'checkbox',
      checked: showCredentialsFor(posting),
      'data-focus-key': 'resume-include-credentials',
      onChange: (event) => {
        if (posting) store = updatePostingResume(store, posting.id, { showCredentials: event.target.checked });
        else store = updateResumeSettings(store, { showCredentials: event.target.checked });
        saveStore();
        render();
      },
    }),
    ' Include credentials',
  ]);
  return el('div', { class: 'bb-resume-editor' }, [
    el('p', { class: 'lede' }, posting
      ? 'Add each role yourself, then a sub-heading and resume bullets from your library. A picked bullet stays linked to that library entry. Include and Pin still apply to this posting.'
      : 'Edit the Resume basics template here: header, jobs, sub-headings, education, credentials, and additional info. A picked bullet stays linked to that library entry. New postings can start from this template.'),
    posting && hiddenResumeRowCount(posting.resume) ? btn('Restore hidden rows', {
      class: 'btn ghost compact-action',
      onClick: () => {
        store = replacePostingResume(store, posting.id, restoreHiddenResumeRows(livePosting(posting.id).resume));
        saveStore();
        render();
        setNote('Restored hidden rows on this posting. Resume basics is unchanged.');
      },
    }) : null,
    resumeSectionOrder(posting),
    credToggle,
    posting ? btn('Save order as my default', {
      class: 'btn ghost compact-action',
      onClick: () => {
        store = updateResumeSettings(store, {
          sectionOrder: sectionOrderFor(posting),
          showCredentials: showCredentialsFor(posting),
        });
        saveStore();
        setNote('Saved as your default section order.');
      },
    }) : null,
    el('h3', {}, 'Header'),
    el('div', { class: 'grid-2' }, [
      field('Name', el('input', {
        value: profile.name,
        placeholder: 'John Doe',
        'aria-label': 'Name',
        'data-focus-key': 'resume-name',
        onInput: (event) => stampProfile('name', event.target.value),
      })),
      field('Suffix', el('input', {
        value: profile.suffix || '',
        placeholder: 'CPA',
        'aria-label': 'Suffix',
        'data-focus-key': 'resume-suffix',
        onInput: (event) => stampProfile('suffix', event.target.value),
      })),
    ]),
    el('div', { class: 'grid-2' }, [
      field('Locations', el('input', {
        value: (profile.locations || []).join(' / ') || profile.location || '',
        placeholder: 'Example City, ST',
        'aria-label': 'Locations',
        'data-focus-key': 'resume-locations',
        onInput: (event) => stampProfile('locations', event.target.value.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean)),
      })),
      field('Email', el('input', {
        value: profile.email,
        placeholder: 'you@example.com',
        'aria-label': 'Email',
        'data-focus-key': 'resume-email',
        onInput: (event) => stampProfile('email', event.target.value),
      })),
    ]),
    field('LinkedIn', el('input', {
      value: (profile.links || [])[0]?.url || '',
      placeholder: 'https://www.linkedin.com/in/you',
      'aria-label': 'LinkedIn',
      'data-focus-key': 'resume-linkedin',
      onInput: (event) => stampProfile('links', event.target.value.trim()
        ? [{ label: 'LinkedIn', url: event.target.value.trim() }]
        : []),
    })),
    posting ? null : jobSetupPrompt(),
    posting ? null : jobCatalogSection(),
    resumeSectionHead('Work experience', addRoleButton(posting)),
    ...(doc.sections.experience.jobs.length
      ? doc.sections.experience.jobs.flatMap((career) => [
        resumeJobEditor(posting, career),
        el('div', { class: 'bb-add-role-slot' }, [addRoleButton(posting, { afterId: career.id })]),
      ])
      : [el('p', { class: 'empty' }, 'No roles yet. Use + Add role, or import a resume JSON.')]),
    resumeSectionHead('Credentials', btn('+ Add credential', {
      class: 'btn ghost compact-action',
      onClick: () => {
        if (posting) {
          store = addPostingLocalCredential(store, posting.id);
          const added = (livePosting(posting.id).resume.localCredentials || []).slice(-1)[0];
          saveStore();
          render({ focusKey: added ? `cr-${added.id}-name` : undefined });
          return;
        }
        store = addCredentialItem(store);
        const added = store.credentials[store.credentials.length - 1];
        saveStore();
        render({ focusKey: added ? `cr-${added.id}-name` : undefined });
      },
    })),
    ...(doc.sections.credentials.items.length
      ? doc.sections.credentials.items.map((item, index) => {
        const name = el('input', { value: item.name, 'aria-label': 'Credential name', 'data-focus-key': `cr-${item.id}-name` });
        const issued = el('input', { value: item.issued, 'aria-label': 'Issued', 'data-focus-key': `cr-${item.id}-issued` });
        const issuer = el('input', { value: item.issuer, 'aria-label': 'Issuer', 'data-focus-key': `cr-${item.id}-issuer` });
        const cid = el('input', { value: item.credentialId, 'aria-label': 'Credential ID', 'data-focus-key': `cr-${item.id}-id` });
        const stamp = () => {
          const patch = {
            name: name.value, issued: issued.value, issuer: issuer.value, credentialId: cid.value,
          };
          if (posting && isLocalResumeRow(posting, 'localCredentials', item.id)) {
            store = updatePostingLocalCredential(store, posting.id, item.id, patch);
          } else {
            store = updateCredentialItem(store, item.id, patch);
          }
          saveStore();
          scheduleResumePreview(posting);
        };
        [name, issued, issuer, cid].forEach((node) => node.addEventListener('input', stamp));
        return el('div', { class: 'bb-job-card' }, [
          el('div', { class: 'bb-rb-tools' }, [
            resumeMoveBtns('credential', {
              index,
              length: doc.sections.credentials.items.length,
              onMove: (delta) => {
                store = moveCredentialItem(store, item.id, delta);
                saveStore();
                render({ focusKey: `cr-${item.id}-name` });
              },
            }),
            ...postingRowDeletes(posting, {
              local: isLocalResumeRow(posting, 'localCredentials', item.id),
              kind: 'credential',
              id: item.id,
              localDelete: () => { store = deletePostingLocalCredential(store, posting.id, item.id); },
              sharedDelete: () => { store = deleteCredentialItem(store, item.id); },
              confirmText: 'Delete this credential from Resume basics?',
            }),
          ]),
          el('div', { class: 'grid-2' }, [field('Name', name), field('Issued', issued)]),
          el('div', { class: 'grid-2' }, [field('Issuer', issuer), field('Credential ID', cid)]),
        ]);
      })
      : [el('p', { class: 'empty' }, 'None yet. Use + Add credential, or import a resume JSON.')]),
    resumeSectionHead('Education', btn('+ Add education', {
      class: 'btn ghost compact-action',
      onClick: () => {
        if (posting) {
          store = addPostingLocalEducation(store, posting.id);
          const added = (livePosting(posting.id).resume.localEducation || []).slice(-1)[0];
          saveStore();
          render({ focusKey: added ? `ed-${added.id}-school` : undefined });
          return;
        }
        store = addEducationItem(store);
        const added = store.education[store.education.length - 1];
        saveStore();
        render({ focusKey: added ? `ed-${added.id}-school` : undefined });
      },
    })),
    ...(doc.sections.education.items.length
      ? doc.sections.education.items.map((item, index) => {
        const school = el('input', { value: item.school, 'aria-label': 'School', 'data-focus-key': `ed-${item.id}-school` });
        const loc = el('input', { value: item.location, 'aria-label': 'School location', 'data-focus-key': `ed-${item.id}-loc` });
        const degree = el('input', { value: item.degree, 'aria-label': 'Degree', 'data-focus-key': `ed-${item.id}-degree` });
        const details = el('input', { value: item.details, 'aria-label': 'Details', 'data-focus-key': `ed-${item.id}-details` });
        const gpa = el('input', { value: item.gpa, 'aria-label': 'GPA', 'data-focus-key': `ed-${item.id}-gpa` });
        const stamp = () => {
          const patch = {
            school: school.value, location: loc.value, degree: degree.value, details: details.value, gpa: gpa.value,
          };
          if (posting && isLocalResumeRow(posting, 'localEducation', item.id)) {
            store = updatePostingLocalEducation(store, posting.id, item.id, patch);
          } else {
            store = updateEducationItem(store, item.id, patch);
          }
          saveStore();
          scheduleResumePreview(posting);
        };
        [school, loc, degree, details, gpa].forEach((node) => node.addEventListener('input', stamp));
        return el('div', { class: 'bb-job-card' }, [
          el('div', { class: 'bb-rb-tools' }, [
            resumeMoveBtns('education', {
              index,
              length: doc.sections.education.items.length,
              onMove: (delta) => {
                store = moveEducationItem(store, item.id, delta);
                saveStore();
                render({ focusKey: `ed-${item.id}-school` });
              },
            }),
            ...postingRowDeletes(posting, {
              local: isLocalResumeRow(posting, 'localEducation', item.id),
              kind: 'education',
              id: item.id,
              localDelete: () => { store = deletePostingLocalEducation(store, posting.id, item.id); },
              sharedDelete: () => { store = deleteEducationItem(store, item.id); },
              confirmText: 'Delete this education row from Resume basics?',
            }),
          ]),
          el('div', { class: 'grid-2' }, [field('School', school), field('Location', loc)]),
          field('Degree', degree),
          field('Details', details),
          field('GPA', gpa),
        ]);
      })
      : [el('p', { class: 'empty' }, 'None yet. Use + Add education, or import a resume JSON.')]),
    resumeSectionHead('Additional info', btn('+ Add row', {
      class: 'btn ghost compact-action',
      onClick: () => {
        if (posting) {
          store = addPostingLocalAdditional(store, posting.id);
          const added = (livePosting(posting.id).resume.localAdditional || []).slice(-1)[0];
          saveStore();
          render({ focusKey: added ? `ad-${added.id}-label` : undefined });
          return;
        }
        store = addAdditionalRow(store);
        const added = store.additional[store.additional.length - 1];
        saveStore();
        render({ focusKey: added ? `ad-${added.id}-label` : undefined });
      },
    })),
    ...(doc.sections.additional.rows.length
      ? doc.sections.additional.rows.map((row, index) => {
        const label = el('input', { value: row.label, 'aria-label': 'Row label', 'data-focus-key': `ad-${row.id}-label` });
        const items = richLine({
          class: 'bb-rb-line bb-addl-items',
          'aria-label': 'Items',
          'data-focus-key': `ad-${row.id}-items`,
        }, {
          rich: additionalValueSpans(row),
          italic: true,
          onChange: (spans) => {
            const text = (spans || []).map((span) => span.text).join('');
            store = editResumeAdditionalRow(store, posting?.id, row.id, (current) => ({
              ...current,
              label: label.value,
              text,
              rich: spans,
            }));
            saveStore();
            scheduleResumePreview(posting);
          },
        });
        items.addEventListener('keydown', (event) => {
          const shortcut = knowledgeMarkShortcut(event);
          if (!shortcut) return;
          event.preventDefault();
          event.stopPropagation();
          document.execCommand(shortcut.command);
          items.dispatchEvent(new Event('input'));
        }, true);
        const stampLabel = () => {
          store = editResumeAdditionalRow(store, posting?.id, row.id, (current) => ({
            ...current,
            label: label.value,
          }));
          saveStore();
          scheduleResumePreview(posting);
        };
        label.addEventListener('input', stampLabel);
        return el('div', { class: 'bb-job-card' }, [
          el('div', { class: 'bb-rb-tools' }, [
            resumeMoveBtns('row', {
              index,
              length: doc.sections.additional.rows.length,
              onMove: (delta) => {
                store = moveAdditionalRow(store, row.id, delta);
                saveStore();
                render({ focusKey: `ad-${row.id}-label` });
              },
            }),
            ...postingRowDeletes(posting, {
              local: Boolean(posting) && isLocalResumeRow(posting, 'localAdditional', row.id)
                && !(store.additional || []).some((item) => item.id === row.id),
              kind: 'additional',
              id: row.id,
              localDelete: () => { store = deletePostingLocalAdditional(store, posting.id, row.id); },
              sharedDelete: () => {
                store = deleteAdditionalRow(store, row.id);
                if (posting) store = deletePostingLocalAdditional(store, posting.id, row.id);
              },
              confirmText: 'Delete this additional-info row from Resume basics?',
            }),
          ]),
          field('Label', label),
          field('Items', items),
        ]);
      })
      : [el('p', { class: 'empty' }, 'None yet. Use + Add row for a label plus items, or import a resume JSON.')]),
  ]);
}

function resumeWorkspace(posting) {
  const doc = compileResumeDoc(posting, store);
  const wrap = el('section', { class: 'panel bb-resume' });
  const header = el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, posting ? 'Resume' : 'Resume basics'),
        el('p', { class: 'tiny' }, posting
          ? [posting.title, posting.company].filter(Boolean).join(' · ')
          : 'Template for header, jobs, sub-headings, education, credentials, and additional info'),
      ]),
      el('div', { class: 'actions' }, [
        btn('Import resume (JSON)', { class: 'btn ghost', onClick: () => resumeFileInput.click() }),
        btn('Print / PDF', { class: 'btn', onClick: () => exportResumePdf(posting) }),
        btn('Download Word', { class: 'btn ghost', onClick: () => exportResumeDocx(posting) }),
        posting ? btn('Save a copy', {
          id: 'resume-save-copy',
          class: 'btn',
          disabled: !resumeFitReadyForPosting(posting.id),
          onClick: () => {
            resumeSnapshotSaveOpen = posting.id;
            render();
          },
        }) : null,
        btn('Saved resumes', { class: 'btn ghost', onClick: () => go({ kind: 'snapshots' }) }),
        posting ? btn('Replace Resume basics with this posting’s resume', {
          class: 'btn ghost',
          onClick: () => {
            if (!confirm(basicsReplaceConfirm(store, posting.id))) return;
            store = replaceBasicsWithPosting(store, posting.id);
            saveStore();
            render();
            setNote('Resume basics now matches this posting. Other postings keep their own edits.');
          },
        }) : null,
        hasBasicsBackup(store) ? btn('Restore previous basics', {
          class: 'btn ghost',
          onClick: () => {
            if (!confirm(basicsRestoreConfirm(store))) return;
            store = restorePreviousBasics(store);
            saveStore();
            render();
            setNote('Restored the previous Resume basics.');
          },
        }) : null,
        posting && posting.resume?.mode !== 'fresh' ? btn('Start fresh', {
          class: 'btn ghost',
          onClick: () => {
            if (!confirm('Empty Work Experience, Education, Credentials, and Additional Info on this posting’s resume? The header stays. Resume basics and other postings are not changed.')) return;
            store = startPostingResumeFresh(store, posting.id);
            saveStore();
            render();
            setNote('This posting’s resume is blank except for the header. Add roles here, or Reset to Resume basics.');
          },
        }) : null,
        posting && posting.resume?.mode === 'fresh' ? btn('Reset to Resume basics', {
          class: 'btn ghost',
          onClick: () => {
            if (!confirm('Replace this posting’s resume with Resume basics? Local roles and bullets on this posting will be removed. Resume basics is unchanged.')) return;
            store = resetPostingResumeToBasics(store, posting.id);
            saveStore();
            render();
            setNote('This posting’s resume again starts from Resume basics.');
          },
        }) : null,
        posting ? btn('Start from saved resume', {
          class: 'btn ghost compact-action',
          onClick: () => {
            resumeSnapshotStartOpen = posting.id;
            resumeSnapshotApplyToPostingId = posting.id;
            render();
          },
        }) : null,
        posting ? btn('Back to posting', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: posting.id }) }) : null,
      ]),
    ]);
  const split = el('div', { class: 'bb-resume-split' }, [
      resumeEditorPane(posting, doc),
      resumePreviewPane(),
    ]);
  wrap.append(header);
  if (posting && resumeSnapshotSaveOpen === posting.id) {
    wrap.append(snapshotSaveForm(posting));
  }
  if (posting && resumeSnapshotStartOpen === posting.id) {
    wrap.append(resumeSnapshotStartPanel(posting));
  }
  wrap.append(split);
  queueMicrotask(() => refreshResumePreview(posting));
  return wrap;
}

function resumeChooserSnapshotList(posting) {
  const rows = activeResumeSnapshots(store);
  return el('div', { class: 'bb-snapshot-save bb-snapshot-start bb-choose-snapshot-list' }, [
    el('p', { class: 'tiny' }, 'Pick a saved resume to copy onto this posting. Resume basics and the saved copy you pick stay unchanged.'),
    el('div', { class: 'bb-snapshot-list bb-snapshot-start-list' }, rows.map((row) => el('div', { class: 'bb-snapshot-row' }, [
      el('div', { class: 'bb-snapshot-meta' }, [
        el('strong', {}, row.name || row.initialName),
        el('span', { class: 'tiny' }, [
          row.sourcePosting?.company,
          row.savedAt ? new Date(row.savedAt).toLocaleDateString() : '',
        ].filter(Boolean).join(' · ')),
      ]),
      el('div', { class: 'bb-snapshot-actions' }, [
        btn('Use this copy', {
          class: 'btn compact-action',
          onClick: () => applySnapshotToPosting(posting, row.id, { fromChooser: true }),
        }),
      ]),
    ]))),
    el('div', { class: 'actions' }, [
      btn('Cancel', {
        class: 'btn ghost compact-action',
        onClick: () => {
          resumeSnapshotChooserOpen = null;
          render();
        },
      }),
    ]),
  ]);
}

function resumeChooser(job) {
  const snapshots = activeResumeSnapshots(store);
  const chooserOpen = resumeSnapshotChooserOpen === job.id;
  return el('section', { class: 'panel bb-resume-choose' }, [
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, 'Start this posting’s resume'),
        el('p', { class: 'tiny' }, [job.title, job.company].filter(Boolean).join(' · ')),
      ]),
      btn('Back to posting', { class: 'btn ghost', onClick: () => {
        resumeSnapshotChooserOpen = null;
        go({ kind: 'jobs', id: job.id });
      } }),
    ]),
    el('div', { class: 'panel-body' }, [
      el('p', { class: 'lede' }, 'The header (name, contact, links) always comes from Resume basics. Start from that shared career history, a saved resume copy, or a blank page on this posting.'),
      el('div', { class: 'bb-choose-cards' }, [
        el('button', {
          type: 'button',
          class: 'start-card is-primary',
          onClick: () => {
            resumeSnapshotChooserOpen = null;
            store = choosePostingResumeMode(store, job.id, 'basics');
            saveStore();
            render();
          },
        }, [
          el('strong', {}, 'Start from Resume basics'),
          el('p', {}, 'Copy in your shared roles, education, credentials, and additional info. You can still hide items and add posting-only roles.'),
        ]),
        snapshots.length ? el('button', {
          type: 'button',
          class: `start-card${chooserOpen ? ' is-primary' : ''}`,
          onClick: () => {
            resumeSnapshotChooserOpen = chooserOpen ? null : job.id;
            render();
          },
        }, [
          el('strong', {}, 'Start from a saved resume'),
          el('p', {}, 'Copy a saved resume layout onto this posting only. The header still comes from Resume basics; later edits stay on this posting.'),
        ]) : el('button', {
          type: 'button',
          class: 'start-card is-disabled',
          disabled: true,
        }, [
          el('strong', {}, 'Start from a saved resume'),
          el('p', {}, 'No saved resumes yet. Save a copy from another posting’s resume, then return here.'),
        ]),
        el('button', {
          type: 'button',
          class: 'start-card',
          onClick: () => {
            resumeSnapshotChooserOpen = null;
            store = choosePostingResumeMode(store, job.id, 'fresh');
            saveStore();
            render();
          },
        }, [
          el('strong', {}, 'Start fresh'),
          el('p', {}, 'Keep the header. Empty Work Experience, Education, Credentials, and Additional Info on this posting only, then build with + Add role.'),
        ]),
      ]),
      chooserOpen && snapshots.length ? resumeChooserSnapshotList(job) : null,
    ]),
  ]);
}

function resumeView(job) {
  if ((job.resume?.mode || 'basics') === 'choose') return resumeChooser(job);
  const profile = store.profile || {};
  const area = el('textarea', { class: 'resume', 'aria-label': 'Plain text resume' });
  let generated = compileResumeText(job, store) || 'Add a resume bullet on a requirement first.';
  let custom = Boolean(job.resumeText);
  area.value = custom ? job.resumeText : generated;
  const currentText = () => area.value;
  const refreshGenerated = () => {
    generated = compileResumeText(job, store) || 'Add a resume bullet on a requirement first.';
    if (!custom) area.value = generated;
  };
  area.addEventListener('input', () => {
    custom = area.value !== generated;
    store = updatePosting(store, job.id, { resumeText: custom ? area.value : '' });
    saveStore();
  });
  const wordHtml = () => resumeTextToWordHtml(currentText(), job.title || 'Resume');
  const workspace = resumeWorkspace(job);
  workspace.append(el('details', { class: 'utility-box' }, [
    el('summary', {}, 'Plain text copy (.txt / older Word)'),
    el('div', { class: 'utility-body' }, [
      el('p', { class: 'tiny' }, 'Grouped by role. Edits here are what Copy and .txt use. They do not change the one-page layout above.'),
      el('div', { class: 'actions' }, [
        btn('Copy', { class: 'btn ghost', onClick: () => copyText(currentText(), 'Copied the resume.') }),
        btn('Download .txt', {
          class: 'btn ghost',
          onClick: () => {
            downloadText(`${job.title || 'resume'}.txt`, currentText());
            setNote('Downloaded a text resume.');
          },
        }),
        btn('Download .doc', {
          class: 'btn ghost',
          onClick: () => {
            downloadText(`${job.title || 'resume'}.doc`, wordHtml(), 'application/msword');
            setNote('Downloaded a Word resume.');
          },
        }),
        btn('Rebuild text', {
          class: 'btn ghost',
          onClick: () => {
            custom = false;
            store = updatePosting(store, job.id, { resumeText: '' });
            saveStore();
            refreshGenerated();
            setNote('Rebuilt the plain-text resume from experiences.');
          },
        }),
      ]),
      el('div', { class: 'grid-2' }, [
        field('Name', el('input', { value: profile.name, placeholder: 'Your name', 'aria-label': 'Plain-text name', onInput: (event) => {
          store = updateProfile(store, { name: event.target.value });
          saveStore();
          refreshGenerated();
        } })),
        field('Email', el('input', { value: profile.email, placeholder: 'you@example.com', 'aria-label': 'Plain-text email', onInput: (event) => {
          store = updateProfile(store, { email: event.target.value });
          saveStore();
          refreshGenerated();
        } })),
      ]),
      field('Preview', area),
    ]),
  ]));
  return workspace;
}

function profileView() {
  return resumeWorkspace(null);
}

function emptyDetail(kind) {
  return el('section', { class: 'panel' }, [
    el('div', { class: 'panel-body empty' },
      kind === 'jobs'
        ? 'Paste a job posting. That is the first click — requirements, then experiences, then questions + STAR.'
        : kind === 'kb'
          ? 'Write a knowledge note, or pick one from the list.'
          : 'Paste several resume bullets, or pick one to fill STAR.'
    ),
  ]);
}

function captureFocus() {
  const active = document.activeElement;
  if (!active?.dataset?.focusKey) return null;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    return { key: active.dataset.focusKey, start: active.selectionStart, end: active.selectionEnd };
  }
  if (active.isContentEditable) return { key: active.dataset.focusKey, editable: true };
  return null;
}

function restoreFocus(captured, focusKey) {
  const key = focusKey || captured?.key;
  if (!key) return;
  const node = root.querySelector(`[data-focus-key="${key.replace(/"/g, '')}"]`);
  if (!node) return;
  node.focus({ preventScroll: true });
  if (focusKey || typeof captured?.start !== 'number' || !node.setSelectionRange) return;
  const max = node.value.length;
  node.setSelectionRange(Math.min(captured.start, max), Math.min(captured.end, max));
}

const SCROLL_PANES = ['.bb-resume-editor', '#resume-preview-wrap'];
let lastRenderHash = '';
/** Pre-replace scroll snapshot for the resume editor; reapplied after preview reflow. */
let pendingResumeScrollRestore = null;

function isResumeEditorView(view = currentView()) {
  return view.kind === 'profile'
    || (view.kind === 'jobs' && view.id && view.mode === 'resume');
}

function captureScroll() {
  const panes = {};
  for (const sel of SCROLL_PANES) {
    const node = document.querySelector(sel);
    if (node) panes[sel] = node.scrollTop;
  }
  const docEl = document.documentElement;
  const body = document.body;
  return {
    windowX: window.scrollX,
    windowY: window.scrollY,
    docY: docEl?.scrollTop ?? window.scrollY,
    bodyY: body?.scrollTop ?? window.scrollY,
    panes,
  };
}

function restoreScroll(snapshot) {
  if (!snapshot) return;
  window.scrollTo(snapshot.windowX, snapshot.windowY);
  const docY = snapshot.docY ?? snapshot.windowY;
  const bodyY = snapshot.bodyY ?? snapshot.windowY;
  if (document.documentElement) document.documentElement.scrollTop = docY;
  if (document.body) document.body.scrollTop = bodyY;
  for (const [sel, top] of Object.entries(snapshot.panes || {})) {
    const node = document.querySelector(sel);
    if (node) node.scrollTop = top;
  }
}

function scheduleResumeScrollRestore(snapshot) {
  if (!snapshot || !isResumeEditorView()) return;
  pendingResumeScrollRestore = snapshot;
  queueMicrotask(() => restoreScroll(snapshot));
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
  raf(() => restoreScroll(snapshot));
  raf(() => raf(() => restoreScroll(snapshot)));
}

function finishRender(captured, options, scroll) {
  if (scroll && isResumeEditorView()) pendingResumeScrollRestore = scroll;
  restoreScroll(scroll);
  restoreFocus(captured, options.focusKey);
  scheduleResumeScrollRestore(scroll);
  refreshFloatingOverlays();
  if (postingRequirementHighlightReqId) {
    const reqId = postingRequirementHighlightReqId;
    postingRequirementHighlightReqId = '';
    queueMicrotask(() => {
      const row = document.querySelector(`tr[data-requirement-id="${reqId}"]`);
      if (!row) return;
      row.scrollIntoView({ block: 'nearest' });
      row.classList.add('is-req-highlight');
      window.setTimeout(() => row.classList.remove('is-req-highlight'), 2400);
    });
  }
}

function render(options = {}) {
  const captured = options.focusKey ? null : captureFocus();
  const view = currentView();
  const nextHash = viewHash(view);
  const scroll = options.preserveScroll || (lastRenderHash && lastRenderHash === nextHash)
    ? captureScroll()
    : null;
  lastRenderHash = nextHash;
  document.title = `${viewTitle(view, store)} — Brag Book`;
  document.body.dataset.view = view.kind;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const key = link.getAttribute('data-nav');
    link.classList.toggle('is-on', key === view.kind);
  });

  if (view.kind === 'home') {
    root.replaceChildren(el('div', {}, [toolbar(view), homeView()]));
    finishRender(captured, options, scroll);
    return;
  }

  if (view.kind === 'profile') {
    root.replaceChildren(el('div', {}, [toolbar(view), profileView()]));
    finishRender(captured, options, scroll);
    return;
  }

  if (view.kind === 'snapshots') {
    const body = view.id ? savedResumeDetail(view.id) : savedResumesBank();
    root.replaceChildren(el('div', {}, [toolbar(view), body]));
    if (view.id) {
      const snap = resumeSnapshotById(store, view.id);
      if (snap && !snapshotIsDeleted(snap)) {
        queueMicrotask(() => refreshResumeSnapshotPreview(snap));
      }
    }
    finishRender(captured, options, scroll);
    return;
  }

  const plan = bookPagePlan(view);
  if (plan) {
    const knowledgeView = view.kind === 'kb' ? view : { kind: 'kb', id: plan.knowledgeId || undefined };
    const bulletsOn = plan.focus !== 'knowledge';
    const body = el('div', { class: 'bb-book-page' }, [
      el('div', { class: 'bb-book-tabs', role: 'tablist', 'aria-label': 'Resume bullets and knowledge' }, plan.tabs.map((tab) => {
        const on = plan.focus === tab.id;
        return el('button', {
          type: 'button',
          class: `bb-book-tab${on ? ' is-on' : ''}`,
          role: 'tab',
          'aria-selected': on ? 'true' : 'false',
          onClick: () => {
            if (on) return;
            go({ kind: tab.kind });
          },
        }, tab.label);
      })),
      bulletsOn
        ? el('section', { class: 'bb-book-section', id: 'book-experiences' }, [
          jobSetupPrompt(),
          jobCatalogSection(),
          plan.addExperiences ? bulkEntryForm({ compact: true }) : null,
          experienceTable(view.kind === 'log' ? view : { kind: 'log' }),
        ])
        : el('section', { class: 'bb-book-section', id: 'book-knowledge' }, [
          plan.addKnowledge ? bulkKnowledgeForm() : null,
          knowledgeWorkspace(knowledgeView),
        ]),
    ]);
    root.replaceChildren(el('div', {}, [toolbar(view), body]));
    finishRender(captured, options, scroll);
    return;
  }

  let detail;
  if (view.kind === 'jobs' && view.id === 'new') detail = jobForm();
  else if (view.kind === 'jobs' && view.id && view.mode === 'prep') {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? prepView(job) : emptyDetail('jobs');
  } else if (view.kind === 'jobs' && view.id && view.mode === 'resume') {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? resumeView(job) : emptyDetail('jobs');
  } else if (view.kind === 'jobs' && view.id && view.mode === 'bullet') {
    const job = store.postings.find((item) => item.id === view.id);
    if (job) {
      expandedBulletKey = `${job.id}:${view.reqId}:${view.bulletId}`;
      detail = jobDetail(job);
    } else {
      detail = emptyDetail('jobs');
    }
  } else if (view.kind === 'jobs' && view.id) {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? jobDetail(job) : emptyDetail('jobs');
  } else detail = emptyDetail('jobs');

  const hideRail = Boolean(view.id) || !store.postings.length;
  const next = el('div', {}, [
    toolbar(view),
    el('div', { class: hideRail ? 'layout is-wide' : 'layout' }, [
      hideRail || view.kind !== 'jobs' ? null : jobList(view.id),
      detail,
    ]),
  ]);
  root.replaceChildren(next);
  finishRender(captured, options, scroll);
}

function setAppNav(on) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.hidden = !on;
  });
}

function renderSignInGate() {
  unlocked = false;
  setAppNav(false);
  const note = !auth?.configured
    ? (auth?.needsConnection
      ? '<p class="bb-gate-error">Sign-in needs an internet connection. Brag Book loads your book from the server whenever you are online.</p>'
      : '<p class="bb-gate-error">Sign-in isn’t configured on this server yet. Open <a href="/brag-book/?local=1">?local=1</a> to use this browser only.</p>')
    : (auth?.needsReauth
      ? '<p class="bb-gate-error">Your session expired. Sign in again to open your book.</p>'
      : '');
  renderBragSignIn(root, {
    art: '<img class="bb-gate-art" src="/brag-book/icon.svg" alt="" width="72" height="72">',
    title: 'Brag Book',
    copy: 'Sign in with the same account as Packing Cubes. Compare requirements and experiences in one table, then open an experience for STAR and questions.',
    note,
    onSuccess: () => location.reload(),
  });
  if (!auth?.configured) {
    const form = root.querySelector('#bb-auth');
    if (form) form.hidden = true;
  }
  wireAuthLink(auth || { configured: false, signedIn: false });
  const legal = document.querySelector('.legal');
  if (legal) legal.textContent = 'Sign in to keep the book on your account. Nothing is stored until you do.';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function showBook(note) {
  unlocked = true;
  hydrateCollapsedLibrarySectionsFromSession();
  setAppNav(true);
  if (!location.hash) location.hash = '#home';
  render();
  if (note) setNote(note);
}

let reconnectFlight = null;

async function reconnectBook() {
  if (localMode || !auth?.token) return;
  if (reconnectFlight) return reconnectFlight;
  reconnectFlight = (async () => {
    try {
      const controller = ensureSaveController();
      const outbox = readOutbox();
      const dirty = controller.state.localVersion > controller.state.confirmedVersion;
      if (!dirty && !outbox?.book) return;
      const data = await loadBook(auth.token);
      const remote = normalizeStore(data.book);
      rememberServerBook(data);
      store = withStarterCareer(resumeOutboxAfterBoot(remote, data));
      cacheStore();
      await flushSave('reconnect');
    } catch {
      /* keep local pending state */
    } finally {
      reconnectFlight = null;
    }
  })();
  return reconnectFlight;
}

async function boot() {
  if (localMode) {
    auth = { configured: true, signedIn: true, token: null, local: true };
    store = withStarterCareer(loadCached());
    cacheStore();
    const legal = document.querySelector('.legal');
    if (legal) legal.textContent = 'This device only (?local=1). Sign in without that flag to keep the book on your account.';
    showBook('This device only');
    const link = document.getElementById('nav-auth-link');
    if (link) {
      link.textContent = 'Local';
      link.href = '/brag-book/';
    }
    return;
  }

  auth = await initAuth();
  if (auth.configured && auth.user && !auth.token) await refreshToken(auth);
  wireAuthLink(auth);

  if (!auth.configured || !auth.signedIn || !auth.token) {
    renderSignInGate();
    return;
  }

  cacheUserId = auth.user?.id || '';
  const cached = loadCached();

  try {
    const data = await loadBook(auth.token);
    const remote = normalizeStore(data.book);
    rememberServerBook(data);
    const legacy = loadLegacyBrowserBackup();
    legacyBrowserBackup = legacy && JSON.stringify(legacy) !== JSON.stringify(remote) ? legacy : null;
    store = withStarterCareer(resumeOutboxAfterBoot(remote, data));
    cacheStore();
    ensureSaveController();
    const bootNote = legacyBrowserBackup
      ? 'An older browser backup exists. Download it from Home before importing any missing edits.'
      : (data.created ? 'New book — John Doe starter is only on this device until you edit.' : 'Saved to your account.');
    showBook(bootNote);
  } catch (err) {
    if (err.status === 401) {
      auth.needsReauth = true;
      auth.signedIn = false;
      renderSignInGate();
      return;
    }
    if (!bookIsEmpty(cached)) {
      store = cached;
      showBook('Cloud copy unavailable — showing this device.');
      return;
    }
    root.innerHTML = `<p class="quiet">Could not load Brag Book: ${escapeHtml(err.message)}</p>`;
  }
}

fileInput.addEventListener('change', () => {
  importStore(fileInput.files?.[0]);
  fileInput.value = '';
});

resumeFileInput.addEventListener('change', () => {
  importResumeFile(resumeFileInput.files?.[0]);
  resumeFileInput.value = '';
});

window.addEventListener('resize', () => {
  scaleResumeFrame(document.getElementById('resume-preview-wrap'), document.getElementById('resume-preview-frame'));
  if (experiencesMobileDrawerOpen && mediaMatches(experiencesDualColumnMediaQuery())) {
    experiencesMobileDrawerOpen = false;
    render({ preserveScroll: true });
  }
});

window.addEventListener('hashchange', () => {
  void flushSave('navigation');
  if (unlocked) render();
});

window.addEventListener('keydown', (event) => {
  if (!unlocked) return;
  if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
  const view = currentView();
  if (view.kind !== 'jobs' || !view.id) return;
  const job = store.postings.find((item) => item.id === view.id);
  if (!job) return;
  if (view.mode === 'prep') {
    const max = Math.max(job.requirements.length - 1, 0);
    let index = Number(sessionStorage.getItem(prepKey(job.id)) || '0');
    if (event.key === 'ArrowRight' || event.key === 'j') {
      event.preventDefault();
      sessionStorage.setItem(prepKey(job.id), String(Math.min(index + 1, max)));
      render();
    }
    if (event.key === 'ArrowLeft' || event.key === 'k') {
      event.preventDefault();
      sessionStorage.setItem(prepKey(job.id), String(Math.max(index - 1, 0)));
      render();
    }
  }
});

window.addEventListener('pagehide', () => {
  if (!auth?.token || shouldBlockEmptyOverwrite(store, lastServerBook)) return;
  void flushSave('pagehide', { keepalive: true });
});

window.addEventListener('beforeunload', () => {
  if (!auth?.token) return;
  void flushSave('beforeunload', { keepalive: true });
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flushSave('visibilitychange:hidden', { keepalive: true });
  if (document.visibilityState === 'visible') pullBookIfClean();
});

window.addEventListener('focus', () => {
  pullBookIfClean();
});

initBragBookPwa({
  flushBeforeReload: () => flushSave('navigation'),
  onReconnect: reconnectBook,
  onNetworkChange: (online) => {
    networkOnlineForEdits = online;
  },
});

if (globalThis.__BB_TEST_RESUME_SCROLL__) {
  globalThis.__bbTestResumeScroll = {
    captureScroll,
    restoreScroll,
    SCROLL_PANES,
  };
}

if (globalThis.__BB_TEST_UNMAPPED_PANEL__) {
  globalThis.__bbTestUnmappedPanel = {
    isExpanded: (postingId) => unmappedResumePanelExpanded.has(postingId),
    resetExpanded: () => unmappedResumePanelExpanded.clear(),
  };
}

boot();
