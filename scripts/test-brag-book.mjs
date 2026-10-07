/**
 * Brag Book store: log, job requirements, STAR compile, hash routes.
 */
import assert from 'node:assert/strict';
import {
  SCHEMA,
  emptyStore,
  normalizeStore,
  normalizeEntry,
  normalizeBullet,
  addEntry,
  addEntries,
  updateEntry,
  deleteEntry,
  addKnowledge,
  addKnowledgeNotes,
  normalizeKnowledge,
  updateKnowledge,
  deleteKnowledge,
  knowledgeById,
  parseKnowledge,
  searchKnowledge,
  experienceCatalog,
  experienceDetailPatch,
  experienceRowField,
  postingsUsingEntry,
  KNOWLEDGE_SAVE_MS,
  noteKnowledgeInput,
  knowledgeSaveStatus,
  mergeBook,
  addPosting,
  updatePosting,
  deletePosting,
  addRequirement,
  addRequirements,
  updateRequirement,
  deleteRequirement,
  addBullet,
  addEntryBullet,
  createEntryBullet,
  updateBullet,
  deleteBullet,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  moveRequirement,
  answerQuestionFromEntry,
  draftBulletFromEntry,
  questionAnswered,
  parseExperiences,
  compileResumeHtml,
  resumeTextToWordHtml,
  updateProfile,
  linkEntry,
  unlinkEntry,
  parseRequirements,
  stripBullet,
  cleanPastedText,
  isRequirementHeader,
  tokenize,
  starFill,
  starScript,
  searchEntries,
  scoreEntry,
  suggestEntries,
  linkedEntries,
  bulletEntry,
  compileResume,
  compileResumeText,
  compileResumeDoc,
  applyImportedResume,
  careerNeedsSeed,
  seedStarterResume,
  STARTER_RESUME_DOC,
  updatePostingResume,
  replacePostingResume,
  addCareerJob,
  deleteCareerJob,
  addCareerGroup,
  addCareerBullet,
  deleteCareerBullet,
  moveCareerBullet,
  moveCareerJob,
  addPostingLocalJob,
  updatePostingLocalJob,
  addPostingLocalEducation,
  addPostingLocalAdditional,
  addPostingLocalBullet,
  deletePostingLocalJob,
  startPostingResumeFresh,
  resetPostingResumeToBasics,
  choosePostingResumeMode,
  addEducationItem,
  deleteEducationItem,
  addCredentialItem,
  deleteCredentialItem,
  addAdditionalRow,
  updateAdditionalRow,
  deleteAdditionalRow,
  addAdditionalGroup,
  normalizeAdditional,
  editResumeAdditionalRow,
  addResumeAdditionalGroup,
  updateResumeAdditionalGroup,
  moveResumeAdditionalGroup,
  deleteResumeAdditionalGroup,
  isResumeDoc,
  parseBulletText,
  toggleId,
  clearBulletOverride,
  clearJobTitle,
  hideResumeRow,
  restoreHiddenResumeRows,
  hiddenResumeRowCount,
  replaceBasicsWithPosting,
  restorePreviousBasics,
  basicsReplaceConfirm,
  basicsRestoreConfirm,
  hasBasicsBackup,
  tidyResumeJobs,
  updateCareerJob,
  assignEntryJob,
  placeJobOnResume,
  addPostingResumeJob,
  attachPostingJobBullets,
  inferEntryJobId,
  postingTiedJobIds,
  suggestJobSetup,
  applyJobSetup,
  dismissJobSetup,
  mergeJobs,
  updateEducationItem,
  libraryBulletChoices,
  placeLibraryBullet,
  resumeTakenEntryIds,
  visibleResumeBullets,
  writeBulletBackToSource,
  DEFAULT_SECTION_ORDER,
  compilePrep,
  prepCoverage,
  listingSummary,
  entryById,
  postingById,
  serializeBook,
  bookIsEmpty,
  normalizeBookRevision,
  bookSaveGuard,
  applyBookWrite,
  shouldPullRemoteBook,
  shouldBlockEmptyOverwrite,
  bookConflictError,
  STALE_BOOK_MESSAGE,
  resumeRoleKey,
  roleIsCollapsed,
  toggleRoleCollapsed,
  resumeRoleSummary,
  isRoleHeaderToggleTarget,
  adoptCompiledJob,
  applyResumeBulletEdit,
  createSharedBullet,
  saveSharedBullet,
  bulletConsistency,
  addResumeGroup,
  removeResumeGroup,
  moveResumeGroup,
  moveResumeBullet,
  stepResumeBullet,
  neighborGroupForBullet,
  moveAdditionalGroup,
  insertKeyAfter,
  bulletLineText,
  ignoreBoldMarkers,
  resumeBulletSpans,
  bulletFromLine,
  markdownToSpans,
  spansToMarkdown,
  additionalItemsSource,
  additionalValueSpans,
  additionalValuePlain,
  asUrl,
  titleFromJobUrl,
  hostFromJobUrl,
} from '../brag-book/engine.js';
import { parseViewHash, viewHash, viewTitle, defaultView, logLayout, hideBookRail } from '../brag-book/routes.js';
import { bookPagePlan, experienceRowSpec, sharedBulletSpec, SHARED_BULLET_FIELDS, STAR_FIELDS, experienceAdderChrome, nextExperienceAdderOpen, resumeBulletArrows, resumeGroupChrome, visibleNodes, homeStartCards, JOB_CATALOG_SAVE_MS, jobCatalogEditEffects, jobCatalogFocusKeys } from '../brag-book/book-view.js';
import {
  applyKnowledgeEnter,
  applyKnowledgeHeadingBreak,
  applyKnowledgeHeadingMarker,
  applyKnowledgeListMarker,
  applyKnowledgeTab,
  groupKnowledgeBlocks,
  insertKnowledgeBlocks,
  knowledgeDocFromHtml,
  knowledgeDocFromMarkdown,
  knowledgeEditEffects,
  knowledgeMarkShortcut,
  knowledgePasteDoc,
  knowledgePlainText,
  setKnowledgeHeading,
  toggleKnowledgeMark,
} from '../brag-book/knowledge-doc.js';
import { renderResumeHtml } from '../brag-book/resume-template.js';
import { dropOrderFromDoc, droppedBulletLabels, fitStatusLine, fitOnePage, FONT_FLOOR_PT, FIT_STEPS } from '../brag-book/resume-fit.js';
import { resumeDocxBytes } from '../brag-book/resume-docx.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const clock = () => Date.parse('2026-10-05T12:00:00.000Z');
let rand = 0;
const random = () => {
  rand += 0.17;
  return rand % 1;
};

assert.equal(SCHEMA, 1);
assert.deepEqual(emptyStore(), {
  v: 1,
  entries: [],
  knowledge: [],
  postings: [],
  profile: { name: '', email: '', location: '', summary: '', skills: '', suffix: '', locations: [], phone: '', links: [] },
  jobs: [],
  education: [],
  credentials: [],
  additional: [],
  resumeSettings: { template: 'classic-serif', sectionOrder: DEFAULT_SECTION_ORDER.slice(), showCredentials: true },
  basicsBackup: null,
  jobSetup: null,
});
assert.deepEqual(normalizeStore(null), emptyStore());
assert.equal(normalizeEntry({ title: '   ' }), null);

let store = emptyStore();
store = addEntry(store, {
  title: 'Shipped packing cubes sync',
  kind: 'experience',
  tags: ['Neon', 'Postgres', '#auth', 'Neon'],
  when: '2026',
  situation: 'Suitcases were local-only.',
  task: 'Sync private cubes for signed-in users.',
  action: 'Wrote a multiplexed /api/pc-* router and a v2 suitcase model.',
  result: 'Signed-in trips now survive a new phone.',
}, clock);
assert.equal(store.entries.length, 1);
assert.deepEqual(store.entries[0].tags, ['neon', 'postgres', 'auth']);
assert.equal(starFill(store.entries[0]).ready, true);
assert.match(starScript(store.entries[0]), /Situation:/);

store = addEntry(store, {
  title: 'Hobby-plan function budget',
  kind: 'skillset',
  tags: 'vercel, serverless',
  notes: 'Prefer ?route= branches over new api/*.js files.',
}, clock);
store = addEntry(store, {
  title: 'World in NYC ED join',
  kind: 'project',
  tags: ['gis', 'nyc'],
  situation: 'Neighborhood blobs were too coarse.',
}, clock);

const packing = store.entries.find((entry) => entry.kind === 'experience');
store = updateEntry(store, packing.id, { result: 'Signed-in trips survive a new phone without a catalog.' }, clock);
assert.match(entryById(store, packing.id).result, /without a catalog/);

const dropped = store.entries[1].id;
assert.equal(asUrl('https://boards.example.com/jobs/1'), 'https://boards.example.com/jobs/1');
assert.equal(asUrl('ftp://nope'), '');
assert.equal(titleFromJobUrl('https://boards.example.com/jobs/product-engineer'), 'product engineer · boards.example.com');
assert.equal(hostFromJobUrl('https://www.example.com/jobs/1'), 'example.com');

const fromLink = addPosting(emptyStore(), { url: 'https://boards.example.com/jobs/product-engineer' }, clock);
assert.equal(fromLink.postings[0].title, 'product engineer · boards.example.com');
assert.equal(fromLink.postings[0].url, 'https://boards.example.com/jobs/product-engineer');
assert.equal(addPosting(emptyStore(), { url: 'not-a-url' }, clock).postings.length, 0);

store = addPosting(store, { title: 'Product engineer', company: 'Beep boop', url: 'https://example.com/jobs/1' }, clock);
const jobId = store.postings[0].id;
store = addRequirement(store, jobId, 'Ship production Javascript without a build step', clock);
store = linkEntry(store, jobId, store.postings[0].requirements[0].id, dropped, clock);
assert.equal(store.postings[0].requirements[0].entryIds.length, 1);
store = deleteEntry(store, dropped);
assert.equal(entryById(store, dropped), null);
assert.deepEqual(store.postings[0].requirements[0].entryIds, []);

const parsed = parseRequirements(`
About the role
We are looking for someone kind.

Requirements:
- Ship production Javascript without a build step
- Comfortable with Postgres / Neon
* Tell STAR stories about messy deploys
1. Nice to have
2. Write resume bullets that map to a posting

Qualifications
Experience with GIS a plus
`);
assert.deepEqual(parsed, [
  'Ship production Javascript without a build step',
  'Comfortable with Postgres / Neon',
  'Tell STAR stories about messy deploys',
  'Write resume bullets that map to a posting',
  'Experience with GIS a plus',
]);
assert.equal(isRequirementHeader('Requirements:'), true);
assert.equal(stripBullet('•  hello'), 'hello');
assert.equal(cleanPastedText('  •  Built\t\tthe   platform\n\n\n  across teams  '), 'Built the platform\nacross teams');
assert.equal(cleanPastedText('hello\u00a0world\r\nnext'), 'hello world\nnext');

store = addRequirements(store, jobId, parsed.slice(1), clock);
const req0 = store.postings[0].requirements[0];
store = addBullet(store, jobId, req0.id, 'Kept every public page on static files plus 11 serverless functions.', clock);
store = addBullet(store, jobId, req0.id, '  ', clock);
assert.equal(postingById(store, jobId).requirements[0].bullets.length, 1);
store = addQuestion(store, jobId, req0.id, 'Walk me through a change that had to stay dependency-free ESM.', clock);
store = linkEntry(store, jobId, req0.id, store.entries.find((e) => e.kind === 'experience').id, clock);

const gisReq = postingById(store, jobId).requirements.find((r) => /GIS/i.test(r.text));
assert.ok(gisReq);
const suggestions = suggestEntries(store, gisReq);
assert.equal(suggestions[0].title, 'World in NYC ED join');
assert.ok(scoreEntry(suggestions[0], gisReq.text) > 0);

store = updateBullet(store, jobId, req0.id, postingById(store, jobId).requirements[0].bullets[0].id, 'Static files plus a Hobby-plan function budget.', clock);
const bulletId = postingById(store, jobId).requirements[0].bullets[0].id;
store = updateBullet(store, jobId, req0.id, bulletId, {
  notes: 'The longer version stays out of the resume.',
  situation: 'The function limit was close.',
  task: 'Ship another app.',
  action: 'Kept the browser engine dependency-free.',
  result: 'Shipped without another function.',
}, clock);
assert.equal(postingById(store, jobId).requirements[0].bullets[0].notes, 'The longer version stays out of the resume.');
assert.equal(starFill(postingById(store, jobId).requirements[0].bullets[0]).ready, true);
const reloadedBullet = normalizeStore(JSON.parse(JSON.stringify(store)), clock)
  .postings[0].requirements[0].bullets[0];
assert.equal(reloadedBullet.notes, 'The longer version stays out of the resume.');
assert.equal(reloadedBullet.result, 'Shipped without another function.');
const compiled = compileResume(postingById(store, jobId), store);
assert.equal(compiled.bullets.length, 1);
assert.match(compileResumeText(postingById(store, jobId), store), /• Static files/);
assert.match(compileResumeHtml(postingById(store, jobId), store), /<li>Static files/);

store = updateProfile(store, { name: 'Karan', email: 'k@example.com', summary: 'Ships small tools.', skills: 'javascript, postgres' });
assert.ok(compileResume(postingById(store, jobId), store).skills.includes('javascript'));
assert.match(compileResumeText(postingById(store, jobId), store), /Karan/);
assert.match(compileResumeText(postingById(store, jobId), store), /Ships small tools/);
assert.match(resumeTextToWordHtml('Karan\n• Static files', 'Resume'), /xmlns:w/);
assert.match(resumeTextToWordHtml('Karan\n• Static files', 'Resume'), /Karan/);

let grouped = addPosting(emptyStore(), { title: 'Target role' }, clock);
const groupedJobId = grouped.postings[0].id;
grouped = addEntry(grouped, { title: 'Launched billing', role: 'Product engineer, Beep', result: 'Cut review time' }, clock);
const groupedEntryId = grouped.entries[0].id;
grouped = addRequirement(grouped, groupedJobId, 'Requirement A', clock);
grouped = addRequirement(grouped, groupedJobId, 'Requirement B', clock);
const [groupA, groupB] = grouped.postings[0].requirements;
grouped = addEntryBullet(grouped, groupedJobId, groupA.id, groupedEntryId, 'Shipped billing for signed-in users', clock);
grouped = addEntryBullet(grouped, groupedJobId, groupB.id, groupedEntryId, 'A different line for the same experience', clock);
const groupedResume = compileResume(postingById(grouped, groupedJobId), grouped);
assert.equal(groupedResume.sections.length, 1);
assert.equal(groupedResume.sections[0].role, 'Product engineer, Beep');
assert.equal(groupedResume.bullets.length, 1);
assert.equal(grouped.entries.find((entry) => entry.id === groupedEntryId).title, 'Shipped billing for signed-in users');
assert.equal(postingById(grouped, groupedJobId).requirements[1].bullets[0].text, 'Shipped billing for signed-in users');
assert.match(compileResumeText(postingById(grouped, groupedJobId), grouped), /Product engineer, Beep/);
assert.doesNotMatch(compileResumeText(postingById(grouped, groupedJobId), grouped), /Requirement A/);
const withRole = normalizeStore({ entries: [{ title: 'Keep', role: 'Analyst' }] }, clock);
assert.equal(withRole.entries[0].role, 'Analyst');

const q0 = postingById(store, jobId).requirements[0].questions[0];
assert.equal(q0.text, 'Walk me through a change that had to stay dependency-free ESM.');
assert.equal(q0.answer, '');
store = updateQuestion(store, jobId, req0.id, q0.id, {
  answer: 'Kept the engine dependency-free ESM.',
  situation: 'Hobby plan was full.',
  task: 'Add another app.',
  action: 'Branched ?route=.',
  result: 'Stayed on Hobby.',
}, clock);
assert.equal(questionAnswered(postingById(store, jobId).requirements[0].questions[0]), true);

const story = store.entries.find((entry) => entry.kind === 'experience');
assert.match(draftBulletFromEntry(story), /without a catalog/);
store = answerQuestionFromEntry(store, jobId, req0.id, q0.id, story.id, clock);
assert.match(postingById(store, jobId).requirements[0].questions[0].situation, /local-only/);

const fromStrings = normalizeStore({
  postings: [{
    title: 'Legacy',
    requirements: [{ text: 'Need SQL', questions: ['Tell me about SQL'], bullets: ['Wrote the join'], ready: true }],
  }],
}, clock);
assert.equal(fromStrings.postings[0].requirements[0].questions[0].text, 'Tell me about SQL');
assert.equal(fromStrings.postings[0].requirements[0].questions[0].answer, '');
assert.equal(fromStrings.postings[0].requirements[0].experiences[0].text, 'Wrote the join');
assert.equal(fromStrings.postings[0].requirements[0].bullets[0].notes, '');
assert.equal('ready' in fromStrings.postings[0].requirements[0], false);
assert.equal(normalizeBullet('Legacy line', clock).text, 'Legacy line');
assert.equal(normalizeBullet('Legacy line', clock).rich[0].bold, false);
const marked = normalizeBullet({
  text: 'plain fallback',
  rich: [{ text: 'Led ', bold: false }, { text: 'billing', bold: true }],
}, clock);
assert.equal(marked.text, 'Led billing');
assert.equal(marked.rich[1].bold, true);
assert.equal(marked.rich[1].text, 'billing');
const trailed = normalizeBullet({ text: 'ignore', rich: [{ text: 'Led billing\n\n', bold: true }] }, clock);
assert.equal(trailed.text, 'Led billing');
assert.equal(trailed.rich[0].bold, true);
let richBook = addPosting(emptyStore(), { title: 'Bold line' }, clock);
const richJob = richBook.postings[0].id;
richBook = addRequirement(richBook, richJob, 'Own the line', clock);
const richReq = richBook.postings[0].requirements[0].id;
richBook = createEntryBullet(richBook, richJob, richReq, 'Led billing', clock, [
  { text: 'Led ', bold: false },
  { text: 'billing', bold: true },
]);
let richBullet = richBook.postings[0].requirements[0].bullets[0];
assert.equal(richBullet.rich[1].bold, true);
assert.equal(richBook.entries[0].rich[1].text, 'billing');
assert.equal(richBook.entries[0].rich[1].bold, true);
richBook = updateBullet(richBook, richJob, richReq, richBullet.id, { notes: 'kept' }, clock);
richBullet = richBook.postings[0].requirements[0].bullets[0];
assert.equal(richBullet.notes, 'kept');
assert.equal(richBullet.rich[1].bold, true);
richBook = updateBullet(richBook, richJob, richReq, richBullet.id, 'Plain replacement', clock);
richBullet = richBook.postings[0].requirements[0].bullets[0];
assert.equal(richBullet.text, 'Plain replacement');
assert.equal(richBullet.rich[0].bold, false);
assert.equal(richBook.entries[0].title, 'Plain replacement');
assert.equal(richBook.entries[0].rich[0].bold, false);

const pasted = parseExperiences(`
- Shipped packing cubes sync
- Hobby-plan function budget
`);
assert.deepEqual(pasted.map((item) => item.title), [
  'Shipped packing cubes sync',
  'Hobby-plan function budget',
]);
const many = addEntries(emptyStore(), pasted, clock);
assert.equal(many.entries[0].title, 'Shipped packing cubes sync');

let shared = addPosting(emptyStore(), { title: 'Shared experience test' }, clock);
const sharedJobId = shared.postings[0].id;
shared = addRequirement(shared, sharedJobId, 'Lead a cross-functional launch', clock);
shared = addRequirement(shared, sharedJobId, 'Communicate measurable results', clock);
const [sharedReqA, sharedReqB] = shared.postings[0].requirements;
shared = createEntryBullet(shared, sharedJobId, sharedReqA.id, 'Launched the finance workflow', clock);
const sharedEntry = shared.entries[0];
assert.equal(sharedEntry.kind, 'experience');
assert.equal(postingById(shared, sharedJobId).requirements[0].bullets[0].entryId, sharedEntry.id);
shared = addEntryBullet(shared, sharedJobId, sharedReqB.id, sharedEntry.id, 'Cut review time by 40%', clock);
assert.equal(postingById(shared, sharedJobId).requirements[1].bullets[0].entryId, sharedEntry.id);
assert.equal(linkedEntries(shared, postingById(shared, sharedJobId).requirements[1])[0].id, sharedEntry.id);
assert.equal(bulletEntry(shared, postingById(shared, sharedJobId).requirements[1].bullets[0]).title, 'Launched the finance workflow');
assert.equal(postingById(shared, sharedJobId).requirements[1].bullets[0].text, 'Launched the finance workflow');
const longLine = 'Created a framework for determining if an automated solution was appropriate. '.repeat(3).trim();
let named = addPosting(emptyStore(), { title: 'Name match' }, clock);
const namedJob = named.postings[0].id;
named = addRequirement(named, namedJob, 'Own the decision', clock);
named = addRequirement(named, namedJob, 'Use it again', clock);
const [namedA, namedB] = named.postings[0].requirements;
named = createEntryBullet(named, namedJob, namedA.id, longLine, clock);
assert.equal(named.entries[0].title, longLine);
assert.equal(named.postings[0].requirements[0].bullets[0].text, longLine);
const namedId = named.entries[0].id;
named = addEntryBullet(named, namedJob, namedB.id, namedId, 'A different name', clock);
assert.equal(named.postings[0].requirements[1].bullets[0].text, longLine);
named = updateBullet(named, namedJob, namedA.id, named.postings[0].requirements[0].bullets[0].id, 'Same line everywhere', clock);
assert.equal(named.entries.length, 1);
assert.equal(named.entries[0].id, namedId);
assert.equal(named.entries[0].title, 'Same line everywhere');
assert.equal(named.postings[0].requirements[1].bullets[0].text, 'Same line everywhere');

let propagated = addPosting(emptyStore(), { title: 'Edit once' }, clock);
const propJob = propagated.postings[0].id;
propagated = addRequirement(propagated, propJob, 'First need', clock);
propagated = addRequirement(propagated, propJob, 'Second need', clock);
const [propA, propB] = propagated.postings[0].requirements;
propagated = createEntryBullet(propagated, propJob, propA.id, 'Original line', clock);
const propEntryId = propagated.entries[0].id;
propagated = addEntryBullet(propagated, propJob, propB.id, propEntryId, 'A copy that must not win', clock);
const propCount = propagated.entries.length;
const propBullet = propagated.postings[0].requirements[0].bullets[0];
propagated = updateBullet(propagated, propJob, propA.id, propBullet.id, {
  text: 'Updated everywhere',
  rich: [{ text: 'Updated ', bold: false }, { text: 'everywhere', bold: true }],
}, clock);
assert.equal(propagated.entries.length, propCount);
assert.equal(propagated.entries.filter((entry) => entry.id === propEntryId).length, 1);
assert.equal(propagated.entries.find((entry) => entry.id === propEntryId).title, 'Updated everywhere');
assert.equal(propagated.entries.find((entry) => entry.id === propEntryId).rich[1].bold, true);
assert.equal(propagated.postings[0].requirements[0].bullets[0].id, propBullet.id);
assert.equal(propagated.postings[0].requirements[0].bullets[0].entryId, propEntryId);
assert.equal(propagated.postings[0].requirements[0].bullets[0].text, 'Updated everywhere');
assert.equal(propagated.postings[0].requirements[1].bullets[0].entryId, propEntryId);
assert.equal(propagated.postings[0].requirements[1].bullets[0].text, 'Updated everywhere');
assert.equal(compileResume(postingById(propagated, propJob), propagated).bullets[0], 'Updated everywhere');

let resumeFollows = addPosting(emptyStore(), { title: 'Resume follows posting' }, clock);
const followJob = resumeFollows.postings[0].id;
resumeFollows = addRequirement(resumeFollows, followJob, 'Need the line', clock);
const followReq = resumeFollows.postings[0].requirements[0].id;
resumeFollows = createEntryBullet(resumeFollows, followJob, followReq, 'Playbook owner: kept the old result', clock);
const followEntry = resumeFollows.entries[0].id;
const followLine = resumeFollows.postings[0].requirements[0].bullets[0].id;
resumeFollows = addCareerJob(resumeFollows, {
  id: 'rj_follow',
  company: 'PwC',
  title: 'Manager',
  groups: [{
    id: 'rg_follow',
    heading: '',
    bullets: [{
      id: 'rb_follow',
      lead: 'Playbook owner',
      body: 'kept the old result',
      sourceBulletIds: [followLine],
    }],
  }],
}, clock);
resumeFollows = updateBullet(resumeFollows, followJob, followReq, followLine, {
  text: 'Playbook owner: rewrote the result for this posting',
  rich: [{ text: 'Playbook owner: ', bold: false }, { text: 'rewrote the result', bold: true }, { text: ' for this posting', bold: false }],
}, clock);
assert.equal(resumeFollows.entries.length, 1);
assert.equal(resumeFollows.jobs.length, 1);
assert.equal(resumeFollows.jobs[0].groups[0].bullets.length, 1);
assert.equal(resumeFollows.jobs[0].groups[0].bullets[0].lead, 'Playbook owner');
assert.match(resumeFollows.jobs[0].groups[0].bullets[0].body, /rewrote the result/);
assert.ok(resumeFollows.jobs[0].groups[0].bullets[0].sourceEntryIds.includes(followEntry));
const followDoc = compileResumeDoc(postingById(resumeFollows, followJob), resumeFollows);
const followBullets = followDoc.sections.experience.jobs.flatMap((job) => job.groups.flatMap((group) => group.bullets));
assert.equal(followBullets.length, 1);
assert.equal(followBullets[0].lead, 'Playbook owner');
assert.match(followBullets[0].body, /rewrote the result/);
assert.equal(compileResumeDoc(null, resumeFollows).sections.experience.jobs[0].groups[0].bullets[0].lead, 'Playbook owner');

const diverged = normalizeStore({
  entries: [{ id: 'en_div', title: 'Decision framework: the posting now says this', kind: 'experience' }],
  jobs: [{
    id: 'rj_div',
    company: 'PwC',
    title: 'Manager',
    groups: [{
      id: 'rg_div',
      heading: '',
      bullets: [{ id: 'rb_div', lead: 'Decision framework', body: 'the resume still says the old line' }],
    }],
  }],
  postings: [{
    title: 'Role',
    requirements: [{
      text: 'Need it',
      bullets: [{ id: 'ln_div', text: 'Decision framework: the posting now says this', entryId: 'en_div' }],
    }],
  }],
}, clock);
assert.equal(diverged.jobs.length, 1);
assert.equal(diverged.jobs[0].groups[0].bullets.length, 1);
assert.equal(diverged.jobs[0].groups[0].bullets[0].lead, 'Decision framework');
assert.match(diverged.jobs[0].groups[0].bullets[0].body, /posting now says this/);
const divergedDoc = compileResumeDoc(diverged.postings[0], diverged);
const divergedBullets = divergedDoc.sections.experience.jobs.flatMap((job) => job.groups.flatMap((group) => group.bullets));
assert.equal(divergedBullets.length, 1);
assert.match(bulletLineText(divergedBullets[0]), /posting now says this/);

let rewritten = addPosting(emptyStore(), { title: 'Full rewrite' }, clock);
const rewriteJob = rewritten.postings[0].id;
rewritten = addRequirement(rewritten, rewriteJob, 'Need', clock);
const rewriteReq = rewritten.postings[0].requirements[0].id;
rewritten = createEntryBullet(rewritten, rewriteJob, rewriteReq, 'Original line: did the work', clock);
const rewriteLine = rewritten.postings[0].requirements[0].bullets[0].id;
rewritten = addCareerJob(rewritten, {
  id: 'rj_rewrite',
  company: 'PwC',
  title: 'Manager',
  groups: [{
    id: 'rg_rewrite',
    heading: '',
    bullets: [{ id: 'rb_rewrite', lead: 'Original line', body: 'did the work' }],
  }],
}, clock);
rewritten = updateBullet(rewritten, rewriteJob, rewriteReq, rewriteLine, 'Completely different wording from the posting', clock);
assert.equal(rewritten.jobs[0].groups[0].bullets.length, 1);
assert.match(bulletLineText(rewritten.jobs[0].groups[0].bullets[0]), /Completely different wording/);
const rewriteDoc = compileResumeDoc(rewritten.postings[0], rewritten);
assert.equal(rewriteDoc.sections.experience.jobs.length, 1);
assert.equal(rewriteDoc.sections.experience.jobs[0].groups[0].bullets.length, 1);

let forked = addPosting(emptyStore(), { title: 'Forked wording' }, clock);
const forkJob = forked.postings[0].id;
forked = addRequirement(forked, forkJob, 'Need', clock);
const forkReq = forked.postings[0].requirements[0].id;
forked = createEntryBullet(forked, forkJob, forkReq, 'Shared lead in: the source line', clock);
const forkBulletId = 'rb_fork';
forked = addCareerJob(forked, {
  id: 'rj_fork',
  company: 'PwC',
  title: 'Manager',
  groups: [{
    id: 'rg_fork',
    heading: '',
    bullets: [{ id: forkBulletId, lead: 'Shared lead in', body: 'the source line', sourceEntryIds: [forked.entries[0].id] }],
  }],
}, clock);
forked = updatePostingResume(forked, forkJob, {
  overrides: { [forkBulletId]: { lead: 'Resume only', body: 'a tailored fork that must stay', edited: true } },
}, clock);
forked = updateBullet(forked, forkJob, forkReq, forked.postings[0].requirements[0].bullets[0].id, 'Shared lead in: the posting changed', clock);
const forkDoc = compileResumeDoc(forked.postings[0], forked);
const forkBullet = forkDoc.sections.experience.jobs[0].groups[0].bullets.find((bullet) => bullet.id === forkBulletId);
assert.equal(forkBullet.lead, 'Resume only');
assert.equal(forkBullet.hasOverride, true);
assert.match(forked.jobs[0].groups[0].bullets[0].body, /posting changed/);
const reloadedProp = normalizeStore(JSON.parse(JSON.stringify(propagated)), clock);
assert.equal(reloadedProp.entries.length, propCount);
assert.equal(reloadedProp.entries.find((entry) => entry.id === propEntryId).title, 'Updated everywhere');
assert.equal(reloadedProp.postings[0].requirements[1].bullets[0].text, 'Updated everywhere');

