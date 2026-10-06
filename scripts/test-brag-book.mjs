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
  deleteAdditionalRow,
  addAdditionalGroup,
  isResumeDoc,
  parseBulletText,
  toggleId,
  clearBulletOverride,
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
  bookConflictError,
  STALE_BOOK_MESSAGE,
  resumeRoleKey,
  roleIsCollapsed,
  toggleRoleCollapsed,
  resumeRoleSummary,
  isRoleHeaderToggleTarget,
  adoptCompiledJob,
  bulletLineText,
  bulletFromLine,
  markdownToSpans,
  spansToMarkdown,
  asUrl,
  titleFromJobUrl,
  hostFromJobUrl,
} from '../brag-book/engine.js';
import { parseViewHash, viewHash, viewTitle, defaultView, logLayout, hideBookRail } from '../brag-book/routes.js';
import { renderResumeHtml } from '../brag-book/resume-template.js';
import { dropOrderFromDoc, FONT_FLOOR_PT, FIT_STEPS } from '../brag-book/resume-fit.js';
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
  postings: [],
  profile: { name: '', email: '', location: '', summary: '', skills: '', suffix: '', locations: [], phone: '', links: [] },
  jobs: [],
  education: [],
  credentials: [],
  additional: [],
  resumeSettings: { template: 'classic-serif', sectionOrder: DEFAULT_SECTION_ORDER.slice(), showCredentials: true },
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
richBook = updateBullet(richBook, richJob, richReq, richBullet.id, { notes: 'kept' }, clock);
richBullet = richBook.postings[0].requirements[0].bullets[0];
assert.equal(richBullet.notes, 'kept');
assert.equal(richBullet.rich[1].bold, true);
richBook = updateBullet(richBook, richJob, richReq, richBullet.id, 'Plain replacement', clock);
richBullet = richBook.postings[0].requirements[0].bullets[0];
assert.equal(richBullet.text, 'Plain replacement');
assert.equal(richBullet.rich[0].bold, false);
assert.equal(richBook.entries[0].title, 'Plain replacement');

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
named = addEntryBullet(named, namedJob, namedB.id, named.entries[0].id, 'A different name', clock);
assert.equal(named.postings[0].requirements[1].bullets[0].text, longLine);
named = updateBullet(named, namedJob, namedA.id, named.postings[0].requirements[0].bullets[0].id, 'Same line everywhere', clock);
assert.equal(named.entries[0].title, 'Same line everywhere');
assert.equal(named.postings[0].requirements[1].bullets[0].text, 'Same line everywhere');
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
assert.equal(aligned.entries[0].title, 'The long resume line');
assert.equal(aligned.postings[0].requirements[1].bullets[0].text, 'The long resume line');
assert.equal(aligned.postings[0].requirements[1].bullets[0].rich[1].bold, true);
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
assert.equal(viewHash({ kind: 'log' }), '#log');
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
  overrides: { b_pwc_rfp: { lead: 'Won new work', body: 'Closed **$5.8M**.' } },
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

seeded = updatePostingResume(seeded, seedJobId, { overrides: { b_pwc_rfp: { lead: 'Saved back', body: 'Wrote it down.' } } }, clock);
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
assert.equal(logLayout({ kind: 'log', id: 'en_1' }), 'detail');
assert.equal(hideBookRail({ kind: 'log', id: 'new' }, { entries: [{ id: 'e' }] }), false);
assert.equal(viewHash({ kind: 'log' }), '#log');
assert.equal(viewTitle({ kind: 'log' }), 'The book');

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
assert.equal(spansToMarkdown([
  { text: 'Led team:', bold: true },
  { text: ' Built it', bold: false },
]), '**Led team:** Built it');

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

console.log('ok');
