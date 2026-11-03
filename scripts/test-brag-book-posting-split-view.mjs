/**
 * Posting split view: requirements | bullets. Model (links, add bullet, drop
 * reduction, resume order) and the real page in jsdom (default mode, drag a
 * requirement onto a bullet, drag a chip onto a second bullet without
 * untagging the first, chip remove, picker, compose, bank search, map
 * pick from the Experiences panel). The stored shape never changes: a
 * requirement under a bullet is the same `req.bullets[]` link the table wrote.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  addPosting,
  addRequirement,
  compileResumeText,
  createExperience,
  emptyStore,
  normalizeStore,
  unmappedPostingResumeBullets,
} from '../brag-book/engine.js';
import { compileResumeDoc } from '../brag-book/resume-model.js';
import {
  SPLIT_DRAG_ENTRY_TYPE,
  SPLIT_DRAG_REQUIREMENT_TYPE,
  addBulletToPosting,
  addBulletsToPosting,
  addLibraryBulletToPosting,
  applySplitDrop,
  filterSplitBullets,
  linkRequirementToBullet,
  normalizePostingViewMode,
  postingResumeEntryOrder,
  postingSplitViewModel,
  readSplitDragPayload,
  removeBulletFromPosting,
  resolveComposeJobId,
  requirementsAvailableForBullet,
  searchBankBulletsForPosting,
  setBulletRequirements,
  splitDropAccepts,
  splitRequirementDisplayOrder,
  unlinkRequirementFromBullet,
} from '../brag-book/posting-split-view.js';
import { emptySplitViewState, splitPaneFor } from '../brag-book/posting-split-view-ui.js';

const css = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
assert.match(css, /\.bb-split-view\s*\{/);
assert.match(css, /@media \(min-width: 861px\)[\s\S]*?\.bb-split-view\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.4fr\) minmax\(280px, 0\.9fr\)/, 'bullets left, requirements right on desktop');
assert.match(css, /@media \(min-width: 861px\)[\s\S]*?\.bb-split-view\s*\{[^}]*height: calc\(100dvh - var\(--nav-h\) - 200px\)/, 'split panes fill the screen');
assert.match(css, /\.bb-split-list \{[^}]*overflow-y: auto/, 'each list scrolls inside its pane');
assert.match(css, /\.bb-split-requirements \{\s*border-left: 1px solid var\(--line-strong\);/, 'a rule splits the two halves');
assert.match(css, /\.bb-split-req\.is-addressed \{\s*background: rgba\(31, 122, 77, 0\.12\);/, 'mapped requirements are light green');
assert.match(css, /\.hero\.is-compact \{\s*padding: 8px 8px 10px 16px;/, 'page title sits in from the left edge');
assert.match(css, /\.bb-split-bullet\.is-drop-target/, 'drop target styling');
assert.match(css, /\.bb-split-chip-body\[draggable="true"\] \{ cursor: grab; \}/, 'a requirement chip can be dragged');
const coarseStart = css.indexOf('/* Touch targets and no-zoom inputs on any coarse pointer');
assert.ok(coarseStart > 0, 'split view coarse-pointer block');
const coarseBlock = css.slice(coarseStart, css.indexOf('tr.job-table-row.is-req-highlight'));
assert.match(coarseBlock, /\.bb-split-bullet-line,\s*\.bb-split-req-text,\s*\.bb-split-compose-text,\s*\.bb-split-bank-search \{ font-size: 16px; \}/, '16px editable text on touch (no iOS zoom)');
assert.match(coarseBlock, /\.bb-split-add-req,[\s\S]*?\.bb-split-selected-done,[\s\S]*?\{ min-height: 44px; \}/, '44px touch targets');
assert.match(coarseBlock, /\.bb-split-chip-remove::after \{ content: ''; position: absolute; inset: -8px; \}/, 'chip × has hit slop');
const phoneStart = css.indexOf('@media (max-width: 720px) {\n  .bb-split-pane-tabs');
assert.ok(phoneStart > 0, 'split view phone block');
const phoneBlock = css.slice(phoneStart, coarseStart);
assert.match(phoneBlock, /\.bb-split-pane-tabs \{\s*position: sticky;/, 'phone pane switch is sticky');
assert.match(phoneBlock, /\.bb-split-view\.is-pane-requirements \.bb-split-bullets,\s*\.bb-split-view\.is-pane-bullets \.bb-split-requirements \{ display: none; \}/, 'phone shows one pane');
assert.match(phoneBlock, /\.bb-split-req-menu \{\s*position: fixed;\s*inset: auto 0 0 0;/, 'requirement picker is a bottom sheet on phones');
assert.match(phoneBlock, /\.bb-split-sheet-backdrop \{\s*display: block;\s*position: fixed;/, 'sheet backdrop on phones');
assert.match(css, /\.bb-split-pane-tabs \{ display: none; \}/, 'pane tabs hidden on desktop');
assert.match(css, /\.bb-split-sheet-backdrop \{ display: none; \}/, 'backdrop hidden on desktop');
assert.match(css, /@media \(max-width: 860px\) \{\s*\.bb-split-handle \{ display: none; \}/, 'no drag handles when stacked');
assert.match(css, /\.bb-split-selected-bar \{\s*position: sticky;/, 'selected requirement bar sticks');

const ui = readFileSync(new URL('../brag-book/posting-split-view-ui.js', import.meta.url), 'utf8');
assert.doesNotMatch(ui, /\b(window\.)?(prompt|confirm|alert)\s*\(/, 'no native dialogs');
assert.doesNotMatch(ui, /scrollIntoView/, 'no viewport jumps');
for (const file of ['posting-split-view.js', 'posting-split-view-ui.js']) {
  const text = readFileSync(new URL(`../brag-book/${file}`, import.meta.url), 'utf8');
  assert.doesNotMatch(text, /from 'node:|from "\.\.\/lib\//, `${file} stays browser-safe`);
}

assert.equal(normalizePostingViewMode(null), 'split');
assert.equal(normalizePostingViewMode('experience'), 'experience');
assert.equal(normalizePostingViewMode('requirement'), 'requirement');
assert.equal(normalizePostingViewMode('bogus'), 'split');

// ---------- model ----------
const clock = () => Date.parse('2026-10-21T22:00:00.000Z');
let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Senior Manager',
  onResume: false,
}, clock);
const xp = createExperience(store, { jobId: 'j1', title: 'Risk program' });
store = xp.store;
const xpId = xp.changedExperienceIds[0];
store = addEntry(store, { id: 'e1', title: 'Built a risk program across 12 teams', jobId: 'j1', experienceId: xpId }, clock);
store = addEntry(store, { id: 'e2', title: 'Automated evidence collection', jobId: 'j1' }, clock);
store = addEntry(store, { id: 'e3', title: 'Bank-only bullet about audits', jobId: 'j1' }, clock);
store = addPosting(store, { title: 'Senior Manager', company: 'GoDaddy' }, clock);
const postingId = store.postings[0].id;
store = addRequirement(store, postingId, 'Lead cross-functional programs', clock);
store = addRequirement(store, postingId, 'Automate evidence collection', clock);
store = addRequirement(store, postingId, 'Partner with auditors', clock);
const [r1, r2, r3] = store.postings[0].requirements;

let model = postingSplitViewModel(store, store.postings[0]);
assert.deepEqual(model.requirements.map((row) => row.ordinal), ['R1', 'R2', 'R3']);
assert.equal(model.bullets.length, 0, 'nothing on the posting yet');
assert.equal(model.unaddressedRequirementIds.length, 3);

// Link = same req.bullets line the table writes, and the bullet lands on the resume.
store = linkRequirementToBullet(store, postingId, r1.id, 'e1');
store = linkRequirementToBullet(store, postingId, r2.id, 'e1');
const sameTwice = linkRequirementToBullet(store, postingId, r2.id, 'e1');
const linksOf = (s) => s.postings[0].requirements.map((req) => (req.bullets || []).map((line) => line.entryId));
assert.deepEqual(linksOf(sameTwice), linksOf(store), 'linking twice is one link');
const shared = linkRequirementToBullet(store, postingId, r1.id, 'e2');
assert.deepEqual(
  shared.postings[0].requirements.find((row) => row.id === r1.id).bullets.map((line) => line.entryId),
  ['e1', 'e2'],
  'the same requirement stays tagged to both bullets',
);
assert.deepEqual(linksOf(store)[0], ['e1'], 'sharing does not unlink the first bullet');
assert.deepEqual(sameTwice.postings[0].resume.localJobs, store.postings[0].resume.localJobs, 'no second resume row');
let liveR1 = store.postings[0].requirements.find((row) => row.id === r1.id);
assert.equal(liveR1.bullets.filter((line) => line.entryId === 'e1').length, 1);
model = postingSplitViewModel(store, store.postings[0]);
assert.equal(model.bullets.length, 1);
assert.deepEqual(model.bullets[0].requirements.map((row) => row.ordinal), ['R1', 'R2'], 'purpose chips in ordinal order');
assert.equal(model.bullets[0].onResume, true, 'linked bullet is on the posting resume');
assert.equal(model.bullets[0].experienceTitle, 'Risk program');
assert.deepEqual(model.unaddressedRequirementIds, [r3.id]);
assert.equal(model.counts.addressedRequirements, 2);
assert.deepEqual(requirementsAvailableForBullet(model, 'e1').map((row) => row.ordinal), ['R3']);
assert.equal(unmappedPostingResumeBullets(store, store.postings[0]).length, 0);

// Unlink keeps the bullet on the resume and in the bank; it becomes "no requirement".
store = unlinkRequirementFromBullet(store, postingId, r1.id, 'e1');
store = unlinkRequirementFromBullet(store, postingId, r2.id, 'e1');
model = postingSplitViewModel(store, store.postings[0]);
assert.equal(model.bullets.length, 1, 'still on the posting via the resume');
assert.equal(model.bullets[0].requirements.length, 0);
assert.equal(model.bullets[0].onResume, true);
assert.equal(filterSplitBullets(model.bullets, 'without-requirement').length, 1);
assert.ok(store.entries.find((row) => row.id === 'e1'), 'bank record untouched');
assert.equal(unmappedPostingResumeBullets(store, store.postings[0]).length, 1, 'Unmapped count agrees');

// setBulletRequirements reconciles to exactly the set.
store = setBulletRequirements(store, postingId, 'e1', [r1.id, r3.id]);
model = postingSplitViewModel(store, store.postings[0]);
assert.deepEqual(model.bullets[0].requirements.map((row) => row.ordinal), ['R1', 'R3']);
store = setBulletRequirements(store, postingId, 'e1', [r3.id]);
model = postingSplitViewModel(store, store.postings[0]);
assert.deepEqual(model.bullets[0].requirements.map((row) => row.ordinal), ['R3']);

// Drops reduce to the same link in both directions.
assert.equal(splitDropAccepts('requirement', 'bullet'), true);
assert.equal(splitDropAccepts('entry', 'requirement'), true);
assert.equal(splitDropAccepts('requirement', 'requirement'), false);
assert.equal(splitDropAccepts('entry', 'bullet'), false);
const viaReqDrop = applySplitDrop(store, postingId, { kind: 'requirement', id: r2.id }, { kind: 'bullet', id: 'e1' });
const viaBulletDrop = applySplitDrop(store, postingId, { kind: 'entry', id: 'e1' }, { kind: 'requirement', id: r2.id });
assert.deepEqual(
  postingSplitViewModel(viaReqDrop, viaReqDrop.postings[0]).bullets[0].requirements.map((row) => row.ordinal),
  ['R2', 'R3'],
);
assert.deepEqual(
  postingSplitViewModel(viaBulletDrop, viaBulletDrop.postings[0]).bullets[0].requirements.map((row) => row.ordinal),
  ['R2', 'R3'],
);
assert.equal(applySplitDrop(store, postingId, { kind: 'entry', id: 'e1' }, { kind: 'bullet', id: 'e1' }), store, 'rejected drop is a no-op');
const fakeTransfer = (type, value) => ({
  types: [type, 'text/plain'],
  getData: (t) => (t === type || t === 'text/plain' ? value : ''),
});
assert.deepEqual(readSplitDragPayload(fakeTransfer(SPLIT_DRAG_REQUIREMENT_TYPE, r1.id)), { kind: 'requirement', id: r1.id });
assert.deepEqual(readSplitDragPayload(fakeTransfer(SPLIT_DRAG_ENTRY_TYPE, 'e2')), { kind: 'entry', id: 'e2' });
assert.equal(readSplitDragPayload({ types: ['text/plain'], getData: () => 'x' }), null);

// New bullet: in the bank, on the resume, optionally under requirements.
const added = addBulletToPosting(store, postingId, {
  title: '**Audit partner:** cut prep time 40%',
  jobId: 'j1',
  requirementIds: [r3.id],
});
assert.ok(added.entryId);
assert.equal(added.placed, true);
store = added.store;
const newEntry = store.entries.find((row) => row.id === added.entryId);
assert.equal(newEntry.title, 'Audit partner: cut prep time 40%');
assert.equal(newEntry.rich[0].bold, true, 'markdown bold lead kept');
model = postingSplitViewModel(store, store.postings[0]);
const newRow = model.bullets.find((row) => row.entryId === added.entryId);
assert.deepEqual(newRow.requirements.map((row) => row.ordinal), ['R3']);
assert.equal(newRow.onResume, true);
assert.equal(addBulletToPosting(store, postingId, { title: '   ', jobId: 'j1' }).entryId, '', 'blank is ignored');
assert.equal(resolveComposeJobId({ selectValue: 'j2', jobs: [{ id: 'j1' }, { id: 'j2' }] }), 'j2', 'the job showing in the dropdown is the one that saves');
assert.equal(resolveComposeJobId({ selectValue: '', jobs: [{ id: 'j1' }, { id: 'j2' }] }), '', 'a blank dropdown does not guess among several jobs');
assert.equal(resolveComposeJobId({ selectValue: '', primaryJobId: 'j1', jobs: [{ id: 'j1' }, { id: 'j2' }] }), 'j1');
assert.equal(resolveComposeJobId({ jobs: [{ id: 'j9' }] }), 'j9');

// Paste-many lands on the posting and the bank, with no requirement.
const pasted = addBulletsToPosting(store, postingId, ['Owned the close calendar', '   ', 'Cut the audit cycle'], { jobId: 'j1' });
assert.equal(pasted.entryIds.length, 2);
for (const id of pasted.entryIds) {
  assert.ok(pasted.store.entries.find((row) => row.id === id), 'pasted bullet is in the bank');
  assert.equal(postingResumeEntryOrder(pasted.store, pasted.store.postings[0]).includes(id), true, 'pasted bullet is on the posting');
  assert.equal(pasted.store.postings[0].requirements.some((req) => (req.bullets || []).some((line) => line.entryId === id)), false, 'paste does not map a requirement');
}

// Mapped requirements display after open ones. R-numbers stay on the stored order.
model = postingSplitViewModel(store, store.postings[0]);
assert.deepEqual(
  splitRequirementDisplayOrder(model.requirements).map((row) => row.ordinal),
  ['R1', 'R2', 'R3'],
);
const removed = removeBulletFromPosting(pasted.store, postingId, pasted.entryIds[0]);
assert.ok(removed.entries.find((row) => row.id === pasted.entryIds[0]), 'removing from the posting keeps the bank record');
assert.equal(postingResumeEntryOrder(removed, removed.postings[0]).includes(pasted.entryIds[0]), false, 'gone from this posting resume');
assert.equal(
  removed.postings[0].requirements.some((req) => (req.bullets || []).some((line) => line.entryId === pasted.entryIds[0])),
  false,
);
// Mapping a requirement does not reorder bullets. They stay in resume order.
const bulletRows = postingSplitViewModel(pasted.store, pasted.store.postings[0]).bullets;
assert.deepEqual(
  bulletRows.map((row) => row.entryId),
  postingResumeEntryOrder(pasted.store, pasted.store.postings[0]),
  'bullets stay in resume order when some already have a requirement',
);

// Bank search excludes bullets already on the posting; bringing one in is resume-only.
const found = searchBankBulletsForPosting(store, store.postings[0], 'bank-only');
assert.deepEqual(found.map((row) => row.entryId), ['e3']);
assert.equal(searchBankBulletsForPosting(store, store.postings[0], 'risk program').length, 0, 'already on posting');
const brought = addLibraryBulletToPosting(store, postingId, 'e3');
assert.equal(brought.placed, true);
store = brought.store;
model = postingSplitViewModel(store, store.postings[0]);
const e3Row = model.bullets.find((row) => row.entryId === 'e3');
assert.equal(e3Row.onResume, true);
assert.equal(e3Row.requirements.length, 0, 'no requirement yet');
assert.equal(addLibraryBulletToPosting(store, postingId, 'e3').reason, 'already');
store = addEntry(store, { id: 'e-nojob', title: 'Orphan bullet', jobId: '' }, clock);
assert.equal(addLibraryBulletToPosting(store, postingId, 'e-nojob').reason, 'no-job');

// Resume order drives the list; linked-but-not-on-resume bullets trail it.
const order = postingResumeEntryOrder(store, store.postings[0]);
assert.deepEqual(model.bullets.map((row) => row.entryId).slice(0, order.length), order);

// Generated resume is unchanged by the view: text/doc come from the same links.
const docBefore = compileResumeDoc(store.postings[0], store);
const textBefore = compileResumeText(store.postings[0], store);
assert.match(textBefore, /Audit partner: cut prep time 40%/);
const docIds = [];
for (const job of docBefore.sections.experience.jobs) {
  for (const group of job.groups) for (const bullet of group.bullets) docIds.push(...(bullet.sourceEntryIds || []));
}
assert.equal(new Set(docIds).size, docIds.length, 'each bullet once on the resume');

// Round trip through normalizeStore keeps every link (no new stored shape).
const roundTrip = normalizeStore(JSON.parse(JSON.stringify(store)));
assert.deepEqual(
  postingSplitViewModel(roundTrip, roundTrip.postings[0]).bullets.map((row) => [row.entryId, row.requirementIds]),
  model.bullets.map((row) => [row.entryId, row.requirementIds]),
);

// An old unlinked line is folded into the bank by normalizeStore, so it shows as a normal bullet…
const legacyRaw = JSON.parse(JSON.stringify(store));
legacyRaw.postings[0].requirements[0].bullets.push({ id: 'ln_old', text: 'Older unlinked line', entryId: '' });
const legacyStore = normalizeStore(legacyRaw);
const legacyModel = postingSplitViewModel(legacyStore, legacyStore.postings[0]);
const folded = legacyModel.bullets.find((row) => row.line === 'Older unlinked line');
assert.ok(folded?.entryId, 'legacy line became a bank bullet');
assert.deepEqual(folded.requirements.map((row) => row.ordinal), ['R1']);
assert.equal(folded.legacy, null);
// …and a line whose entry is gone mid-session still renders read-only with its requirement.
const orphanStore = {
  ...store,
  postings: store.postings.map((posting, index) => (index === 0
    ? {
      ...posting,
      requirements: posting.requirements.map((req, reqIndex) => (reqIndex === 0
        ? { ...req, bullets: [...req.bullets, { id: 'ln_gone', text: 'Entry deleted elsewhere', entryId: 'en_missing' }] }
        : req)),
    }
    : posting)),
};
const orphanRow = postingSplitViewModel(orphanStore, orphanStore.postings[0]).bullets.find((row) => row.legacy);
assert.ok(orphanRow, 'orphan line listed');
assert.equal(orphanRow.line, 'Entry deleted elsewhere');
assert.deepEqual(orphanRow.requirements.map((row) => row.ordinal), ['R1']);
assert.equal(orphanRow.entryId, '');

assert.deepEqual(Object.keys(emptySplitViewState()).sort(), [
  'bankQuery', 'bulletFilter', 'composeJobId', 'composeOpen', 'deleteBulletPendingId', 'deleteRequirementPendingId', 'expandedChipKey',
  'expandedDetailsEntryId', 'openRequirementPickerEntryId', 'pane', 'questionsOpenReqId', 'requirementAddOpen', 'selectedRequirementId',
]);

// Phone pane default: bullets when the resume has any, requirements when it only has requirements.
assert.equal(splitPaneFor(emptySplitViewState(), model), 'bullets');
assert.equal(splitPaneFor({ ...emptySplitViewState(), pane: 'requirements' }, model), 'requirements');
assert.equal(splitPaneFor(emptySplitViewState(), { counts: { bullets: 0, requirements: 2 } }), 'requirements');
assert.equal(splitPaneFor(emptySplitViewState(), { counts: { bullets: 0, requirements: 0 } }), 'bullets');

// ---------- DOM ----------
const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
  url: `http://127.0.0.1/brag-book/?local=1&experiences=1#jobs/${postingId}`,
  pretendToBeVisual: true,
});
const { window } = dom;
Object.assign(globalThis, {
  window,
  document: window.document,
  location: window.location,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  Node: window.Node,
  Element: window.Element,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: (fn) => window.setTimeout(fn, 0),
});
window.scrollTo = () => {};
window.localStorage.setItem(STORE_KEY, JSON.stringify(store));

await import(new URL(`../brag-book/app.js?split-view=${Date.now()}`, import.meta.url));
const tick = () => new Promise((resolve) => window.setTimeout(resolve, 60));
await tick();
await tick();

const { document } = window;
const readStore = () => normalizeStore(JSON.parse(window.localStorage.getItem(STORE_KEY)));

const toggle = document.querySelector('.bb-posting-view-toggle');
assert.ok(toggle, 'view toggle');
assert.match(toggle.querySelector('.bb-seg-btn.is-on').textContent, /Split view/, 'split view is the default');
assert.ok(document.querySelector('.bb-split-view'), 'split view rendered');
assert.match(document.querySelector('.bb-split-view').style.height, /^\d+px$/, 'panes are given a fixed height');
assert.equal(document.querySelector('.bb-split-bullet-list')?.dataset.splitScrollWired, '1');
assert.equal(document.querySelector('.bb-split-req-list')?.dataset.splitScrollWired, '1');
assert.equal(document.querySelector('.bb-exp-side-panel'), null, 'Experiences panel is not a third column');
assert.equal(document.querySelector('.bb-exp-mobile-toggle'), null, 'no Experiences button on the split view');
assert.equal(document.querySelector('.bb-posting-dual'), null, 'split view is one workspace, not the dual shell');
const splitCols = [...document.querySelectorAll('.bb-split-col')];
assert.ok(splitCols[0]?.classList.contains('bb-split-bullets'), 'bullets column is on the left');
assert.ok(splitCols[1]?.classList.contains('bb-split-requirements'), 'requirements column is on the right');
assert.equal(document.querySelector('.bb-unmapped-resume'), null, 'Unmapped panel folded into the split filter');
assert.equal([...document.querySelector('.job-workspace').childNodes].some((node) => node.nodeType === window.Node.TEXT_NODE && node.textContent.includes('null')), false, 'split view does not print null');
assert.doesNotMatch(document.querySelector('.job-workspace').textContent, /\bnull\b/);
const bulletFoot = document.querySelector('.bb-split-bullets .bb-split-col-foot');
const requirementFoot = document.querySelector('.bb-split-requirements .bb-split-col-foot');
assert.match(bulletFoot?.textContent || '', /Paste more bullets/, 'paste bullets sits under the bullets column');
assert.match(requirementFoot?.textContent || '', /Paste more requirements/, 'paste requirements sits under the requirements column');
assert.equal(document.querySelector('.workspace-utilities'), null, 'split view does not repeat the paste controls below the columns');
const jobDetails = document.querySelector('.bb-job-details');
const splitView = document.querySelector('.bb-split-view');
assert.ok(jobDetails && splitView);
assert.ok(jobDetails.compareDocumentPosition(splitView) & window.Node.DOCUMENT_POSITION_FOLLOWING, 'job details is above the split');
assert.ok(document.querySelector('.bb-split-remove-posting'), 'a bullet can be removed from this posting');
assert.equal(document.querySelectorAll('.bb-split-req').length, 3);
assert.deepEqual(
  [...document.querySelectorAll('.bb-split-req')].map((node) => node.dataset.requirementId),
  [r1.id, r2.id, r3.id],
  'open requirements stay ahead of mapped ones',
);
assert.ok(document.querySelector(`.bb-split-req[data-requirement-id="${r3.id}"]`).classList.contains('is-addressed'));
const e1Card = () => document.querySelector('.bb-split-bullet[data-entry-id="e1"]');
assert.ok(e1Card(), 'e1 bullet card');
assert.deepEqual(
  [...e1Card().querySelectorAll('.bb-split-chip:not(.bb-split-chip-add) .bb-split-chip-ordinal')].map((node) => node.textContent),
  ['R3'],
);
assert.ok(e1Card().querySelector('.bb-split-bullet-line[contenteditable="true"]'), 'bullet text is editable in place');
assert.ok(e1Card().querySelector('.bb-split-on-resume'), 'On resume shown');

// Drag R1 onto e1.
const r1Card = document.querySelector(`.bb-split-req[data-requirement-id="${r1.id}"]`);
assert.ok(r1Card);
assert.equal(r1Card.getAttribute('draggable'), null, 'card is not draggable until the handle is pressed');
r1Card.querySelector('.bb-split-handle').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
assert.equal(r1Card.getAttribute('draggable'), 'true');
const payload = new Map();
const transfer = {
  types: [],
  effectAllowed: '',
  dropEffect: '',
  setData: (type, value) => {
    payload.set(type, value);
    transfer.types = [...payload.keys()];
  },
  getData: (type) => payload.get(type) || '',
};
const fire = (node, type) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  node.dispatchEvent(event);
  return event;
};
fire(r1Card, 'dragstart');
assert.equal(payload.get(SPLIT_DRAG_REQUIREMENT_TYPE), r1.id);
const over = fire(e1Card(), 'dragover');
assert.equal(over.defaultPrevented, true, 'bullet accepts a requirement drag');
assert.ok(e1Card().classList.contains('is-drop-target'));
const scrollBefore = window.scrollY;
const bulletOrderBefore = [...document.querySelectorAll('.bb-split-bullet')].map((node) => node.dataset.entryId);
fire(e1Card(), 'drop');
await tick();
assert.equal(window.scrollY, scrollBefore);
assert.deepEqual(
  [...e1Card().querySelectorAll('.bb-split-chip:not(.bb-split-chip-add) .bb-split-chip-ordinal')].map((node) => node.textContent),
  ['R1', 'R3'],
  'R1 now under the bullet',
);
let saved = readStore();
liveR1 = saved.postings[0].requirements.find((row) => row.id === r1.id);
assert.equal(liveR1.bullets.some((line) => line.entryId === 'e1'), true, 'persisted as the same req.bullets link');
assert.deepEqual(
  [...document.querySelectorAll('.bb-split-req')].map((node) => node.dataset.requirementId),
  [r2.id, r1.id, r3.id],
  'a newly mapped requirement moves to the end',
);
assert.ok(document.querySelector(`.bb-split-req[data-requirement-id="${r1.id}"]`).classList.contains('is-addressed'));
assert.equal(document.querySelector(`.bb-split-req[data-requirement-id="${r2.id}"]`).classList.contains('is-addressed'), false);
assert.deepEqual(
  [...document.querySelectorAll('.bb-split-bullet')].map((node) => node.dataset.entryId),
  bulletOrderBefore,
  'mapping a requirement does not move the bullet',
);
assert.equal([...document.querySelectorAll('.bb-split-group-label')].some((node) => /Has a requirement/.test(node.textContent)), false);

// A bullet drag onto a requirement is rejected on another bullet, accepted on a requirement card.
const e3Card = document.querySelector('.bb-split-bullet[data-entry-id="e3"]');
payload.clear();
transfer.types = [];
e3Card.querySelector('.bb-split-handle').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
fire(e3Card, 'dragstart');
assert.equal(fire(e1Card(), 'dragover').defaultPrevented, false, 'bullet on bullet is not a drop');
const r2Card = document.querySelector(`.bb-split-req[data-requirement-id="${r2.id}"]`);
assert.equal(fire(r2Card, 'dragover').defaultPrevented, true);
fire(r2Card, 'drop');
await tick();
saved = readStore();
assert.equal(
  saved.postings[0].requirements.find((row) => row.id === r2.id).bullets.some((line) => line.entryId === 'e3'),
  true,
  'bullet dropped on a requirement links too',
);

// Dragging a chip onto another bullet copies the tag. The source bullet keeps it.
const r1ChipBody = e1Card().querySelector(`.bb-split-chip[data-requirement-id="${r1.id}"] .bb-split-chip-body`);
assert.equal(r1ChipBody.getAttribute('draggable'), 'true');
assert.equal(e1Card().getAttribute('draggable'), null, 'the bullet card stays undraggable');
payload.clear();
transfer.types = [];
const chipDrag = fire(r1ChipBody, 'dragstart');
assert.equal(chipDrag.defaultPrevented, false, 'the bullet card does not cancel a chip drag');
assert.equal(payload.get(SPLIT_DRAG_REQUIREMENT_TYPE), r1.id);
assert.equal(e1Card().classList.contains('is-dragging'), false, 'dragging a chip does not drag the bullet');
assert.ok(r1ChipBody.closest('.bb-split-chip').classList.contains('is-dragging'));
const e3CardAgain = document.querySelector('.bb-split-bullet[data-entry-id="e3"]');
assert.equal(fire(e3CardAgain, 'dragover').defaultPrevented, true, 'another bullet accepts the chip');
fire(e3CardAgain, 'drop');
await tick();
saved = readStore();
const r1AfterCopy = saved.postings[0].requirements.find((row) => row.id === r1.id);
assert.deepEqual(
  r1AfterCopy.bullets.map((line) => line.entryId).filter((id) => id === 'e1' || id === 'e3').sort(),
  ['e1', 'e3'],
  'R1 stays on the first bullet and is tagged to the second',
);
assert.equal(r1AfterCopy.bullets.filter((line) => line.entryId === 'e1').length, 1, 'the source link is not duplicated');
assert.ok(e1Card().querySelector(`.bb-split-chip[data-requirement-id="${r1.id}"]`), 'source chip remains');
assert.ok(document.querySelector(`.bb-split-bullet[data-entry-id="e3"] .bb-split-chip[data-requirement-id="${r1.id}"]`), 'target chip appears');
assert.match(document.getElementById('status-note')?.textContent || '', /stays on the other bullets too/);
payload.clear();
transfer.types = [];
fire(e1Card().querySelector(`.bb-split-chip[data-requirement-id="${r1.id}"] .bb-split-chip-body`), 'dragstart');
fire(e1Card(), 'drop');
await tick();
saved = readStore();
assert.equal(
  saved.postings[0].requirements.find((row) => row.id === r1.id).bullets.filter((line) => line.entryId === 'e1').length,
  1,
  'dropping a chip on its own bullet does not add a second link',
);
assert.match(document.getElementById('status-note')?.textContent || '', /already on this bullet/);
document.querySelector(`.bb-split-bullet[data-entry-id="e3"] .bb-split-chip[data-requirement-id="${r1.id}"] .bb-split-chip-remove`).click();
await tick();
saved = readStore();
assert.equal(saved.postings[0].requirements.find((row) => row.id === r1.id).bullets.some((line) => line.entryId === 'e3'), false);
assert.equal(
  saved.postings[0].requirements.find((row) => row.id === r1.id).bullets.some((line) => line.entryId === 'e1'),
  true,
  'removing the copy leaves the original tag',
);

// Chip × removes one link and leaves the bullet on the resume.
const r1Chip = e1Card().querySelector(`.bb-split-chip[data-requirement-id="${r1.id}"] .bb-split-chip-remove`);
r1Chip.click();
await tick();
saved = readStore();
assert.equal(saved.postings[0].requirements.find((row) => row.id === r1.id).bullets.some((line) => line.entryId === 'e1'), false);
assert.ok(e1Card().querySelector('.bb-split-on-resume'), 'still on the resume after removing a chip');
assert.equal(postingResumeEntryOrder(saved, saved.postings[0]).includes('e1'), true);

// + Requirement picker lists only requirements not yet under the bullet.
e1Card().querySelector('.bb-split-add-req').click();
await tick();
const menu = e1Card().querySelector('.bb-split-req-menu');
assert.ok(menu, 'picker opens');
assert.deepEqual(
  [...menu.querySelectorAll('.bb-split-req-option .bb-split-chip-ordinal')].map((node) => node.textContent),
  ['R1', 'R2'],
);
menu.querySelector(`.bb-split-req-option[data-requirement-id="${r2.id}"]`).click();
await tick();
saved = readStore();
assert.equal(saved.postings[0].requirements.find((row) => row.id === r2.id).bullets.some((line) => line.entryId === 'e1'), true);
assert.equal(e1Card().querySelector('.bb-split-req-menu'), null, 'picker closes after a pick');

// Picker is a dialog with Close + Escape + backdrop (a bottom sheet on phones).
e1Card().querySelector('.bb-split-add-req').click();
await tick();
const sheet = e1Card().querySelector('.bb-split-req-menu');
assert.equal(sheet.getAttribute('role'), 'dialog');
assert.ok(sheet.querySelector('.bb-split-req-menu-close'), 'Close button');
sheet.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
await tick();
assert.equal(e1Card().querySelector('.bb-split-req-menu'), null, 'Escape closes the picker');
assert.equal(document.activeElement?.dataset?.focusKey, 'split-add-req-e1', 'focus returns to + Requirement');
e1Card().querySelector('.bb-split-add-req').click();
await tick();
e1Card().querySelector('.bb-split-sheet-backdrop').click();
await tick();
assert.equal(e1Card().querySelector('.bb-split-req-menu'), null, 'backdrop tap closes the picker');

// Tapping a chip shows the whole requirement (no hover title on touch).
const r3ChipBody = e1Card().querySelector(`.bb-split-chip[data-requirement-id="${r3.id}"] .bb-split-chip-body`);
assert.equal(r3ChipBody.getAttribute('aria-expanded'), 'false');
r3ChipBody.click();
await tick();
const r3ChipOpen = e1Card().querySelector(`.bb-split-chip[data-requirement-id="${r3.id}"]`);
assert.ok(r3ChipOpen.classList.contains('is-expanded'));
assert.equal(r3ChipOpen.querySelector('.bb-split-chip-text').textContent, r3.text, 'full text once expanded');
r3ChipOpen.querySelector('.bb-split-chip-body').click();
await tick();
assert.equal(e1Card().querySelector(`.bb-split-chip[data-requirement-id="${r3.id}"]`).classList.contains('is-expanded'), false);

// Phone pane switch: both panes are in the DOM; the root carries the active pane.
const splitRoot = () => document.querySelector('.bb-split-view');
assert.equal(splitRoot().dataset.pane, 'bullets', 'defaults to the bullets pane when the resume has bullets');
const paneTabs = () => [...document.querySelectorAll('.bb-split-pane-tab')];
assert.deepEqual(paneTabs().map((node) => node.dataset.pane), ['bullets', 'requirements']);
assert.match(paneTabs()[0].textContent, /Bullets · \d+/);
assert.match(paneTabs()[1].textContent, /Requirements · 3/);
assert.equal(paneTabs()[0].getAttribute('aria-selected'), 'true');
paneTabs()[1].click();
await tick();
assert.ok(splitRoot().classList.contains('is-pane-requirements'));
assert.equal(paneTabs()[1].getAttribute('aria-selected'), 'true');
assert.ok(document.querySelector('.bb-split-requirements'), 'requirements column still rendered');
assert.ok(document.querySelector('.bb-split-bullets'), 'bullets column still rendered (CSS hides it on phones)');

// Selected requirement → "+ R1" buttons on bullets that do not address it (touch/keyboard path).
// Selecting from the requirements pane moves a phone to the bullets pane with a sticky Done bar.
r1Card.querySelector('.bb-split-req-select').click();
await tick();
assert.ok(document.querySelector('.bb-split-view.has-selected-requirement'));
assert.ok(splitRoot().classList.contains('is-pane-bullets'), 'Add to bullets… switches to the bullets pane');
const selectedBar = document.querySelector('.bb-split-selected-bar');
assert.ok(selectedBar, 'sticky selected bar');
assert.equal(selectedBar.dataset.requirementId, r1.id);
assert.match(selectedBar.textContent, /Adding R1/);
assert.ok(selectedBar.querySelector('.bb-split-selected-done'), 'Done on the bar');
const addChips = [...document.querySelectorAll('.bb-split-chip-add')];
assert.ok(addChips.length >= 1, 'add chips offered');
const e1Add = e1Card().querySelector('.bb-split-chip-add');
assert.ok(e1Add, 'e1 does not address R1 so it offers + R1');
e1Add.click();
await tick();
assert.equal(e1Card().querySelector('.bb-split-chip-add'), null, 'e1 now addresses R1');
assert.ok(e1Card().classList.contains('is-addressing'));
document.querySelector('.bb-split-selected-done').click();
await tick();
assert.equal(document.querySelector('.bb-split-selected-bar'), null, 'Done clears the selection');
assert.equal(document.querySelector('.bb-split-view.has-selected-requirement'), null);
// Re-select so the compose test below still starts under R1.
document.querySelector(`.bb-split-req[data-requirement-id="${r1.id}"] .bb-split-req-select`).click();
await tick();
assert.ok(document.querySelector('.bb-split-selected-bar'));

// Compose a new bullet while R1 is selected: bank + resume + under R1.
document.querySelector('.bb-split-new-bullet').click();
await tick();
const compose = document.querySelector('.bb-split-compose-text');
assert.ok(compose, 'compose box');
assert.equal(document.activeElement, compose, 'compose gets focus');
compose.value = 'Shipped a controls dashboard used by 40 auditors';
compose.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
await tick();
saved = readStore();
const composed = saved.entries.find((row) => row.title === 'Shipped a controls dashboard used by 40 auditors');
assert.ok(composed, 'new bullet in the bank');
assert.equal(composed.jobId, 'j1');
assert.equal(saved.postings[0].requirements.find((row) => row.id === r1.id).bullets.some((line) => line.entryId === composed.id), true, 'starts under R1');
assert.ok(document.querySelector(`.bb-split-bullet[data-entry-id="${composed.id}"]`), 'new card rendered');
assert.equal(document.activeElement?.dataset?.focusKey, `split-bullet-${composed.id}`, 'focus lands on the new bullet');
assert.equal(postingResumeEntryOrder(saved, saved.postings[0]).includes(composed.id), true, 'on the resume');

// Bank search never offers a bullet that is already on the posting.
const bankInput = document.querySelector('.bb-split-bank-search');
assert.ok(bankInput);
bankInput.value = 'Audit partner';
bankInput.dispatchEvent(new window.Event('input', { bubbles: true }));
await tick();
assert.ok(document.querySelector('.bb-split-bank-results'), 'results panel');
assert.equal(document.querySelector('.bb-split-bank-option'), null, 'bullet already on the posting is not offered');
assert.equal(document.activeElement?.dataset?.focusKey, 'split-bank-search', 'typing keeps focus in the search');
bankInput.value = '';
bankInput.dispatchEvent(new window.Event('input', { bubbles: true }));
await tick();

// Remove e3's only chip: it stays on the resume and shows under the "No requirement" filter.
const e3Only = document.querySelector('.bb-split-bullet[data-entry-id="e3"]');
e3Only.querySelector('.bb-split-chip-remove').click();
await tick();
saved = readStore();
assert.equal(postingResumeEntryOrder(saved, saved.postings[0]).includes('e3'), true, 'e3 still on the resume with no requirement');
const filterBtns = [...document.querySelectorAll('.bb-split-filter .bb-seg-btn')];
assert.match(filterBtns[1].textContent, /No requirement · 1/);
filterBtns[1].click();
await tick();
const shown = [...document.querySelectorAll('.bb-split-bullet')];
assert.deepEqual(shown.map((node) => node.dataset.entryId), ['e3']);
assert.ok(shown.every((node) => node.classList.contains('is-without-requirement')));
filterBtns[0].click();
await tick();
assert.ok(document.querySelectorAll('.bb-split-bullet').length > 1);

// Remove from this posting keeps the bank record.
document.querySelector('.bb-split-bullet[data-entry-id="e3"] .bb-split-remove-posting').click();
await tick();
document.querySelector('.bb-split-bullet[data-entry-id="e3"] .bb-split-confirm .is-danger').click();
await tick();
saved = readStore();
assert.equal(document.querySelector('.bb-split-bullet[data-entry-id="e3"]'), null, 'e3 left the posting');
assert.ok(saved.entries.find((row) => row.id === 'e3'), 'e3 stays in the bank');
assert.equal(postingResumeEntryOrder(saved, saved.postings[0]).includes('e3'), false);

document.querySelector('.bb-split-new-bullet').click();
await tick();
const saveForm = document.querySelector('.bb-split-compose');
assert.ok(saveForm, 'new bullet form');
const saveArea = saveForm.querySelector('textarea');
saveArea.value = 'Saved from the split form';
const saveJob = saveForm.querySelector('select');
const pickedJob = saveJob ? saveJob.options[saveJob.options.length - 1].value : '';
if (saveJob) saveJob.value = pickedJob;
[...saveForm.querySelectorAll('button')].find((node) => node.textContent === 'Save bullet').click();
await tick();
saved = readStore();
const savedBullet = saved.entries.find((row) => row.title === 'Saved from the split form');
assert.ok(savedBullet, 'Save bullet writes the bank');
if (pickedJob) assert.equal(savedBullet.jobId, pickedJob);
assert.equal(document.querySelector('.bb-split-compose'), null, 'the form closes after a save');

const pasteBox = document.querySelector('.bb-split-bullets .bb-split-col-foot details');
assert.ok(pasteBox, 'paste bullets form');
pasteBox.open = true;
const pasteArea = pasteBox.querySelector('textarea');
pasteArea.value = 'Shipped the close calendar\n- Cut the audit cycle';
[...pasteBox.querySelectorAll('button')].find((node) => node.textContent === 'Add bullets').click();
await tick();
saved = readStore();
const pastedTitles = saved.entries.map((row) => row.title);
assert.ok(pastedTitles.includes('Shipped the close calendar'));
assert.ok(pastedTitles.includes('Cut the audit cycle'));
assert.equal(saved.postings[0].requirements.some((req) => (req.bullets || []).some((line) => line.text === 'Shipped the close calendar' || line.text === 'Cut the audit cycle')), false, 'pasted bullets start unmapped');

// Delete requirement needs an inline confirm; bullets stay.
const r3Card = document.querySelector(`.bb-split-req[data-requirement-id="${r3.id}"]`);
r3Card.querySelector('.icon-quiet.is-danger').click();
await tick();
const confirmRow = document.querySelector(`.bb-split-req[data-requirement-id="${r3.id}"] .bb-split-confirm`);
assert.ok(confirmRow, 'inline confirm');
confirmRow.querySelector('.is-danger').click();
await tick();
saved = readStore();
assert.equal(saved.postings[0].requirements.some((row) => row.id === r3.id), false);
assert.ok(saved.entries.find((row) => row.id === added.entryId), 'bullet survives requirement delete');
assert.equal(postingResumeEntryOrder(saved, saved.postings[0]).includes(added.entryId), true, 'and stays on the resume');

// Switching to the table views still works and the Unmapped panel returns there.
const byReq = [...toggle.querySelectorAll('.bb-seg-btn')].find((node) => /By requirement/.test(node.textContent));
byReq.click();
await tick();
assert.ok(document.querySelector('.job-table'), 'table view reachable');
assert.ok(document.querySelector('.bb-unmapped-resume'), 'Unmapped panel back on the table view');
assert.equal(window.sessionStorage.getItem(`bb-posting-req-view:${postingId}`), 'requirement');

console.log('test-brag-book-posting-split-view.mjs: ok');