let unlinked = addPosting(emptyStore(), { title: 'Unlinked' }, clock);
unlinked = addRequirement(unlinked, unlinked.postings[0].id, 'Need', clock);
unlinked = addBullet(unlinked, unlinked.postings[0].id, unlinked.postings[0].requirements[0].id, 'Only here', clock);
unlinked = updateBullet(
  unlinked,
  unlinked.postings[0].id,
  unlinked.postings[0].requirements[0].id,
  unlinked.postings[0].requirements[0].bullets[0].id,
  'Still only here',
  clock,
);
assert.equal(unlinked.entries.length, 0);
assert.equal(unlinked.postings[0].requirements[0].bullets[0].text, 'Still only here');
const aligned = normalizeStore({
  entries: [{ id: 'en_line', title: 'Short name', kind: 'experience' }],
  postings: [{
    title: 'Role',
    requirements: [
      { text: 'First', bullets: [{ id: 'ln1', text: 'The long resume line', entryId: 'en_line', rich: [{ text: 'The long ', bold: false }, { text: 'resume line', bold: true }] }] },
      { text: 'Second', bullets: [{ id: 'ln2', text: 'Other line', entryId: 'en_line' }] },
    ],
  }],
}, clock);
assert.equal(aligned.entries.length, 1);
assert.equal(aligned.entries[0].id, 'en_line');
assert.equal(aligned.entries[0].title, 'Short name');
assert.equal(aligned.postings[0].requirements[0].bullets[0].text, 'Short name');
assert.equal(aligned.postings[0].requirements[1].bullets[0].text, 'Short name');
assert.equal(aligned.postings[0].requirements[0].bullets[0].entryId, 'en_line');
shared = updateEntry(shared, sharedEntry.id, { result: 'Cut review time by 40%.' }, clock);
assert.equal(
  bulletEntry(shared, postingById(shared, sharedJobId).requirements[0].bullets[0]).result,
  'Cut review time by 40%.'
);
const sharedPrep = compilePrep(shared, postingById(shared, sharedJobId));
assert.equal(sharedPrep[0].bulletDetails[0].result, 'Cut review time by 40%.');
assert.equal(sharedPrep[0].stories.length, 0);
const sharedReloaded = normalizeStore(JSON.parse(JSON.stringify(shared)), clock);
assert.equal(sharedReloaded.postings[0].requirements[0].bullets[0].entryId, sharedEntry.id);
const staleShared = normalizeStore({
  entries: [],
  postings: [{ title: 'Stale', requirements: [{ text: 'Need it', bullets: [{ text: 'Keep the line', entryId: 'missing' }] }] }],
}, clock);
assert.equal(staleShared.postings[0].requirements[0].bullets[0].entryId, '');
shared = deleteEntry(shared, sharedEntry.id);
assert.equal(shared.entries.length, 0);
assert.equal(shared.postings[0].requirements[0].bullets.length, 0);
assert.equal(shared.postings[0].requirements[1].bullets.length, 0);

store = moveRequirement(store, jobId, gisReq.id, -1, clock);
assert.ok(postingById(store, jobId).requirements.findIndex((req) => req.id === gisReq.id) >= 0);

const prep = compilePrep(store, postingById(store, jobId));
assert.equal(prep[0].stories[0].title, 'Shipped packing cubes sync');
assert.equal(prep[0].bulletDetails[0].notes, 'The longer version stays out of the resume.');
assert.equal(prep[0].bulletDetails[0].fill.ready, true);
assert.equal(prep[0].questions.length, 1);
assert.equal(prep[0].questions[0].answered, true);
assert.match(prep[0].questions[0].script, /Situation:/);
const coverage = prepCoverage(store, postingById(store, jobId));
assert.equal(coverage.total, parsed.length);
assert.equal(coverage.withBullet, 1);
assert.equal(coverage.withStory, 1);
assert.equal(coverage.withAnswer, 1);
assert.equal('ready' in coverage, false);
assert.ok(coverage.hints.some((hint) => /need a resume bullet/.test(hint)));

const hits = searchEntries(store, 'neon suitcase');
assert.equal(hits[0].kind, 'experience');
assert.ok(tokenize('able to ship the role').includes('ship'));
assert.ok(!tokenize('able to ship the role').includes('the'));

store = updatePosting(store, jobId, { status: 'prepping', company: 'Beep Boop Labs' }, clock);
assert.equal(postingById(store, jobId).company, 'Beep Boop Labs');
store = deleteQuestion(store, jobId, req0.id, postingById(store, jobId).requirements[0].questions[0].id, clock);
store = unlinkEntry(store, jobId, req0.id, postingById(store, jobId).requirements[0].entryIds[0], clock);
store = deleteBullet(store, jobId, req0.id, postingById(store, jobId).requirements[0].bullets[0].id, clock);
store = deleteRequirement(store, jobId, gisReq.id, clock);
assert.equal(postingById(store, jobId).requirements.some((r) => r.id === gisReq.id), false);

const dirty = normalizeStore({
  entries: [{ title: 'Keep' }, { title: '' }, { id: 'dup', title: 'A' }, { id: 'dup', title: 'B' }],
  postings: [
    { title: 'Job', requirements: [{ text: 'Need', entryIds: ['missing', 'en_keep'] }] },
    { title: '   ' },
  ],
}, clock);
assert.equal(dirty.entries.length, 2);
assert.deepEqual(dirty.postings[0].requirements[0].entryIds, []);

store = deletePosting(store, jobId);
assert.equal(store.postings.length, 0);
assert.equal(listingSummary(store).entries, 2);
assert.equal(bookIsEmpty(emptyStore()), true);
assert.equal(bookIsEmpty(store), false);
const packed = serializeBook(store);
assert.equal(packed.book.v, 1);
assert.throws(() => serializeBook(store, { maxChars: 8 }), /too large/);

assert.deepEqual(defaultView(), { kind: 'home' });
assert.equal(viewHash({ kind: 'home' }), '#home');
assert.equal(viewHash({ kind: 'log' }), '#experiences');
assert.equal(viewHash({ kind: 'jobs', id: 'job_1', mode: 'prep' }), '#jobs/job_1/prep');
assert.equal(viewHash({ kind: 'jobs', id: 'job_1', mode: 'fill', reqId: 'rq_1' }), '#jobs/job_1/fill/rq_1');
assert.equal(
  viewHash({ kind: 'jobs', id: 'job_1', mode: 'bullet', reqId: 'rq_1', bulletId: 'ln_1' }),
  '#jobs/job_1/bullet/rq_1/ln_1'
);
assert.deepEqual(parseViewHash('#jobs/job_1/bullet/rq_1/ln_1', { postingIds: ['job_1'] }), {
  kind: 'jobs',
  id: 'job_1',
  mode: 'bullet',
  reqId: 'rq_1',
  bulletId: 'ln_1',
});
assert.deepEqual(parseViewHash('#jobs/job_1/fill/rq_1', { postingIds: ['job_1'] }), {
  kind: 'jobs',
  id: 'job_1',
  mode: 'fill',
  reqId: 'rq_1',
});
assert.equal(viewTitle({ kind: 'jobs', id: 'new' }), 'New job posting');
assert.deepEqual(parseViewHash(''), { kind: 'home' });
assert.deepEqual(parseViewHash('#home'), { kind: 'home' });
assert.deepEqual(parseViewHash('#jobs/job_1/resume', { postingIds: ['job_1'] }), {
  kind: 'jobs',
  id: 'job_1',
  mode: 'resume',
});
assert.deepEqual(parseViewHash('#jobs/nope', { postingIds: ['job_1'] }), { kind: 'jobs' });
assert.deepEqual(parseViewHash('#log/en_1', { entryIds: ['en_1'] }), { kind: 'log', id: 'en_1' });
assert.equal(viewTitle({ kind: 'home' }), 'Brag Book');
assert.equal(viewTitle({ kind: 'jobs', id: 'job_1', mode: 'prep' }, { postings: [{ id: 'job_1', title: 'PM' }] }), 'Prep · PM');
assert.equal(viewTitle({ kind: 'jobs', id: 'job_1', mode: 'bullet' }, { postings: [{ id: 'job_1', title: 'PM' }] }), 'Experience · PM');

assert.equal(viewHash({ kind: 'profile' }), '#profile');
assert.deepEqual(parseViewHash('#profile'), { kind: 'profile' });
assert.equal(viewTitle({ kind: 'profile' }), 'Resume basics');

// ids stay unique even when the clock is pinned
const a = addEntry(emptyStore(), { title: 'One' }, clock, random);
const b = addEntry(a, { title: 'Two' }, clock, random);
assert.notEqual(b.entries[0].id, b.entries[1].id);

const samplePath = join(dirname(fileURLToPath(import.meta.url)), '../brag-book/data/inaayat-gill-resume.json');
const sampleResume = JSON.parse(readFileSync(samplePath, 'utf8'));
assert.equal(isResumeDoc(sampleResume), true);
assert.equal(isResumeDoc({ entries: [], postings: [] }), false);

const oldBook = normalizeStore({
  entries: [{ title: 'Legacy win', role: 'Analyst' }],
  postings: [{ title: 'Legacy job', resumeText: 'plain' }],
  profile: { name: 'Ada', location: 'Seattle, WA' },
}, clock);
assert.equal(oldBook.jobs.length, 0);
assert.equal(oldBook.education.length, 0);
assert.equal(oldBook.credentials.length, 0);
assert.deepEqual(oldBook.profile.locations, ['Seattle, WA']);
assert.equal(oldBook.profile.location, 'Seattle, WA');
assert.equal(oldBook.postings[0].resumeText, 'plain');
assert.deepEqual(oldBook.postings[0].resume.excludedBulletIds, []);
assert.equal(oldBook.resumeSettings.showCredentials, true);
assert.equal(bookIsEmpty(oldBook), false);
assert.equal(bookIsEmpty(emptyStore()), true);

let seeded = applyImportedResume(emptyStore(), sampleResume, clock);
assert.equal(seeded.profile.name, 'Inaayat Gill');
assert.equal(seeded.profile.suffix, 'CPA');
assert.deepEqual(seeded.profile.locations, ['New York, NY', 'Seattle, WA']);
assert.equal(seeded.jobs[0].company, 'PricewaterhouseCoopers LLC');
assert.equal(seeded.jobs[1].company, 'Alaska Airlines');
assert.equal(seeded.credentials[0].name, 'Certified Public Accountant (CPA)');
assert.equal(seeded.education[0].gpa, '3.7/4.0');
assert.equal(seeded.additional[1].groups[0].label, 'Compliance Tools');
assert.equal(bookIsEmpty(seeded), false);

seeded = addPosting(seeded, { title: 'Sample posting', company: 'Example' }, clock);
const seedJobId = seeded.postings[0].id;
const resumeDoc = compileResumeDoc(postingById(seeded, seedJobId), seeded);
assert.equal(resumeDoc.header.name, 'Inaayat Gill');
assert.equal(resumeDoc.sectionOrder[0], 'experience');
assert.equal(resumeDoc.sections.experience.jobs[0].groups[0].bullets[0].lead.includes('Walkthroughs'), true);
assert.equal(resumeDoc.sections.credentials.enabled, true);

const html = renderResumeHtml(resumeDoc, { droppedBulletIds: [] });
assert.match(html, /Inaayat Gill, CPA/);
assert.match(html, /Work Experience/);
assert.match(html, /PricewaterhouseCoopers LLC/);
assert.match(html, /class="title"/);
assert.match(html, /Issued May 2024/);
assert.match(html, /Cumulative GPA: 3\.7\/4\.0/);
assert.match(html, /100\+ controls/);
assert.match(html, /mailto:inaayat@gmail.com/);

seeded = updatePostingResume(seeded, seedJobId, {
  excludedJobIds: ['job_alaska'],
  excludedBulletIds: ['b_pwc_risk'],
  showCredentials: false,
  sectionOrder: ['education', 'experience', 'additional', 'credentials'],
  overrides: { b_pwc_rfp: { lead: 'Won new work', body: 'Closed **$5.8M**.', edited: true } },
}, clock);
const tailored = compileResumeDoc(postingById(seeded, seedJobId), seeded);
assert.equal(tailored.sectionOrder[0], 'education');
assert.equal(tailored.sections.credentials.enabled, false);
assert.equal(tailored.sections.experience.jobs.find((job) => job.id === 'job_alaska').included, false);
const rfp = tailored.sections.experience.jobs[0].groups.flatMap((g) => g.bullets).find((b) => b.id === 'b_pwc_rfp');
assert.equal(rfp.lead, 'Won new work');
assert.equal(rfp.hasOverride, true);
assert.equal(seeded.jobs[0].groups[2].bullets.find((b) => b.id === 'b_pwc_rfp').lead, 'Secured New Business of $5.8M');
const hidden = renderResumeHtml(tailored, { droppedBulletIds: [] });
assert.doesNotMatch(hidden, /Alaska Airlines/);
assert.doesNotMatch(hidden, /Issued May 2024/);
assert.match(hidden, /Won new work/);

const sourceLead = seeded.jobs[0].groups[2].bullets.find((b) => b.id === 'b_pwc_rfp').lead;
seeded = replacePostingResume(seeded, seedJobId, clearBulletOverride(postingById(seeded, seedJobId).resume, 'b_pwc_rfp'));
const resetDoc = compileResumeDoc(postingById(seeded, seedJobId), seeded);
const resetBullet = resetDoc.sections.experience.jobs[0].groups.flatMap((g) => g.bullets).find((b) => b.id === 'b_pwc_rfp');
assert.equal(resetBullet.lead, sourceLead);
assert.equal(resetBullet.hasOverride, false);

seeded = updatePostingResume(seeded, seedJobId, { overrides: { b_pwc_rfp: { lead: 'Saved back', body: 'Wrote it down.', edited: true } } }, clock);
const live = compileResumeDoc(postingById(seeded, seedJobId), seeded).sections.experience.jobs[0].groups
  .flatMap((g) => g.bullets).find((b) => b.id === 'b_pwc_rfp');
seeded = writeBulletBackToSource(seeded, seedJobId, live);
assert.equal(seeded.jobs[0].groups[2].bullets.find((b) => b.id === 'b_pwc_rfp').lead, 'Saved back');

assert.deepEqual(parseBulletText('Led 11-person team: Built **100+ controls**'), {
  lead: 'Led 11-person team',
  body: 'Built **100+ controls**',
});
assert.match(parseBulletText('Saved 140+ engineering hours last year').body, /\*\*140\+ engineering hours/);

const overflowDoc = compileResumeDoc(postingById(seeded, seedJobId), applyImportedResume(emptyStore(), sampleResume, clock));
overflowDoc.sections.experience.jobs[0].groups[0].bullets.forEach((b, i) => { b.priority = i === 0 ? 1 : 2; b.pinned = false; });
const drops = dropOrderFromDoc(overflowDoc);
assert.ok(drops.includes('b_pwc_risk') || drops.length >= 1);
assert.equal(FIT_STEPS.at(-1)['--fs'], '9.5pt');
assert.equal(FONT_FLOOR_PT, 9.5);
const lastAlaska = overflowDoc.sections.experience.jobs.find((j) => j.id === 'job_alaska')
  .groups.flatMap((g) => g.bullets);
assert.equal(lastAlaska.length, 1);
assert.ok(!drops.includes(lastAlaska[0].id));

const pinFitDoc = {
  sections: {
    experience: {
      jobs: [
        {
          id: 'job_new',
          included: true,
          groups: [{
            bullets: [
              { id: 'keep_pin', lead: 'Leading Enterprise AI Governance Maturity Assessment', body: 'Designed the model.', priority: 3, pinned: true, included: true },
              { id: 'drop_me', lead: 'Shorter unpinned line', body: 'Did the work.', priority: 3, pinned: false, included: true },
              { id: 'also_drop', lead: 'Another unpinned line', body: 'More work.', priority: 1, pinned: false, included: true },
              { id: 'off', lead: 'Excluded line', body: 'Not on the page.', priority: 3, pinned: false, included: false },
            ],
          }],
        },
        {
          id: 'job_old',
          included: true,
          groups: [{
            bullets: [
              { id: 'old_only', lead: 'Only bullet on the old role', body: 'Stays.', priority: 3, pinned: false, included: true },
            ],
          }],
        },
      ],
    },
  },
};
const pinDrops = dropOrderFromDoc(pinFitDoc);
assert.deepEqual(pinDrops, ['drop_me', 'also_drop']);
assert.ok(!pinDrops.includes('keep_pin'));
assert.ok(!pinDrops.includes('off'));
assert.ok(!pinDrops.includes('old_only'));
assert.deepEqual(droppedBulletLabels(pinFitDoc, pinDrops), ['Shorter unpinned line', 'Another unpinned line']);
assert.equal(
  fitStatusLine({ fits: true, fontPt: 9.6, droppedLabels: droppedBulletLabels(pinFitDoc, ['keep_pin']) }),
  'Fits on one page · 9.6pt · hid Leading Enterprise AI Governance Maturity Assessment',
);
assert.equal(
  fitStatusLine({
    fits: true,
    fontPt: 9.5,
    droppedLabels: ['Shorter unpinned line', 'Another unpinned line'],
  }),
  'Fits on one page · 9.5pt · hid Shorter unpinned line; Another unpinned line',
);
assert.equal(
  fitStatusLine({ fits: false, fontPt: 9.5, overflowPx: 40, pinnedBlocked: true, droppedLabels: ['Shorter unpinned line'] }),
  "Over one page: pinned bullets don't fit. Unpin or shorten a bullet. Hid Shorter unpinned line.",
);
assert.equal(
  fitStatusLine({ fits: false, fontPt: 9.5, overflowPx: 20, pinnedBlocked: false, droppedLabels: [] }),
  'Over by 2 lines — hide or shorten bullets',
);
assert.equal(fitStatusLine({ fits: true, fontPt: 10, droppedLabels: [] }), 'Fits on one page · 10pt');

function fakeResumePage(items, { liHeight = 20 } = {}) {
  function matches(el, sel) {
    if (sel === '.job') return el.className === 'job';
    if (sel === 'li') return el.tagName === 'LI';
    const bullet = /^li\[data-bullet-id="(.*)"\]$/.exec(sel);
    if (bullet) return el.tagName === 'LI' && el.attrs['data-bullet-id'] === bullet[1];
    const pinned = /^li\[data-pinned="(.*)"\]$/.exec(sel);
    if (pinned) return el.tagName === 'LI' && el.attrs['data-pinned'] === pinned[1];
    return false;
  }
  function queryAll(el, sel) {
    const out = [];
    const walk = (node) => {
      if (node !== el && matches(node, sel)) out.push(node);
      for (const child of node.children || []) walk(child);
    };
    walk(el);
    return out;
  }
  function removeNode(node) {
    const parent = node.parentNode;
    if (!parent) return;
    parent.children = parent.children.filter((child) => child !== node);
  }
  const lis = items.map((item) => {
    const li = {
      tagName: 'LI',
      attrs: {
        'data-bullet-id': item.id,
        'data-pinned': item.pinned ? '1' : '0',
      },
      textContent: item.text || '',
      children: [],
      classList: { contains() { return false; } },
      getAttribute(name) { return this.attrs[name] ?? null; },
    };
    li.querySelector = (sel) => queryAll(li, sel)[0] || null;
    li.querySelectorAll = (sel) => queryAll(li, sel);
    li.remove = () => removeNode(li);
    li.closest = (sel) => {
      let node = li;
      while (node) {
        if (matches(node, sel)) return node;
        node = node.parentNode;
      }
      return null;
    };
    return li;
  });
  const ul = {
    tagName: 'UL',
    children: lis,
    previousElementSibling: null,
    classList: { contains() { return false; } },
    querySelector(sel) { return queryAll(ul, sel)[0] || null; },
    querySelectorAll(sel) { return queryAll(ul, sel); },
    remove() { removeNode(ul); },
  };
  lis.forEach((li) => { li.parentNode = ul; });
  const job = {
    className: 'job',
    tagName: 'DIV',
    children: [ul],
    classList: { contains(name) { return name === 'job'; } },
    querySelector(sel) { return queryAll(job, sel)[0] || null; },
    querySelectorAll(sel) { return queryAll(job, sel); },
  };
  ul.parentNode = job;
  const page = {
    children: [job],
    style: { setProperty() {} },
    querySelector(sel) { return queryAll(page, sel)[0] || null; },
    querySelectorAll(sel) { return queryAll(page, sel); },
    get scrollHeight() { return page.querySelectorAll('li').length * liHeight; },
  };
  job.parentNode = page;
  return page;
}

const fitted = fitOnePage(fakeResumePage([
  { id: 'keep_pin', job: 'job_new', pinned: true, text: 'Leading Enterprise AI Governance Maturity Assessment' },
  { id: 'drop_me', job: 'job_new', pinned: false, text: 'Shorter unpinned line' },
], { liHeight: 400, pageHeight: 500 }), {
  pageHeightPx: 500,
  dropOrder: ['keep_pin', 'drop_me'],
});
assert.equal(fitted.droppedBulletIds.includes('keep_pin'), false);
assert.deepEqual(fitted.droppedBulletIds, ['drop_me']);
assert.equal(fitted.fits, true);
assert.equal(fitted.pinnedBlocked, false);

const pinnedOverflow = fitOnePage(fakeResumePage([
  { id: 'keep_pin', job: 'job_new', pinned: true, text: 'Leading Enterprise AI Governance Maturity Assessment' },
  { id: 'drop_me', job: 'job_new', pinned: false, text: 'Shorter unpinned line' },
], { liHeight: 400, pageHeight: 300 }), {
  pageHeightPx: 300,
  dropOrder: ['drop_me', 'keep_pin'],
});
assert.deepEqual(pinnedOverflow.droppedBulletIds, ['drop_me']);
assert.equal(pinnedOverflow.fits, false);
assert.equal(pinnedOverflow.pinnedBlocked, true);
assert.equal(pinnedOverflow.droppedBulletIds.includes('keep_pin'), false);

const editedSentence = 'Leading Enterprise AI Governance Maturity Assessment: Designing the maturity model and scoring criteria, running 15+ accounting evaluations';
const staleBody = 'Designing the maturity model and scoring criteria, running **stakeholder** evaluations across **Finance**';
let previewBook = addPosting(emptyStore(), { title: 'Preview follows editor' }, clock);
const previewPostingId = previewBook.postings[0].id;
previewBook = addEntry(previewBook, {
  id: 'en_gov',
  title: 'Leading Enterprise AI Governance Maturity Assessment: Designing the maturity model and scoring criteria, running stakeholder evaluations across Finance',
  kind: 'experience',
}, clock);
previewBook = addCareerJob(previewBook, {
  id: 'rj_gov',
  company: 'GoDaddy',
  title: 'Senior Manager',
  groups: [{
    id: 'rg_gov',
    heading: '',
    bullets: [{
      id: 'rb_gov',
      lead: 'Leading Enterprise AI Governance Maturity Assessment',
      body: 'Designing the maturity model and scoring criteria, running **stakeholder** evaluations across Finance',
      sourceEntryIds: ['en_gov'],
    }],
  }],
}, clock);
previewBook = updatePostingResume(previewBook, previewPostingId, {
  overrides: {
    rb_gov: {
      lead: 'Leading Enterprise AI Governance Maturity Assessment',
      body: staleBody,
    },
  },
}, clock);
const staleHtml = renderResumeHtml(compileResumeDoc(postingById(previewBook, previewPostingId), previewBook));
assert.match(staleHtml, /\*\*stakeholder\*\*|stakeholder/);
assert.match(staleHtml, /Finance/);
const editedSpans = [{ text: editedSentence, bold: false }];
previewBook = applyResumeBulletEdit(previewBook, {
  postingId: previewPostingId,
  jobId: 'rj_gov',
  groupId: 'rg_gov',
  bullet: { id: 'rb_gov', sourceEntryIds: ['en_gov'] },
  spans: editedSpans,
}, clock);
const previewDoc = compileResumeDoc(postingById(previewBook, previewPostingId), previewBook);
const previewBullet = previewDoc.sections.experience.jobs
  .flatMap((job) => job.groups.flatMap((group) => group.bullets))
  .find((bullet) => bullet.id === 'rb_gov');
assert.equal(ignoreBoldMarkers(bulletLineText(previewBullet)), editedSentence);
assert.match(previewBullet.lead, /Leading Enterprise AI Governance/);
assert.match(previewBullet.body, /15\+ accounting evaluations/);
assert.equal(previewBullet.hasOverride, false);
assert.equal(previewBook.entries.find((entry) => entry.id === 'en_gov').title, editedSentence);
const editedPreviewHtml = renderResumeHtml(previewDoc, { droppedBulletIds: [] });
const previewLi = editedPreviewHtml.match(/<li[^>]*data-bullet-id="rb_gov"[^>]*>[\s\S]*?<\/li>/)?.[0] || '';
assert.match(previewLi, /15\+ accounting evaluations/);
assert.doesNotMatch(previewLi, /\*\*/);
assert.doesNotMatch(previewLi, /stakeholder/);
assert.doesNotMatch(previewLi, /Finance/);
assert.doesNotMatch(previewLi, /<b>[^<]*15\+/);
assert.match(previewLi, /<b>Leading Enterprise AI Governance Maturity Assessment:<\/b>/);

const plainBook = applyResumeBulletEdit(addCareerJob(addEntry(emptyStore(), {
  id: 'en_plain',
  title: 'Old lead: old **stakeholder** body',
  kind: 'experience',
}, clock), {
  id: 'rj_plain',
  company: 'GoDaddy',
  title: 'Senior Manager',
  groups: [{
    id: 'rg_plain',
    bullets: [{
      id: 'rb_plain',
      lead: 'Old lead',
      body: 'old **stakeholder** body',
      sourceEntryIds: ['en_plain'],
    }],
  }],
}, clock), {
  postingId: null,
  jobId: 'rj_plain',
  groupId: 'rg_plain',
  bullet: { id: 'rb_plain', sourceEntryIds: ['en_plain'] },
  spans: editedSpans,
}, clock);
const plainDoc = compileResumeDoc(null, plainBook);
const plainBullet = plainDoc.sections.experience.jobs[0].groups[0].bullets[0];
assert.equal(ignoreBoldMarkers(bulletLineText(plainBullet)), editedSentence);
const plainHtml = renderResumeHtml(plainDoc, { droppedBulletIds: [] });
assert.match(plainHtml, /15\+ accounting evaluations/);
assert.doesNotMatch(plainHtml, /\*\*/);
assert.doesNotMatch(plainHtml, /stakeholder/);
assert.match(plainHtml, /<b>Leading Enterprise AI Governance Maturity Assessment:<\/b>/);

const libraryLine = 'Built Team Capacity-Planning Platform: Created a GitHub-hosted live view that consolidates multiple Jira instances.';
let libraryBook = addPosting(emptyStore(), { title: 'Library wins' }, clock);
const libraryPostingId = libraryBook.postings[0].id;
libraryBook = addEntry(libraryBook, { id: 'en_live', title: libraryLine, kind: 'experience' }, clock);
libraryBook = addCareerJob(libraryBook, {
  id: 'rj_live',
  company: 'GoDaddy',
  title: 'Manager',
  groups: [{
    id: 'rg_live',
    bullets: [{
      id: 'rb_live',
      lead: 'Built Team Capacity-Planning Platform',
      body: '** Created a GitHub-hosted live view that consolidates c**ases.',
      sourceEntryIds: ['en_live'],
    }],
  }],
}, clock);
libraryBook = updatePostingResume(libraryBook, libraryPostingId, {
  overrides: {
    rb_live: {
      lead: 'Built Team Capacity-Planning Platform',
      body: '** Created a GitHub-hosted live view that consolidates c**ases and auto**mated exports.',
    },
  },
}, clock);
const libraryDoc = compileResumeDoc(postingById(libraryBook, libraryPostingId), libraryBook);
const libraryBullet = libraryDoc.sections.experience.jobs
  .flatMap((job) => job.groups.flatMap((group) => group.bullets))
  .find((bullet) => bullet.id === 'rb_live');
assert.equal(libraryBullet.hasOverride, false);
assert.equal(libraryBullet.lead, 'Built Team Capacity-Planning Platform');
assert.match(libraryBullet.body, /Created a GitHub-hosted live view/);
assert.doesNotMatch(`${libraryBullet.lead} ${libraryBullet.body}`, /c\*\*|auto\*\*|\*\* Created/);
const librarySpans = resumeBulletSpans(libraryBullet);
assert.equal(librarySpans.map((span) => span.text).join(''), libraryLine);
assert.equal(librarySpans[0].bold, true);
assert.equal(librarySpans.slice(1).some((span) => span.bold), false);
const libraryHtml = renderResumeHtml(libraryDoc, { droppedBulletIds: [] });
assert.match(libraryHtml, /<b>Built Team Capacity-Planning Platform:<\/b> Created a GitHub-hosted live view/);
assert.doesNotMatch(libraryHtml, /\*\*/);
assert.doesNotMatch(libraryHtml, /automated exports/);
libraryBook = updatePostingResume(libraryBook, libraryPostingId, {
  overrides: {
    rb_live: { lead: 'Posting title', body: 'Tailored only on this posting.', edited: true },
  },
}, clock);
const tailoredDoc = compileResumeDoc(postingById(libraryBook, libraryPostingId), libraryBook);
const tailoredBullet = tailoredDoc.sections.experience.jobs
  .flatMap((job) => job.groups.flatMap((group) => group.bullets))
  .find((bullet) => bullet.id === 'rb_live');
assert.equal(tailoredBullet.hasOverride, true);
assert.equal(tailoredBullet.lead, 'Posting title');
assert.match(renderResumeHtml(tailoredDoc), /Tailored only on this posting/);
libraryBook = replacePostingResume(
  libraryBook,
  libraryPostingId,
  clearBulletOverride(postingById(libraryBook, libraryPostingId).resume, 'rb_live'),
);
const resetLibrary = compileResumeDoc(postingById(libraryBook, libraryPostingId), libraryBook);
const resetLibraryBullet = resetLibrary.sections.experience.jobs
  .flatMap((job) => job.groups.flatMap((group) => group.bullets))
  .find((bullet) => bullet.id === 'rb_live');
assert.equal(resetLibraryBullet.hasOverride, false);
assert.match(renderResumeHtml(resetLibrary), /Created a GitHub-hosted live view/);
assert.doesNotMatch(renderResumeHtml(resetLibrary), /Tailored only on this posting/);
assert.equal(postingById(libraryBook, libraryPostingId).resume.overrides.rb_live, undefined);

let titleBook = addCareerJob(emptyStore(), { id: 'rj_title', company: 'GoDaddy', title: 'Manager | Risk' }, clock);
titleBook = addPosting(titleBook, { id: 'job_tailor', title: 'Tailor me' }, clock);
titleBook = addPosting(titleBook, { id: 'job_other', title: 'Other' }, clock);
titleBook = updatePostingResume(titleBook, 'job_tailor', {
  jobTitles: { rj_title: 'Senior Manager | Finance' },
}, clock);
const tailoredJob = compileResumeDoc(postingById(titleBook, 'job_tailor'), titleBook)
  .sections.experience.jobs.find((job) => job.id === 'rj_title');
assert.equal(tailoredJob.title, 'Senior Manager | Finance');
assert.equal(tailoredJob.company, 'GoDaddy');
assert.equal(tailoredJob.originalTitle, 'Manager | Risk');
assert.equal(tailoredJob.titleTailored, true);
assert.equal(titleBook.jobs.find((job) => job.id === 'rj_title').title, 'Manager | Risk');
assert.equal(titleBook.jobs.find((job) => job.id === 'rj_title').company, 'GoDaddy');
assert.equal(postingById(titleBook, 'job_tailor').resume.jobTitles.rj_title, 'Senior Manager | Finance');
const otherJob = compileResumeDoc(postingById(titleBook, 'job_other'), titleBook)
  .sections.experience.jobs.find((job) => job.id === 'rj_title');
assert.equal(otherJob.title, 'Manager | Risk');
assert.equal(otherJob.company, 'GoDaddy');
assert.equal(otherJob.titleTailored, false);
const basicsJob = compileResumeDoc(null, titleBook).sections.experience.jobs
  .find((job) => job.id === 'rj_title');
