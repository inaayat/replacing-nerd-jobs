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
  compilePrep,
  prepCoverage,
  listingSummary,
  entryById,
  postingById,
  serializeBook,
  bookIsEmpty,
  asUrl,
  titleFromJobUrl,
  hostFromJobUrl,
} from '../brag-book/engine.js';
import { parseViewHash, viewHash, viewTitle, defaultView } from '../brag-book/routes.js';

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
  profile: { name: '', email: '', location: '', summary: '', skills: '' },
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

// ids stay unique even when the clock is pinned
const a = addEntry(emptyStore(), { title: 'One' }, clock, random);
const b = addEntry(a, { title: 'Two' }, clock, random);
assert.notEqual(b.entries[0].id, b.entries[1].id);

console.log('ok');
