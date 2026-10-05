/**
 * Brag Book store: log, job requirements, STAR compile, hash routes.
 */
import assert from 'node:assert/strict';
import {
  SCHEMA,
  emptyStore,
  normalizeStore,
  normalizeEntry,
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
  updateBullet,
  deleteBullet,
  addExperience,
  addResponse,
  updateResponse,
  deleteResponse,
  addQuestion,
  deleteQuestion,
  openNewPosting,
  isBlankPosting,
  NEW_POSTING_TITLE,
  linkEntry,
  unlinkEntry,
  parseRequirements,
  parseExperiences,
  stripBullet,
  isRequirementHeader,
  tokenize,
  starFill,
  starScript,
  searchEntries,
  scoreEntry,
  suggestEntries,
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
assert.deepEqual(emptyStore(), { v: 1, entries: [], postings: [] });
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
assert.equal(postingById(store, jobId).requirements[0].experiences.length, 1);
assert.equal(postingById(store, jobId).requirements[0].bullets.length, 1);
assert.equal(postingById(store, jobId).requirements[0].experiences, postingById(store, jobId).requirements[0].bullets);
store = addQuestion(store, jobId, req0.id, 'Walk me through a change that had to stay dependency-free ESM.', clock);
store = linkEntry(store, jobId, req0.id, store.entries.find((e) => e.kind === 'experience').id, clock);

const gisReq = postingById(store, jobId).requirements.find((r) => /GIS/i.test(r.text));
assert.ok(gisReq);
const suggestions = suggestEntries(store, gisReq);
assert.equal(suggestions[0].title, 'World in NYC ED join');
assert.ok(scoreEntry(suggestions[0], gisReq.text) > 0);

store = updateBullet(store, jobId, req0.id, postingById(store, jobId).requirements[0].bullets[0].id, 'Static files plus a Hobby-plan function budget.', clock);
store = updateRequirement(store, jobId, req0.id, { ready: true }, clock);

const compiled = compileResume(postingById(store, jobId));
assert.equal(compiled.bullets.length, 1);
assert.match(compileResumeText(postingById(store, jobId)), /• Static files/);

store = addExperience(store, jobId, req0.id, 'Wrote the packing-cubes sync as a dependency-free model.', clock);
store = addResponse(store, jobId, req0.id, {
  title: 'Hobby-plan multiplex',
  situation: 'Twelve functions already used.',
  task: 'Add another signed-in app.',
  action: 'Branched ?route= on the existing handler.',
  result: 'Stayed on the Hobby plan.',
}, clock);
const starId = postingById(store, jobId).requirements[0].responses[0].id;
store = updateResponse(store, jobId, req0.id, starId, { result: 'Stayed on Hobby with room for one more.' }, clock);
assert.match(postingById(store, jobId).requirements[0].responses[0].result, /room for one more/);

const prep = compilePrep(store, postingById(store, jobId));
assert.equal(prep[0].stories[0].title, 'Shipped packing cubes sync');
assert.equal(prep[0].questions.length, 1);
assert.equal(prep[0].experiences.length, 2);
assert.equal(prep[0].responses[0].title, 'Hobby-plan multiplex');
assert.equal(prep[0].responses[0].fill.ready, true);
const coverage = prepCoverage(store, postingById(store, jobId));
assert.equal(coverage.total, parsed.length);
assert.equal(coverage.withExperience, 1);
assert.equal(coverage.withBullet, 1);
assert.equal(coverage.withStory, 1);
assert.equal(coverage.withResponse, 1);
assert.equal(coverage.ready, 1);

const fromBullets = normalizeStore({
  postings: [{
    title: 'Legacy',
    requirements: [{ text: 'Need SQL', bullets: ['My old resume line'] }],
  }],
}, clock);
assert.equal(fromBullets.postings[0].requirements[0].experiences[0].text, 'My old resume line');
assert.equal(fromBullets.postings[0].requirements[0].bullets[0].text, 'My old resume line');

const opened = openNewPosting(emptyStore(), clock);
assert.equal(opened.created, true);
assert.equal(opened.posting.title, NEW_POSTING_TITLE);
assert.equal(isBlankPosting(opened.posting), true);
const reused = openNewPosting(opened.store, clock);
assert.equal(reused.created, false);
assert.equal(reused.posting.id, opened.posting.id);
store = deleteResponse(store, jobId, req0.id, starId, clock);
assert.equal(postingById(store, jobId).requirements[0].responses.length, 0);

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
assert.equal(viewTitle({ kind: 'jobs', id: 'new' }), 'New job posting');
assert.equal(viewTitle({ kind: 'log', id: 'new' }), 'Add experiences');

const pasted = parseExperiences(`
- Shipped packing cubes sync
- Hobby-plan function budget
- World in NYC ED join
`);
assert.deepEqual(pasted.map((item) => item.title), [
  'Shipped packing cubes sync',
  'Hobby-plan function budget',
  'World in NYC ED join',
]);

const blocks = parseExperiences(`
Shipped packing cubes sync
Suitcases were local-only.

Hobby-plan function budget
Prefer ?route= branches.
`);
assert.equal(blocks[0].notes, 'Suitcases were local-only.');
assert.equal(blocks[1].title, 'Hobby-plan function budget');

const stars = parseExperiences(`
Title: Multiplexed the API
Situation: Twelve functions already used.
Task: Add another signed-in app.
Action: Branched ?route= on the existing handler.
Result: Stayed on Hobby.

GIS join
Situation: Neighborhood blobs were too coarse.
`);
assert.equal(stars[0].title, 'Multiplexed the API');
assert.equal(stars[0].result, 'Stayed on Hobby.');
assert.equal(stars[1].title, 'GIS join');
assert.equal(stars[1].situation, 'Neighborhood blobs were too coarse.');
assert.deepEqual(parseExperiences(''), []);

let many = addEntries(emptyStore(), pasted, clock);
assert.equal(many.entries.length, 3);
assert.equal(many.entries[0].title, 'Shipped packing cubes sync');
assert.equal(many.entries[2].title, 'World in NYC ED join');
assert.equal(viewTitle({ kind: 'jobs', id: 'job_1', mode: 'prep' }, { postings: [{ id: 'job_1', title: 'PM' }] }), 'Prep · PM');

// ids stay unique even when the clock is pinned
const a = addEntry(emptyStore(), { title: 'One' }, clock, random);
const b = addEntry(a, { title: 'Two' }, clock, random);
assert.notEqual(b.entries[0].id, b.entries[1].id);

console.log('ok');