assert.equal(basicsJob.title, 'Manager | Risk');
assert.equal(basicsJob.titleTailored, false);
const titleHtml = renderResumeHtml(compileResumeDoc(postingById(titleBook, 'job_tailor'), titleBook), { droppedBulletIds: [] });
assert.match(titleHtml, /Senior Manager \| Finance/);
assert.match(titleHtml, /GoDaddy/);
assert.doesNotMatch(titleHtml, /Manager \| Risk/);
titleBook = updateCareerJob(titleBook, 'rj_title', { company: 'GoDaddy Inc.' }, clock);
const afterCompany = compileResumeDoc(postingById(titleBook, 'job_tailor'), titleBook)
  .sections.experience.jobs.find((job) => job.id === 'rj_title');
assert.equal(afterCompany.company, 'GoDaddy Inc.');
assert.equal(afterCompany.title, 'Senior Manager | Finance');
assert.equal(afterCompany.titleTailored, true);
assert.equal(compileResumeDoc(postingById(titleBook, 'job_other'), titleBook)
  .sections.experience.jobs.find((job) => job.id === 'rj_title').title, 'Manager | Risk');
titleBook = replacePostingResume(
  titleBook,
  'job_tailor',
  clearJobTitle(postingById(titleBook, 'job_tailor').resume, 'rj_title'),
  clock,
);
const resetTitle = compileResumeDoc(postingById(titleBook, 'job_tailor'), titleBook)
  .sections.experience.jobs.find((job) => job.id === 'rj_title');
assert.equal(resetTitle.title, 'Manager | Risk');
assert.equal(resetTitle.company, 'GoDaddy Inc.');
assert.equal(resetTitle.titleTailored, false);
assert.equal(postingById(titleBook, 'job_tailor').resume.jobTitles.rj_title, undefined);
assert.equal(titleBook.jobs.find((job) => job.id === 'rj_title').title, 'Manager | Risk');

const embeddedLead = 'Embedded Risk, Compliance & Readiness Partner to Finance';
const embeddedBody = 'Partnered with Finance and kept this sentence intact.';
let tidyBook = emptyStore();
tidyBook = {
  ...tidyBook,
  profile: { ...tidyBook.profile, name: 'Inaayat Gill' },
  knowledge: [{ id: 'kn_keep', title: 'Leave this note', body: 'Untouched.' }],
  education: [{ id: 'ed_keep', school: 'Keep School', degree: 'BS' }],
};
tidyBook = addEntry(tidyBook, {
  id: 'en_embed',
  title: `${embeddedLead}: ${embeddedBody}`,
  kind: 'experience',
}, clock);
tidyBook = addCareerJob(tidyBook, {
  id: 'rj_exp',
  company: 'Experience',
  title: '',
  start: 'October 2021',
  end: 'Present',
  groups: [{
    id: 'rg_exp',
    heading: '',
    bullets: [{ id: 'rb_embed', lead: embeddedLead, body: embeddedBody, sourceEntryIds: ['en_embed'] }],
  }],
}, clock);
tidyBook = addCareerJob(tidyBook, {
  id: 'rj_gd_empty',
  company: 'GoDaddy',
  title: '',
  start: 'October 2021',
  end: 'Present',
  groups: [{ id: 'rg_gd_empty', heading: '', bullets: [] }],
}, clock);
tidyBook = addCareerJob(tidyBook, {
  id: 'rj_gd',
  company: 'GoDaddy',
  title: 'Manager | Risk',
  groups: [{
    id: 'rg_gd',
    heading: 'Automation & Efficiency in Compliance',
    bullets: [{ id: 'rb_gd', lead: 'Keep GoDaddy', body: 'This bullet stays.' }],
  }],
}, clock);
tidyBook = addCareerJob(tidyBook, {
  id: 'rj_pwc',
  company: 'PricewaterhouseCoopers LLC',
  title: 'Senior Associate',
  groups: [{
    id: 'rg_pwc',
    heading: 'Automation & Efficiency in Compliance',
    bullets: [{ id: 'rb_pwc', lead: 'Keep PwC', body: 'This bullet stays.' }],
  }],
}, clock);
tidyBook = addPosting(tidyBook, { id: 'job_tidy', title: 'Do not rewrite me' }, clock);
const tidied = tidyResumeJobs(tidyBook);
assert.equal(tidied.profile.name, 'Inaayat Gill');
assert.equal(tidied.knowledge[0].title, 'Leave this note');
assert.equal(tidied.education[0].school, 'Keep School');
assert.equal(tidied.entries.find((entry) => entry.id === 'en_embed').title, `${embeddedLead}: ${embeddedBody}`);
assert.equal(tidied.postings.find((posting) => posting.id === 'job_tidy').title, 'Do not rewrite me');
assert.equal(tidied.jobs.some((job) => job.company === 'Experience'), false);
assert.equal(tidied.jobs.some((job) => job.id === 'rj_gd_empty'), false);
assert.equal(tidied.jobs.find((job) => job.id === 'rj_gd').groups[0].bullets[0].body, 'This bullet stays.');
const pwcAfter = tidied.jobs.find((job) => job.id === 'rj_pwc');
assert.equal(pwcAfter.title, 'Senior Associate');
assert.equal(pwcAfter.groups[0].heading, 'Automation & Efficiency in Compliance');
assert.equal(pwcAfter.groups[0].bullets[0].body, 'This bullet stays.');
const moved = pwcAfter.groups[0].bullets.find((bullet) => bullet.id === 'rb_embed');
assert.equal(moved.lead, embeddedLead);
assert.equal(moved.body, embeddedBody);
assert.deepEqual(moved.sourceEntryIds, ['en_embed']);
const tidiedAgain = tidyResumeJobs(tidied);
assert.equal(JSON.stringify(tidiedAgain.jobs), JSON.stringify(tidied.jobs));

let unplaced = addPosting(emptyStore(), { id: 'job_unplaced', title: 'No auto role' }, clock);
unplaced = addEntry(unplaced, { id: 'en_unplaced', title: 'Library only: not a role', kind: 'experience' }, clock);
unplaced = addRequirement(unplaced, 'job_unplaced', 'Need a line', clock);
unplaced = addEntryBullet(unplaced, 'job_unplaced', unplaced.postings[0].requirements[0].id, 'en_unplaced', '', clock);
const unplacedDoc = compileResumeDoc(postingById(unplaced, 'job_unplaced'), unplaced);
assert.equal(unplacedDoc.sections.experience.jobs.length, 0);
assert.equal(unplaced.entries.find((entry) => entry.id === 'en_unplaced').title, 'Library only: not a role');

let picked = addCareerJob(emptyStore(), {
  id: 'rj_pick',
  company: 'PwC',
  title: 'Manager',
  groups: [{ id: 'rg_pick', heading: 'Automation & Efficiency in Compliance', bullets: [] }],
}, clock);
picked = addEntry(picked, { id: 'en_pick', title: 'Picked line: stays with the library', kind: 'experience' }, clock);
picked = addEntry(picked, { id: 'en_other', title: 'Another library line', kind: 'experience' }, clock);
picked = addPosting(picked, { id: 'job_pick', title: 'Picker' }, clock);
assert.equal(libraryBulletChoices(picked, { query: 'picked' }).map((entry) => entry.id).includes('en_pick'), true);
picked = placeLibraryBullet(picked, {
  postingId: 'job_pick',
  jobId: 'rj_pick',
  groupId: 'rg_pick',
  entryId: 'en_pick',
}, clock, random);
const pickedOnce = compileResumeDoc(postingById(picked, 'job_pick'), picked)
  .sections.experience.jobs.find((job) => job.id === 'rj_pick').groups[0].bullets;
assert.equal(pickedOnce.length, 1);
assert.equal(pickedOnce[0].lead, 'Picked line');
assert.match(pickedOnce[0].body, /stays with the library/);
assert.deepEqual(pickedOnce[0].sourceEntryIds, ['en_pick']);
assert.equal(picked.jobs[0].groups[0].bullets.length, 0);
const pickedAgain = placeLibraryBullet(picked, {
  postingId: 'job_pick',
  jobId: 'rj_pick',
  groupId: 'rg_pick',
  entryId: 'en_pick',
}, clock, random);
assert.equal(compileResumeDoc(postingById(pickedAgain, 'job_pick'), pickedAgain)
  .sections.experience.jobs.find((job) => job.id === 'rj_pick').groups[0].bullets.length, 1);
picked = updateEntry(picked, 'en_pick', { title: 'Picked line: rewritten in the library', rich: null }, clock);
const pickedLive = compileResumeDoc(postingById(picked, 'job_pick'), picked)
  .sections.experience.jobs.find((job) => job.id === 'rj_pick').groups[0].bullets[0];
assert.match(pickedLive.body, /rewritten in the library/);
assert.equal(libraryBulletChoices(picked, { query: 'picked', takenIds: ['en_pick'] }).some((entry) => entry.id === 'en_pick'), false);
picked = updateCareerJob(picked, 'rj_pick', {
  groups: [{ id: 'rg_pick', heading: 'Renamed subheader', bullets: [] }],
}, clock);
assert.equal(picked.jobs[0].groups[0].heading, 'Renamed subheader');

let sharedRows = addEducationItem(emptyStore(), {
  id: 'ed_uw',
  school: 'University of Washington',
  degree: 'Bachelor of Arts in Business Administration',
}, clock);
sharedRows = addCredentialItem(sharedRows, { id: 'cr_cpa', name: 'Certified Public Accountant (CPA)' }, clock);
sharedRows = addAdditionalRow(sharedRows, {
  id: 'ad_reg',
  label: 'Regulatory Knowledge',
  items: ['Sarbanes Oxley (SOX)'],
}, clock);
sharedRows = addCareerJob(sharedRows, { id: 'rj_keep', company: 'PwC', title: 'Manager' }, clock);
sharedRows = addPosting(sharedRows, { id: 'job_hide', title: 'Stripe' }, clock);
sharedRows = addPosting(sharedRows, { id: 'job_show', title: 'Other posting' }, clock);
sharedRows = replacePostingResume(sharedRows, 'job_hide', hideResumeRow(postingById(sharedRows, 'job_hide').resume, 'education', 'ed_uw'), clock);
sharedRows = replacePostingResume(sharedRows, 'job_hide', hideResumeRow(postingById(sharedRows, 'job_hide').resume, 'credential', 'cr_cpa'), clock);
sharedRows = replacePostingResume(sharedRows, 'job_hide', hideResumeRow(postingById(sharedRows, 'job_hide').resume, 'additional', 'ad_reg'), clock);
assert.equal(hiddenResumeRowCount(postingById(sharedRows, 'job_hide').resume), 3);
assert.equal(sharedRows.education.find((row) => row.id === 'ed_uw').school, 'University of Washington');
assert.equal(sharedRows.credentials.find((row) => row.id === 'cr_cpa').name, 'Certified Public Accountant (CPA)');
assert.equal(sharedRows.additional.find((row) => row.id === 'ad_reg').label, 'Regulatory Knowledge');
assert.equal(sharedRows.jobs.find((job) => job.id === 'rj_keep').company, 'PwC');
const hiddenDoc = compileResumeDoc(postingById(sharedRows, 'job_hide'), sharedRows);
assert.equal(hiddenDoc.sections.education.items.some((row) => row.id === 'ed_uw'), false);
assert.equal(hiddenDoc.sections.credentials.items.some((row) => row.id === 'cr_cpa'), false);
assert.equal(hiddenDoc.sections.additional.rows.some((row) => row.id === 'ad_reg'), false);
const hiddenHtml = renderResumeHtml(hiddenDoc, { droppedBulletIds: [] });
assert.doesNotMatch(hiddenHtml, /University of Washington/);
assert.doesNotMatch(hiddenHtml, /Regulatory Knowledge/);
const otherRows = compileResumeDoc(postingById(sharedRows, 'job_show'), sharedRows);
assert.equal(otherRows.sections.education.items.some((row) => row.id === 'ed_uw'), true);
assert.equal(otherRows.sections.additional.rows.some((row) => row.id === 'ad_reg'), true);
const basicsRows = compileResumeDoc(null, sharedRows);
assert.equal(basicsRows.sections.education.items.some((row) => row.id === 'ed_uw'), true);
assert.equal(basicsRows.sections.credentials.items.some((row) => row.id === 'cr_cpa'), true);
sharedRows = replacePostingResume(sharedRows, 'job_hide', restoreHiddenResumeRows(postingById(sharedRows, 'job_hide').resume), clock);
assert.equal(hiddenResumeRowCount(postingById(sharedRows, 'job_hide').resume), 0);
assert.equal(compileResumeDoc(postingById(sharedRows, 'job_hide'), sharedRows).sections.education.items.some((row) => row.id === 'ed_uw'), true);
const basicsOnly = deleteEducationItem(sharedRows, 'ed_uw');
assert.equal(basicsOnly.education.some((row) => row.id === 'ed_uw'), false);
assert.equal(basicsOnly.credentials.length, sharedRows.credentials.length);
assert.equal(basicsOnly.additional.length, sharedRows.additional.length);
assert.equal(basicsOnly.jobs.find((job) => job.id === 'rj_keep').company, 'PwC');
assert.equal(compileResumeDoc(postingById(basicsOnly, 'job_show'), basicsOnly).sections.education.items.some((row) => row.id === 'ed_uw'), false);

let basicsSwap = addEntry(emptyStore(), { id: 'en_lib', title: 'Library lead: stays linked' }, clock);
basicsSwap = addKnowledge(basicsSwap, { id: 'kb_keep', title: 'Keep this note', body: 'Untouched' }, clock);
basicsSwap = updateProfile(basicsSwap, { name: 'Ada', email: 'ada@example.com' });
basicsSwap = addCareerJob(basicsSwap, {
  id: 'rj_old',
  company: 'Old Co',
  title: 'Analyst',
  groups: [{
    id: 'rg_old',
    heading: 'Old head',
    bullets: [
      { id: 'rb_old', lead: 'Old lead', body: 'Old body', sourceEntryIds: ['en_old'] },
      { id: 'rb_hide', lead: 'Hidden lead', body: 'Hidden body' },
    ],
  }],
}, clock);
basicsSwap = addEducationItem(basicsSwap, { id: 'ed_old', school: 'Old School', degree: 'BA' }, clock);
basicsSwap = addCredentialItem(basicsSwap, { id: 'cr_old', name: 'Old Cert' }, clock);
basicsSwap = addAdditionalRow(basicsSwap, { id: 'ad_old', label: 'Old row', items: ['Excel'] }, clock);
basicsSwap = addPosting(basicsSwap, { id: 'job_src', title: 'Source posting' }, clock);
basicsSwap = addPosting(basicsSwap, { id: 'job_custom', title: 'Custom posting' }, clock);
basicsSwap = addPosting(basicsSwap, { id: 'job_plain', title: 'Plain posting' }, clock);
basicsSwap = addPosting(basicsSwap, { id: 'job_fresh', title: 'Fresh posting' }, clock);
basicsSwap = updatePostingResume(basicsSwap, 'job_src', {
  excludedBulletIds: ['rb_hide'],
  jobTitles: { rj_old: 'Tailored role' },
  groupHeadings: { rg_old: 'Tailored sub' },
  overrides: { rb_old: { lead: 'Tailored lead', body: 'Tailored body', edited: true } },
  sectionOrder: ['education', 'experience', 'additional', 'credentials'],
  showCredentials: false,
}, clock);
basicsSwap = addPostingLocalJob(basicsSwap, 'job_src', {
  id: 'rj_local',
  company: 'Local Co',
  title: 'Local title',
  groups: [{ id: 'rg_local', heading: 'Local sub', bullets: [] }],
}, {}, clock, random);
basicsSwap = placeLibraryBullet(basicsSwap, {
  postingId: 'job_src',
  jobId: 'rj_local',
  groupId: 'rg_local',
  entryId: 'en_lib',
}, clock, random);
basicsSwap = addPostingLocalEducation(basicsSwap, 'job_src', { id: 'ed_new', school: 'New School', degree: 'MS' }, clock, random);
basicsSwap = addPostingLocalAdditional(basicsSwap, 'job_src', { id: 'ad_new', label: 'New row', items: ['SQL'] }, clock, random);
basicsSwap = replacePostingResume(basicsSwap, 'job_src', hideResumeRow(postingById(basicsSwap, 'job_src').resume, 'education', 'ed_old'), clock);
basicsSwap = replacePostingResume(basicsSwap, 'job_src', hideResumeRow(postingById(basicsSwap, 'job_src').resume, 'additional', 'ad_old'), clock);
basicsSwap = addPostingLocalJob(basicsSwap, 'job_custom', {
  id: 'rj_custom',
  company: 'Custom Co',
  title: 'Custom title',
  groups: [{ id: 'rg_custom', heading: 'Custom sub', bullets: [{ id: 'rb_custom', lead: 'Custom lead', body: 'Custom body' }] }],
}, {}, clock, random);
basicsSwap = updatePostingResume(basicsSwap, 'job_custom', {
  jobTitles: { rj_old: 'Custom title override' },
  overrides: { rb_old: { lead: 'Custom wording', body: 'Still custom', edited: true } },
  sectionOrder: ['experience', 'education', 'credentials', 'additional'],
  showCredentials: true,
}, clock);
basicsSwap = startPostingResumeFresh(basicsSwap, 'job_fresh', clock);
basicsSwap = addPostingLocalJob(basicsSwap, 'job_fresh', {
  id: 'rj_fresh',
  company: 'Fresh Co',
  title: 'Fresh title',
  groups: [{ id: 'rg_fresh', heading: 'Fresh sub', bullets: [{ id: 'rb_fresh', lead: 'Fresh lead', body: 'Fresh body' }] }],
}, {}, clock, random);
const basicsBefore = basicsSwap;
const resumeSnapshots = basicsBefore.postings.map((job) => JSON.stringify(job.resume));
const entrySnapshot = JSON.stringify(basicsBefore.entries);
const knowledgeSnapshot = JSON.stringify(basicsBefore.knowledge);
assert.equal(hasBasicsBackup(basicsBefore), false);
const swapConfirm = basicsReplaceConfirm(basicsBefore, 'job_src');
assert.match(swapConfirm, /Replace Resume basics with Source posting\?/);
assert.match(swapConfirm, /Old Co/);
assert.match(swapConfirm, /Local Co/);
assert.match(swapConfirm, /Old School/);
assert.match(swapConfirm, /New School/);
assert.match(swapConfirm, /Old row/);
assert.match(swapConfirm, /New row/);
assert.doesNotMatch(swapConfirm, /Hidden lead/);
assert.doesNotMatch(swapConfirm, /Tailored lead/);
assert.match(swapConfirm, /Other postings keep their own edits/);
assert.equal(replaceBasicsWithPosting(basicsBefore, 'missing', clock), basicsBefore);
let basicsNext = replaceBasicsWithPosting(basicsBefore, 'job_src', clock);
assert.equal(basicsNext.profile.name, 'Ada');
assert.equal(basicsNext.jobs.some((job) => job.company === 'Old Co'), true);
assert.equal(basicsNext.jobs.find((job) => job.id === 'rj_old').title, 'Tailored role');
assert.equal(basicsNext.jobs.find((job) => job.id === 'rj_old').groups[0].heading, 'Tailored sub');
assert.equal(basicsNext.jobs.find((job) => job.id === 'rj_old').groups[0].bullets.some((bullet) => bullet.lead === 'Hidden lead'), false);
const keptBullet = basicsNext.jobs.find((job) => job.id === 'rj_old').groups[0].bullets.find((bullet) => bullet.id === 'rb_old');
assert.equal(keptBullet.lead, 'Old lead');
assert.equal(keptBullet.body, 'Old body');
assert.deepEqual(keptBullet.sourceEntryIds, ['en_old']);
const localCopied = basicsNext.jobs.find((job) => job.id === 'rj_local');
assert.equal(localCopied.company, 'Local Co');
assert.equal(localCopied.groups[0].heading, 'Local sub');
assert.equal(localCopied.groups[0].bullets[0].lead, 'Library lead');
assert.match(localCopied.groups[0].bullets[0].body, /stays linked/);
assert.deepEqual(localCopied.groups[0].bullets[0].sourceEntryIds, ['en_lib']);
assert.equal(basicsNext.education.some((row) => row.school === 'Old School'), false);
assert.equal(basicsNext.education.some((row) => row.id === 'ed_new' && row.school === 'New School'), true);
assert.equal(basicsNext.credentials.some((row) => row.id === 'cr_old'), true);
assert.equal(basicsNext.additional.some((row) => row.label === 'Old row'), false);
assert.equal(basicsNext.additional.some((row) => row.id === 'ad_new' && row.label === 'New row'), true);
assert.deepEqual(basicsNext.resumeSettings.sectionOrder, ['education', 'experience', 'additional', 'credentials']);
assert.equal(basicsNext.resumeSettings.showCredentials, false);
assert.equal(basicsNext.basicsBackup.profile.name, 'Ada');
assert.equal(basicsNext.basicsBackup.jobs.some((job) => job.company === 'Old Co' && job.title === 'Analyst'), true);
assert.equal(basicsNext.basicsBackup.education.some((row) => row.school === 'Old School'), true);
assert.equal(basicsNext.basicsBackup.savedAt, '2026-10-05T12:00:00.000Z');
assert.equal(JSON.stringify(basicsNext.entries), entrySnapshot);
assert.equal(JSON.stringify(basicsNext.knowledge), knowledgeSnapshot);
assert.deepEqual(basicsNext.postings.map((job) => JSON.stringify(job.resume)), resumeSnapshots);
assert.equal(postingById(basicsNext, 'job_custom').resume.localJobs.some((job) => job.company === 'Custom Co'), true);
assert.equal(postingById(basicsNext, 'job_custom').resume.jobTitles.rj_old, 'Custom title override');
assert.equal(postingById(basicsNext, 'job_custom').resume.overrides.rb_old.lead, 'Custom wording');
assert.deepEqual(postingById(basicsNext, 'job_custom').resume.sectionOrder, ['experience', 'education', 'credentials', 'additional']);
assert.equal(postingById(basicsNext, 'job_custom').resume.showCredentials, true);
const customDoc = compileResumeDoc(postingById(basicsNext, 'job_custom'), basicsNext);
assert.equal(customDoc.sections.experience.jobs.some((job) => job.company === 'Custom Co'), true);
assert.equal(customDoc.sections.experience.jobs.find((job) => job.id === 'rj_old').title, 'Custom title override');
assert.equal(customDoc.sections.credentials.enabled, true);
const plainBasicsDoc = compileResumeDoc(postingById(basicsNext, 'job_plain'), basicsNext);
assert.equal(plainBasicsDoc.sections.experience.jobs.some((job) => job.company === 'Local Co'), true);
assert.equal(plainBasicsDoc.sections.experience.jobs.some((job) => job.company === 'Custom Co'), false);
assert.equal(plainBasicsDoc.sections.education.items.some((row) => row.school === 'New School'), true);
assert.equal(plainBasicsDoc.sections.education.items.some((row) => row.school === 'Old School'), false);
const freshBasicsDoc = compileResumeDoc(postingById(basicsNext, 'job_fresh'), basicsNext);
assert.equal(freshBasicsDoc.sections.experience.jobs.some((job) => job.company === 'Fresh Co'), true);
assert.equal(freshBasicsDoc.sections.experience.jobs.some((job) => job.company === 'Local Co'), false);
const editedBasics = updateCareerJob(basicsNext, 'rj_local', { title: 'Edited on basics' }, clock);
assert.equal(editedBasics.jobs.find((job) => job.id === 'rj_local').title, 'Edited on basics');
assert.deepEqual(editedBasics.postings.map((job) => job.resume), basicsNext.postings.map((job) => job.resume));
const editedSchool = updateEducationItem(editedBasics, 'ed_new', { school: 'Edited School' }, clock);
assert.equal(editedSchool.education.find((row) => row.id === 'ed_new').school, 'Edited School');
assert.deepEqual(editedSchool.postings.map((job) => job.resume), basicsNext.postings.map((job) => job.resume));
const packedBasics = serializeBook(basicsNext);
const reloadedBasics = normalizeStore(JSON.parse(packedBasics.json), clock);
assert.equal(reloadedBasics.jobs.some((job) => job.company === 'Local Co'), true);
assert.equal(reloadedBasics.basicsBackup.jobs.some((job) => job.company === 'Old Co'), true);
assert.equal(reloadedBasics.basicsBackup.education[0].school, 'Old School');
assert.equal(JSON.stringify(reloadedBasics.postings.map((job) => job.resume)), JSON.stringify(basicsNext.postings.map((job) => job.resume)));
const remoteRow = addAdditionalRow(basicsBefore, { id: 'ad_remote', label: 'Remote row', items: ['Kept'] }, clock);
const remoteEntry = addEntry(remoteRow, { id: 'en_remote', title: 'Remote only' }, clock);
const mergedBasics = normalizeStore(mergeBook(basicsBefore, basicsNext, remoteEntry), clock);
assert.equal(mergedBasics.entries.some((entry) => entry.id === 'en_remote'), true);
assert.equal(mergedBasics.entries.some((entry) => entry.id === 'en_lib'), true);
assert.equal(mergedBasics.additional.some((row) => row.id === 'ad_remote'), true);
assert.equal(mergedBasics.additional.some((row) => row.id === 'ad_new'), true);
assert.equal(mergedBasics.jobs.some((job) => job.company === 'Local Co'), true);
assert.equal(mergedBasics.basicsBackup.jobs.some((job) => job.company === 'Old Co'), true);
assert.equal(mergedBasics.knowledge.some((note) => note.id === 'kb_keep'), true);
assert.match(basicsRestoreConfirm(basicsNext), /Restore previous basics \(Old Co\)/);
assert.match(basicsRestoreConfirm(basicsNext), /Posting edits stay/);
let basicsBack = updateProfile(basicsNext, { name: 'Bea' });
basicsBack = restorePreviousBasics(basicsBack, clock);
assert.equal(hasBasicsBackup(basicsBack), false);
assert.equal(basicsBack.basicsBackup, null);
assert.equal(basicsBack.profile.name, 'Ada');
assert.equal(basicsBack.jobs.some((job) => job.company === 'Old Co' && job.title === 'Analyst'), true);
assert.equal(basicsBack.jobs.some((job) => job.company === 'Local Co'), false);
assert.equal(basicsBack.education.some((row) => row.school === 'Old School'), true);
assert.equal(basicsBack.additional.some((row) => row.label === 'Old row'), true);
assert.equal(basicsBack.resumeSettings.showCredentials, true);
assert.deepEqual(basicsBack.postings.map((job) => JSON.stringify(job.resume)), resumeSnapshots);
assert.equal(JSON.stringify(basicsBack.entries), entrySnapshot);
const basicsAgain = replaceBasicsWithPosting(basicsNext, 'job_src', clock);
assert.equal(basicsAgain.basicsBackup.jobs.some((job) => job.company === 'Local Co'), true);
assert.equal(basicsAgain.basicsBackup.jobs.some((job) => job.title === 'Analyst'), false);

const strayBullet = {
  lead: 'Migration of Manual Journal Prep',
  body: 'Created auto**mated journals, ** Created a review, closed c**ases annually**, and gener**al controls.',
};
const strayHtml = renderResumeHtml({
  header: { name: 'Ada' },
  sectionOrder: ['experience'],
  sections: {
    experience: {
      title: 'Work Experience',
      jobs: [{
        id: 'job_stray',
        company: 'GoDaddy',
        title: 'Manager',
        included: true,
        groups: [{ bullets: [{ id: 'b_stray', ...strayBullet, included: true }] }],
      }],
    },
  },
}, { droppedBulletIds: [] });
assert.match(strayHtml, /<b>Migration of Manual Journal Prep:<\/b> Created automated journals, Created a review, closed cases annually, and general controls\./);
assert.doesNotMatch(strayHtml, /\*\*/);
assert.doesNotMatch(strayHtml, /<b>[^<]*automated/);
const strayDocx = new TextDecoder().decode(resumeDocxBytes({
  header: { name: 'Ada' },
  sectionOrder: ['experience'],
  sections: {
    experience: {
      title: 'Work Experience',
      jobs: [{
        id: 'job_stray',
        company: 'GoDaddy',
        title: 'Manager',
        included: true,
        groups: [{ bullets: [{ id: 'b_stray', ...strayBullet, included: true }] }],
      }],
    },
  },
}));
assert.match(strayDocx, /Created automated journals, Created a review, closed cases annually, and general controls\./);
assert.doesNotMatch(strayDocx, /\*\*/);
const strayLeadRun = strayDocx.match(/<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*?<\/w:rPr><w:t[^>]*>Migration of Manual Journal Prep:<\/w:t>/);
assert.match(strayLeadRun[0], /<w:b\/>/);
const strayBodyRun = strayDocx.match(/<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*?<\/w:rPr><w:t[^>]*>Created automated journals/);
assert.ok(strayBodyRun);
assert.doesNotMatch(strayBodyRun[0], /<w:b\/>/);

const strayStarBullet = {
  lead: 'Migration of Manual Journal Prep',
  body: 'Created auto*mated journals, * Created a review, closed c*ases annually*, and gener*al controls.',
};
const strayStarDoc = {
  header: { name: 'Ada' },
  sectionOrder: ['experience'],
  sections: {
    experience: {
      title: 'Work Experience',
      jobs: [{
        id: 'job_star',
        company: 'GoDaddy',
        title: 'Manager',
        included: true,
        groups: [{ bullets: [{ id: 'b_star', ...strayStarBullet, included: true }] }],
      }],
    },
  },
};
const strayStarHtml = renderResumeHtml(strayStarDoc, { droppedBulletIds: [] });
assert.match(strayStarHtml, /<b>Migration of Manual Journal Prep:<\/b> Created automated journals, Created a review, closed cases annually, and general controls\./);
assert.doesNotMatch(strayStarHtml, /\*/);
assert.doesNotMatch(strayStarHtml, /<i>/);
const strayStarDocx = new TextDecoder().decode(resumeDocxBytes(strayStarDoc));
assert.match(strayStarDocx, /Created automated journals, Created a review, closed cases annually, and general controls\./);
assert.doesNotMatch(strayStarDocx, /\*/);
assert.doesNotMatch(strayStarDocx, /<w:i\/>/);

let italicBook = addEntry(emptyStore(), {
  id: 'en_italic',
  title: 'Leading Enterprise AI Governance Maturity Assessment: Designing the model',
}, clock);
italicBook = addCareerJob(italicBook, {
  id: 'rj_italic',
  company: 'GoDaddy',
  title: 'Manager',
  groups: [{
    id: 'rg_italic',
    bullets: [{
      id: 'rb_italic',
      lead: 'Leading Enterprise AI Governance Maturity Assessment',
      body: 'Designing the model',
      sourceEntryIds: ['en_italic'],
    }],
  }],
}, clock);
italicBook = addPosting(italicBook, { id: 'job_italic', title: 'Italic posting' }, clock);
const italicSpans = [
  { text: 'Leading Enterprise AI Governance Maturity Assessment: ', bold: false },
  { text: 'Designing', bold: false, italic: true },
  { text: ' the model', bold: false },
];
italicBook = applyResumeBulletEdit(italicBook, {
  postingId: null,
  jobId: 'rj_italic',
  groupId: 'rg_italic',
  bullet: { id: 'rb_italic', sourceEntryIds: ['en_italic'] },
  spans: italicSpans,
}, clock);
const italicEntry = italicBook.entries.find((entry) => entry.id === 'en_italic');
assert.equal(italicEntry.rich.find((span) => span.text === 'Designing').italic, true);
assert.equal(italicEntry.title.includes('*'), false);
const italicBasics = compileResumeDoc(null, italicBook);
const italicPosting = compileResumeDoc(postingById(italicBook, 'job_italic'), italicBook);
for (const italicDoc of [italicBasics, italicPosting]) {
  const italicHtml = renderResumeHtml(italicDoc, { droppedBulletIds: [] });
  assert.match(italicHtml, /<b>Leading Enterprise AI Governance Maturity Assessment:<\/b> <i>Designing<\/i> the model/);
  assert.doesNotMatch(italicHtml, /\*/);
  const italicDocx = new TextDecoder().decode(resumeDocxBytes(italicDoc));
  const designingRun = italicDocx.match(/<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*?<\/w:rPr><w:t[^>]*>Designing<\/w:t>/);
  assert.ok(designingRun);
  assert.match(designingRun[0], /<w:i\/>/);
  assert.doesNotMatch(designingRun[0], /<w:b\/>/);
  assert.doesNotMatch(italicDocx, /\*/);
}
const italicBullet = italicBasics.sections.experience.jobs
  .flatMap((job) => job.groups.flatMap((group) => group.bullets))
  .find((bullet) => bullet.id === 'rb_italic');
const italicShown = resumeBulletSpans(italicBullet);
assert.equal(italicShown.find((span) => span.text === 'Designing').italic, true);
assert.equal(italicShown[0].bold, true);
assert.equal(italicShown.map((span) => span.text).join('').includes('*'), false);
assert.equal(bulletConsistency(italicBook).some((issue) => issue.bulletId === 'rb_italic'), false);
const reloadedItalic = normalizeStore(JSON.parse(serializeBook(italicBook).json), clock);
assert.equal(reloadedItalic.entries.find((entry) => entry.id === 'en_italic').rich.find((span) => span.text === 'Designing').italic, true);
assert.match(renderResumeHtml(compileResumeDoc(null, reloadedItalic), { droppedBulletIds: [] }), /<i>Designing<\/i>/);

const bytes = resumeDocxBytes(resumeDoc);
assert.equal(bytes[0], 0x50);
assert.equal(bytes[1], 0x4b);
const docxText = new TextDecoder().decode(bytes);
assert.match(docxText, /Inaayat Gill/);
assert.match(docxText, /1F497D/);

assert.deepEqual(toggleId(['a'], 'b'), ['a', 'b']);
assert.deepEqual(toggleId(['a', 'b'], 'a'), ['b']);

const packedSeed = serializeBook(seeded);
assert.equal(packedSeed.book.jobs[0].company, 'PricewaterhouseCoopers LLC');
assert.ok(packedSeed.book.postings[0].resume.excludedJobIds.includes('job_alaska'));

let handmade = emptyStore();
handmade = addCareerJob(handmade, { company: 'NewCo', title: 'Analyst' }, clock, random);
assert.equal(handmade.jobs.length, 1);
assert.equal(handmade.jobs[0].company, 'NewCo');
assert.equal(handmade.jobs[0].title, 'Analyst');
assert.ok(handmade.jobs[0].id);
const newRoleId = handmade.jobs[0].id;
const blankGroupId = handmade.jobs[0].groups[0].id;
handmade = addCareerBullet(handmade, newRoleId, blankGroupId, { lead: 'Shipped it', body: 'Wrote the join.' }, clock, random);
assert.equal(handmade.jobs[0].groups[0].bullets.length, 1);
assert.equal(handmade.jobs[0].groups[0].bullets[0].lead, 'Shipped it');
handmade = addCareerGroup(handmade, newRoleId, { heading: 'Later' }, clock, random);
assert.equal(handmade.jobs[0].groups.length, 2);
assert.equal(handmade.jobs[0].groups[1].heading, 'Later');
const laterGroup = handmade.jobs[0].groups[1].id;
handmade = addCareerBullet(handmade, newRoleId, laterGroup, { lead: 'Second' }, clock, random);
handmade = moveCareerBullet(handmade, newRoleId, laterGroup, handmade.jobs[0].groups[1].bullets[0].id, -1, clock);
handmade = moveCareerJob(handmade, newRoleId, -1);
handmade = addEducationItem(handmade, { school: 'UW', degree: 'BA' }, clock, random);
handmade = addCredentialItem(handmade, { name: 'CPA', issued: 'May 2024' }, clock, random);
handmade = addAdditionalRow(handmade, { label: 'Tools', items: ['Excel', 'SQL'] }, clock, random);
assert.equal(handmade.education[0].school, 'UW');
assert.equal(handmade.credentials[0].name, 'CPA');
assert.deepEqual(handmade.additional[0].items, ['Excel', 'SQL']);
handmade = addAdditionalGroup(handmade, handmade.additional[0].id, { label: 'Analytics' }, clock, random);
assert.equal(handmade.additional[0].groups[0].label, 'Analytics');
assert.deepEqual(handmade.additional[0].groups[0].items, ['Excel', 'SQL']);

const packedHand = serializeBook(handmade);
const reloadedHand = normalizeStore(JSON.parse(packedHand.json), clock);
assert.equal(reloadedHand.jobs[0].company, 'NewCo');
assert.equal(reloadedHand.jobs[0].groups[0].bullets[0].lead, 'Shipped it');
assert.equal(reloadedHand.education[0].school, 'UW');
assert.equal(reloadedHand.credentials[0].name, 'CPA');
assert.equal(reloadedHand.additional[0].groups[0].label, 'Analytics');

const draft = addCareerJob(emptyStore(), {}, clock, random);
assert.equal(draft.jobs.length, 1);
assert.equal(draft.jobs[0].company, '');
const draftAgain = normalizeStore(JSON.parse(serializeBook(draft).json), clock);
assert.equal(draftAgain.jobs.length, 1);
assert.ok(draftAgain.jobs[0].id);

handmade = addPosting(handmade, { title: 'Target role' }, clock);
const fromPosting = addCareerJob(handmade, { company: 'PostingCo' }, clock, random);
assert.equal(fromPosting.jobs.some((job) => job.company === 'PostingCo'), true);
const postingDoc = compileResumeDoc(fromPosting.postings[0], fromPosting);
assert.equal(postingDoc.sections.experience.jobs.some((job) => job.company === 'PostingCo' && job.included !== false), true);

const removed = deleteCareerJob(fromPosting, fromPosting.jobs.find((job) => job.company === 'PostingCo').id);
assert.equal(removed.jobs.some((job) => job.company === 'PostingCo'), false);
const afterDrop = deleteCareerBullet(
  removed,
  newRoleId,
  removed.jobs[0].groups[0].id,
  removed.jobs[0].groups[0].bullets[0].id,
);
assert.equal(afterDrop.jobs[0].groups[0].bullets.some((b) => b.lead === 'Shipped it'), false);
assert.equal(deleteEducationItem(afterDrop, afterDrop.education[0].id).education.length, 0);
assert.equal(deleteCredentialItem(afterDrop, afterDrop.credentials[0].id).credentials.length, 0);
assert.equal(deleteAdditionalRow(afterDrop, afterDrop.additional[0].id).additional.length, 0);

const legacyStill = normalizeStore({
  entries: [{ title: 'Legacy win' }],
  postings: [{ title: 'Legacy job', resumeText: 'plain' }],
}, clock);
assert.equal(legacyStill.jobs.length, 0);
assert.equal(legacyStill.postings[0].resumeText, 'plain');
assert.equal(addCareerJob(legacyStill, { company: 'Later' }, clock, random).jobs[0].company, 'Later');

assert.equal(logLayout({ kind: 'log' }), 'catalog');
assert.equal(logLayout({ kind: 'log', id: 'new' }), 'catalog-add');
assert.equal(logLayout({ kind: 'log', id: 'en_1' }), 'catalog');
assert.equal(hideBookRail({ kind: 'log', id: 'new' }, { entries: [{ id: 'e' }] }), false);
assert.equal(viewHash({ kind: 'log' }), '#experiences');
assert.equal(viewTitle({ kind: 'log' }), 'Resume bullets & knowledge');
assert.equal(viewHash({ kind: 'log', id: 'en_1' }), '#experiences/en_1');
assert.deepEqual(parseViewHash('#experiences'), { kind: 'log' });
assert.deepEqual(parseViewHash('#experiences/en_1', { entryIds: ['en_1'] }), { kind: 'log', id: 'en_1' });
assert.deepEqual(parseViewHash('#log'), { kind: 'log' });
assert.equal(viewHash({ kind: 'kb' }), '#kb');
assert.equal(viewTitle({ kind: 'kb' }), 'Resume bullets & knowledge');
assert.equal(viewTitle({ kind: 'kb', id: 'note_1' }, { knowledge: [{ id: 'note_1', title: 'Neon' }] }), 'Resume bullets & knowledge');
assert.deepEqual(parseViewHash('#kb'), { kind: 'kb' });
assert.deepEqual(parseViewHash('#knowledge'), { kind: 'kb' });
assert.deepEqual(parseViewHash('#kb/note_1', { knowledgeIds: ['note_1'] }), { kind: 'kb', id: 'note_1' });
assert.equal(logLayout({ kind: 'kb' }), 'catalog');
assert.equal(logLayout({ kind: 'kb', id: 'new' }), 'catalog-add');
assert.equal(hideBookRail({ kind: 'kb' }, { knowledge: [{ id: 'n' }] }), false);

let overlay = applyImportedResume(emptyStore(), sampleResume, clock);
overlay = addPosting(overlay, { title: 'Local role posting' }, clock);
overlay = addPosting(overlay, { title: 'Other posting' }, clock);
overlay = choosePostingResumeMode(overlay, overlay.postings[0].id, 'basics', clock);
overlay = choosePostingResumeMode(overlay, overlay.postings[1].id, 'basics', clock);
const overlayJobId = overlay.postings[0].id;
const otherJobId = overlay.postings[1].id;
assert.equal(overlay.postings[0].resume.mode, 'basics');
const sharedCount = overlay.jobs.length;
overlay = addPostingLocalJob(overlay, overlayJobId, { company: 'Posting Only LLC', title: 'Contractor' }, {}, clock, random);
assert.equal(overlay.jobs.length, sharedCount);
assert.equal(overlay.postings[0].resume.localJobs.length, 1);
assert.equal(overlay.postings[0].resume.localJobs[0].company, 'Posting Only LLC');
assert.equal(overlay.postings[1].resume.localJobs.length, 0);
const localDoc = compileResumeDoc(postingById(overlay, overlayJobId), overlay);
assert.equal(localDoc.sections.experience.jobs.some((job) => job.company === 'Posting Only LLC' && job.local), true);
const otherDoc = compileResumeDoc(postingById(overlay, otherJobId), overlay);
assert.equal(otherDoc.sections.experience.jobs.some((job) => job.company === 'Posting Only LLC'), false);

const localRole = overlay.postings[0].resume.localJobs[0];
overlay = addPostingLocalBullet(overlay, overlayJobId, localRole.id, localRole.groups[0].id, {
  lead: 'Built a posting-only control',
  body: 'Did not touch Resume basics.',
}, clock, random);
const withBullet = compileResumeDoc(postingById(overlay, overlayJobId), overlay);
const localCompiled = withBullet.sections.experience.jobs.find((job) => job.id === localRole.id);
assert.equal(localCompiled.groups[0].bullets.some((b) => b.lead.includes('posting-only')), true);
assert.equal(overlay.jobs.some((job) => (job.groups || []).some((g) => (g.bullets || []).some((b) => b.lead.includes('posting-only')))), false);

const liveLocal = compileResumeDoc(postingById(overlay, overlayJobId), overlay)
  .sections.experience.jobs.find((job) => job.id === localRole.id)
  .groups[0].bullets.find((b) => b.lead.includes('posting-only'));
overlay = writeBulletBackToSource(overlay, overlayJobId, liveLocal);
assert.equal(overlay.jobs.some((job) => job.company === 'Posting Only LLC'), true);
assert.equal(overlay.jobs.some((job) => (job.groups || []).some((g) => (g.bullets || []).some((b) => b.lead.includes('posting-only')))), true);

let freshStore = applyImportedResume(emptyStore(), sampleResume, clock);
freshStore = addPosting(freshStore, { title: 'Fresh posting', resume: { mode: 'choose' } }, clock);
assert.equal(freshStore.postings[0].resume.mode, 'choose');
const missingMode = normalizeStore({
  entries: [],
  postings: [{ title: 'Old row', resume: { excludedJobIds: [] } }],
}, clock);
assert.equal(missingMode.postings[0].resume.mode, 'basics');
freshStore = choosePostingResumeMode(freshStore, freshStore.postings[0].id, 'fresh', clock);
assert.equal(freshStore.postings[0].resume.mode, 'fresh');
assert.equal(freshStore.jobs[0].company, 'PricewaterhouseCoopers LLC');
const freshDoc = compileResumeDoc(freshStore.postings[0], freshStore);
assert.equal(freshDoc.header.name, 'Inaayat Gill');
assert.equal(freshDoc.sections.experience.jobs.length, 0);
assert.equal(freshDoc.sections.education.items.length, 0);
assert.equal(freshDoc.sections.credentials.items.length, 0);
freshStore = addPostingLocalJob(freshStore, freshStore.postings[0].id, { company: 'Scratch Co' }, {}, clock, random);
assert.equal(compileResumeDoc(freshStore.postings[0], freshStore).sections.experience.jobs[0].company, 'Scratch Co');
assert.equal(freshStore.jobs.some((job) => job.company === 'Scratch Co'), false);
freshStore = resetPostingResumeToBasics(freshStore, freshStore.postings[0].id, clock);
assert.equal(freshStore.postings[0].resume.mode, 'basics');
assert.equal(compileResumeDoc(freshStore.postings[0], freshStore).sections.experience.jobs[0].company, 'PricewaterhouseCoopers LLC');
assert.equal(freshStore.jobs[0].company, 'PricewaterhouseCoopers LLC');

let isolated = applyImportedResume(emptyStore(), sampleResume, clock);
isolated = addPosting(isolated, { title: 'A' }, clock);
isolated = addPosting(isolated, { title: 'B' }, clock);
isolated = choosePostingResumeMode(isolated, isolated.postings[0].id, 'basics', clock);
isolated = choosePostingResumeMode(isolated, isolated.postings[1].id, 'basics', clock);
isolated = addPostingLocalJob(isolated, isolated.postings[0].id, { company: 'Only A' }, {}, clock, random);
isolated = startPostingResumeFresh(isolated, isolated.postings[0].id, clock);
assert.equal(isolated.postings[0].resume.localJobs.length, 0);
assert.equal(compileResumeDoc(isolated.postings[0], isolated).sections.experience.jobs.length, 0);
assert.equal(compileResumeDoc(isolated.postings[1], isolated).sections.experience.jobs[0].company, 'PricewaterhouseCoopers LLC');
isolated = deletePostingLocalJob(isolated, isolated.postings[1].id, 'nope', clock);
assert.equal(isolated.jobs.length > 0, true);

const packedLocal = serializeBook(overlay);
const reloadedLocal = normalizeStore(JSON.parse(packedLocal.json), clock);
assert.ok(reloadedLocal.postings[0].resume.localJobs.length >= 0);
assert.equal(reloadedLocal.postings[0].resume.mode, 'basics');

const loadedAt = '2026-01-01T00:00:00.000Z';
assert.equal(normalizeBookRevision(new Date(loadedAt)), loadedAt);
assert.equal(normalizeBookRevision(loadedAt), loadedAt);
assert.equal(normalizeBookRevision('2026-01-01T00:00:00+00:00'), loadedAt);
assert.equal(normalizeBookRevision(null), null);
assert.equal(normalizeBookRevision(''), null);
assert.deepEqual(bookSaveGuard(new Date(loadedAt), loadedAt), { ok: true, reason: 'match' });
assert.deepEqual(bookSaveGuard(null, null), { ok: true, reason: 'create' });
assert.deepEqual(bookSaveGuard(loadedAt, undefined), { ok: true, reason: 'legacy' });
assert.deepEqual(bookSaveGuard(loadedAt, null), { ok: false, status: 409, reason: 'stale' });
assert.deepEqual(bookSaveGuard(loadedAt, '2026-01-02T00:00:00.000Z'), { ok: false, status: 409, reason: 'stale' });
assert.deepEqual(bookSaveGuard(loadedAt, 'not-a-date'), { ok: false, status: 409, reason: 'stale' });

const created = applyBookWrite(null, null, { profile: { name: 'New' } }, Date.parse(loadedAt));
assert.equal(created.ok, true);
assert.equal(created.reason, 'create');
assert.equal(created.record.updatedAt, loadedAt);

const legacyRow = { book: emptyStore(), updatedAt: loadedAt };
const legacySave = applyBookWrite(legacyRow, undefined, applyImportedResume(emptyStore(), sampleResume, clock), Date.parse('2026-01-01T01:00:00.000Z'));
assert.equal(legacySave.ok, true);
assert.equal(legacySave.reason, 'legacy');
assert.ok(legacySave.record.book.jobs.length > 0);
assert.ok(legacySave.record.book.education.length > 0);
assert.ok(legacySave.record.book.credentials.length > 0);

let server = { book: emptyStore(), updatedAt: loadedAt };
const tabB = applyBookWrite(
  server,
  loadedAt,
  applyImportedResume(emptyStore(), sampleResume, clock),
  Date.parse('2026-01-01T01:00:00.000Z'),
);
assert.equal(tabB.ok, true);
assert.equal(tabB.reason, 'match');
assert.ok(tabB.record.book.jobs.length > 0);
server = tabB.record;

const staleTab = emptyStore();
staleTab.profile = { ...staleTab.profile, name: 'Stale header' };
const tabA = applyBookWrite(server, loadedAt, staleTab, Date.parse('2026-01-01T02:00:00.000Z'));
assert.equal(tabA.ok, false);
assert.equal(tabA.status, 409);
assert.equal(tabA.reason, 'stale');
assert.ok(tabA.record.book.jobs.length > 0);
assert.ok(tabA.record.book.education.length > 0);
assert.ok(tabA.record.book.credentials.length > 0);
assert.notEqual(tabA.record.book.profile.name, 'Stale header');
const conflict = bookConflictError(tabA.record);
assert.equal(conflict.status, 409);
assert.equal(conflict.conflict, true);
assert.match(conflict.message, /somewhere else/);
assert.equal(conflict.message, STALE_BOOK_MESSAGE);
assert.equal(conflict.updatedAt, server.updatedAt);
assert.ok(conflict.book.jobs.length > 0);

assert.equal(shouldPullRemoteBook({ dirty: false, visible: true }), true);
assert.equal(shouldPullRemoteBook({ dirty: true, visible: true }), false);
assert.equal(shouldPullRemoteBook({ persistPending: true }), false);
assert.equal(shouldPullRemoteBook({ pushing: true }), false);
assert.equal(shouldPullRemoteBook({ visible: false }), false);

assert.equal(resumeRoleKey('job-1', 'role-a'), 'job-1:role-a');
assert.equal(resumeRoleKey('', 'role-a'), 'basics:role-a');
assert.equal(resumeRoleKey(null, ''), '');
assert.equal(roleIsCollapsed([], 'job-1', 'role-a'), false);
const folded = toggleRoleCollapsed([], 'job-1', 'role-a');
assert.equal(roleIsCollapsed(folded, 'job-1', 'role-a'), true);
assert.equal(roleIsCollapsed(folded, 'basics', 'role-a'), false);
assert.equal(roleIsCollapsed(toggleRoleCollapsed(folded, 'job-1', 'role-a'), 'job-1', 'role-a'), false);
assert.deepEqual(resumeRoleSummary({
  company: 'PricewaterhouseCoopers LLC',
  title: 'Senior Associate',
  groups: [{ bullets: [{}, {}, {}] }, { bullets: [{}] }],
}), { title: 'PricewaterhouseCoopers LLC · Senior Associate', bullets: 4 });
assert.deepEqual(resumeRoleSummary({}), { title: 'Untitled role', bullets: 0 });
assert.equal(isRoleHeaderToggleTarget('DIV', false), true);
assert.equal(isRoleHeaderToggleTarget('BUTTON', false), false);
assert.equal(isRoleHeaderToggleTarget('LABEL', false), false);
assert.equal(isRoleHeaderToggleTarget('DIV', true), false);

assert.equal(bulletLineText({ lead: 'Led team', body: 'Built it' }), '**Led team:** Built it');
assert.equal(bulletLineText({ lead: '', body: 'Plain **bold** line' }), 'Plain **bold** line');
assert.deepEqual(bulletFromLine('**Led team:** Built **100+** controls'), {
  lead: '',
  body: '**Led team:** Built **100+** controls',
});
assert.deepEqual(markdownToSpans('**Led team:** Built it'), [
  { text: 'Led team:', bold: true },
  { text: ' Built it', bold: false },
]);
assert.deepEqual(markdownToSpans('*Compliance Tools*: AuditBoard'), [
  { text: 'Compliance Tools', italic: true, bold: false },
  { text: ': AuditBoard', bold: false },
]);
assert.deepEqual(markdownToSpans('**Regulatory Knowledge:** SOX · *ICFR*'), [
  { text: 'Regulatory Knowledge:', bold: true },
  { text: ' SOX · ', bold: false },
  { text: 'ICFR', italic: true, bold: false },
]);
assert.equal(spansToMarkdown([
  { text: 'Led team:', bold: true },
  { text: ' Built it', bold: false },
]), '**Led team:** Built it');
assert.equal(spansToMarkdown([
  { text: 'Compliance Tools', italic: true },
  { text: ': AuditBoard', bold: false },
]), '*Compliance Tools*: AuditBoard');

const ghostRole = {
  id: 'job_role_godaddy',
  company: 'GoDaddy',
  title: '',
  location: 'New York, NY / Seattle, WA',
  start: 'October 2021',
  end: 'Present',
  groups: [{ id: 'g1', heading: '', bullets: [{ id: 'b1', lead: '', body: 'Did a thing' }] }],
};
let adopted = adoptCompiledJob(addPosting(emptyStore(), { title: 'Open' }, clock), 'missing', ghostRole, clock, random);
assert.equal((adopted.postings || []).length, 1);
adopted = addPosting(emptyStore(), { title: 'Open' }, clock);
const postingId = adopted.postings[0].id;
adopted = adoptCompiledJob(adopted, postingId, ghostRole, clock, random);
assert.equal(adopted.jobs.some((job) => job.id === 'job_role_godaddy'), false);
assert.equal(adopted.postings[0].resume.localJobs.some((job) => job.id === 'job_role_godaddy' && job.company === 'GoDaddy'), true);
const adoptedAgain = adoptCompiledJob(adopted, postingId, ghostRole, clock, random);
assert.equal(adoptedAgain.postings[0].resume.localJobs.length, adopted.postings[0].resume.localJobs.length);
adopted = updatePostingLocalJob(adopted, postingId, 'job_role_godaddy', { title: 'Senior Analyst' }, clock);
assert.equal(compileResumeDoc(postingById(adopted, postingId), adopted).sections.experience.jobs
  .find((job) => job.id === 'job_role_godaddy').title, 'Senior Analyst');
const basicsAdopt = adoptCompiledJob(emptyStore(), null, ghostRole, clock, random);
assert.equal(basicsAdopt.jobs[0].company, 'GoDaddy');
assert.equal(adoptCompiledJob(basicsAdopt, null, ghostRole, clock, random).jobs.length, 1);

assert.deepEqual(insertKeyAfter(['a', 'b', 'c'], 'x', 'a'), ['a', 'x', 'b', 'c']);
assert.deepEqual(insertKeyAfter(['a', 'b'], 'x'), ['a', 'b', 'x']);
assert.deepEqual(insertKeyAfter(['a', 'x', 'b'], 'x', 'b'), ['a', 'b', 'x']);

let ordered = applyImportedResume(emptyStore(), sampleResume, clock);
ordered = addPosting(ordered, { title: 'Order posting' }, clock);
const orderedJobId = ordered.postings[0].id;
const pwc = ordered.jobs.find((job) => job.company.startsWith('PricewaterhouseCoopers'));
const pwcGroups = pwc.groups.map((group) => group.id);
assert.ok(pwcGroups.length >= 2);
ordered = moveResumeGroup(ordered, orderedJobId, pwc.id, pwcGroups[0], 1, clock);
const afterMove = compileResumeDoc(postingById(ordered, orderedJobId), ordered)
  .sections.experience.jobs.find((job) => job.id === pwc.id).groups.map((group) => group.id);
assert.equal(afterMove[0], pwcGroups[1]);
assert.equal(afterMove[1], pwcGroups[0]);
const inserted = addResumeGroup(ordered, orderedJobId, pwc, { afterId: afterMove[0] }, clock, random);
ordered = inserted.store;
const afterInsert = compileResumeDoc(postingById(ordered, orderedJobId), ordered)
  .sections.experience.jobs.find((job) => job.id === pwc.id).groups.map((group) => group.id);
assert.equal(afterInsert[1], inserted.groupId);
const basicsInsert = addResumeGroup(applyImportedResume(emptyStore(), sampleResume, clock), null, pwc, {
  afterId: pwcGroups[0],
}, clock, random);
assert.equal(basicsInsert.store.jobs.find((job) => job.id === pwc.id).groups[1].id, basicsInsert.groupId);

assert.deepEqual(
  neighborGroupForBullet(
    [{ id: 'a', bullets: [{ id: '1' }] }, { id: 'b', bullets: [{ id: '2' }] }],
    'b',
    '2',
    -1
  ),
  { fromGroupId: 'b', toGroupId: 'a', index: 1 }
);
let hopped = addCareerJob(emptyStore(), {
  company: 'Hop',
  groups: [
    { id: 'g1', heading: '', bullets: [{ id: 'b1', lead: 'First' }] },
    { id: 'g2', heading: 'Later', bullets: [{ id: 'b2', lead: 'Second' }] },
  ],
}, clock, random);
const hopJob = hopped.jobs[0];
assert.equal(hopJob.groups[0].id, 'g1');
hopped = stepResumeBullet(hopped, null, hopJob, 'g2', 'b2', -1, clock);
assert.deepEqual(hopped.jobs[0].groups[0].bullets.map((bullet) => bullet.id), ['b1', 'b2']);
assert.equal(hopped.jobs[0].groups[1].bullets.length, 0);
hopped = moveResumeBullet(hopped, null, hopJob, 'g1', 'g2', 'b1', { index: 0 }, clock);
assert.equal(hopped.jobs[0].groups[0].bullets[0].id, 'b2');
assert.equal(hopped.jobs[0].groups[1].bullets[0].id, 'b1');
hopped = addPosting(hopped, { title: 'Hop posting' }, clock);
const hopPosting = hopped.postings[0];
const jobsBeforePostingHop = JSON.stringify(hopped.jobs);
hopped = stepResumeBullet(hopped, hopPosting.id, hopJob, 'g2', 'b1', -1, clock);
assert.equal(JSON.stringify(hopped.jobs), jobsBeforePostingHop);
assert.equal(hopped.jobs[0].groups[0].bullets.map((bullet) => bullet.id).join(','), 'b2');
assert.equal(hopped.jobs[0].groups[1].bullets[0].id, 'b1');
const hoppedPostingDoc = compileResumeDoc(postingById(hopped, hopPosting.id), hopped)
  .sections.experience.jobs.find((job) => job.id === hopJob.id);
assert.deepEqual(hoppedPostingDoc.groups.map((group) => group.bullets.map((bullet) => bullet.id)), [['b2', 'b1'], []]);
assert.equal(postingById(hopped, hopPosting.id).resume.bulletGroup.b1, 'g1');

let addl = applyImportedResume(emptyStore(), sampleResume, clock);
addl = addAdditionalGroup(addl, addl.additional[0].id, { label: 'First' }, clock, random);
addl = addAdditionalGroup(addl, addl.additional[0].id, { label: 'Second' }, clock, random);
const addlIds = addl.additional[0].groups.map((group) => group.id);
addl = moveAdditionalGroup(addl, addl.additional[0].id, addlIds[0], 1, clock);
assert.equal(addl.additional[0].groups[0].id, addlIds[1]);
assert.equal(addl.additional[0].groups[1].id, addlIds[0]);

const emptyGroup = normalizeAdditional([{
  id: 'ad_empty',
  label: 'Tools',
  groups: [{ label: '', items: [] }, { id: 'sg_keep', label: '', items: [] }],
}], clock);
assert.equal(emptyGroup[0].groups.length, 1);
assert.equal(emptyGroup[0].groups[0].id, 'sg_keep');

let subLabels = addAdditionalRow(emptyStore(), {
  id: 'ad_tech',
  label: 'Technical Skills',
  items: ['AuditBoard', 'Excel'],
}, clock, random);
subLabels = addResumeAdditionalGroup(subLabels, null, 'ad_tech', {}, clock, random);
assert.equal(subLabels.additional[0].groups.length, 1);
assert.equal(subLabels.additional[0].groups[0].label, '');
assert.deepEqual(subLabels.additional[0].groups[0].items, ['AuditBoard', 'Excel']);
assert.deepEqual(subLabels.additional[0].items, []);
subLabels = addResumeAdditionalGroup(subLabels, null, 'ad_tech', { label: 'Data Analytics' }, clock, random);
assert.equal(subLabels.additional[0].groups.length, 2);
assert.equal(subLabels.additional[0].groups[1].label, 'Data Analytics');
assert.ok(subLabels.additional[0].updatedAt);
const basicsPreview = renderResumeHtml(compileResumeDoc(null, subLabels));
assert.match(basicsPreview, /<b>Technical Skills:<\/b> AuditBoard, Excel · Data Analytics/);
assert.doesNotMatch(basicsPreview, /<i>/);
subLabels = updateResumeAdditionalGroup(subLabels, null, 'ad_tech', subLabels.additional[0].groups[0].id, {
  label: 'Compliance Tools',
  items: ['AuditBoard', 'Dynamics 365'],
}, clock);
subLabels = updateResumeAdditionalGroup(subLabels, null, 'ad_tech', subLabels.additional[0].groups[1].id, {
  label: 'Data Analytics',
  items: ['Advanced Excel', 'SQL'],
}, clock);
const groupedFold = 'Compliance Tools: AuditBoard, Dynamics 365 · Data Analytics: Advanced Excel, SQL';
const groupedPreview = renderResumeHtml(compileResumeDoc(null, subLabels));
assert.match(groupedPreview, /<b>Technical Skills:<\/b> Compliance Tools: AuditBoard, Dynamics 365 · Data Analytics: Advanced Excel, SQL/);
assert.doesNotMatch(groupedPreview, /<i>Compliance Tools<\/i>/);
const groupedDocx = new TextDecoder().decode(resumeDocxBytes(compileResumeDoc(null, subLabels)));
assert.match(groupedDocx, /<w:t[^>]*>Compliance Tools: AuditBoard, Dynamics 365 · Data Analytics: Advanced Excel, SQL<\/w:t>/);
assert.doesNotMatch(groupedDocx, /<w:i\/><w:iCs\/>[\s\S]*?<w:t[^>]*>Compliance Tools<\/w:t>/);
assert.equal(additionalItemsSource(subLabels.additional[0]), groupedFold);
assert.equal(additionalValuePlain(subLabels.additional[0]), groupedFold);
const reloadedSubs = normalizeStore(JSON.parse(serializeBook(subLabels).json), clock);
assert.equal(reloadedSubs.additional[0].groups[0].label, 'Compliance Tools');
assert.deepEqual(reloadedSubs.additional[0].items, []);
const skillsLine = 'AI & Agents: Claude Code, Anthropic API, Model Context Protocol (MCP), Cursor, ChatGPT, Copilot; AI-Assisted Development: Python (pandas, openpyxl, Playwright), SQL, Kusto, Git/GitHub, GitHub Actions, REST APIs, Low-Code & Data: Advanced Excel, Power BI, Power Automate, Power Query, Alteryx; Systems: Workday, Dynamics 365, AuditBoard, Jira, Azure DevOps';
const skillsTail = 'Low-Code & Data: Advanced Excel, Power BI, Power Automate, Power Query, Alteryx';
const skillsBook = normalizeStore({
  additional: [{ id: 'ad_skills', label: 'Technical Skills', items: [skillsLine] }],
}, clock);
assert.equal(skillsBook.additional[0].items[0], skillsLine);
assert.equal(additionalItemsSource(skillsBook.additional[0]), skillsLine);
const skillsStringBook = normalizeStore({
  additional: [{ id: 'ad_skills_s', label: 'Technical Skills', items: skillsLine }],
}, clock);
assert.deepEqual(skillsStringBook.additional[0].items, [skillsLine]);
const skillsGroupBook = normalizeStore({
  additional: [{
    id: 'ad_skills_g',
    label: 'Technical Skills',
    groups: [{ id: 'sg_notes', label: 'Notes', items: [skillsLine] }],
  }],
}, clock);
assert.equal(skillsGroupBook.additional[0].groups[0].items[0], skillsLine);
assert.equal(additionalItemsSource(skillsGroupBook.additional[0]), `Notes: ${skillsLine}`);
const skillsHtml = renderResumeHtml(compileResumeDoc(null, skillsBook));
assert.match(skillsHtml, /Copilot; AI-Assisted Development/);
assert.ok(skillsHtml.includes(skillsTail.replaceAll('&', '&amp;')));
assert.match(skillsHtml, /Systems: Workday, Dynamics 365, AuditBoard, Jira, Azure DevOps/);
assert.doesNotMatch(skillsHtml, /<i>AI &amp; Agents<\/i>/);
assert.doesNotMatch(skillsHtml, /Low-C</);
const skillsDocx = new TextDecoder().decode(resumeDocxBytes(compileResumeDoc(null, skillsBook)));
assert.match(skillsDocx, /Copilot; AI-Assisted Development/);
assert.ok(skillsDocx.includes(skillsTail.replaceAll('&', '&amp;')));
assert.match(skillsDocx, /Systems: Workday, Dynamics 365, AuditBoard, Jira, Azure DevOps/);
const markedItems = editResumeAdditionalRow(subLabels, null, 'ad_tech', (row) => ({
  ...row,
  text: `Keep *asterisks* ${skillsLine}`,
  rich: [
    { text: 'Keep *asterisks* ', bold: false },
    { text: 'AI & Agents', bold: true, italic: true },
    { text: skillsLine.slice('AI & Agents'.length), bold: false },
    { text: ' SQL', bold: false, italic: true },
  ],
}), clock);
assert.equal(markedItems.additional[0].groups[0].label, 'Compliance Tools');
assert.equal(markedItems.additional[0].text, `Keep *asterisks* ${skillsLine}`);
const markedHtml = renderResumeHtml(compileResumeDoc(null, markedItems));
assert.match(markedHtml, /Keep \*asterisks\* /);
assert.match(markedHtml, /<b><i>AI &amp; Agents<\/i><\/b>/);
assert.match(markedHtml, /<i> SQL<\/i>/);
assert.ok(markedHtml.includes(skillsTail.replaceAll('&', '&amp;')));
assert.doesNotMatch(markedHtml, /<i>asterisks<\/i>/);
assert.doesNotMatch(markedHtml, /<i>Compliance Tools<\/i>/);
const markedDocx = new TextDecoder().decode(resumeDocxBytes(compileResumeDoc(null, markedItems)));
assert.match(markedDocx, /<w:b\/><w:bCs\/>\s*<w:i\/><w:iCs\/>[\s\S]*?<w:t[^>]*>AI &amp; Agents<\/w:t>/);
assert.match(markedDocx, /<w:i\/><w:iCs\/>[\s\S]*?<w:t[^>]*> SQL<\/w:t>/);
assert.ok(markedDocx.includes(skillsTail.replaceAll('&', '&amp;')));
assert.match(markedDocx, /Copilot; AI-Assisted Development/);
const clearedItems = editResumeAdditionalRow(subLabels, null, 'ad_tech', (row) => ({
  ...row,
  text: '',
  rich: [],
}), clock);
assert.ok(clearedItems.additional[0].groups.length);
assert.equal(additionalItemsSource(clearedItems.additional[0]), '');
assert.doesNotMatch(renderResumeHtml(compileResumeDoc(null, clearedItems)), /Compliance Tools/);

let postingSubs = addAdditionalRow(emptyStore(), {
  id: 'ad_tech',
  label: 'Technical Skills',
  items: ['AuditBoard'],
}, clock, random);
postingSubs = addPosting(postingSubs, { id: 'job_sub', title: 'This posting' }, clock);
postingSubs = addPosting(postingSubs, { id: 'job_other', title: 'Other posting' }, clock);
postingSubs = addPostingLocalAdditional(postingSubs, 'job_sub', {
  id: 'ad_local',
  label: 'Local tools',
  items: ['Excel'],
}, clock, random);
const beforeLocalAdd = JSON.stringify(postingSubs.additional);
postingSubs = addResumeAdditionalGroup(postingSubs, 'job_sub', 'ad_local', { label: 'Sheets' }, clock, random);
assert.equal(JSON.stringify(postingSubs.additional), beforeLocalAdd);
const localRow = postingById(postingSubs, 'job_sub').resume.localAdditional.find((row) => row.id === 'ad_local');
assert.equal(localRow.groups.length, 1);
assert.equal(localRow.groups[0].label, 'Sheets');
assert.deepEqual(localRow.groups[0].items, ['Excel']);
const localGroupId = localRow.groups[0].id;
postingSubs = updateResumeAdditionalGroup(postingSubs, 'job_sub', 'ad_local', localGroupId, {
  label: 'Sheets',
  items: ['Excel', 'SQL'],
}, clock);
postingSubs = addResumeAdditionalGroup(postingSubs, 'job_sub', 'ad_local', { label: 'Second' }, clock, random);
const localGroups = postingById(postingSubs, 'job_sub').resume.localAdditional.find((row) => row.id === 'ad_local').groups;
assert.equal(localGroups.length, 2);
postingSubs = moveResumeAdditionalGroup(postingSubs, 'job_sub', 'ad_local', localGroups[0].id, 1, clock);
assert.equal(
  postingById(postingSubs, 'job_sub').resume.localAdditional.find((row) => row.id === 'ad_local').groups[0].label,
  'Second',
);
postingSubs = deleteResumeAdditionalGroup(postingSubs, 'job_sub', 'ad_local', localGroups[1].id, clock);
assert.equal(
  postingById(postingSubs, 'job_sub').resume.localAdditional.find((row) => row.id === 'ad_local').groups.length,
  1,
);
assert.equal(postingSubs.additional[0].items[0], 'AuditBoard');

const basicsBeforeFork = JSON.stringify(postingSubs.additional);
postingSubs = addResumeAdditionalGroup(postingSubs, 'job_sub', 'ad_tech', {
  label: 'Compliance Tools',
  items: ['AuditBoard'],
}, clock, random);
assert.equal(JSON.stringify(postingSubs.additional), basicsBeforeFork);
const forkedRow = postingById(postingSubs, 'job_sub').resume.localAdditional.find((row) => row.id === 'ad_tech');
assert.equal(forkedRow.groups[0].label, 'Compliance Tools');
const forkedAdditionalDoc = compileResumeDoc(postingById(postingSubs, 'job_sub'), postingSubs);
assert.match(renderResumeHtml(forkedAdditionalDoc), /<b>Technical Skills:<\/b> Compliance Tools: AuditBoard/);
assert.doesNotMatch(renderResumeHtml(forkedAdditionalDoc), /<i>Compliance Tools<\/i>/);
const otherPostingDoc = compileResumeDoc(postingById(postingSubs, 'job_other'), postingSubs);
assert.equal(otherPostingDoc.sections.additional.rows.find((row) => row.id === 'ad_tech').groups.length, 0);
assert.deepEqual(compileResumeDoc(null, postingSubs).sections.additional.rows.find((row) => row.id === 'ad_tech').items, ['AuditBoard']);
postingSubs = replacePostingResume(
  postingSubs,
  'job_sub',
  hideResumeRow(postingById(postingSubs, 'job_sub').resume, 'additional', 'ad_tech'),
  clock,
);
assert.equal(
  compileResumeDoc(postingById(postingSubs, 'job_sub'), postingSubs).sections.additional.rows.some((row) => row.id === 'ad_tech'),
  false,
);
assert.equal(postingSubs.additional.some((row) => row.id === 'ad_tech'), true);

let sameId = addEducationItem(emptyStore(), { id: 'ed_same', school: 'Shared U' }, clock, random);
sameId = addAdditionalRow(sameId, { id: 'ad_same', label: 'Tools', items: ['Excel'] }, clock, random);
sameId = addPosting(sameId, { id: 'job_same', title: 'Same id' }, clock);
sameId = addPostingLocalEducation(sameId, 'job_same', { id: 'ed_same', school: 'Override U' }, clock, random);
sameId = addPostingLocalAdditional(sameId, 'job_same', { id: 'ad_same', label: 'Tools', items: ['SQL'] }, clock, random);
const sameDoc = compileResumeDoc(postingById(sameId, 'job_same'), sameId);
assert.equal(sameDoc.sections.education.items.find((row) => row.id === 'ed_same').school, 'Shared U');
assert.deepEqual(sameDoc.sections.additional.rows.find((row) => row.id === 'ad_same').items, ['SQL']);

const mergeAddBase = addAdditionalRow(emptyStore(), { id: 'ad_merge', label: 'Technical Skills', items: ['Excel'] }, () => Date.parse('2026-01-01T00:00:00.000Z'), random);
const mergeAddLocal = addAdditionalGroup(mergeAddBase, 'ad_merge', {
  id: 'sg_merge',
  label: 'Compliance Tools',
  items: ['AuditBoard'],
}, () => Date.parse('2026-02-01T00:00:00.000Z'), random);
const mergeAddRemote = updateAdditionalRow(mergeAddBase, 'ad_merge', { label: 'Skills' }, () => Date.parse('2026-03-01T00:00:00.000Z'));
assert.equal(mergeBook(mergeAddBase, mergeAddLocal, mergeAddRemote).additional[0].label, 'Skills');
const mergeAddNewer = addAdditionalGroup(mergeAddBase, 'ad_merge', {
  id: 'sg_merge',
  label: 'Compliance Tools',
  items: ['AuditBoard'],
}, () => Date.parse('2026-04-01T00:00:00.000Z'), random);
const mergedGroups = mergeBook(mergeAddBase, mergeAddNewer, mergeAddRemote).additional[0];
assert.equal(mergedGroups.groups[0].label, 'Compliance Tools');
assert.equal(mergedGroups.label, 'Technical Skills');

let logged = addEntries(addPosting(emptyStore(), { title: 'Open' }, clock), [
  { title: 'Led a walkthrough', kind: 'experience' },
], clock);
logged = addRequirement(logged, logged.postings[0].id, 'Need a walkthrough', clock);
logged = addEntryBullet(
  logged,
  logged.postings[0].id,
  logged.postings[0].requirements[0].id,
  logged.entries[0].id,
  'Led a walkthrough',
  clock
);
assert.ok(logged.entries.length >= 1);
assert.ok(logged.postings[0].requirements[0].bullets.length >= 1);
const packedLog = serializeBook(logged);
const reloadedLog = normalizeStore(JSON.parse(packedLog.json), clock);
assert.equal(reloadedLog.entries[0].title, 'Led a walkthrough');
assert.equal(reloadedLog.postings[0].requirements[0].bullets[0].text, 'Led a walkthrough');
assert.equal(shouldBlockEmptyOverwrite(emptyStore(), reloadedLog), true);
assert.equal(shouldBlockEmptyOverwrite(reloadedLog, reloadedLog), false);
assert.equal(shouldBlockEmptyOverwrite(emptyStore(), emptyStore()), false);
const movedLog = moveResumeGroup(reloadedLog, reloadedLog.postings[0].id, 'nope', 'g', 1, clock);
assert.equal(movedLog.entries[0].title, 'Led a walkthrough');
assert.equal(movedLog.postings[0].requirements[0].bullets[0].text, 'Led a walkthrough');

const boldTitle = normalizeEntry({ title: 'Led **3** associates on access reviews' }, clock);
assert.equal(boldTitle.title, 'Led 3 associates on access reviews');
assert.equal(boldTitle.rich.some((span) => span.bold && span.text === '3'), true);
assert.equal(normalizeEntry({ title: 'Led it' }, clock).company, '');
let companyBook = addEntry(emptyStore(), { title: 'Led it', role: 'Analyst', when: '2021' }, clock);
companyBook = updateEntry(companyBook, companyBook.entries[0].id, { company: 'GoDaddy' }, clock);
assert.equal(companyBook.entries[0].title, 'Led it');
assert.equal(companyBook.entries[0].role, 'Analyst');
assert.equal(companyBook.entries[0].company, 'GoDaddy');

let catalogStore = addEntry(emptyStore(), { title: 'Resume line', kind: 'project' }, () => Date.parse('2026-01-01T00:00:00.000Z'));
catalogStore = addKnowledge(catalogStore, { title: 'Longer note', body: 'Context about the work' }, () => Date.parse('2026-06-01T00:00:00.000Z'));
assert.deepEqual(experienceCatalog(catalogStore).map((row) => row.type), ['entry']);
assert.equal(experienceCatalog(catalogStore).some((row) => row.type === 'note'), false);
assert.equal(experienceCatalog(catalogStore, { query: 'longer' }).length, 0);
assert.equal(experienceCatalog(catalogStore, { query: 'resume' })[0].type, 'entry');
assert.equal(searchKnowledge(catalogStore, 'longer').length, 1);
assert.equal(searchKnowledge(catalogStore, 'Context about').length, 1);
assert.equal(searchKnowledge(catalogStore, 'no such page').length, 0);
assert.equal(experienceRowField('kind'), false);
assert.equal(experienceRowField('when'), false);
assert.equal(experienceRowField('situation'), true);
assert.equal(experienceRowField('company'), true);

let inline = addPosting(emptyStore(), { title: 'Inline row' }, clock);
const inlineJob = inline.postings[0].id;
inline = addRequirement(inline, inlineJob, 'Need the story', clock);
const inlineReq = inline.postings[0].requirements[0].id;
inline = createEntryBullet(inline, inlineJob, inlineReq, 'Original line', clock);
const inlineId = inline.entries[0].id;
inline = updateEntry(inline, inlineId, { when: '2024', kind: 'project', company: 'GoDaddy', role: 'Analyst' }, clock);
const inlineCount = inline.entries.length;
const inlinePatch = experienceDetailPatch({
  title: 'Original line revised',
  rich: [{ text: 'Original line revised', bold: false }],
  situation: 'The queue was split across three sheets.',
  company: 'GoDaddy',
  role: 'Analyst',
  when: '1999',
  kind: 'skillset',
});
assert.equal(Object.prototype.hasOwnProperty.call(inlinePatch, 'when'), false);
assert.equal(Object.prototype.hasOwnProperty.call(inlinePatch, 'kind'), false);
inline = updateEntry(inline, inlineId, inlinePatch, clock);
assert.equal(inline.entries.length, inlineCount);
assert.equal(inline.entries.filter((entry) => entry.id === inlineId).length, 1);
assert.equal(inline.entries[0].when, '2024');
assert.equal(inline.entries[0].kind, 'project');
assert.equal(inline.entries[0].situation, 'The queue was split across three sheets.');
assert.equal(inline.entries[0].company, 'GoDaddy');
assert.equal(inline.postings[0].requirements[0].bullets.length, 1);
assert.equal(inline.postings[0].requirements[0].bullets[0].entryId, inlineId);
assert.equal(inline.postings[0].requirements[0].bullets[0].text, 'Original line revised');
assert.equal(postingsUsingEntry(inline, inlineId)[0].id, inlineJob);

let pendingSave = null;
pendingSave = noteKnowledgeInput(pendingSave, 'kb1', { title: 'A page' }, 1000);
pendingSave = noteKnowledgeInput(pendingSave, 'kb1', { body: 'Typed later' }, 1200);
assert.equal(pendingSave.patch.title, 'A page');
assert.equal(pendingSave.patch.body, 'Typed later');
assert.equal(pendingSave.due, 1200 + KNOWLEDGE_SAVE_MS);
assert.equal(knowledgeSaveStatus(pendingSave, 1200 + KNOWLEDGE_SAVE_MS - 1), 'pending');
assert.equal(knowledgeSaveStatus(pendingSave, 1200 + KNOWLEDGE_SAVE_MS), 'due');

const mergeBase = normalizeStore({
  entries: [{ id: 'en_base', title: 'Kept line', kind: 'experience', updatedAt: '2026-01-01T00:00:00.000Z' }],
  knowledge: [{ id: 'kb_base', title: 'Page', body: 'First', updatedAt: '2026-01-01T00:00:00.000Z' }],
  postings: [],
}, clock);
const mergeLocal = updateKnowledge(mergeBase, 'kb_base', {
  body: 'Draft from this tab',
  rich: [{ text: 'Draft from this tab', bold: false }],
}, () => Date.parse('2026-02-01T00:00:00.000Z'));
let mergeRemote = addEntry(mergeBase, { id: 'en_other', title: 'Added in the other tab' }, () => Date.parse('2026-01-15T00:00:00.000Z'));
mergeRemote = addPosting(mergeRemote, { id: 'job_other', title: 'Other tab posting' }, () => Date.parse('2026-01-15T00:00:00.000Z'));
const merged = normalizeStore(mergeBook(mergeBase, mergeLocal, mergeRemote), clock);
assert.equal(merged.entries.some((entry) => entry.id === 'en_base'), true);
assert.equal(merged.entries.some((entry) => entry.title === 'Added in the other tab'), true);
assert.equal(merged.postings.some((job) => job.title === 'Other tab posting'), true);
assert.equal(merged.knowledge.length, 1);
assert.match(merged.knowledge[0].body, /this tab/);
const remoteNewer = updateKnowledge(mergeBase, 'kb_base', {
  body: 'Newer from the other tab',
  rich: [{ text: 'Newer from the other tab', bold: false }],
}, () => Date.parse('2026-03-01T00:00:00.000Z'));
const mergedNewer = normalizeStore(mergeBook(mergeBase, mergeLocal, remoteNewer), clock);
assert.match(mergedNewer.knowledge[0].body, /other tab/);
assert.equal(mergedNewer.entries.some((entry) => entry.id === 'en_base'), true);

const oldNoKnowledge = normalizeStore({ entries: [{ title: 'Legacy win' }] }, clock);
assert.equal(oldNoKnowledge.knowledge.length, 0);
assert.equal(oldNoKnowledge.entries[0].title, 'Legacy win');
assert.equal(oldNoKnowledge.entries[0].rich[0].text, 'Legacy win');

const notes = parseKnowledge('Neon Auth\nSame JWT as Packing Cubes.\n\nHobby plan\nTwelve functions max.');
assert.deepEqual(notes.map((item) => item.title), ['Neon Auth', 'Hobby plan']);
assert.equal(notes[0].body, 'Same JWT as Packing Cubes.');
let kb = addKnowledgeNotes(emptyStore(), notes, clock);
assert.equal(kb.knowledge.length, 2);
assert.equal(kb.knowledge[0].title, 'Neon Auth');
assert.match(kb.knowledge[0].body, /JWT/);
kb = updateKnowledge(kb, kb.knowledge[0].id, {
  body: 'Same JWT as Packing Cubes. **Sign-in required.**',
  rich: [
    { text: 'Same JWT as Packing Cubes. ', bold: false },
    { text: 'Sign-in required.', bold: true },
  ],
}, clock);
assert.equal(knowledgeById(kb, kb.knowledge[0].id).rich[1].bold, true);
assert.equal(searchKnowledge(kb, 'jwt').length, 1);
const plainPage = normalizeKnowledge({ id: 'kb_plain', title: 'Old', body: 'Just text\nSecond line' }, clock);
assert.equal(plainPage.body, 'Just text\nSecond line');
assert.deepEqual(plainPage.doc.map((block) => block.type), ['p', 'p']);
assert.equal(plainPage.doc[1].spans[0].text, 'Second line');
assert.equal(plainPage.doc[0].type === 'li', false);
const markedPage = normalizeKnowledge({ id: 'kb_mark', title: 'Marked', body: 'See **this**' }, clock);
assert.equal(markedPage.body, 'See this');
assert.equal(markedPage.doc[0].spans[1].bold, true);
assert.equal(searchKnowledge({ knowledge: [markedPage] }, '**').length, 0);
assert.equal(searchKnowledge({ knowledge: [markedPage] }, 'this').length, 1);
const italicPage = normalizeKnowledge({
  id: 'kb_italic',
  title: 'Italic',
  doc: [{ type: 'p', indent: 0, spans: [
    { text: 'hello ', bold: false, italic: false },
    { text: 'there', bold: true, italic: true },
  ] }],
}, clock);
assert.equal(italicPage.doc[0].spans[1].italic, true);
assert.equal(italicPage.doc[0].spans[1].bold, true);
assert.equal(italicPage.body, 'hello there');
const renamedItalic = updateKnowledge({ knowledge: [italicPage] }, 'kb_italic', { title: 'Renamed' }, clock);
assert.equal(renamedItalic.knowledge[0].title, 'Renamed');
assert.equal(renamedItalic.knowledge[0].doc[0].spans[1].italic, true);
assert.equal(renamedItalic.knowledge[0].body, 'hello there');
assert.equal(searchKnowledge({ knowledge: [italicPage] }, 'there').length, 1);
assert.equal(searchKnowledge({ knowledge: [italicPage] }, '<em>').length, 0);
assert.equal(searchKnowledge({
  knowledge: [{
    title: 'T',
    body: '**secret** <em>nope</em>',
    doc: [{ type: 'p', spans: [{ text: 'milk', bold: false, italic: true }] }],
  }],
}, 'secret').length, 0);
assert.equal(searchKnowledge({
  knowledge: [{
    title: 'T',
    body: '**secret** <em>nope</em>',
    doc: [{ type: 'p', spans: [{ text: 'milk', bold: false, italic: true }] }],
  }],
}, 'milk').length, 1);
const nastyPage = normalizeKnowledge({
  title: 'Nasty',
  doc: [
    { type: 'script', spans: [{ text: 'alert(1)' }] },
    { type: 'p', spans: [{ text: '<img src=x onerror=alert(1)>', bold: false }] },
  ],
}, clock);
assert.equal(nastyPage.doc.length, 1);
assert.equal(nastyPage.doc[0].type, 'p');
assert.match(nastyPage.body, /<img/);
assert.equal(JSON.stringify(nastyPage.doc).includes('"type":"script"'), false);
const dashed = applyKnowledgeListMarker(
  [{ type: 'p', indent: 0, spans: [{ text: '- milk', bold: false, italic: false }] }],
  { index: 0, offset: 6 },
);
assert.equal(dashed.changed, true);
assert.equal(dashed.doc[0].type, 'li');
assert.equal(dashed.doc[0].spans.map((span) => span.text).join(''), 'milk');
assert.equal(dashed.caret.offset, 4);
const starred = applyKnowledgeListMarker(
  [{ type: 'p', indent: 0, spans: [{ text: '* eggs', bold: false, italic: false }] }],
  { index: 0, offset: 2 },
);
assert.equal(starred.doc[0].type, 'li');
assert.equal(starred.doc[0].spans[0].text, 'eggs');
assert.equal(applyKnowledgeListMarker(
  [{ type: 'p', spans: [{ text: 'hello - there', bold: false }] }],
  { index: 0, offset: 13 },
).changed, false);
const continued = applyKnowledgeEnter(starred.doc, { index: 0, offset: 4 });
assert.equal(continued.doc.length, 2);
assert.equal(continued.doc[1].type, 'li');
assert.equal(continued.doc[1].indent, 0);
assert.equal(continued.doc[1].spans.length, 0);
const ended = applyKnowledgeEnter(continued.doc, { index: 1, offset: 0 });
assert.equal(ended.doc[1].type, 'p');
const indented = applyKnowledgeTab(starred.doc, { index: 0, offset: 1 }, false);
assert.equal(indented.doc[0].indent, 1);
const outdented = applyKnowledgeTab(indented.doc, { index: 0, offset: 1 }, true);
assert.equal(outdented.doc[0].type, 'li');
assert.equal(outdented.doc[0].indent, 0);
assert.equal(applyKnowledgeTab(outdented.doc, { index: 0, offset: 1 }, true).doc[0].type, 'p');
assert.equal(applyKnowledgeTab(
  [{ type: 'li', indent: 6, spans: [{ text: 'x', bold: false }] }],
  { index: 0, offset: 0 },
  false,
).changed, false);
const outline = groupKnowledgeBlocks([
  { type: 'li', indent: 0, spans: [{ text: 'a', bold: false }] },
  { type: 'li', indent: 1, spans: [{ text: 'b', bold: false }] },
]);
assert.equal(outline[0].kind, 'ul');
assert.equal(outline[0].items[0].text, 'a');
assert.equal(outline[0].items[0].children[0].text, 'b');
const italicRange = toggleKnowledgeMark(
  [{ type: 'p', spans: [{ text: 'hello there', bold: false, italic: false }] }],
  { index: 0, start: 6, end: 11 },
  'italic',
);
assert.equal(italicRange.doc[0].spans.find((span) => span.text === 'there').italic, true);
assert.equal(knowledgeEditEffects('input').render, false);
assert.equal(knowledgeEditEffects('input').save, true);
assert.equal(knowledgeEditEffects('keydown').render, false);
assert.equal(knowledgeEditEffects('keydown').save, true);
assert.equal(knowledgeEditEffects('toolbar').render, false);
assert.deepEqual(knowledgeMarkShortcut({ key: 'b', metaKey: true }), { command: 'bold', preventDefault: true });
assert.deepEqual(knowledgeMarkShortcut({ key: 'B', ctrlKey: true }), { command: 'bold', preventDefault: true });
assert.deepEqual(knowledgeMarkShortcut({ key: 'i', metaKey: true }), { command: 'italic', preventDefault: true });
assert.deepEqual(knowledgeMarkShortcut({ key: 'i', ctrlKey: true }), { command: 'italic', preventDefault: true });
assert.equal(knowledgeMarkShortcut({ key: 'b' }), null);
assert.equal(knowledgeMarkShortcut({ key: 'b', metaKey: true, altKey: true }), null);
assert.equal(knowledgeMarkShortcut({ key: 'b', ctrlKey: true, shiftKey: true }), null);
assert.equal(knowledgeMarkShortcut({ key: 'b', metaKey: true, ctrlKey: true }), null);
assert.equal(knowledgeMarkShortcut({ key: 'b', metaKey: true, repeat: true }), null);
assert.equal(knowledgeMarkShortcut({ key: 'u', metaKey: true }), null);
const caretMark = toggleKnowledgeMark(
  [{ type: 'p', spans: [{ text: 'hello there', bold: false, italic: false }] }],
  { index: 0, start: 4, end: 4 },
  'bold',
);
assert.equal(caretMark.changed, false);
assert.equal(caretMark.doc[0].spans[0].bold, false);
const h3typed = applyKnowledgeHeadingMarker(
  [{ type: 'p', spans: [{ text: '### Topic', bold: false, italic: false }] }],
  { index: 0, offset: 9 },
);
assert.equal(h3typed.changed, true);
assert.equal(h3typed.doc[0].type, 'h3');
assert.equal(h3typed.doc[0].spans[0].text, 'Topic');
assert.equal(h3typed.caret.offset, 5);
assert.equal(applyKnowledgeHeadingMarker(
  [{ type: 'p', spans: [{ text: '## PwC', bold: false }] }],
  { index: 0, offset: 6 },
).doc[0].type, 'h2');
assert.equal(applyKnowledgeHeadingMarker(
  [{ type: 'p', spans: [{ text: '# Title', bold: false }] }],
  { index: 0, offset: 7 },
).doc[0].type, 'h1');
assert.equal(applyKnowledgeHeadingMarker(
  [{ type: 'p', spans: [{ text: '#### Nope', bold: false }] }],
  { index: 0, offset: 9 },
).changed, false);
assert.equal(applyKnowledgeHeadingMarker(
  [{ type: 'p', spans: [{ text: 'hello # there', bold: false }] }],
  { index: 0, offset: 13 },
).changed, false);
const headingSet = setKnowledgeHeading(
  [{ type: 'p', spans: [{ text: 'Role', bold: false }] }],
  { index: 0, offset: 2 },
  2,
);
assert.equal(headingSet.doc[0].type, 'h2');
assert.equal(setKnowledgeHeading(headingSet.doc, { index: 0, offset: 2 }, 2).doc[0].type, 'p');
const headingBreak = applyKnowledgeHeadingBreak(headingSet.doc, { index: 0, offset: 4 });
assert.equal(headingBreak.doc[0].type, 'h2');
assert.equal(headingBreak.doc[1].type, 'p');
assert.equal(headingBreak.caret.offset, 0);
const samplePaste = '# Title\n\n## PwC \u2014 Associate (Oct 2021 \u2013 Jun 2023)\n\n### Topic\n\n- Bullet with $1.6M and 100+ controls';
const sampleDoc = knowledgeDocFromMarkdown(samplePaste);
assert.equal(sampleDoc.find((block) => block.type === 'h1').spans[0].text, 'Title');
assert.equal(sampleDoc.find((block) => block.type === 'h2').spans.map((span) => span.text).join(''), 'PwC \u2014 Associate (Oct 2021 \u2013 Jun 2023)');
assert.equal(sampleDoc.find((block) => block.type === 'h3').spans[0].text, 'Topic');
assert.equal(sampleDoc.find((block) => block.type === 'li').spans.map((span) => span.text).join(''), 'Bullet with $1.6M and 100+ controls');
const samplePlain = knowledgePlainText(sampleDoc);
assert.equal(samplePlain, 'Title\n\nPwC \u2014 Associate (Oct 2021 \u2013 Jun 2023)\n\nTopic\n\nBullet with $1.6M and 100+ controls');
assert.equal(samplePlain.includes('#'), false);
assert.equal(samplePlain.includes('**'), false);
const sampleStored = normalizeKnowledge({ title: 'Pasted', doc: sampleDoc }, clock);
assert.equal(sampleStored.body, samplePlain);
assert.equal(sampleStored.doc.find((block) => block.type === 'h2').type, 'h2');
const markedLine = knowledgeDocFromMarkdown('- **bold** and *italic* and _also_');
assert.equal(markedLine[0].type, 'li');
assert.equal(markedLine[0].spans.find((span) => span.text === 'bold').bold, true);
assert.equal(markedLine[0].spans.find((span) => span.text === 'italic').italic, true);
assert.equal(markedLine[0].spans.find((span) => span.text === 'also').italic, true);
assert.equal(knowledgePlainText(markedLine).includes('**'), false);
assert.equal(knowledgeDocFromMarkdown('  - nested')[0].indent, 1);
assert.equal(knowledgeDocFromMarkdown('*italic* stays')[0].type, 'p');
assert.equal(knowledgeDocFromMarkdown('a_b_c')[0].spans[0].text, 'a_b_c');
const longLines = ['# Notes'];
for (let n = 1; n <= 150; n += 1) longLines.push(`- Line ${n} \u2014 \u201cquoted\u201d ${n} with $1.6M`);
const longDoc = knowledgeDocFromMarkdown(longLines.join('\n'));
assert.equal(longDoc.length, 151);
assert.equal(longDoc[0].type, 'h1');
assert.equal(longDoc[150].type, 'li');
assert.equal(longDoc[150].spans[0].text, 'Line 150 \u2014 \u201cquoted\u201d 150 with $1.6M');
const longPlain = knowledgePlainText(longDoc);
assert.equal(longPlain.split('\n').length, 151);
assert.equal(longPlain.includes('\u2014'), true);
assert.equal(longPlain.includes('\u201cquoted\u201d'), true);
assert.equal(longPlain.includes('**'), false);
assert.equal(normalizeKnowledge({ title: 'Long', doc: longDoc }, clock).doc.length, 151);
const htmlDoc = knowledgeDocFromHtml('<h1>Title</h1><p>Hello <b>bold</b> and <i>italic</i></p><ul><li>One<ul><li>Nested</li></ul></li></ul><script>alert(1)</script><img src=x onerror="alert(1)">');
assert.equal(htmlDoc[0].type, 'h1');
assert.equal(htmlDoc[0].spans[0].text, 'Title');
assert.equal(htmlDoc.find((block) => block.type === 'p').spans.find((span) => span.text === 'bold').bold, true);
assert.equal(htmlDoc.find((block) => block.type === 'p').spans.find((span) => span.text === 'italic').italic, true);
assert.equal(htmlDoc.filter((block) => block.type === 'li')[0].spans[0].text, 'One');
assert.equal(htmlDoc.filter((block) => block.type === 'li')[0].indent, 0);
assert.equal(htmlDoc.filter((block) => block.type === 'li')[1].indent, 1);
assert.equal(knowledgePlainText(htmlDoc).includes('alert'), false);
assert.equal(knowledgeDocFromHtml('<p>a &lt; b &mdash; &ldquo;q&rdquo;</p>')[0].spans[0].text, 'a < b \u2014 \u201cq\u201d');
const docsWrap = knowledgePasteDoc('<b style="font-weight:normal"><h2>Role</h2><p>Say <span style="font-weight:700">yes</span></p></b>', 'Role');
assert.equal(docsWrap[0].type, 'h2');
assert.equal(docsWrap[0].spans[0].bold, false);
assert.equal(docsWrap[1].spans.find((span) => span.text === 'yes').bold, true);
assert.equal(knowledgePasteDoc('<div># Title</div>', '# Title')[0].type, 'h1');
const pastedBlocks = insertKnowledgeBlocks(
  [{ type: 'p', indent: 0, spans: [] }],
  { index: 0, offset: 0 },
  sampleDoc,
);
assert.equal(pastedBlocks.changed, true);
assert.equal(pastedBlocks.doc.find((block) => block.type === 'h1').spans[0].text, 'Title');
const italicPacked = serializeBook({ knowledge: [italicPage] });
const italicReloaded = normalizeStore(JSON.parse(italicPacked.json), clock);
assert.equal(italicReloaded.knowledge[0].doc[0].spans[1].italic, true);
assert.equal(italicReloaded.knowledge[0].body, 'hello there');
assert.equal(bookIsEmpty(kb), false);
assert.equal(shouldBlockEmptyOverwrite(emptyStore(), kb), true);
assert.equal(listingSummary(kb).knowledge, 2);
kb = deleteKnowledge(kb, kb.knowledge[0].id);
assert.equal(kb.knowledge.length, 1);
const packedKb = serializeBook(kb);
const reloadedKb = normalizeStore(JSON.parse(packedKb.json), clock);
assert.equal(reloadedKb.knowledge[0].title, 'Hobby plan');
assert.equal(reloadedKb.entries.length, 0);

assert.equal(careerNeedsSeed(emptyStore()), true);
assert.equal(bookIsEmpty(emptyStore()), true);
const starter = seedStarterResume(emptyStore(), clock);
assert.equal(starter.profile.name, 'John Doe');
assert.equal(starter.profile.email, 'john.doe@example.com');
assert.equal(starter.profile.phone, '(555) 010-0000');
assert.equal(starter.jobs.length, 2);
assert.equal(starter.jobs[0].company, 'Example Financial Group');
assert.ok(starter.jobs[0].groups.length >= 2);
assert.equal(starter.credentials[0].name, 'Example Professional License');
assert.equal(starter.education[0].school, 'Example University');
assert.equal(starter.additional.length, 2);
assert.deepEqual(starter.resumeSettings.sectionOrder, DEFAULT_SECTION_ORDER.slice());
const starterDoc = compileResumeDoc(null, starter);
assert.equal(starterDoc.header.name, 'John Doe');
assert.equal(starterDoc.sections.experience.jobs.length, 2);
assert.equal(starterDoc.sections.credentials.items.length, 1);
assert.equal(isResumeDoc(STARTER_RESUME_DOC), true);
const namedHeader = { ...emptyStore(), profile: { ...emptyStore().profile, name: 'Ada' } };
assert.equal(careerNeedsSeed(namedHeader), false);
assert.equal(seedStarterResume(namedHeader, clock).profile.name, 'Ada');
assert.equal(seedStarterResume(namedHeader, clock).jobs.length, 0);
let withWins = addEntry(emptyStore(), { title: 'Kept win' }, clock);
assert.equal(careerNeedsSeed(withWins), true);
withWins = seedStarterResume(withWins, clock);
assert.equal(withWins.entries[0].title, 'Kept win');
assert.equal(withWins.profile.name, 'John Doe');
const forbidden = /inaayat|gill|pricewaterhouse|alaska airlines|university of washington|foster school|washington state board|inaayat@gmail|55864|job_pwc|job_alaska/i;
const starterBlob = JSON.stringify(STARTER_RESUME_DOC);
assert.equal(forbidden.test(starterBlob), false);
const previewHtml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../brag-book/sample-preview.html'), 'utf8');
assert.equal(forbidden.test(previewHtml), false);
assert.match(previewHtml, /John Doe/);
assert.doesNotMatch(previewHtml, /inaayat-gill-resume/);

const liveCareer = applyImportedResume(emptyStore(), sampleResume, clock);
assert.equal(careerNeedsSeed(liveCareer), false);
assert.equal(seedStarterResume(liveCareer, clock), liveCareer);
assert.equal(liveCareer.profile.name, 'Inaayat Gill');
assert.equal(liveCareer.profile.email, 'inaayat@gmail.com');
assert.equal(liveCareer.jobs[0].company, 'PricewaterhouseCoopers LLC');
assert.equal(emptyStore().jobs.length, 0);
assert.equal(emptyStore().profile.name, '');

const homeCards = homeStartCards();
assert.equal(homeCards.length, 3);
assert.equal(homeCards.filter((card) => card.combined).length, 1);
assert.equal(homeCards.some((card) => card.view?.kind === 'kb'), false);
assert.deepEqual(homeCards.find((card) => card.combined).view, { kind: 'log' });

for (const hash of ['#kb', '#knowledge', '#experiences']) {
  const plan = bookPagePlan(parseViewHash(hash));
  assert.equal(plan.experiences, true);
  assert.equal(plan.knowledge, true);
}
assert.equal(bookPagePlan(parseViewHash('#kb')).focus, 'knowledge');
assert.equal(bookPagePlan(parseViewHash('#knowledge')).focus, 'knowledge');
assert.equal(bookPagePlan(parseViewHash('#experiences')).focus, 'experiences');
assert.deepEqual(bookPagePlan(parseViewHash('#experiences')).tabs.map((tab) => tab.label), ['Resume bullets', 'Knowledge']);
assert.deepEqual(bookPagePlan(parseViewHash('#kb')).tabs.map((tab) => tab.kind), ['log', 'kb']);
const notedPlan = bookPagePlan(parseViewHash('#kb/note_1', { knowledgeIds: ['note_1'] }));
assert.equal(notedPlan.knowledge, true);
assert.equal(notedPlan.experiences, true);
assert.equal(notedPlan.knowledgeId, 'note_1');
assert.equal(bookPagePlan({ kind: 'home' }), null);

let inlineRows = addEntry(emptyStore(), {
  title: 'Keep me',
  company: 'Untouched Co',
  role: 'Reader',
  situation: 'Leave this',
}, clock);
inlineRows = addEntry(inlineRows, {
  title: 'Edit me',
  company: 'Old Co',
  role: 'Old role',
  situation: 'Before',
}, clock);
const keepId = inlineRows.entries.find((entry) => entry.title === 'Keep me').id;
const editId = inlineRows.entries.find((entry) => entry.title === 'Edit me').id;
const beforeCount = inlineRows.entries.length;
const beforeIds = inlineRows.entries.map((entry) => entry.id).sort();
for (const entry of inlineRows.entries) {
  const spec = experienceRowSpec(entry);
  assert.equal(spec.requiresInteraction, false);
  assert.deepEqual(spec.controls.map((control) => control.key), ['jobId', 'situation', 'task', 'action', 'result']);
  assert.equal(spec.controls.find((control) => control.key === 'jobId').label, 'Job');
  assert.equal(spec.controls.find((control) => control.key === 'jobId').kind, 'job');
  assert.equal(spec.controls.some((control) => control.key === 'company' || control.key === 'role'), false);
  assert.equal(spec.controls.filter((control) => control.column === 'star').length, 4);
}
inlineRows = updateEntry(inlineRows, editId, experienceDetailPatch({
  title: 'Edit me revised',
  rich: [{ text: 'Edit me revised', bold: false }],
  company: 'GoDaddy',
  role: 'Analyst',
  jobId: 'rj_row',
  situation: 'The queue was split.',
  task: 'Close it in one place.',
  action: 'Wrote the four fields on the row.',
  result: 'One entry, no duplicate.',
  kind: 'skillset',
  when: '1999',
}), clock);
assert.equal(inlineRows.entries.length, beforeCount);
assert.deepEqual(inlineRows.entries.map((entry) => entry.id).sort(), beforeIds);
assert.equal(inlineRows.entries.filter((entry) => entry.id === editId).length, 1);
assert.equal(inlineRows.entries.find((entry) => entry.id === keepId).title, 'Keep me');
assert.equal(inlineRows.entries.find((entry) => entry.id === keepId).situation, 'Leave this');
const edited = inlineRows.entries.find((entry) => entry.id === editId);
assert.equal(edited.title, 'Edit me revised');
assert.equal(edited.company, 'GoDaddy');
assert.equal(edited.role, 'Analyst');
assert.equal(edited.kind === 'skillset', false);
assert.equal(edited.when === '1999', false);
const editedSpec = experienceRowSpec(edited);
assert.equal(editedSpec.requiresInteraction, false);
assert.equal(edited.jobId, 'rj_row');
assert.equal(editedSpec.controls.find((control) => control.key === 'jobId').value, 'rj_row');
assert.equal(editedSpec.controls.some((control) => control.key === 'company' || control.key === 'role'), false);
assert.equal(editedSpec.controls.find((control) => control.key === 'situation').value, 'The queue was split.');
assert.equal(editedSpec.controls.find((control) => control.key === 'task').value, 'Close it in one place.');
assert.equal(editedSpec.controls.find((control) => control.key === 'action').value, 'Wrote the four fields on the row.');
assert.equal(editedSpec.controls.find((control) => control.key === 'result').value, 'One entry, no duplicate.');

const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
const engineImport = appSource.slice(0, appSource.indexOf("from './engine.js'"));
assert.match(engineImport, /\bsearchKnowledge\b/);
assert.match(appSource, /bookPagePlan\(view\)/);
assert.match(appSource, /experienceRowSpec\(/);
assert.match(appSource, /sharedBulletForm\(/);
assert.match(appSource, /experienceAdderChrome\(/);
assert.match(appSource, /nextExperienceAdderOpen\(/);
assert.match(appSource, /resumeBulletArrows\(/);
assert.match(appSource, /visibleNodes\(/);
assert.match(appSource, /visibleResumeBullets\(/);
assert.match(appSource, /resumeGroupChrome\(/);
assert.match(appSource, /removeResumeGroup\(/);
assert.match(appSource, /\+ Sub-heading/);
assert.doesNotMatch(appSource, /if \(posting && localGroup\) \{\s*store = deletePostingLocalGroup/);
assert.match(appSource, /includeExcluded: !posting/);
assert.match(appSource, /chrome\.showForm/);
assert.match(appSource, /saveSharedBullet/);
assert.match(appSource, /SHARED_BULLET_FIELDS/);
assert.doesNotMatch(appSource, /function experienceEditor[\s\S]*aria-label': 'Role'/);
assert.match(appSource, /homeStartCards\(/);
assert.match(appSource, /Resume bullets & knowledge/);
assert.doesNotMatch(appSource, /Experiences & knowledge/);
assert.match(appSource, /Recent resume bullets/);
assert.match(appSource, /Search resume bullets, companies, STAR/);
assert.match(appSource, /aria-label': 'Search resume bullets'/);
assert.doesNotMatch(appSource, /aria-label': 'Search experiences'/);
assert.doesNotMatch(appSource, /No experiences yet/);
assert.match(appSource, /bb-book-tab/);
assert.equal(jobCatalogEditEffects('input').render, false);
assert.equal(jobCatalogEditEffects('input').save, true);
assert.equal(jobCatalogEditEffects('blur').render, false);
assert.equal(jobCatalogEditEffects('blur').save, true);
assert.equal(jobCatalogEditEffects('click').render, false);
assert.ok(JOB_CATALOG_SAVE_MS >= 200);
const godaddyKeys = jobCatalogFocusKeys('rj_gd');
const pwcKeys = jobCatalogFocusKeys('rj_pwc');
assert.equal(godaddyKeys.title, 'job-title-rj_gd');
assert.notEqual(godaddyKeys.title, pwcKeys.title);
assert.equal(new Set([...Object.values(godaddyKeys), ...Object.values(pwcKeys)]).size, 8);
assert.match(appSource, /jobCatalogEditEffects\('input'\)/);
assert.match(appSource, /jobCatalogEditEffects\('blur'\)/);
assert.match(appSource, /JOB_CATALOG_SAVE_MS/);
assert.doesNotMatch(appSource, /blur', \(\) => render\(\{ focusKey: node\.getAttribute\('data-focus-key'\) \}\)/);
assert.match(appSource, /Set up your jobs/);
assert.match(appSource, /Italic/);
assert.match(appSource, /knowledgeEditEffects\('input'\)/);
assert.match(appSource, /knowledgeEditEffects\('toolbar'\)/);
assert.match(appSource, /applyKnowledgeListMarker/);
assert.match(appSource, /applyKnowledgeEnter/);
assert.match(appSource, /applyKnowledgeTab/);
assert.match(appSource, /knowledgeMarkShortcut\(event\)/);
assert.match(appSource, /execCommand\(shortcut\.command\)/);
assert.match(appSource, /event\.stopPropagation\(\)/);
assert.match(appSource, /knowledgePasteDoc/);
assert.match(appSource, /setKnowledgeHeading/);
assert.match(appSource, /H1/);
assert.match(appSource, /Unassigned/);
assert.match(appSource, /\+ New job/);
assert.match(appSource, /tailored for this posting/);
assert.match(appSource, /Reset to job title/);
assert.match(appSource, /Restore hidden rows/);
assert.match(appSource, /Delete from Resume basics too/);
assert.match(appSource, /Replace Resume basics with this posting’s resume/);
assert.match(appSource, /Restore previous basics/);
assert.match(appSource, /Edit the Resume basics template here/);
assert.doesNotMatch(appSource, /Add sub-label/);
assert.doesNotMatch(appSource, /addResumeAdditionalGroup\(store, posting/);
assert.doesNotMatch(appSource, /aria-label': 'Sub-label'/);
assert.match(appSource, /editResumeAdditionalRow\(store, posting\?\.id, row\.id/);
assert.match(appSource, /execCommand\('italic'\)/);
const addlEditor = appSource.slice(appSource.indexOf("resumeSectionHead('Additional info'"), appSource.indexOf('function resumeWorkspace'));
assert.doesNotMatch(addlEditor, /btn\('Bold'/);
assert.doesNotMatch(addlEditor, /btn\('Italic'/);
assert.doesNotMatch(addlEditor, /splitResumeItems/);
assert.doesNotMatch(addlEditor, /groups: \[\]/);
assert.match(addlEditor, /knowledgeMarkShortcut\(event\)/);
assert.match(addlEditor, /execCommand\(shortcut\.command\)/);
assert.match(addlEditor, /event\.stopPropagation\(\)/);
assert.match(addlEditor, /rich: spans/);
const addlChange = addlEditor.slice(addlEditor.indexOf('onChange:'), addlEditor.indexOf('const stampLabel'));
assert.doesNotMatch(addlChange, /render\(/);
assert.match(addlChange, /scheduleResumePreview\(posting\)/);
assert.doesNotMatch(appSource, /btn\('Bold'/);
const richKeys = appSource.slice(appSource.indexOf('function bindRichKeys'), appSource.indexOf('function richLine'));
assert.match(richKeys, /key === 'b'/);
assert.match(richKeys, /key === 'i'/);
assert.match(richKeys, /event\.preventDefault\(\)/);
assert.match(richKeys, /execCommand\('bold'\)/);
assert.match(richKeys, /execCommand\('italic'\)/);
const stampLabelSource = appSource.slice(appSource.indexOf('const stampLabel'), appSource.indexOf('label.addEventListener', appSource.indexOf('const stampLabel')));
assert.doesNotMatch(stampLabelSource, /render\(/);
assert.match(stampLabelSource, /scheduleResumePreview\(posting\)/);
assert.match(appSource, /basicsReplaceConfirm/);
assert.match(appSource, /basicsRestoreConfirm/);
const bookCss = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
const sheetCss = bookCss.match(/\.bb-kb-sheet \{[^}]+\}/);
assert.ok(sheetCss);
assert.match(sheetCss[0], /background:\s*#fff/);
assert.match(sheetCss[0], /box-shadow:/);
assert.match(bookCss, /\.bb-kb-editor \{[^}]*background:\s*#e7e2da/);
const jobRoleCss = bookCss.match(/\.bb-exp-jobrole \.bb-cell-input[^{]*\{[^}]+\}/);
const starCss = bookCss.match(/\.bb-inline-area \{[^}]+\}/);
assert.ok(jobRoleCss);
assert.ok(starCss);
assert.match(jobRoleCss[0], /font-family:\s*var\(--content-font\)/);
assert.match(jobRoleCss[0], /font-size:\s*0\.82rem/);
assert.match(jobRoleCss[0], /line-height:\s*1\.35/);
assert.match(jobRoleCss[0], /min-height:\s*0/);
assert.match(starCss[0], /font-family:\s*var\(--content-font\)/);
assert.match(starCss[0], /font-size:\s*0\.82rem/);
assert.match(starCss[0], /line-height:\s*1\.35/);
const catalogCss = bookCss.match(/\.bb-job-catalog-row \{[^}]+\}/);
assert.ok(catalogCss);
assert.match(catalogCss[0], /minmax\(0,\s*1fr\)/);
assert.match(catalogCss[0], /minmax\(0,\s*1\.15fr\)/);
assert.match(catalogCss[0], /minmax\(0,\s*0\.85fr\)/);
assert.match(catalogCss[0], /minmax\(0,\s*0\.8fr\)/);
assert.match(catalogCss[0], /min-width:\s*0/);
assert.match(bookCss, /\.bb-job-catalog-row > input,\s*\.bb-new-job > input \{[^}]*min-width:\s*0/);
assert.doesNotMatch(catalogCss[0], /1\.2fr 1\.2fr 1fr 1fr auto/);
assert.doesNotMatch(appSource, /Start fresh to hide shared/);
assert.match(appSource, /Search resume bullets/);
assert.match(appSource, /Type to search resume bullets/);
assert.match(appSource, /placeLibraryBullet/);
assert.match(appSource, /addPostingResumeJob/);
assert.match(appSource, /Added that job and its mapped bullets/);
assert.match(appSource, /disabled: true, selected: true/);
const pickerSrc = appSource.slice(
  appSource.indexOf('function libraryBulletPicker'),
  appSource.indexOf('function addSubheadingButton'),
);
assert.match(pickerSrc, /Type to search resume bullets/);
assert.doesNotMatch(pickerSrc, /addEventListener\('focus'/);
assert.match(appSource, /\bInclude\b/);
assert.match(appSource, /\bPin\b/);
assert.doesNotMatch(appSource, /Reset to source/);
assert.doesNotMatch(appSource, /Save back to source/);
assert.doesNotMatch(appSource, /writeBulletBackToSource/);
assert.doesNotMatch(appSource, /clearBulletOverride/);
assert.doesNotMatch(appSource, /Resume wording/);
const bulletEditorSrc = appSource.slice(
  appSource.indexOf('function resumeBulletEditor'),
  appSource.indexOf('function resumeJobIds'),
);
assert.doesNotMatch(bulletEditorSrc, /btn\('Reset to source'/);
assert.doesNotMatch(bulletEditorSrc, /btn\('Save back to source'/);
assert.doesNotMatch(bulletEditorSrc, /btn\('Bold'/);
assert.match(bulletEditorSrc, /italic: true/);
const bulletCommit = bulletEditorSrc.slice(bulletEditorSrc.indexOf('const commitWording'), bulletEditorSrc.indexOf('const line ='));
assert.doesNotMatch(bulletCommit, /render\(/);
assert.match(bulletCommit, /scheduleResumePreview\(posting\)/);
assert.match(bulletEditorSrc, /bullet\.hasOverride \? el\('span', \{ class: 'tiny' \}, 'This posting only'\)/);
assert.doesNotMatch(bulletEditorSrc, /localBullet \? el\('span', \{ class: 'tiny' \}, 'This posting only'\)/);
assert.doesNotMatch(appSource, /experienceIsOpen/);
assert.doesNotMatch(appSource, /toggleExperience/);
assert.doesNotMatch(appSource, /Expand experience/);

await renderBookPage('#kb');
await renderBookPage('#knowledge');
await renderBookPage('#experiences');
const reqApp = await renderRequirementsPage();
const reqHtml = nodeMarkup(reqApp);
const reqText = reqApp.textContent;
assert.match(reqText, /Need close experience/);
assert.match(reqText, /Need a second row/);
assert.match(reqText, /\+ New/);
assert.equal(reqApp.querySelectorAll('.experience-add').length, 2);
assert.equal(reqApp.querySelectorAll('.bb-shared-bullet').length, 0);
assert.doesNotMatch(reqHtml, /null/);
assert.doesNotMatch(reqHtml, /undefined/);
assert.doesNotMatch(reqText, /null/);
assert.doesNotMatch(reqText, /undefined/);
const navHtml = readFileSync(new URL('../brag-book/index.html', import.meta.url), 'utf8');
assert.match(navHtml, /Resume bullets/);
assert.doesNotMatch(navHtml, />Experiences</);

console.log('ok');

function installBookDom(hash, extras = {}) {
  class El {
    constructor(tag) {
      this.tagName = String(tag || '').toUpperCase();
      this.nodeType = 1;
      this.children = [];
      this.attrs = {};
      this.dataset = {};
      this.style = {};
      this.className = '';
      this.hidden = false;
      this.value = '';
      this.parentNode = null;
      this.nodeValue = '';
    }
    get classList() {
      return { toggle() {}, add() {}, remove() {}, contains() { return false; } };
    }
    setAttribute(key, value) {
      this.attrs[key] = String(value);
      if (key === 'id') this.id = String(value);
    }
    getAttribute(key) { return this.attrs[key] ?? null; }
    addEventListener() {}
    append(...nodes) {
      for (const node of nodes) {
        let child = node;
        if (child == null || typeof child !== 'object') {
          const text = new El('#text');
          text.nodeType = 3;
          text.nodeValue = String(child);
          child = text;
        }
        child.parentNode = this;
        this.children.push(child);
      }
    }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    get childNodes() { return this.children; }
    get textContent() {
      if (this.nodeType === 3) return this.nodeValue || '';
      return this.children.map((child) => child.textContent || '').join('');
    }
    set textContent(value) {
      const text = document.createTextNode(String(value));
      this.children = [text];
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const child of node.children || []) {
          if (matches(child, sel)) out.push(child);
          walk(child);
        }
      };
      walk(this);
      return out;
    }
    focus() {}
    click() {}
    remove() {}
    contains() { return false; }
  }
  function matches(node, sel) {
    if (!node || node.nodeType === 3) return false;
    if (sel.startsWith('#')) return node.id === sel.slice(1);
    if (sel.startsWith('.')) return String(node.className || '').split(/\s+/).includes(sel.slice(1));
    if (sel.startsWith('[') && sel.endsWith(']')) {
      const body = sel.slice(1, -1);
      const eq = body.indexOf('=');
      if (eq === -1) return node.attrs[body] != null;
      const key = body.slice(0, eq);
      const raw = body.slice(eq + 1).replace(/^"|"$/g, '');
      return node.attrs[key] === raw;
    }
    return node.tagName === sel.toUpperCase();
  }
  const app = new El('main');
  app.id = 'app';
  const body = new El('body');
  const legal = new El('p');
  legal.className = 'legal';
  const auth = new El('a');
  auth.id = 'nav-auth-link';
  body.append(app, legal, auth);
  const document = {
    body,
    activeElement: null,
    getElementById(id) { return id === 'app' ? app : body.querySelector(`#${id}`); },
    createElement(tag) { return new El(tag); },
    createElementNS(_ns, tag) { return new El(tag); },
    createTextNode(text) {
      const node = new El('#text');
      node.nodeType = 3;
      node.nodeValue = String(text);
      return node;
    },
    querySelector(sel) { return body.querySelector(sel); },
    querySelectorAll(sel) { return body.querySelectorAll(sel); },
    addEventListener() {},
    createRange() {
      return { selectNodeContents() {}, setStart() {}, setEnd() {}, collapse() {}, toString() { return ''; } };
    },
    getSelection() { return null; },
    execCommand() { return false; },
  };
  globalThis.document = document;
  globalThis.HTMLElement = El;
  globalThis.HTMLInputElement = class extends El {};
  globalThis.HTMLTextAreaElement = class extends El {};
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  globalThis.confirm = () => false;
  globalThis.location = {
    hash,
    search: '?local=1',
    href: `http://127.0.0.1:8080/brag-book/?local=1${hash}`,
  };
  globalThis.window = {
    addEventListener() {},
    scrollTo() {},
    scrollX: 0,
    scrollY: 0,
    location: globalThis.location,
  };
  const mem = new Map();
  mem.set('brag-book-store-v1', JSON.stringify({
    entries: [
      {
        id: 'en_row',
        title: 'Led the close',
        company: 'GoDaddy',
        role: 'Analyst',
        situation: 'Books were late',
        task: 'Close faster',
        action: 'Rebuilt the checklist',
        result: 'Cut two days',
        kind: 'experience',
      },
      {
        id: 'en_two',
        title: 'Second line',
        company: 'Other Co',
        role: 'Associate',
        situation: 'Second situation',
        task: 'Second task',
        action: 'Second action',
        result: 'Second result',
      },
    ],
    knowledge: [{ id: 'note_1', title: 'Neon notes', body: 'JWT lives in localStorage' }],
    postings: extras.postings || [],
  }));
  globalThis.localStorage = {
    getItem: (key) => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => mem.set(key, String(value)),
    removeItem: (key) => mem.delete(key),
  };
  return { app };
}

async function renderBookPage(hash) {
  const { app } = installBookDom(hash);
  const href = new URL(`../brag-book/app.js?hash=${encodeURIComponent(hash)}`, import.meta.url);
  await import(href);
  const labels = app.querySelectorAll('[aria-label]').map((node) => node.getAttribute('aria-label'));
  const text = app.textContent;
  const tabs = app.querySelectorAll('.bb-book-tab');
  assert.equal(text.includes('Opening the book'), false);
  assert.match(text, /Resume bullets & knowledge/);
  assert.deepEqual(tabs.map((tab) => tab.textContent), ['Resume bullets', 'Knowledge']);
  const selected = tabs.filter((tab) => String(tab.className).includes('is-on')).map((tab) => tab.textContent);
  const knowledge = hash === '#kb' || hash === '#knowledge';
  assert.deepEqual(selected, [knowledge ? 'Knowledge' : 'Resume bullets']);
  if (knowledge) {
    assert.match(text, /Search pages|New page|Neon notes/);
    assert.match(text, /Neon notes/);
    assert.doesNotMatch(text, /Led the close/);
    assert.equal(app.querySelectorAll('[data-star="always"]').length, 0);
    assert.equal(app.querySelector('#book-knowledge') != null, true);
    assert.equal(app.querySelector('#book-experiences'), null);
  } else {
    assert.match(text, /Led the close/);
    assert.match(text, /Second line/);
    assert.doesNotMatch(text, /Neon notes/);
    assert.match(text, /\+ Add resume bullet/);
    const placeholders = app.querySelectorAll('input').map((node) => node.getAttribute('placeholder'));
    assert.equal(placeholders.includes('Search resume bullets, companies, STAR…'), true);
    assert.equal(placeholders.includes('Search pages'), false);
    for (const label of ['Job', 'Situation', 'Task', 'Action', 'Result']) {
      assert.equal(labels.filter((item) => item === label).length, 2, `${hash} ${label}`);
    }
    assert.equal(labels.filter((item) => item === 'Role').length, 0);
    assert.match(text, /Unassigned/);
    assert.match(text, /Set up your jobs/);
    assert.equal(app.querySelectorAll('[data-star="always"]').length, 2);
    assert.match(text, /Books were late/);
    assert.match(text, /Second result/);
    assert.equal(app.querySelector('#book-experiences') != null, true);
    assert.equal(app.querySelector('#book-knowledge'), null);
  }
  assert.equal(app.querySelectorAll('[aria-label="Expand experience"]').length, 0);
}

function nodeMarkup(node) {
  if (!node) return '';
  if (node.nodeType === 3 || String(node.tagName || '').toLowerCase() === '#text') {
    return node.nodeValue || '';
  }
  const name = String(node.tagName || 'div').toLowerCase();
  return `<${name}>${(node.children || []).map(nodeMarkup).join('')}</${name}>`;
}

async function renderRequirementsPage() {
  const { app } = installBookDom('#jobs/job_req_map', {
    postings: [{
      id: 'job_req_map',
      title: 'Close role',
      company: 'Acme',
      requirements: [
        { id: 'rq_one', text: 'Need close experience', bullets: [] },
        { id: 'rq_two', text: 'Need a second row', bullets: [] },
      ],
    }],
  });
  const href = new URL('../brag-book/app.js?hash=%23jobs%2Fjob_req_map', import.meta.url);
  await import(href);
  return app;
}

const looseJobs = normalizeStore({
  entries: [{ id: 'en_loose', title: 'Closed the books', company: 'Acme', role: 'Analyst' }],
});
assert.equal(looseJobs.entries[0].jobId, '');
assert.equal(looseJobs.jobs.length, 0);
assert.equal(looseJobs.jobSetup, null);

let jobBook = addEntry(emptyStore(), { id: 'en_acme', title: 'Closed the books', company: 'Acme', role: 'Analyst' }, clock);
jobBook = addEntry(jobBook, { id: 'en_acme_2', title: 'Closed them again', company: 'Acme', role: 'Senior Analyst' }, clock);
jobBook = addEntry(jobBook, { id: 'en_beta', title: 'Drew the diagram', company: 'Beta', role: 'Designer' }, clock);
jobBook = addEntry(jobBook, { id: 'en_plain', title: 'No employer yet' }, clock);
jobBook = addKnowledge(jobBook, { id: 'kb_keep', title: 'Leave this note', body: 'Untouched' }, clock);
const suggested = suggestJobSetup(jobBook);
assert.equal(suggested.needed, true);
assert.equal(suggested.proposals.length, 2);
const acmeProposal = suggested.proposals.find((proposal) => proposal.company === 'Acme');
assert.ok(acmeProposal);
assert.deepEqual(acmeProposal.entryIds.sort(), ['en_acme', 'en_acme_2']);
assert.equal(acmeProposal.sources.length, 2);
assert.equal(suggestJobSetup({ ...jobBook, jobSetup: { status: 'done', savedAt: '2026-10-05T12:00:00.000Z' } }).needed, false);
assert.equal(suggestJobSetup({ ...jobBook, jobSetup: { status: 'later', savedAt: '2026-10-05T12:00:00.000Z' } }).needed, false);

const beforeKnowledge = JSON.stringify(jobBook.knowledge);
const beforePlain = jobBook.entries.find((entry) => entry.id === 'en_plain');
const applied = applyJobSetup(jobBook, { proposalIds: suggested.proposals.map((proposal) => proposal.id) }, clock, random);
assert.equal(applied.jobSetup.status, 'done');
assert.equal(applied.jobs.length, 2);
assert.equal(applied.jobs.every((job) => job.onResume === false), true);
assert.equal(compileResumeDoc(null, applied).sections.experience.jobs.length, 0);
const acmeJob = applied.jobs.find((job) => job.company === 'Acme');
const betaJob = applied.jobs.find((job) => job.company === 'Beta');
assert.equal(applied.entries.find((entry) => entry.id === 'en_acme').jobId, acmeJob.id);
assert.equal(applied.entries.find((entry) => entry.id === 'en_acme').company, 'Acme');
assert.equal(applied.entries.find((entry) => entry.id === 'en_acme').role, acmeJob.title);
assert.equal(applied.entries.find((entry) => entry.id === 'en_acme_2').jobId, acmeJob.id);
assert.equal(applied.entries.find((entry) => entry.id === 'en_beta').jobId, betaJob.id);
assert.equal(applied.entries.find((entry) => entry.id === 'en_plain').jobId, '');
assert.equal(applied.entries.find((entry) => entry.id === 'en_plain').title, beforePlain.title);
assert.equal(JSON.stringify(applied.knowledge), beforeKnowledge);
assert.equal(suggestJobSetup(applied).needed, false);

const dismissed = dismissJobSetup(jobBook, clock);
assert.equal(dismissed.jobSetup.status, 'later');
assert.equal(dismissed.jobs.length, 0);
assert.equal(dismissed.entries.find((entry) => entry.id === 'en_acme').jobId, '');

let mergedJobs = addCareerJob(emptyStore(), {
  id: 'rj_keep',
  company: 'Acme',
  title: 'Analyst',
  onResume: false,
  groups: [{ id: 'rg_keep', heading: 'Close', bullets: [] }],
}, clock);
mergedJobs = addCareerJob(mergedJobs, {
  id: 'rj_drop',
  company: 'Acme',
  title: 'Senior Analyst',
  onResume: true,
  groups: [{ id: 'rg_drop', heading: 'Review', bullets: [] }],
}, clock);
mergedJobs = addEntry(mergedJobs, { id: 'en_drop', title: 'Reviewed it', company: 'Acme', role: 'Senior Analyst', jobId: 'rj_drop' }, clock);
mergedJobs = mergeJobs(mergedJobs, 'rj_keep', 'rj_drop', clock);
assert.deepEqual(mergedJobs.jobs.map((job) => job.id), ['rj_keep']);
assert.equal(mergedJobs.jobs[0].onResume, true);
assert.deepEqual(mergedJobs.jobs[0].groups.map((group) => group.id), ['rg_keep', 'rg_drop']);
assert.equal(mergedJobs.entries[0].jobId, 'rj_keep');
assert.equal(mergedJobs.entries[0].company, 'Acme');
assert.equal(mergedJobs.entries[0].role, 'Analyst');

let linked = addCareerJob(emptyStore(), {
  id: 'rj_cat',
  company: 'Acme',
  title: 'Analyst',
  location: 'NY',
  start: '2020',
  end: '2024',
  onResume: false,
}, clock);
linked = addEntry(linked, { id: 'en_linked', title: 'Closed the books', company: 'Acme', role: 'Analyst', jobId: 'rj_cat' }, clock);
linked = addEntry(linked, { id: 'en_other', title: 'Elsewhere', company: 'Beta', role: 'Designer', jobId: '' }, clock);
linked = addPosting(linked, { id: 'job_a', title: 'Posting A' }, clock);
linked = addPosting(linked, { id: 'job_b', title: 'Posting B' }, clock);
linked = addPostingLocalJob(linked, 'job_a', {
  id: 'rj_local',
  company: 'Old Co',
  title: 'Old title',
  jobId: 'rj_cat',
}, {}, clock);
const otherResume = linked.postings.find((posting) => posting.id === 'job_b').resume;
let shown = compileResumeDoc(linked.postings.find((posting) => posting.id === 'job_a'), linked);
let catalogLocal = shown.sections.experience.jobs.find((job) => job.id === 'rj_local');
assert.equal(catalogLocal.company, 'Acme');
assert.equal(catalogLocal.title, 'Analyst');
assert.equal(catalogLocal.location, 'NY');
assert.equal(compileResumeDoc(null, linked).sections.experience.jobs.some((job) => job.id === 'rj_cat'), false);
linked = updateCareerJob(linked, 'rj_cat', { company: 'Acme Inc', title: 'Senior Analyst', location: 'Remote' }, clock);
assert.equal(linked.entries.find((entry) => entry.id === 'en_linked').company, 'Acme Inc');
assert.equal(linked.entries.find((entry) => entry.id === 'en_linked').role, 'Senior Analyst');
assert.equal(linked.entries.find((entry) => entry.id === 'en_other').company, 'Beta');
assert.equal(linked.entries.find((entry) => entry.id === 'en_other').role, 'Designer');
const storedLocal = linked.postings.find((posting) => posting.id === 'job_a').resume.localJobs.find((job) => job.id === 'rj_local');
assert.equal(storedLocal.company, 'Acme Inc');
assert.equal(storedLocal.title, 'Senior Analyst');
assert.equal(storedLocal.location, 'Remote');
linked = updatePostingResume(linked, 'job_a', { jobTitles: { rj_local: 'Tailored analyst' } }, clock);
shown = compileResumeDoc(linked.postings.find((posting) => posting.id === 'job_a'), linked);
catalogLocal = shown.sections.experience.jobs.find((job) => job.id === 'rj_local');
assert.equal(catalogLocal.title, 'Tailored analyst');
assert.equal(catalogLocal.company, 'Acme Inc');
assert.equal(linked.jobs.find((job) => job.id === 'rj_cat').title, 'Senior Analyst');

assert.equal(compileResumeDoc(null, linked).sections.experience.jobs.some((job) => job.id === 'rj_cat'), false);
linked = placeJobOnResume(linked, null, 'rj_cat', clock);
assert.equal(linked.jobs.find((job) => job.id === 'rj_cat').onResume, true);
assert.equal(compileResumeDoc(null, linked).sections.experience.jobs.some((job) => job.id === 'rj_cat'), true);
linked = updateCareerJob(linked, 'rj_cat', { onResume: false }, clock);
const resumeBefore = linked.postings.find((posting) => posting.id === 'job_b').resume;
linked = placeJobOnResume(linked, 'job_a', 'rj_cat', clock);
assert.ok(linked.postings.find((posting) => posting.id === 'job_a').resume.includedJobIds.includes('rj_cat'));
assert.equal(linked.postings.find((posting) => posting.id === 'job_a').resume.localJobs.some((job) => job.company === 'Acme Inc' && job.id !== 'rj_local'), false);
assert.deepEqual(linked.postings.find((posting) => posting.id === 'job_b').resume, resumeBefore);
assert.deepEqual(linked.postings.find((posting) => posting.id === 'job_b').resume, otherResume);
shown = compileResumeDoc(linked.postings.find((posting) => posting.id === 'job_a'), linked);
assert.equal(shown.sections.experience.jobs.some((job) => job.id === 'rj_cat'), true);
assert.equal(compileResumeDoc(linked.postings.find((posting) => posting.id === 'job_b'), linked).sections.experience.jobs.some((job) => job.id === 'rj_cat'), false);

const choices = libraryBulletChoices(linked, { jobId: 'rj_cat' });
assert.deepEqual(choices.map((entry) => entry.id), []);
const searched = libraryBulletChoices(linked, { query: 'Elsewhere', jobId: 'rj_cat' });
assert.equal(searched[0]?.id === 'en_linked' || searched.some((entry) => entry.id === 'en_other'), true);

const unassigned = assignEntryJob(linked, 'en_linked', '', clock);
assert.equal(unassigned.entries.find((entry) => entry.id === 'en_linked').jobId, '');
assert.equal(unassigned.entries.find((entry) => entry.id === 'en_linked').company, 'Acme Inc');
assert.equal(unassigned.entries.find((entry) => entry.id === 'en_linked').role, 'Senior Analyst');

const round = serializeBook({
  ...applied,
  jobSetup: { status: 'later', savedAt: '2026-10-05T12:00:00.000Z' },
  postings: [{
    id: 'job_round',
    title: 'Round trip',
    resume: { includedJobIds: [applied.jobs[0].id] },
  }],
});
assert.equal(round.book.jobSetup.status, 'later');
assert.equal(round.book.jobs[0].onResume, false);
assert.equal(round.book.jobs[0].jobId, '');
assert.ok(round.book.postings[0].resume.includedJobIds.includes(applied.jobs[0].id));
assert.equal(normalizeStore(round.book).entries.find((entry) => entry.id === 'en_plain').jobId, '');

let mapped = addCareerJob(emptyStore(), {
  id: 'rj_mapped',
  company: 'Stripe',
  title: 'Revenue Accountant',
  onResume: false,
  groups: [{ id: 'rg_mapped', heading: 'Close', bullets: [] }],
}, clock);
mapped = addCareerJob(mapped, {
  id: 'rj_idle',
  company: 'Idle Co',
  title: 'Analyst',
  onResume: false,
}, clock);
mapped = addEntry(mapped, {
  id: 'en_mapped',
  title: 'Closed the month in two days',
  company: 'Stripe',
  role: 'Revenue Accountant',
  jobId: 'rj_mapped',
}, clock);
mapped = addEntry(mapped, {
  id: 'en_idle',
  title: 'Filed a quiet report',
  company: 'Idle Co',
  role: 'Analyst',
  jobId: 'rj_idle',
}, clock);
mapped = addPosting(mapped, { id: 'job_mapped', title: 'Mapped posting' }, clock);
mapped = addPosting(mapped, { id: 'job_quiet', title: 'Quiet posting' }, clock);
mapped = addRequirement(mapped, 'job_mapped', 'Close experience', clock);
const mappedReqId = mapped.postings.find((posting) => posting.id === 'job_mapped').requirements[0].id;
mapped = addEntryBullet(mapped, 'job_mapped', mappedReqId, 'en_mapped', '', clock);
assert.equal(inferEntryJobId(mapped.entries.find((entry) => entry.id === 'en_mapped'), mapped), 'rj_mapped');
assert.ok(postingTiedJobIds(mapped, postingById(mapped, 'job_mapped')).has('rj_mapped'));
assert.equal(postingTiedJobIds(mapped, postingById(mapped, 'job_quiet')).size, 0);

const mappedSnapshot = JSON.stringify(mapped);
const mappedDoc = compileResumeDoc(postingById(mapped, 'job_mapped'), mapped);
assert.equal(JSON.stringify(mapped), mappedSnapshot);
assert.deepEqual(mapped.postings.find((posting) => posting.id === 'job_mapped').resume.includedJobIds || [], []);
assert.equal(mappedDoc.sections.experience.jobs.some((job) => job.id === 'rj_mapped'), true);
assert.equal(mappedDoc.sections.experience.jobs.some((job) => job.id === 'rj_idle'), false);
const mappedBullets = mappedDoc.sections.experience.jobs
  .find((job) => job.id === 'rj_mapped')
  .groups.flatMap((group) => group.bullets || []);
assert.equal(mappedBullets.filter((bullet) => (bullet.sourceEntryIds || []).includes('en_mapped')).length, 1);
assert.ok(mappedBullets.some((bullet) => `${bullet.lead} ${bullet.body}`.includes('Closed the month')));
assert.equal(compileResumeDoc(postingById(mapped, 'job_quiet'), mapped).sections.experience.jobs.length, 0);
assert.equal(compileResumeDoc(null, mapped).sections.experience.jobs.some((job) => job.id === 'rj_mapped'), false);

const quietBefore = mapped.postings.find((posting) => posting.id === 'job_quiet').resume;
const entryCount = mapped.entries.length;
mapped = addPostingResumeJob(mapped, 'job_mapped', 'rj_mapped', {}, clock, random);
assert.ok(mapped.postings.find((posting) => posting.id === 'job_mapped').resume.includedJobIds.includes('rj_mapped'));
assert.equal(mapped.jobs.find((job) => job.id === 'rj_mapped').onResume, false);
assert.equal(mapped.entries.length, entryCount);
assert.deepEqual(mapped.postings.find((posting) => posting.id === 'job_quiet').resume, quietBefore);
const addedDoc = compileResumeDoc(postingById(mapped, 'job_mapped'), mapped);
const addedBullets = addedDoc.sections.experience.jobs
  .find((job) => job.id === 'rj_mapped')
  .groups.flatMap((group) => group.bullets || []);
assert.equal(addedBullets.filter((bullet) => (bullet.sourceEntryIds || []).includes('en_mapped')).length, 1);
assert.equal(addedDoc.sections.experience.jobs.find((job) => job.id === 'rj_mapped').company, 'Stripe');

mapped = addPostingResumeJob(mapped, 'job_quiet', 'rj_idle', {}, clock, random);
assert.ok(mapped.postings.find((posting) => posting.id === 'job_quiet').resume.includedJobIds.includes('rj_idle'));
assert.equal(compileResumeDoc(postingById(mapped, 'job_quiet'), mapped)
  .sections.experience.jobs.some((job) => job.id === 'rj_idle'), true);
assert.equal(compileResumeDoc(postingById(mapped, 'job_quiet'), mapped)
  .sections.experience.jobs.some((job) => job.id === 'rj_mapped'), false);

assert.deepEqual(libraryBulletChoices(mapped).map((entry) => entry.id), []);
assert.deepEqual(libraryBulletChoices(mapped, { jobId: 'rj_mapped' }).map((entry) => entry.id), []);
assert.equal(libraryBulletChoices(mapped, { query: 'Closed the month' })[0]?.id, 'en_mapped');
assert.ok(libraryBulletChoices(mapped, { query: 'quiet report', jobId: 'rj_idle' }).some((entry) => entry.id === 'en_idle'));
mapped = placeLibraryBullet(mapped, {
  postingId: 'job_quiet',
  jobId: 'rj_idle',
  groupId: '',
  entryId: 'en_idle',
}, clock, random);
assert.equal(mapped.entries.length, entryCount);
assert.equal(mapped.entries.some((entry) => entry.title === 'Filed a quiet report' && entry.id !== 'en_idle'), false);
const searchedDoc = compileResumeDoc(postingById(mapped, 'job_quiet'), mapped);
const searchedBullets = searchedDoc.sections.experience.jobs
  .find((job) => job.id === 'rj_idle')
  .groups.flatMap((group) => group.bullets || []);
assert.equal(searchedBullets.filter((bullet) => (bullet.sourceEntryIds || []).includes('en_idle')).length, 1);
assert.equal(mapped.jobs.find((job) => job.id === 'rj_idle').groups?.flatMap((group) => group.bullets || []).length || 0, 0);

let freshMapped = addCareerJob(emptyStore(), {
  id: 'rj_fresh_on',
  company: 'Basics Co',
  title: 'On resume',
  onResume: true,
}, clock);
freshMapped = addCareerJob(freshMapped, {
  id: 'rj_fresh_tie',
  company: 'Stripe',
  title: 'Accountant',
  onResume: false,
}, clock);
freshMapped = addEntry(freshMapped, {
  id: 'en_fresh_tie',
  title: 'Reconciled cash daily',
  company: 'Stripe',
  role: 'Accountant',
  jobId: 'rj_fresh_tie',
}, clock);
freshMapped = addCredentialItem(freshMapped, { id: 'cr_fresh', name: 'CPA' }, clock);
freshMapped = addEducationItem(freshMapped, { id: 'ed_fresh', school: 'UW', degree: 'BA' }, clock);
freshMapped = addPosting(freshMapped, { id: 'job_fresh_map', title: 'Fresh mapped' }, clock);
freshMapped = startPostingResumeFresh(freshMapped, 'job_fresh_map', clock);
freshMapped = addRequirement(freshMapped, 'job_fresh_map', 'Cash', clock);
freshMapped = addEntryBullet(
  freshMapped,
  'job_fresh_map',
  freshMapped.postings[0].requirements[0].id,
  'en_fresh_tie',
  '',
  clock,
);
const freshBefore = JSON.stringify(freshMapped);
const freshMappedDoc = compileResumeDoc(postingById(freshMapped, 'job_fresh_map'), freshMapped);
assert.equal(JSON.stringify(freshMapped), freshBefore);
assert.equal(freshMappedDoc.mode, 'fresh');
assert.equal(freshMappedDoc.sections.experience.jobs.some((job) => job.id === 'rj_fresh_tie'), true);
assert.equal(freshMappedDoc.sections.experience.jobs.some((job) => job.id === 'rj_fresh_on'), false);
assert.equal(freshMappedDoc.sections.experience.jobs.find((job) => job.id === 'rj_fresh_tie').company, 'Stripe');
assert.ok(freshMappedDoc.sections.experience.jobs
  .find((job) => job.id === 'rj_fresh_tie')
  .groups.flatMap((group) => group.bullets || [])
  .some((bullet) => (bullet.sourceEntryIds || []).includes('en_fresh_tie')));
assert.equal(freshMappedDoc.sections.credentials.items.length, 0);
assert.equal(freshMappedDoc.sections.education.items.length, 0);

freshMapped = addPostingResumeJob(freshMapped, 'job_fresh_map', 'rj_fresh_on', {}, clock, random);
const freshAdded = compileResumeDoc(postingById(freshMapped, 'job_fresh_map'), freshMapped);
assert.ok(freshMapped.postings[0].resume.includedJobIds.includes('rj_fresh_on'));
assert.equal(freshAdded.sections.experience.jobs.some((job) => job.id === 'rj_fresh_on'), true);
assert.equal(freshAdded.sections.experience.jobs.find((job) => job.id === 'rj_fresh_on').company, 'Basics Co');
assert.equal(freshAdded.sections.credentials.items.length, 0);

assert.deepEqual(SHARED_BULLET_FIELDS.map((field) => field.key), [
  'jobId', 'title', 'situation', 'task', 'action', 'result', 'notes',
]);
assert.deepEqual(STAR_FIELDS.map((field) => field.key), ['situation', 'task', 'action', 'result']);
const sharedSpec = sharedBulletSpec({
  id: 'en_form',
  title: 'Shared line',
  jobId: 'rj_form',
  situation: 'S',
  task: 'T',
  action: 'A',
  result: 'R',
  notes: 'N',
});
assert.equal(sharedSpec.fields.length, SHARED_BULLET_FIELDS.length);
assert.equal(sharedSpec.fields.find((field) => field.key === 'jobId').value, 'rj_form');

let oneRecord = addCareerJob(emptyStore(), {
  id: 'rj_shared',
  company: 'Acme',
  title: 'Analyst',
  onResume: true,
  groups: [{
    id: 'rg_shared',
    heading: '',
    bullets: [{ id: 'rb_shared', lead: 'Closed', body: 'the books', sourceEntryIds: ['en_shared'] }],
  }],
}, clock);
oneRecord = addEntry(oneRecord, {
  id: 'en_shared',
  title: 'Closed: the books',
  company: 'Acme',
  role: 'Analyst',
  jobId: 'rj_shared',
}, clock);
oneRecord = addPosting(oneRecord, { id: 'job_shared', title: 'Shared posting' }, clock);
oneRecord = addPosting(oneRecord, { id: 'job_other', title: 'Other posting' }, clock);
oneRecord = addRequirement(oneRecord, 'job_shared', 'Close', clock);
oneRecord = addRequirement(oneRecord, 'job_other', 'Close', clock);
oneRecord = addEntryBullet(
  oneRecord,
  'job_shared',
  oneRecord.postings.find((posting) => posting.id === 'job_shared').requirements[0].id,
  'en_shared',
  '',
  clock,
);
oneRecord = addEntryBullet(
  oneRecord,
  'job_other',
  oneRecord.postings.find((posting) => posting.id === 'job_other').requirements[0].id,
  'en_shared',
  '',
  clock,
);
assert.equal(bulletConsistency(oneRecord).length, 0);

oneRecord = applyResumeBulletEdit(oneRecord, {
  postingId: 'job_shared',
  jobId: 'rj_shared',
  groupId: 'rg_shared',
  bullet: { id: 'rb_shared', sourceEntryIds: ['en_shared'] },
  spans: [{ text: 'Closed: the month in two days', bold: false }],
}, clock);
assert.equal(oneRecord.entries.find((entry) => entry.id === 'en_shared').title, 'Closed: the month in two days');
assert.equal(oneRecord.postings.find((posting) => posting.id === 'job_shared').resume.overrides?.rb_shared, undefined);
const oneRecordDoc = compileResumeDoc(postingById(oneRecord, 'job_shared'), oneRecord);
const oneOtherDoc = compileResumeDoc(postingById(oneRecord, 'job_other'), oneRecord);
const oneBasicsDoc = compileResumeDoc(null, oneRecord);
assert.ok(`${oneRecordDoc.sections.experience.jobs[0].groups[0].bullets[0].lead} ${oneRecordDoc.sections.experience.jobs[0].groups[0].bullets[0].body}`.includes('the month'));
assert.ok(oneOtherDoc.sections.experience.jobs[0].groups.flatMap((group) => group.bullets).some((bullet) => `${bullet.lead} ${bullet.body}`.includes('the month')));
assert.ok(oneBasicsDoc.sections.experience.jobs[0].groups.flatMap((group) => group.bullets).some((bullet) => `${bullet.lead} ${bullet.body}`.includes('the month')));
assert.equal(oneRecordDoc.sections.experience.jobs[0].groups[0].bullets[0].hasOverride, false);
assert.equal(bulletConsistency(oneRecord).length, 0);

oneRecord = updatePostingResume(oneRecord, 'job_shared', {
  overrides: { rb_shared: { lead: 'Local', body: 'only here', edited: true } },
}, clock);
const oneLocalDoc = compileResumeDoc(postingById(oneRecord, 'job_shared'), oneRecord);
assert.equal(oneLocalDoc.sections.experience.jobs[0].groups[0].bullets[0].hasOverride, true);
assert.ok(`${oneLocalDoc.sections.experience.jobs[0].groups[0].bullets[0].lead} ${oneLocalDoc.sections.experience.jobs[0].groups[0].bullets[0].body}`.includes('only here'));
assert.equal(oneRecord.entries.find((entry) => entry.id === 'en_shared').title, 'Closed: the month in two days');
assert.equal(bulletConsistency(oneRecord).some((issue) => issue.bulletId === 'rb_shared'), false);

oneRecord = updatePostingResume(oneRecord, 'job_other', {
  overrides: { rb_shared: { lead: 'Other', body: 'posting still local', edited: true } },
}, clock);
const otherOverrideDoc = compileResumeDoc(postingById(oneRecord, 'job_other'), oneRecord);
assert.equal(otherOverrideDoc.sections.experience.jobs[0].groups[0].bullets[0].hasOverride, true);
assert.ok(`${otherOverrideDoc.sections.experience.jobs[0].groups[0].bullets[0].lead} ${otherOverrideDoc.sections.experience.jobs[0].groups[0].bullets[0].body}`.includes('posting still local'));

oneRecord = applyResumeBulletEdit(oneRecord, {
  postingId: 'job_shared',
  jobId: 'rj_shared',
  groupId: 'rg_shared',
  bullet: { id: 'rb_shared', sourceEntryIds: ['en_shared'] },
  spans: [{ text: 'Closed: the week in one day', bold: false }],
}, clock);
assert.equal(oneRecord.entries.find((entry) => entry.id === 'en_shared').title, 'Closed: the week in one day');
assert.equal(oneRecord.postings.find((posting) => posting.id === 'job_shared').resume.overrides?.rb_shared, undefined);
assert.equal(oneRecord.postings.find((posting) => posting.id === 'job_other').resume.overrides?.rb_shared?.edited, true);
const oneEditedDoc = compileResumeDoc(postingById(oneRecord, 'job_shared'), oneRecord);
const oneOtherKept = compileResumeDoc(postingById(oneRecord, 'job_other'), oneRecord);
const oneBasicsAfter = compileResumeDoc(null, oneRecord);
assert.equal(oneEditedDoc.sections.experience.jobs[0].groups[0].bullets[0].hasOverride, false);
assert.ok(`${oneEditedDoc.sections.experience.jobs[0].groups[0].bullets[0].lead} ${oneEditedDoc.sections.experience.jobs[0].groups[0].bullets[0].body}`.includes('the week'));
assert.ok(oneBasicsAfter.sections.experience.jobs[0].groups.flatMap((group) => group.bullets).some((bullet) => `${bullet.lead} ${bullet.body}`.includes('the week')));
assert.equal(oneOtherKept.sections.experience.jobs[0].groups[0].bullets[0].hasOverride, true);
assert.ok(`${oneOtherKept.sections.experience.jobs[0].groups[0].bullets[0].lead} ${oneOtherKept.sections.experience.jobs[0].groups[0].bullets[0].body}`.includes('posting still local'));

const drifted = {
  ...oneRecord,
  entries: oneRecord.entries.map((entry) => (
    entry.id === 'en_shared' ? { ...entry, title: 'Library moved on' } : entry
  )),
  postings: oneRecord.postings.map((posting) => ({
    ...posting,
    requirements: (posting.requirements || []).map((req) => ({
      ...req,
      bullets: (req.bullets || []).map((line) => (
        line.entryId === 'en_shared' ? { ...line, text: 'Stale requirement copy' } : line
      )),
    })),
  })),
};
assert.ok(bulletConsistency(drifted).some((issue) => issue.kind === 'requirement' && issue.entryId === 'en_shared'));

let linkedPick = createSharedBullet(emptyStore(), {
  title: 'Picked a job on create',
  jobId: 'missing',
}, clock);
assert.equal(linkedPick.store.entries[0].jobId, '');
linkedPick = addCareerJob(emptyStore(), { id: 'rj_pick_job', company: 'Beta', title: 'Designer', onResume: false }, clock);
linkedPick = createSharedBullet(linkedPick, {
  title: 'Picked a job on create',
  jobId: 'rj_pick_job',
  situation: 'The board was empty.',
}, clock).store;
assert.equal(linkedPick.entries[0].jobId, 'rj_pick_job');
assert.equal(linkedPick.entries[0].company, 'Beta');
assert.equal(linkedPick.entries[0].role, 'Designer');
assert.equal(linkedPick.entries[0].situation, 'The board was empty.');
linkedPick = saveSharedBullet(linkedPick, linkedPick.entries[0].id, { jobId: '', result: 'Linked everywhere.' }, clock);
assert.equal(linkedPick.entries[0].jobId, '');
assert.equal(linkedPick.entries[0].result, 'Linked everywhere.');
linkedPick = saveSharedBullet(linkedPick, linkedPick.entries[0].id, { jobId: 'rj_pick_job' }, clock);
assert.equal(linkedPick.entries[0].jobId, 'rj_pick_job');

let bulkJob = addCareerJob(emptyStore(), { id: 'rj_bulk', company: 'Bulk Co', title: 'Lead' }, clock);
bulkJob = addEntries(bulkJob, [
  { title: 'First pasted line', jobId: 'rj_bulk' },
  { title: 'Second pasted line', jobId: 'rj_bulk' },
], clock);
assert.equal(bulkJob.entries.length, 2);
assert.ok(bulkJob.entries.every((entry) => entry.jobId === 'rj_bulk' && entry.company === 'Bulk Co'));

assert.deepEqual(experienceAdderChrome(false), {
  open: false,
  showForm: false,
  addLabel: '+ New',
  showCancel: false,
});
assert.deepEqual(experienceAdderChrome(true), {
  open: true,
  showForm: true,
  addLabel: 'Add',
  showCancel: true,
});
assert.equal(nextExperienceAdderOpen('new'), true);
assert.equal(nextExperienceAdderOpen('compose-new'), true);
assert.equal(nextExperienceAdderOpen('save', true), false);
assert.equal(nextExperienceAdderOpen('cancel', true), false);
assert.equal(nextExperienceAdderOpen('pick', true), false);
assert.equal(nextExperienceAdderOpen('type', true), true);
assert.deepEqual(resumeBulletArrows(0, 3), { disableUp: true, disableDown: false });
assert.deepEqual(resumeBulletArrows(1, 3), { disableUp: false, disableDown: false });
assert.deepEqual(resumeBulletArrows(2, 3), { disableUp: false, disableDown: true });
assert.deepEqual(resumeBulletArrows(0, 1), { disableUp: true, disableDown: true });
assert.deepEqual(visibleNodes(
  { id: 'keep' },
  null,
  undefined,
  false,
  { id: 'also' },
), [{ id: 'keep' }, { id: 'also' }]);
assert.deepEqual(visibleNodes(null, undefined), []);

function compiledBulletIds(book, postingId, jobId) {
  const job = compileResumeDoc(postingById(book, postingId), book)
    .sections.experience.jobs.find((item) => item.id === jobId);
  return (job?.groups || []).flatMap((group) => (group.bullets || []).map((bullet) => bullet.id));
}

function compiledBulletLines(book, postingId, jobId) {
  const job = compileResumeDoc(postingById(book, postingId), book)
    .sections.experience.jobs.find((item) => item.id === jobId);
  return (job?.groups || []).flatMap((group) => (group.bullets || []).map((bullet) => (
    `${bullet.lead || ''} ${bullet.body || ''}`.replace(/\s+/g, ' ').trim()
  )));
}

let orderBook = addCareerJob(emptyStore(), {
  id: 'rj_ord',
  company: 'GoDaddy',
  title: 'Manager',
  onResume: true,
  groups: [{
    id: 'rg_ord',
    heading: '',
    bullets: [
      { id: 'rb_ord_a', lead: 'Alpha posted first line', body: 'kept wording A', sourceEntryIds: ['en_ord_a'] },
      { id: 'rb_ord_b', lead: 'Bravo posted second line', body: 'kept wording B', sourceEntryIds: ['en_ord_b'] },
    ],
  }],
}, clock);
orderBook = addEntry(orderBook, {
  id: 'en_ord_a',
  title: 'Alpha posted first line: kept wording A',
  jobId: 'rj_ord',
}, clock);
orderBook = addEntry(orderBook, {
  id: 'en_ord_b',
  title: 'Bravo posted second line: kept wording B',
  jobId: 'rj_ord',
}, clock);
orderBook = addPosting(orderBook, { id: 'job_ord', title: 'Order posting' }, clock);
orderBook = addPosting(orderBook, { id: 'job_ord_other', title: 'Other posting' }, clock);
orderBook = updatePostingResume(orderBook, 'job_ord', {
  includedJobIds: ['rj_ord'],
  excludedBulletIds: ['rb_never'],
  pinnedBulletIds: ['rb_ord_a'],
  overrides: {
    rb_ord_a: { edited: true, lead: 'Alpha posted first line', body: 'posting-local A' },
  },
}, clock);
const otherResumeBefore = JSON.parse(JSON.stringify(postingById(orderBook, 'job_ord_other').resume));
const careerOrderBefore = orderBook.jobs.find((job) => job.id === 'rj_ord').groups[0].bullets.map((bullet) => bullet.id).join(',');
const overrideBefore = JSON.stringify(postingById(orderBook, 'job_ord').resume.overrides);
const includeBefore = JSON.stringify(postingById(orderBook, 'job_ord').resume.excludedBulletIds);
const pinBefore = JSON.stringify(postingById(orderBook, 'job_ord').resume.pinnedBulletIds);
const entriesBefore = JSON.stringify(orderBook.entries);
const orderJob = orderBook.jobs.find((job) => job.id === 'rj_ord');
assert.deepEqual(compiledBulletIds(orderBook, 'job_ord', 'rj_ord'), ['rb_ord_a', 'rb_ord_b']);
assert.equal(stepResumeBullet(orderBook, 'job_ord', orderJob, 'rg_ord', 'rb_ord_a', -1, clock), orderBook);
assert.equal(stepResumeBullet(orderBook, 'job_ord', orderJob, 'rg_ord', 'rb_ord_b', 1, clock), orderBook);

orderBook = stepResumeBullet(orderBook, 'job_ord', orderJob, 'rg_ord', 'rb_ord_a', 1, clock);
assert.deepEqual(compiledBulletIds(orderBook, 'job_ord', 'rj_ord'), ['rb_ord_b', 'rb_ord_a']);
assert.deepEqual(compiledBulletLines(orderBook, 'job_ord', 'rj_ord'), [
  'Bravo posted second line kept wording B',
  'Alpha posted first line posting-local A',
]);
assert.equal(orderBook.jobs.find((job) => job.id === 'rj_ord').groups[0].bullets.map((bullet) => bullet.id).join(','), careerOrderBefore);
assert.deepEqual(postingById(orderBook, 'job_ord_other').resume, otherResumeBefore);
assert.equal(JSON.stringify(postingById(orderBook, 'job_ord').resume.overrides), overrideBefore);
assert.equal(JSON.stringify(postingById(orderBook, 'job_ord').resume.excludedBulletIds), includeBefore);
assert.equal(JSON.stringify(postingById(orderBook, 'job_ord').resume.pinnedBulletIds), pinBefore);
assert.equal(JSON.stringify(orderBook.entries), entriesBefore);
assert.deepEqual(postingById(orderBook, 'job_ord').resume.bulletOrder.rg_ord, ['rb_ord_b', 'rb_ord_a']);
const compiledA = compileResumeDoc(postingById(orderBook, 'job_ord'), orderBook)
  .sections.experience.jobs.find((job) => job.id === 'rj_ord')
  .groups[0].bullets.find((bullet) => bullet.id === 'rb_ord_a');
assert.equal(compiledA.hasOverride, true);
assert.equal(compiledA.included, true);
assert.equal(compiledA.pinned, true);
assert.equal(compileResumeDoc(postingById(orderBook, 'job_ord'), orderBook)
  .sections.experience.jobs.find((job) => job.id === 'rj_ord')
  .groups[0].bullets.find((bullet) => bullet.id === 'rb_ord_b').included, true);

const packedOrder = serializeBook(orderBook);
const reloadedOrder = normalizeStore(JSON.parse(packedOrder.json), clock);
assert.deepEqual(compiledBulletIds(reloadedOrder, 'job_ord', 'rj_ord'), ['rb_ord_b', 'rb_ord_a']);
assert.equal(reloadedOrder.jobs.find((job) => job.id === 'rj_ord').groups[0].bullets.map((bullet) => bullet.id).join(','), careerOrderBefore);
assert.equal(reloadedOrder.postings.find((posting) => posting.id === 'job_ord').resume.overrides.rb_ord_a.body, 'posting-local A');

const previewOrderDoc = compileResumeDoc(postingById(reloadedOrder, 'job_ord'), reloadedOrder);
const previewOrderHtml = renderResumeHtml(previewOrderDoc);
assert.ok(previewOrderHtml.indexOf('Bravo posted second line') < previewOrderHtml.indexOf('Alpha posted first line'));
const previewOrderDocx = new TextDecoder().decode(resumeDocxBytes(previewOrderDoc));
assert.ok(previewOrderDocx.indexOf('Bravo posted second line') < previewOrderDocx.indexOf('Alpha posted first line'));

let mappedOrder = addCareerJob(emptyStore(), {
  id: 'rj_map_ord',
  company: 'Stripe',
  title: 'Accountant',
  onResume: false,
  groups: [{ id: 'rg_map_ord', heading: '', bullets: [] }],
}, clock);
mappedOrder = addEntry(mappedOrder, {
  id: 'en_map_ord_a',
  title: 'Mapped extra one unique',
  jobId: 'rj_map_ord',
}, clock);
mappedOrder = addEntry(mappedOrder, {
  id: 'en_map_ord_b',
  title: 'Mapped extra two unique',
  jobId: 'rj_map_ord',
}, clock);
mappedOrder = addPosting(mappedOrder, { id: 'job_map_ord', title: 'Mapped order' }, clock);
mappedOrder = addRequirement(mappedOrder, 'job_map_ord', 'Need extras', clock);
const mappedOrdReq = mappedOrder.postings[0].requirements[0].id;
mappedOrder = addEntryBullet(mappedOrder, 'job_map_ord', mappedOrdReq, 'en_map_ord_a', '', clock);
mappedOrder = addEntryBullet(mappedOrder, 'job_map_ord', mappedOrdReq, 'en_map_ord_b', '', clock);
const mappedOrdSnapshot = JSON.stringify(mappedOrder);
const mappedOrdLines = compiledBulletLines(mappedOrder, 'job_map_ord', 'rj_map_ord');
assert.deepEqual(mappedOrdLines, ['Mapped extra one unique', 'Mapped extra two unique']);
assert.equal(JSON.stringify(mappedOrder), mappedOrdSnapshot);
const mappedOrdJob = { id: 'rj_map_ord' };
const mappedOrdIds = compiledBulletIds(mappedOrder, 'job_map_ord', 'rj_map_ord');
assert.equal(mappedOrdIds.length, 2);
const mappedOrdGroup = compileResumeDoc(postingById(mappedOrder, 'job_map_ord'), mappedOrder)
  .sections.experience.jobs.find((job) => job.id === 'rj_map_ord').groups[0];
mappedOrder = stepResumeBullet(mappedOrder, 'job_map_ord', mappedOrdJob, mappedOrdGroup.id, mappedOrdIds[0], 1, clock);
assert.deepEqual(compiledBulletLines(mappedOrder, 'job_map_ord', 'rj_map_ord'), [
  'Mapped extra two unique',
  'Mapped extra one unique',
]);
assert.equal(mappedOrder.jobs.find((job) => job.id === 'rj_map_ord').groups[0].bullets.length, 0);
assert.equal(mappedOrder.entries.find((entry) => entry.id === 'en_map_ord_a').title, 'Mapped extra one unique');
assert.equal(mappedOrder.entries.find((entry) => entry.id === 'en_map_ord_b').title, 'Mapped extra two unique');
const mappedReloaded = normalizeStore(JSON.parse(serializeBook(mappedOrder).json), clock);
assert.deepEqual(compiledBulletLines(mappedReloaded, 'job_map_ord', 'rj_map_ord'), [
  'Mapped extra two unique',
  'Mapped extra one unique',
]);

assert.deepEqual(visibleResumeBullets([
  { id: 'a', included: true },
  { id: 'b', included: false },
  { id: 'c' },
]), [{ id: 'a', included: true }, { id: 'c' }]);
assert.deepEqual(visibleResumeBullets(null), []);

let hideBook = addCareerJob(emptyStore(), {
  id: 'rj_hide',
  company: 'GoDaddy',
  title: 'Manager',
  onResume: true,
  groups: [{
    id: 'rg_hide',
    heading: '',
    bullets: [
      { id: 'rb_hide_a', lead: 'Visible first', body: 'kept A', sourceEntryIds: ['en_hide_a'] },
      { id: 'rb_hide_b', lead: 'Hidden middle', body: 'kept B', sourceEntryIds: ['en_hide_b'] },
      { id: 'rb_hide_c', lead: 'Visible last', body: 'kept C', sourceEntryIds: ['en_hide_c'] },
    ],
  }],
}, clock);
hideBook = addEntry(hideBook, { id: 'en_hide_a', title: 'Visible first: kept A', jobId: 'rj_hide' }, clock);
hideBook = addEntry(hideBook, { id: 'en_hide_b', title: 'Hidden middle: kept B', jobId: 'rj_hide' }, clock);
hideBook = addEntry(hideBook, { id: 'en_hide_c', title: 'Visible last: kept C', jobId: 'rj_hide' }, clock);
hideBook = addEntry(hideBook, { id: 'en_hide_other', title: 'Other library line', jobId: '' }, clock);
hideBook = addPosting(hideBook, { id: 'job_hide', title: 'Hide posting' }, clock);
hideBook = addPosting(hideBook, { id: 'job_hide_other', title: 'Other hide posting' }, clock);
hideBook = updatePostingResume(hideBook, 'job_hide', {
  includedJobIds: ['rj_hide'],
  excludedBulletIds: ['rb_hide_b'],
  overrides: {
    rb_hide_a: { edited: true, lead: 'Visible first', body: 'posting-local A' },
  },
}, clock);
const hideSnapshot = JSON.stringify(hideBook);
const hideDoc = compileResumeDoc(postingById(hideBook, 'job_hide'), hideBook);
assert.equal(JSON.stringify(hideBook), hideSnapshot);
const hideGroup = hideDoc.sections.experience.jobs.find((job) => job.id === 'rj_hide').groups[0];
assert.deepEqual(hideGroup.bullets.map((bullet) => bullet.id), ['rb_hide_a', 'rb_hide_b', 'rb_hide_c']);
assert.deepEqual(visibleResumeBullets(hideGroup.bullets).map((bullet) => bullet.id), ['rb_hide_a', 'rb_hide_c']);
assert.equal(hideGroup.bullets.find((bullet) => bullet.id === 'rb_hide_a').hasOverride, true);
assert.equal(hideGroup.bullets.find((bullet) => bullet.id === 'rb_hide_a').body, 'posting-local A');
assert.equal(resumeTakenEntryIds(hideBook, postingById(hideBook, 'job_hide')).includes('en_hide_b'), true);
assert.equal(resumeTakenEntryIds(hideBook, postingById(hideBook, 'job_hide'), { includeExcluded: false }).includes('en_hide_b'), false);
assert.equal(resumeTakenEntryIds(hideBook, postingById(hideBook, 'job_hide'), { includeExcluded: false }).includes('en_hide_a'), true);
const hideChoices = libraryBulletChoices(hideBook, {
  query: 'Hidden middle',
  takenIds: resumeTakenEntryIds(hideBook, postingById(hideBook, 'job_hide'), { includeExcluded: false }),
  jobId: 'rj_hide',
});
assert.equal(hideChoices.some((entry) => entry.id === 'en_hide_b'), true);
assert.equal(libraryBulletChoices(hideBook, {
  query: 'Other library',
  takenIds: resumeTakenEntryIds(hideBook, postingById(hideBook, 'job_hide'), { includeExcluded: false }),
}).some((entry) => entry.id === 'en_hide_other'), true);
assert.equal(libraryBulletChoices(hideBook, {
  query: 'Visible first',
  takenIds: resumeTakenEntryIds(hideBook, postingById(hideBook, 'job_hide'), { includeExcluded: false }),
}).some((entry) => entry.id === 'en_hide_a'), false);

const hideCareerBefore = JSON.stringify(hideBook.jobs);
const hideEntriesBefore = JSON.stringify(hideBook.entries);
const hideOtherBefore = JSON.stringify(postingById(hideBook, 'job_hide_other').resume);
const hideOverrideBefore = JSON.stringify(postingById(hideBook, 'job_hide').resume.overrides);
hideBook = placeLibraryBullet(hideBook, {
  postingId: 'job_hide',
  jobId: 'rj_hide',
  groupId: 'rg_hide',
  entryId: 'en_hide_b',
}, clock, random);
assert.equal(postingById(hideBook, 'job_hide').resume.excludedBulletIds.includes('rb_hide_b'), false);
assert.deepEqual(
  compileResumeDoc(postingById(hideBook, 'job_hide'), hideBook)
    .sections.experience.jobs.find((job) => job.id === 'rj_hide').groups[0].bullets.map((bullet) => bullet.id),
  ['rb_hide_a', 'rb_hide_b', 'rb_hide_c']
);
assert.equal(JSON.stringify(hideBook.jobs), hideCareerBefore);
assert.equal(JSON.stringify(hideBook.entries), hideEntriesBefore);
assert.equal(JSON.stringify(postingById(hideBook, 'job_hide_other').resume), hideOtherBefore);
assert.equal(JSON.stringify(postingById(hideBook, 'job_hide').resume.overrides), hideOverrideBefore);

hideBook = updatePostingResume(hideBook, 'job_hide', { excludedBulletIds: ['rb_hide_b'] }, clock);
const hideJob = hideBook.jobs.find((job) => job.id === 'rj_hide');
assert.equal(stepResumeBullet(hideBook, 'job_hide', hideJob, 'rg_hide', 'rb_hide_a', -1, clock), hideBook);
assert.equal(stepResumeBullet(hideBook, 'job_hide', hideJob, 'rg_hide', 'rb_hide_c', 1, clock), hideBook);
hideBook = stepResumeBullet(hideBook, 'job_hide', hideJob, 'rg_hide', 'rb_hide_a', 1, clock);
assert.deepEqual(
  compileResumeDoc(postingById(hideBook, 'job_hide'), hideBook)
    .sections.experience.jobs.find((job) => job.id === 'rj_hide').groups[0].bullets.map((bullet) => bullet.id),
  ['rb_hide_c', 'rb_hide_b', 'rb_hide_a']
);
assert.deepEqual(
  visibleResumeBullets(compileResumeDoc(postingById(hideBook, 'job_hide'), hideBook)
    .sections.experience.jobs.find((job) => job.id === 'rj_hide').groups[0].bullets).map((bullet) => bullet.id),
  ['rb_hide_c', 'rb_hide_a']
);
assert.deepEqual(resumeBulletArrows(0, 2), { disableUp: true, disableDown: false });
assert.deepEqual(resumeBulletArrows(1, 2), { disableUp: false, disableDown: true });
assert.deepEqual(resumeBulletArrows(0, 1, { groupIndex: 0, groupCount: 2 }), { disableUp: true, disableDown: false });
assert.deepEqual(resumeBulletArrows(0, 1, { groupIndex: 1, groupCount: 2 }), { disableUp: false, disableDown: true });
assert.equal(JSON.stringify(hideBook.jobs), hideCareerBefore);
assert.equal(hideBook.entries.find((entry) => entry.id === 'en_hide_b').title, 'Hidden middle: kept B');
assert.equal(postingById(hideBook, 'job_hide').resume.overrides.rb_hide_a.body, 'posting-local A');
assert.deepEqual(postingById(hideBook, 'job_hide').resume.excludedBulletIds, ['rb_hide_b']);
const hideReloaded = normalizeStore(JSON.parse(serializeBook(hideBook).json), clock);
assert.deepEqual(postingById(hideReloaded, 'job_hide').resume.excludedBulletIds, ['rb_hide_b']);
assert.deepEqual(
  visibleResumeBullets(compileResumeDoc(postingById(hideReloaded, 'job_hide'), hideReloaded)
    .sections.experience.jobs.find((job) => job.id === 'rj_hide').groups[0].bullets).map((bullet) => bullet.id),
  ['rb_hide_c', 'rb_hide_a']
);

const emptyHeads = [
  { id: 'rg_a', heading: '', bullets: [{ id: 'rb_1' }] },
  { id: 'rg_b', heading: '', bullets: [{ id: 'rb_2' }] },
];
const emptyChrome = resumeGroupChrome(emptyHeads, '', true);
assert.equal(emptyChrome.namedCount, 0);
assert.equal(emptyChrome.showUnder, false);
assert.equal(emptyChrome.showDefaultAdd, true);
assert.equal(emptyChrome.showHeading(emptyHeads[0]), false);
assert.equal(emptyChrome.showHeading(emptyHeads[1]), false);
assert.equal(emptyChrome.underLabel(emptyHeads[1], 1), 'No sub-heading');
assert.equal(emptyChrome.underLabel(emptyHeads[1], 1).includes('Untitled'), false);
const namedChrome = resumeGroupChrome([
  { id: 'rg_a', heading: '', bullets: [] },
  { id: 'rg_b', heading: 'Training', bullets: [] },
], '', true);
assert.equal(namedChrome.namedCount, 1);
assert.equal(namedChrome.showUnder, true);
assert.equal(namedChrome.showDefaultAdd, false);
assert.equal(namedChrome.showHeading({ id: 'rg_a', heading: '' }), false);
assert.equal(namedChrome.showHeading({ id: 'rg_b', heading: 'Training' }), true);
assert.equal(namedChrome.underLabel({ heading: 'Training' }, 1), 'Training');
assert.equal(namedChrome.underLabel({ heading: '' }, 0), 'No sub-heading');
const draftChrome = resumeGroupChrome(emptyHeads, 'rg_b', true);
assert.equal(draftChrome.hasDraft, true);
assert.equal(draftChrome.showDefaultAdd, false);
assert.equal(draftChrome.showHeading(emptyHeads[0]), false);
assert.equal(draftChrome.showHeading(emptyHeads[1]), true);
assert.equal(resumeGroupChrome(emptyHeads, '', false).showHeading(emptyHeads[0]), true);
assert.equal(resumeGroupChrome(emptyHeads, '', false).underLabel(emptyHeads[1], 1), 'Untitled heading 2');

let headBook = addCareerJob(emptyStore(), {
  id: 'rj_head',
  company: 'PwC',
  title: 'Senior Associate',
  onResume: true,
  groups: [
    { id: 'rg_head_a', heading: '', bullets: [{ id: 'rb_head_a', lead: 'Common Controls', body: 'mapped 900' }] },
    { id: 'rg_head_b', heading: 'Training', bullets: [{ id: 'rb_head_b', lead: 'Taught the close', body: 'kept' }] },
  ],
}, clock);
headBook = addPosting(headBook, { id: 'job_head', title: 'Head posting' }, clock);
headBook = addPosting(headBook, { id: 'job_head_other', title: 'Other head' }, clock);
headBook = updatePostingResume(headBook, 'job_head', { includedJobIds: ['rj_head'] }, clock);
const headBefore = JSON.stringify(headBook);
const headDoc = compileResumeDoc(postingById(headBook, 'job_head'), headBook);
assert.equal(JSON.stringify(headBook), headBefore);
const headGroups = headDoc.sections.experience.jobs.find((job) => job.id === 'rj_head').groups;
assert.equal(headGroups.length, 2);
assert.equal(headGroups[0].heading, '');
assert.equal(headGroups[1].heading, 'Training');
const headHtml = renderResumeHtml(headDoc);
assert.match(headHtml, /Common Controls/);
assert.match(headHtml, /Taught the close/);
assert.match(headHtml, /<div class="subhead">Training<\/div>/);
assert.doesNotMatch(headHtml, /subhead"><\/div>/);
const headDocx = new TextDecoder().decode(resumeDocxBytes(headDoc));
assert.match(headDocx, /Training/);
assert.match(headDocx, /Common Controls/);

const headCareerBefore = JSON.stringify(headBook.jobs);
const headOtherBefore = JSON.stringify(postingById(headBook, 'job_head_other').resume);
headBook = removeResumeGroup(headBook, 'job_head', { id: 'rj_head' }, 'rg_head_b', clock);
assert.equal(JSON.stringify(headBook.jobs), headCareerBefore);
assert.equal(JSON.stringify(postingById(headBook, 'job_head_other').resume), headOtherBefore);
const afterRemove = compileResumeDoc(postingById(headBook, 'job_head'), headBook)
  .sections.experience.jobs.find((job) => job.id === 'rj_head');
assert.deepEqual(afterRemove.groups.map((group) => group.heading), ['', '']);
assert.deepEqual(afterRemove.groups.flatMap((group) => (group.bullets || []).map((bullet) => bullet.id)), [
  'rb_head_a',
  'rb_head_b',
]);
assert.equal(postingById(headBook, 'job_head').resume.groupHeadings.rg_head_b, '');
const afterChrome = resumeGroupChrome(afterRemove.groups, '', true);
assert.equal(afterChrome.namedCount, 0);
assert.equal(afterChrome.showDefaultAdd, true);
assert.equal(afterChrome.showUnder, false);
assert.equal(afterChrome.showHeading(afterRemove.groups[0]), false);
assert.equal(afterChrome.showHeading(afterRemove.groups[1]), false);
const afterHtml = renderResumeHtml(compileResumeDoc(postingById(headBook, 'job_head'), headBook));
assert.match(afterHtml, /Common Controls/);
assert.match(afterHtml, /Taught the close/);
assert.doesNotMatch(afterHtml, /<div class="subhead">Training<\/div>/);
headBook = removeResumeGroup(headBook, 'job_head', { id: 'rj_head' }, 'rg_head_a', clock);
assert.deepEqual(
  compileResumeDoc(postingById(headBook, 'job_head'), headBook)
    .sections.experience.jobs.find((job) => job.id === 'rj_head').groups
    .flatMap((group) => (group.bullets || []).map((bullet) => bullet.id)),
  ['rb_head_a', 'rb_head_b']
);
const addedHead = addResumeGroup(headBook, 'job_head', { id: 'rj_head' }, { afterId: 'rg_head_b' }, clock, random);
headBook = addedHead.store;
const withDraft = compileResumeDoc(postingById(headBook, 'job_head'), headBook)
  .sections.experience.jobs.find((job) => job.id === 'rj_head').groups;
assert.ok(withDraft.some((group) => group.id === addedHead.groupId));
const draftAfterAdd = resumeGroupChrome(withDraft, addedHead.groupId, true);
assert.equal(draftAfterAdd.hasDraft, true);
assert.equal(draftAfterAdd.showHeading(withDraft.find((group) => group.id === addedHead.groupId)), true);
assert.equal(draftAfterAdd.showDefaultAdd, false);
const headReloaded = normalizeStore(JSON.parse(serializeBook(headBook).json), clock);
assert.equal(headReloaded.jobs.find((job) => job.id === 'rj_head').groups[1].heading, 'Training');
assert.equal(postingById(headReloaded, 'job_head').resume.groupHeadings.rg_head_b, '');
assert.deepEqual(
  compileResumeDoc(postingById(headReloaded, 'job_head'), headReloaded)
    .sections.experience.jobs.find((job) => job.id === 'rj_head').groups
    .flatMap((group) => (group.bullets || []).map((bullet) => bullet.id)),
  ['rb_head_a', 'rb_head_b']
);

function compiledGroupIds(book, postingId, jobId) {
  const job = compileResumeDoc(postingById(book, postingId), book)
    .sections.experience.jobs.find((item) => item.id === jobId);
  return (job?.groups || []).map((group) => ({
    id: group.id,
    heading: group.heading,
    bullets: (group.bullets || []).map((bullet) => bullet.id),
  }));
}

let moveBook = addCareerJob(emptyStore(), {
  id: 'rj_move',
  company: 'Stripe',
  title: 'Accountant',
  onResume: true,
  groups: [
    { id: 'rg_move_bare', heading: '', bullets: [{ id: 'rb_move_a', lead: 'Bare first', body: 'kept A', sourceEntryIds: ['en_move_a'] }] },
    { id: 'rg_move_train', heading: 'Training', bullets: [{ id: 'rb_move_b', lead: 'Taught the close', body: 'kept B', sourceEntryIds: ['en_move_b'] }] },
  ],
}, clock);
moveBook = addEntry(moveBook, { id: 'en_move_a', title: 'Bare first: kept A', jobId: 'rj_move' }, clock);
moveBook = addEntry(moveBook, { id: 'en_move_b', title: 'Taught the close: kept B', jobId: 'rj_move' }, clock);
moveBook = addEntry(moveBook, { id: 'en_move_c', title: 'Mapped extra unique', jobId: 'rj_move' }, clock);
moveBook = addPosting(moveBook, { id: 'job_move', title: 'Move posting' }, clock);
moveBook = addPosting(moveBook, { id: 'job_move_other', title: 'Other move posting' }, clock);
moveBook = updatePostingResume(moveBook, 'job_move', {
  includedJobIds: ['rj_move'],
  excludedBulletIds: ['rb_move_skip'],
  pinnedBulletIds: ['rb_move_a'],
  overrides: {
    rb_move_a: { edited: true, lead: 'Bare first', body: 'posting-local A' },
  },
}, clock);
moveBook = addRequirement(moveBook, 'job_move', 'Need extras', clock);
moveBook = addEntryBullet(moveBook, 'job_move', postingById(moveBook, 'job_move').requirements[0].id, 'en_move_c', '', clock);
const moveCareerBefore = JSON.stringify(moveBook.jobs);
const moveEntriesBefore = JSON.stringify(moveBook.entries);
const moveOtherBefore = JSON.stringify(postingById(moveBook, 'job_move_other').resume);
const moveOverrideBefore = JSON.stringify(postingById(moveBook, 'job_move').resume.overrides);
const moveIncludeBefore = JSON.stringify(postingById(moveBook, 'job_move').resume.excludedBulletIds);
const movePinBefore = JSON.stringify(postingById(moveBook, 'job_move').resume.pinnedBulletIds);
const moveJob = { id: 'rj_move' };
const mappedExtraId = compiledBulletIds(moveBook, 'job_move', 'rj_move').find((id) => id !== 'rb_move_a' && id !== 'rb_move_b');
assert.ok(mappedExtraId);
assert.deepEqual(compiledGroupIds(moveBook, 'job_move', 'rj_move').map((group) => group.bullets), [
  ['rb_move_a'],
  ['rb_move_b', mappedExtraId],
]);

moveBook = moveResumeBullet(moveBook, 'job_move', moveJob, 'rg_move_train', 'rg_move_bare', 'rb_move_b', {}, clock);
assert.deepEqual(compiledGroupIds(moveBook, 'job_move', 'rj_move').map((group) => group.bullets), [
  ['rb_move_a', 'rb_move_b'],
  [mappedExtraId],
]);
assert.equal(postingById(moveBook, 'job_move').resume.bulletGroup.rb_move_b, 'rg_move_bare');
assert.equal(JSON.stringify(moveBook.jobs), moveCareerBefore);
assert.equal(JSON.stringify(moveBook.entries), moveEntriesBefore);
assert.equal(JSON.stringify(postingById(moveBook, 'job_move_other').resume), moveOtherBefore);
assert.equal(JSON.stringify(postingById(moveBook, 'job_move').resume.overrides), moveOverrideBefore);
assert.equal(JSON.stringify(postingById(moveBook, 'job_move').resume.excludedBulletIds), moveIncludeBefore);
assert.equal(JSON.stringify(postingById(moveBook, 'job_move').resume.pinnedBulletIds), movePinBefore);

moveBook = stepResumeBullet(moveBook, 'job_move', moveJob, 'rg_move_train', mappedExtraId, -1, clock);
assert.deepEqual(compiledGroupIds(moveBook, 'job_move', 'rj_move').map((group) => group.bullets), [
  ['rb_move_a', 'rb_move_b', mappedExtraId],
  [],
]);
assert.equal(postingById(moveBook, 'job_move').resume.bulletGroup[mappedExtraId], 'rg_move_bare');

moveBook = moveResumeBullet(moveBook, 'job_move', moveJob, 'rg_move_bare', 'rg_move_train', 'rb_move_a', {}, clock);
assert.deepEqual(compiledGroupIds(moveBook, 'job_move', 'rj_move').map((group) => group.bullets), [
  ['rb_move_b', mappedExtraId],
  ['rb_move_a'],
]);
const movedA = compileResumeDoc(postingById(moveBook, 'job_move'), moveBook)
  .sections.experience.jobs.find((job) => job.id === 'rj_move')
  .groups.flatMap((group) => group.bullets).find((bullet) => bullet.id === 'rb_move_a');
assert.equal(movedA.hasOverride, true);
assert.equal(movedA.body, 'posting-local A');
assert.equal(movedA.pinned, true);
assert.equal(movedA.included, true);

const moveHtml = renderResumeHtml(compileResumeDoc(postingById(moveBook, 'job_move'), moveBook));
assert.ok(moveHtml.indexOf('Taught the close') < moveHtml.indexOf('Bare first'));
assert.match(moveHtml, /<div class="subhead">Training<\/div>/);
const moveDocx = new TextDecoder().decode(resumeDocxBytes(compileResumeDoc(postingById(moveBook, 'job_move'), moveBook)));
assert.ok(moveDocx.indexOf('Taught the close') < moveDocx.indexOf('Bare first'));

const moveReloaded = normalizeStore(JSON.parse(serializeBook(moveBook).json), clock);
assert.equal(JSON.stringify(moveReloaded.jobs), moveCareerBefore);
assert.equal(postingById(moveReloaded, 'job_move').resume.bulletGroup.rb_move_a, 'rg_move_train');
assert.deepEqual(compiledGroupIds(moveReloaded, 'job_move', 'rj_move').map((group) => group.bullets), [
  ['rb_move_b', mappedExtraId],
  ['rb_move_a'],
]);
assert.equal(compileResumeDoc(postingById(moveReloaded, 'job_move_other'), moveReloaded)
  .sections.experience.jobs.find((job) => job.id === 'rj_move')
  .groups.find((group) => group.id === 'rg_move_train').bullets[0].id, 'rb_move_b');
