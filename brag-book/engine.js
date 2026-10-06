/**
 * Brag Book document model. Browser-safe ESM — no node: imports.
 *
 * One local store: experiences (`entries`) plus job postings.
 * Each requirement holds resume bullets, pinned stories, and questions
 * that each carry their own STAR answer. A slim `profile` rides on the
 * store for resume contact / summary / skills.
 */

export const SCHEMA = 1;
export const STORE_KEY = 'brag-book-store-v1';
export const BOOK_MAX_CHARS = 1_500_000;

import {
  emptyResumeSettings,
  normalizeResumeSettings,
  normalizeResumeVariant,
  normalizeProfileResume,
  normalizeCareerJobs,
  normalizeCareerJob,
  normalizeEducation,
  normalizeCredentials,
  normalizeAdditional,
  patchResumeVariant,
  importResumeDoc,
  moveListItem,
} from './resume-model.js';

export {
  RESUME_SECTION_KEYS,
  DEFAULT_SECTION_ORDER,
  emptyResumeSettings,
  emptyResumeVariant,
  normalizeResumeSettings,
  normalizeResumeVariant,
  normalizeCareerJob,
  normalizeCareerJobs,
  normalizeEducation,
  normalizeCredentials,
  normalizeAdditional,
  compileResumeDoc,
  importResumeDoc,
  isResumeDoc,
  parseBulletText,
  boldMetrics,
  bulletPlainText,
  visibleResumeDoc,
  headerFromProfile,
  moveListItem,
  moveKey,
  toggleId,
  findResumeBullet,
  writeBulletBackToSource,
  patchResumeVariant,
  clearBulletOverride,
} from './resume-model.js';

export const ENTRY_KINDS = ['experience', 'project', 'skillset'];
export const POSTING_STATUSES = ['draft', 'prepping', 'applied', 'archived'];

const TITLE_MAX = 160;
const TEXT_MAX = 4000;
const TAG_MAX = 32;
const TAGS_MAX = 16;
const URL_MAX = 2048;

export function emptyProfile() {
  return {
    name: '',
    email: '',
    location: '',
    summary: '',
    skills: '',
    suffix: '',
    locations: [],
    phone: '',
    links: [],
  };
}

export function emptyStore() {
  return {
    v: SCHEMA,
    entries: [],
    postings: [],
    profile: emptyProfile(),
    jobs: [],
    education: [],
    credentials: [],
    additional: [],
    resumeSettings: emptyResumeSettings(),
  };
}

export function normalizeProfile(raw) {
  const extra = normalizeProfileResume(raw);
  return {
    name: asString(raw?.name, TITLE_MAX),
    email: asString(raw?.email, TITLE_MAX),
    location: extra.locations.join(' / '),
    summary: asString(raw?.summary, TEXT_MAX),
    skills: asString(raw?.skills, TEXT_MAX),
    suffix: extra.suffix,
    locations: extra.locations,
    phone: extra.phone,
    links: extra.links,
  };
}

export const SAMPLE_JD = `Product engineer — Beep boop

About the role
We ship small tools without a build step.

Requirements:
- Ship production Javascript without a build step
- Comfortable with Postgres / Neon
- Write resume bullets that map to a posting
- Tell STAR stories about messy deploys
`;

export function nowIso(clock = Date.now) {
  return new Date(clock()).toISOString();
}

export function newId(prefix, clock = Date.now, random = Math.random) {
  const stamp = clock().toString(36);
  const extra = Math.floor(random() * 1e9).toString(36);
  return `${prefix}_${stamp}${extra}`;
}

function asString(value, max) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

export function asUrl(value) {
  const text = asString(value, URL_MAX);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function titleFromJobUrl(value) {
  const href = asUrl(value);
  if (!href) return '';
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, '');
    const last = url.pathname.split('/').filter(Boolean).pop() || '';
    const slug = decodeURIComponent(last).replace(/[-_]+/g, ' ').trim();
    if (slug && slug !== last) return asString(`${slug} · ${host}`, TITLE_MAX);
    if (slug) return asString(`${slug} · ${host}`, TITLE_MAX);
    return host;
  } catch {
    return '';
  }
}

export function hostFromJobUrl(value) {
  const href = asUrl(value);
  if (!href) return '';
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function asTags(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? '')
        .split(/[,#]/)
        .map((part) => part.trim());
  const seen = new Set();
  const tags = [];
  for (const item of raw) {
    const tag = asString(item, TAG_MAX).replace(/^#/, '').toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= TAGS_MAX) break;
  }
  return tags;
}

function asKind(value) {
  return ENTRY_KINDS.includes(value) ? value : 'experience';
}

function asStatus(value) {
  return POSTING_STATUSES.includes(value) ? value : 'draft';
}

function normalizeLine(item, clock) {
  if (typeof item === 'string') {
    const text = asString(item, TEXT_MAX);
    if (!text) return null;
    return { id: newId('ln', clock), text };
  }
  const text = asString(item?.text, TEXT_MAX);
  if (!text) return null;
  return { id: asString(item?.id, 64) || newId('ln', clock), text };
}

function normalizeLines(value, clock) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const line = normalizeLine(item, clock);
    if (!line || seen.has(line.id)) continue;
    seen.add(line.id);
    out.push(line);
  }
  return out;
}

function normalizeRichSpans(value, fallback) {
  const spans = [];
  const push = (text, bold) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    if (last && last.bold === Boolean(bold)) last.text += text;
    else spans.push({ text, bold: Boolean(bold) });
  };
  if (Array.isArray(value)) {
    for (const span of value) {
      if (!span || typeof span !== 'object') continue;
      let text = String(span.text ?? '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n');
      if (text.length > TEXT_MAX) text = text.slice(0, TEXT_MAX);
      push(text, span.bold);
    }
  }
  while (spans.length) {
    const last = spans[spans.length - 1];
    const trimmed = last.text.replace(/\n+$/, '');
    if (trimmed === last.text) break;
    if (!trimmed) spans.pop();
    else {
      last.text = trimmed;
      break;
    }
  }
  const joined = spans.map((span) => span.text).join('');
  if (joined.trim()) {
    if (joined.length <= TEXT_MAX) return { text: joined, rich: spans };
    let left = TEXT_MAX;
    const capped = [];
    for (const span of spans) {
      if (left <= 0) break;
      const text = span.text.length > left ? span.text.slice(0, left) : span.text;
      left -= text.length;
      if (text) capped.push({ text, bold: span.bold });
    }
    return { text: capped.map((span) => span.text).join(''), rich: capped };
  }
  const text = asString(fallback, TEXT_MAX);
  if (!text) return null;
  return { text, rich: [{ text, bold: false }] };
}

export function normalizeBullet(raw, clock = Date.now) {
  if (typeof raw === 'string') {
    const text = asString(raw, TEXT_MAX);
    if (!text) return null;
    return {
      id: newId('ln', clock),
      text,
      rich: [{ text, bold: false }],
      notes: '',
      situation: '',
      task: '',
      action: '',
      result: '',
      entryId: '',
    };
  }
  if (!raw || typeof raw !== 'object') return null;
  const formatted = normalizeRichSpans(raw.rich, raw.text);
  if (!formatted) return null;
  return {
    id: asString(raw.id, 64) || newId('ln', clock),
    text: formatted.text,
    rich: formatted.rich,
    notes: asString(raw.notes, TEXT_MAX),
    situation: asString(raw.situation, TEXT_MAX),
    task: asString(raw.task, TEXT_MAX),
    action: asString(raw.action, TEXT_MAX),
    result: asString(raw.result, TEXT_MAX),
    entryId: asString(raw.entryId, 64),
  };
}

function normalizeBullets(value, clock) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const bullet = normalizeBullet(item, clock);
    if (!bullet || seen.has(bullet.id)) continue;
    seen.add(bullet.id);
    out.push(bullet);
  }
  return out;
}

export function normalizeEntry(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  // The title is the resume line, so it can be as long as a bullet.
  const title = asString(raw.title, TEXT_MAX);
  if (!title) return null;
  const createdAt = asString(raw.createdAt, 40) || nowIso(clock);
  return {
    id: asString(raw.id, 64) || newId('en', clock),
    kind: asKind(raw.kind),
    title,
    role: asString(raw.role, TITLE_MAX),
    jobId: asString(raw.jobId, 64),
    when: asString(raw.when, 80),
    tags: asTags(raw.tags),
    situation: asString(raw.situation, TEXT_MAX),
    task: asString(raw.task, TEXT_MAX),
    action: asString(raw.action, TEXT_MAX),
    result: asString(raw.result, TEXT_MAX),
    notes: asString(raw.notes, TEXT_MAX),
    createdAt,
    updatedAt: asString(raw.updatedAt, 40) || createdAt,
  };
}

export function normalizeQuestion(raw, clock = Date.now) {
  if (typeof raw === 'string') {
    const text = asString(raw, TEXT_MAX);
    if (!text) return null;
    return { id: newId('ln', clock), text, answer: '', situation: '', task: '', action: '', result: '' };
  }
  if (!raw || typeof raw !== 'object') return null;
  const text = asString(raw.text, TEXT_MAX);
  if (!text) return null;
  return {
    id: asString(raw.id, 64) || newId('ln', clock),
    text,
    answer: asString(raw.answer, TEXT_MAX),
    situation: asString(raw.situation, TEXT_MAX),
    task: asString(raw.task, TEXT_MAX),
    action: asString(raw.action, TEXT_MAX),
    result: asString(raw.result, TEXT_MAX),
  };
}

function normalizeQuestions(value, clock) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const question = normalizeQuestion(item, clock);
    if (!question || seen.has(question.id)) continue;
    seen.add(question.id);
    out.push(question);
  }
  return out;
}

export function normalizeRequirement(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  const text = asString(raw.text, TEXT_MAX);
  if (!text) return null;
  const entryIds = Array.isArray(raw.entryIds)
    ? [...new Set(raw.entryIds.map((id) => asString(id, 64)).filter(Boolean))]
    : [];
  const source = Array.isArray(raw.experiences) && raw.experiences.length ? raw.experiences : raw.bullets;
  const bullets = normalizeBullets(source, clock);
  return {
    id: asString(raw.id, 64) || newId('rq', clock),
    text,
    bullets,
    experiences: bullets,
    questions: normalizeQuestions(raw.questions, clock),
    entryIds,
  };
}

export function normalizePosting(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  const url = asUrl(raw.url);
  const title = asString(raw.title, TITLE_MAX) || titleFromJobUrl(url);
  if (!title) return null;
  const createdAt = asString(raw.createdAt, 40) || nowIso(clock);
  const requirements = [];
  const seen = new Set();
  for (const item of Array.isArray(raw.requirements) ? raw.requirements : []) {
    const req = normalizeRequirement(item, clock);
    if (!req || seen.has(req.id)) continue;
    seen.add(req.id);
    requirements.push(req);
  }
  return {
    id: asString(raw.id, 64) || newId('job', clock),
    title,
    company: asString(raw.company, TITLE_MAX),
    url,
    status: asStatus(raw.status),
    notes: asString(raw.notes, TEXT_MAX),
    sourceText: asString(raw.sourceText, 20000),
    resumeText: asString(raw.resumeText, 20000),
    resume: normalizeResumeVariant(raw.resume),
    requirements,
    createdAt,
    updatedAt: asString(raw.updatedAt, 40) || createdAt,
  };
}

export function normalizeStore(raw, clock = Date.now) {
  const store = emptyStore();
  if (!raw || typeof raw !== 'object') return store;
  const seenEntries = new Set();
  for (const item of Array.isArray(raw.entries) ? raw.entries : []) {
    const entry = normalizeEntry(item, clock);
    if (!entry || seenEntries.has(entry.id)) continue;
    seenEntries.add(entry.id);
    store.entries.push(entry);
  }
  const seenJobs = new Set();
  for (const item of Array.isArray(raw.postings) ? raw.postings : []) {
    const posting = normalizePosting(item, clock);
    if (!posting || seenJobs.has(posting.id)) continue;
    seenJobs.add(posting.id);
    posting.requirements = posting.requirements.map((req) => ({
      ...req,
      entryIds: req.entryIds.filter((id) => seenEntries.has(id)),
      bullets: req.bullets.map((bullet) => ({
        ...bullet,
        entryId: seenEntries.has(bullet.entryId) ? bullet.entryId : '',
      })),
    }));
    posting.requirements = posting.requirements.map((req) => ({
      ...req,
      experiences: req.bullets,
    }));
    store.postings.push(posting);
  }
  store.profile = normalizeProfile(raw.profile);
  store.jobs = normalizeCareerJobs(raw.jobs, clock);
  store.education = normalizeEducation(raw.education, clock);
  store.credentials = normalizeCredentials(raw.credentials, clock);
  store.additional = normalizeAdditional(raw.additional, clock);
  store.resumeSettings = normalizeResumeSettings(raw.resumeSettings);
  return alignExperienceLines(store, clock);
}

function firstBulletForEntry(store, entryId) {
  if (!entryId) return null;
  for (const job of store?.postings || []) {
    for (const req of job.requirements || []) {
      const bullet = (req.bullets || []).find((line) => line.entryId === entryId);
      if (bullet) return bullet;
    }
  }
  return null;
}

function replaceEntry(store, id, patch, clock) {
  const current = entryById(store, id);
  if (!current) return store;
  const next = normalizeEntry({ ...current, ...patch, id: current.id, createdAt: current.createdAt }, clock);
  if (!next) return store;
  return { ...store, entries: replaceById(store.entries, id, touched(next, clock)) };
}

function sameRich(a, b) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (left.length !== right.length) return false;
  return left.every((span, index) => span.text === right[index].text && Boolean(span.bold) === Boolean(right[index].bold));
}

// One experience has one line. That line is the entry title and every resume bullet that points at it.
function experienceLineMatches(store, entryId, formatted) {
  const entry = entryById(store, entryId);
  if (!entry || entry.title !== formatted.text) return false;
  for (const job of store.postings || []) {
    for (const req of job.requirements || []) {
      for (const line of req.bullets || []) {
        if (line.entryId === entryId && (line.text !== formatted.text || !sameRich(line.rich, formatted.rich))) return false;
      }
    }
  }
  return true;
}

function applyExperienceLine(store, entryId, text, rich, clock) {
  const formatted = normalizeRichSpans(rich, text);
  if (!entryId || !formatted) return store;
  if (experienceLineMatches(store, entryId, formatted)) return store;
  let next = replaceEntry(store, entryId, { title: formatted.text }, clock);
  next = {
    ...next,
    postings: (next.postings || []).map((job) => ({
      ...job,
      requirements: job.requirements.map((req) => {
        let changed = false;
        const bullets = req.bullets.map((line) => {
          if (line.entryId !== entryId) return line;
          if (line.text === formatted.text && sameRich(line.rich, formatted.rich)) return line;
          changed = true;
          return normalizeBullet({ ...line, text: formatted.text, rich: formatted.rich, id: line.id }, clock) || line;
        });
        return changed ? withBullets(req, bullets) : req;
      }),
    })),
  };
  return next;
}

function alignExperienceLines(store, clock) {
  let next = store;
  const seen = new Set();
  for (const job of store.postings || []) {
    for (const req of job.requirements || []) {
      for (const bullet of req.bullets || []) {
        if (!bullet.entryId || seen.has(bullet.entryId)) continue;
        seen.add(bullet.entryId);
        next = applyExperienceLine(next, bullet.entryId, bullet.text, bullet.rich, clock);
      }
    }
  }
  return next;
}

function touched(record, clock) {
  return { ...record, updatedAt: nowIso(clock) };
}

function replaceById(list, id, next) {
  return list.map((item) => (item.id === id ? next : item));
}

function dropById(list, id) {
  return list.filter((item) => item.id !== id);
}

export function entryById(store, id) {
  return (store?.entries || []).find((entry) => entry.id === id) || null;
}

export function postingById(store, id) {
  return (store?.postings || []).find((job) => job.id === id) || null;
}

export function requirementById(posting, id) {
  return (posting?.requirements || []).find((req) => req.id === id) || null;
}

export function addEntry(store, draft, clock = Date.now) {
  const entry = normalizeEntry({ ...draft, id: draft?.id || newId('en', clock), createdAt: nowIso(clock) }, clock);
  if (!entry) return store;
  return { ...store, entries: [entry, ...store.entries] };
}

export function addEntries(store, drafts, clock = Date.now) {
  let next = store;
  for (const draft of [...(drafts || [])].reverse()) next = addEntry(next, draft, clock);
  return next;
}

export function updateProfile(store, patch) {
  return { ...store, profile: normalizeProfile({ ...(store?.profile || emptyProfile()), ...patch }) };
}

export function updateEntry(store, id, patch, clock = Date.now) {
  const next = replaceEntry(store, id, patch, clock);
  if (!patch || !Object.prototype.hasOwnProperty.call(patch, 'title')) return next;
  const entry = entryById(next, id);
  if (!entry) return next;
  const bullet = firstBulletForEntry(next, id);
  const rich = bullet && bullet.text === entry.title ? bullet.rich : null;
  return applyExperienceLine(next, id, entry.title, rich, clock);
}

export function deleteEntry(store, id) {
  if (!entryById(store, id)) return store;
  return {
    ...store,
    entries: dropById(store.entries, id),
    postings: store.postings.map((job) => ({
      ...job,
      requirements: job.requirements.map((req) => ({
        ...req,
        entryIds: req.entryIds.filter((entryId) => entryId !== id),
        bullets: req.bullets.filter((bullet) => bullet.entryId !== id),
        experiences: req.bullets.filter((bullet) => bullet.entryId !== id),
      })),
    })),
  };
}

export function addPosting(store, draft, clock = Date.now) {
  const posting = normalizePosting(
    { ...draft, id: draft?.id || newId('job', clock), createdAt: nowIso(clock) },
    clock
  );
  if (!posting) return store;
  return { ...store, postings: [posting, ...store.postings] };
}

export function updatePosting(store, id, patch, clock = Date.now) {
  const current = postingById(store, id);
  if (!current) return store;
  const next = normalizePosting(
    { ...current, ...patch, id: current.id, createdAt: current.createdAt, requirements: current.requirements },
    clock
  );
  if (!next) return store;
  return { ...store, postings: replaceById(store.postings, id, touched(next, clock)) };
}

export function updatePostingResume(store, id, patch, clock = Date.now) {
  const current = postingById(store, id);
  if (!current) return store;
  return updatePosting(store, id, { resume: patchResumeVariant(current.resume, patch) }, clock);
}

export function replacePostingResume(store, id, resume, clock = Date.now) {
  const current = postingById(store, id);
  if (!current) return store;
  return updatePosting(store, id, { resume: normalizeResumeVariant(resume) }, clock);
}

export function applyImportedResume(store, raw, clock = Date.now) {
  return normalizeStore(importResumeDoc(store || emptyStore(), raw, clock), clock);
}

export function updateCareerJob(store, id, patch, clock = Date.now) {
  const jobs = (store?.jobs || []).map((job) => {
    if (job.id !== id) return job;
    return normalizeCareerJob({ ...job, ...patch, id: job.id }, clock) || job;
  });
  return { ...store, jobs };
}

export function moveCareerJob(store, id, delta) {
  return { ...store, jobs: moveListItem(store?.jobs || [], id, delta) };
}

export function updateResumeSettings(store, patch) {
  return {
    ...store,
    resumeSettings: normalizeResumeSettings({ ...(store?.resumeSettings || emptyResumeSettings()), ...patch }),
  };
}

export function updateEducationItem(store, id, patch, clock = Date.now) {
  return {
    ...store,
    education: normalizeEducation(
      (store?.education || []).map((item) => (item.id === id ? { ...item, ...patch, id: item.id } : item)),
      clock
    ),
  };
}

export function updateCredentialItem(store, id, patch, clock = Date.now) {
  return {
    ...store,
    credentials: normalizeCredentials(
      (store?.credentials || []).map((item) => (item.id === id ? { ...item, ...patch, id: item.id } : item)),
      clock
    ),
  };
}

export function updateAdditionalRow(store, id, patch, clock = Date.now) {
  return {
    ...store,
    additional: normalizeAdditional(
      (store?.additional || []).map((item) => (item.id === id ? { ...item, ...patch, id: item.id } : item)),
      clock
    ),
  };
}

function mapCareerJob(store, jobId, fn, clock = Date.now) {
  const current = (store?.jobs || []).find((job) => job.id === jobId);
  if (!current) return store;
  const next = normalizeCareerJob(fn(current), clock);
  if (!next) return store;
  return { ...store, jobs: replaceById(store.jobs, jobId, next) };
}

export function addCareerJob(store, draft = {}, clock = Date.now, random = Math.random) {
  const job = normalizeCareerJob({
    company: '',
    title: '',
    location: '',
    start: '',
    end: '',
    groups: [{ id: newId('rg', clock, random), heading: '', bullets: [] }],
    ...draft,
    id: draft.id || newId('rj', clock, random),
  }, clock);
  if (!job) return store;
  return { ...store, jobs: [...(store.jobs || []), job] };
}

export function deleteCareerJob(store, id) {
  if (!(store?.jobs || []).some((job) => job.id === id)) return store;
  return { ...store, jobs: dropById(store.jobs, id) };
}

export function addCareerGroup(store, jobId, draft = {}, clock = Date.now, random = Math.random) {
  return mapCareerJob(store, jobId, (job) => ({
    ...job,
    groups: [...(job.groups || []), {
      id: draft.id || newId('rg', clock, random),
      heading: draft.heading || '',
      bullets: Array.isArray(draft.bullets) ? draft.bullets : [],
    }],
  }), clock);
}

export function deleteCareerGroup(store, jobId, groupId, clock = Date.now) {
  return mapCareerJob(store, jobId, (job) => ({
    ...job,
    groups: (job.groups || []).filter((group) => group.id !== groupId),
  }), clock);
}

export function addCareerBullet(store, jobId, groupId, draft = {}, clock = Date.now, random = Math.random) {
  const current = (store?.jobs || []).find((job) => job.id === jobId);
  if (!current) return store;
  let groups = current.groups || [];
  if (groupId && !groups.some((group) => group.id === groupId)) return store;
  if (!groups.length) {
    groups = [{ id: newId('rg', clock, random), heading: '', bullets: [] }];
    groupId = groups[0].id;
  }
  const targetId = groupId || groups[groups.length - 1].id;
  const bullet = {
    id: draft.id || newId('rb', clock, random),
    lead: draft.lead || '',
    body: draft.body || '',
    priority: draft.priority,
    pinned: draft.pinned,
  };
  return mapCareerJob(store, jobId, (job) => ({
    ...job,
    groups: (job.groups?.length ? job.groups : groups).map((group) => (
      group.id === targetId ? { ...group, bullets: [...(group.bullets || []), bullet] } : group
    )),
  }), clock);
}

export function deleteCareerBullet(store, jobId, groupId, bulletId, clock = Date.now) {
  return mapCareerJob(store, jobId, (job) => ({
    ...job,
    groups: (job.groups || []).map((group) => (
      group.id === groupId
        ? { ...group, bullets: (group.bullets || []).filter((bullet) => bullet.id !== bulletId) }
        : group
    )),
  }), clock);
}

export function moveCareerBullet(store, jobId, groupId, bulletId, delta, clock = Date.now) {
  return mapCareerJob(store, jobId, (job) => ({
    ...job,
    groups: (job.groups || []).map((group) => (
      group.id === groupId
        ? { ...group, bullets: moveListItem(group.bullets || [], bulletId, delta) }
        : group
    )),
  }), clock);
}

export function moveCareerGroup(store, jobId, groupId, delta, clock = Date.now) {
  return mapCareerJob(store, jobId, (job) => ({
    ...job,
    groups: moveListItem(job.groups || [], groupId, delta),
  }), clock);
}

export function addEducationItem(store, draft = {}, clock = Date.now, random = Math.random) {
  const row = normalizeEducation(
    [...(store?.education || []), { school: '', ...draft, id: draft.id || newId('ed', clock, random) }],
    clock
  );
  return { ...store, education: row };
}

export function deleteEducationItem(store, id) {
  return { ...store, education: dropById(store?.education || [], id) };
}

export function moveEducationItem(store, id, delta) {
  return { ...store, education: moveListItem(store?.education || [], id, delta) };
}

export function addCredentialItem(store, draft = {}, clock = Date.now, random = Math.random) {
  const row = normalizeCredentials(
    [...(store?.credentials || []), { name: '', ...draft, id: draft.id || newId('cr', clock, random) }],
    clock
  );
  return { ...store, credentials: row };
}

export function deleteCredentialItem(store, id) {
  return { ...store, credentials: dropById(store?.credentials || [], id) };
}

export function moveCredentialItem(store, id, delta) {
  return { ...store, credentials: moveListItem(store?.credentials || [], id, delta) };
}

export function addAdditionalRow(store, draft = {}, clock = Date.now, random = Math.random) {
  const row = normalizeAdditional(
    [...(store?.additional || []), {
      label: '',
      items: [],
      groups: [],
      ...draft,
      id: draft.id || newId('ad', clock, random),
    }],
    clock
  );
  return { ...store, additional: row };
}

export function deleteAdditionalRow(store, id) {
  return { ...store, additional: dropById(store?.additional || [], id) };
}

export function moveAdditionalRow(store, id, delta) {
  return { ...store, additional: moveListItem(store?.additional || [], id, delta) };
}

export function addAdditionalGroup(store, rowId, draft = {}, clock = Date.now, random = Math.random) {
  return {
    ...store,
    additional: normalizeAdditional(
      (store?.additional || []).map((row) => {
        if (row.id !== rowId) return row;
        const incoming = {
          id: draft.id || newId('sg', clock, random),
          label: draft.label || '',
          items: Array.isArray(draft.items) ? draft.items : [],
        };
        if (row.groups?.length) {
          return { ...row, items: [], groups: [...row.groups, incoming] };
        }
        return {
          ...row,
          items: [],
          groups: [{
            ...incoming,
            items: incoming.items.length ? incoming.items : (row.items || []),
          }],
        };
      }),
      clock
    ),
  };
}

export function updateAdditionalGroup(store, rowId, groupId, patch, clock = Date.now) {
  return {
    ...store,
    additional: normalizeAdditional(
      (store?.additional || []).map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          groups: (row.groups || []).map((group) => (
            group.id === groupId ? { ...group, ...patch, id: group.id } : group
          )),
        };
      }),
      clock
    ),
  };
}

export function deleteAdditionalGroup(store, rowId, groupId, clock = Date.now) {
  return {
    ...store,
    additional: normalizeAdditional(
      (store?.additional || []).map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          groups: (row.groups || []).filter((group) => group.id !== groupId),
        };
      }),
      clock
    ),
  };
}

export function deletePosting(store, id) {
  if (!postingById(store, id)) return store;
  return { ...store, postings: dropById(store.postings, id) };
}

function mapRequirement(store, postingId, requirementId, fn, clock = Date.now) {
  const job = postingById(store, postingId);
  const req = requirementById(job, requirementId);
  if (!job || !req) return store;
  const nextReq = fn(req);
  if (!nextReq) return store;
  const nextJob = touched(
    {
      ...job,
      requirements: replaceById(job.requirements, requirementId, nextReq),
    },
    clock
  );
  return { ...store, postings: replaceById(store.postings, postingId, nextJob) };
}

export function addRequirement(store, postingId, text, clock = Date.now) {
  const job = postingById(store, postingId);
  const req = normalizeRequirement({ text, id: newId('rq', clock) }, clock);
  if (!job || !req) return store;
  const nextJob = touched({ ...job, requirements: [...job.requirements, req] }, clock);
  return { ...store, postings: replaceById(store.postings, postingId, nextJob) };
}

export function addRequirements(store, postingId, texts, clock = Date.now) {
  let next = store;
  for (const text of texts || []) next = addRequirement(next, postingId, text, clock);
  return next;
}

export function updateRequirement(store, postingId, requirementId, patch, clock = Date.now) {
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => normalizeRequirement({ ...req, ...patch, id: req.id }, clock),
    clock
  );
}

export function deleteRequirement(store, postingId, requirementId, clock = Date.now) {
  const job = postingById(store, postingId);
  if (!job || !requirementById(job, requirementId)) return store;
  const nextJob = touched(
    { ...job, requirements: dropById(job.requirements, requirementId) },
    clock
  );
  return { ...store, postings: replaceById(store.postings, postingId, nextJob) };
}

export function moveRequirement(store, postingId, requirementId, delta, clock = Date.now) {
  const job = postingById(store, postingId);
  if (!job) return store;
  const index = job.requirements.findIndex((req) => req.id === requirementId);
  if (index < 0) return store;
  const nextIndex = index + Number(delta || 0);
  if (nextIndex < 0 || nextIndex >= job.requirements.length) return store;
  const requirements = job.requirements.slice();
  const [row] = requirements.splice(index, 1);
  requirements.splice(nextIndex, 0, row);
  return { ...store, postings: replaceById(store.postings, postingId, touched({ ...job, requirements }, clock)) };
}

function withBullets(req, bullets) {
  return { ...req, bullets, experiences: bullets };
}

export function addBullet(store, postingId, requirementId, text, clock = Date.now) {
  const line = normalizeBullet({ text, id: newId('ln', clock) }, clock);
  if (!line) return store;
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => withBullets(req, [...req.bullets, line]),
    clock
  );
}

export function addEntryBullet(store, postingId, requirementId, entryId, text = '', clock = Date.now, rich) {
  const entry = entryById(store, entryId);
  const job = postingById(store, postingId);
  const req = requirementById(job, requirementId);
  if (!entry || !req || req.bullets.some((bullet) => bullet.entryId === entryId)) return store;
  const sibling = firstBulletForEntry(store, entryId);
  const line = normalizeBullet({
    id: newId('ln', clock),
    entryId,
    text: sibling?.text || asString(text, TEXT_MAX) || entry.title,
    rich: sibling ? sibling.rich : rich,
  }, clock);
  if (!line) return store;
  let next = mapRequirement(
    store,
    postingId,
    requirementId,
    (current) => withBullets(current, [...current.bullets, line]),
    clock
  );
  if (!sibling && line.text !== entry.title) next = replaceEntry(next, entryId, { title: line.text }, clock);
  return next;
}

export function createEntryBullet(store, postingId, requirementId, text, clock = Date.now, rich) {
  const formatted = normalizeRichSpans(rich, text);
  const title = asString(formatted?.text || text, TEXT_MAX);
  if (!title || !formatted) return store;
  const entryId = newId('en', clock);
  const next = addEntry(store, { id: entryId, title, kind: 'experience' }, clock);
  return addEntryBullet(next, postingId, requirementId, entryId, formatted.text, clock, formatted.rich);
}

export function updateBullet(store, postingId, requirementId, bulletId, patch, clock = Date.now) {
  const nextPatch = typeof patch === 'string' ? { text: patch } : { ...(patch || {}) };
  // A plain-text edit replaces the line. Keeping the previous spans would
  // ignore the new text, because those spans are the source of the line.
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'text') && !Object.prototype.hasOwnProperty.call(nextPatch, 'rich')) {
    nextPatch.rich = null;
  }
  const next = mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => withBullets(
      req,
      req.bullets.map((line) => {
        if (line.id !== bulletId) return line;
        return normalizeBullet({ ...line, ...nextPatch, id: line.id }, clock) || line;
      }).filter((line) => line.text)
    ),
    clock
  );
  if (!Object.prototype.hasOwnProperty.call(nextPatch, 'text')) return next;
  const bullet = requirementById(postingById(next, postingId), requirementId)?.bullets.find((line) => line.id === bulletId);
  if (!bullet?.entryId) return next;
  return applyExperienceLine(next, bullet.entryId, bullet.text, bullet.rich, clock);
}

export function deleteBullet(store, postingId, requirementId, bulletId, clock = Date.now) {
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => withBullets(req, dropById(req.bullets, bulletId)),
    clock
  );
}

export function addQuestion(store, postingId, requirementId, draft, clock = Date.now) {
  const question = normalizeQuestion(
    typeof draft === 'string' ? { text: draft, id: newId('ln', clock) } : { ...draft, id: draft?.id || newId('ln', clock) },
    clock
  );
  if (!question) return store;
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => ({ ...req, questions: [...req.questions, question] }),
    clock
  );
}

export function updateQuestion(store, postingId, requirementId, questionId, patch, clock = Date.now) {
  const nextPatch = typeof patch === 'string' ? { text: patch } : (patch || {});
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => ({
      ...req,
      questions: req.questions.map((line) => {
        if (line.id !== questionId) return line;
        return normalizeQuestion({ ...line, ...nextPatch, id: line.id }, clock) || line;
      }).filter((line) => line.text),
    }),
    clock
  );
}

export function deleteQuestion(store, postingId, requirementId, questionId, clock = Date.now) {
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => ({ ...req, questions: dropById(req.questions, questionId) }),
    clock
  );
}

export function linkEntry(store, postingId, requirementId, entryId, clock = Date.now) {
  if (!entryById(store, entryId)) return store;
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) =>
      req.entryIds.includes(entryId)
        ? req
        : { ...req, entryIds: [...req.entryIds, entryId] },
    clock
  );
}

export function answerQuestionFromEntry(store, postingId, requirementId, questionId, entryId, clock = Date.now) {
  const entry = entryById(store, entryId);
  if (!entry) return store;
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => ({
      ...req,
      questions: req.questions.map((question) =>
        question.id === questionId ? applyStoryToQuestion(question, entry) : question
      ),
    }),
    clock
  );
}

export function unlinkEntry(store, postingId, requirementId, entryId, clock = Date.now) {
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => ({ ...req, entryIds: req.entryIds.filter((id) => id !== entryId) }),
    clock
  );
}

const HEADER_RE = /^(requirements?|qualifications?|what you.?ll do|responsibilities|about (the )?(role|job|you)|nice to have|preferred|minimum|must have|we(?:'re| are) looking)\b/i;
const BULLET_RE = /^(?:[-*•–—●▪‣∙]|\d+[.)]|[a-z][.)])\s+/i;

export function stripBullet(line) {
  return String(line || '')
    .replace(/\r/g, '')
    .replace(BULLET_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Paste keeps the words and the line breaks the person typed. Source formatting
// (indent, runs of spaces, blank lines, a copied bullet) does not come along.
export function cleanPastedText(value) {
  const text = String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '').replace(/[ \t]{2,}/g, ' '))
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/^\n+|\n+$/g, '');
  return text.replace(/^\s*[-*•–—●▪‣∙]\s+/, '');
}

export function isRequirementHeader(line) {
  const text = stripBullet(line);
  if (!text) return true;
  if (text.length <= 40 && /:$/.test(text)) return true;
  return HEADER_RE.test(text) && text.length <= 48;
}

export function parseRequirements(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const fromBullets = [];
  for (const line of lines) {
    if (!BULLET_RE.test(line) && !/^[-*•]/.test(line)) continue;
    const cleaned = stripBullet(line);
    if (!cleaned || isRequirementHeader(cleaned) || cleaned.length > 400) continue;
    fromBullets.push(cleaned);
  }
  const unique = (items) => {
    const seen = new Set();
    const out = [];
    for (const item of items) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };
  const shortLines = lines
    .map(stripBullet)
    .filter((line) => line && !isRequirementHeader(line) && line.length <= 280);
  if (fromBullets.length) {
    const extras = shortLines.filter((line) => line.length <= 160);
    return unique([...fromBullets, ...extras]);
  }
  if (shortLines.length >= 2) return unique(shortLines);
  return unique(
    raw
      .split(/\n{2,}/)
      .map((para) => para.replace(/\s+/g, ' ').trim())
      .filter((para) => para.length >= 12 && para.length <= 400 && !isRequirementHeader(para))
  );
}

const STOP = new Set([
  'a', 'an', 'and', 'the', 'to', 'of', 'in', 'on', 'for', 'with', 'or', 'as',
  'is', 'are', 'be', 'by', 'at', 'from', 'that', 'this', 'you', 'your', 'we',
  'our', 'will', 'able', 'plus', 'using', 'use', 'into', 'over', 'per',
]);

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((token) => token.length >= 3 && !STOP.has(token));
}

export function starFill(entry) {
  const parts = ['situation', 'task', 'action', 'result'];
  const filled = parts.filter((key) => asString(entry?.[key], TEXT_MAX));
  return { filled: filled.length, total: 4, ready: filled.length === 4, missing: parts.filter((key) => !asString(entry?.[key], TEXT_MAX)) };
}

export function starScript(entry) {
  if (!entry) return '';
  const bits = [
    entry.situation && `Situation: ${entry.situation}`,
    entry.task && `Task: ${entry.task}`,
    entry.action && `Action: ${entry.action}`,
    entry.result && `Result: ${entry.result}`,
  ].filter(Boolean);
  return bits.join('\n');
}

export function searchEntries(store, query) {
  const q = asString(query, 200).toLowerCase();
  const list = store?.entries || [];
  if (!q) return list;
  const tokens = tokenize(q);
  return list.filter((entry) => {
    const hay = [
      entry.title,
      entry.role,
      entry.kind,
      entry.when,
      entry.notes,
      entry.situation,
      entry.task,
      entry.action,
      entry.result,
      ...(entry.tags || []),
    ]
      .join(' ')
      .toLowerCase();
    if (hay.includes(q)) return true;
    return tokens.every((token) => hay.includes(token));
  });
}

export function scoreEntry(entry, requirementText) {
  if (!entry) return 0;
  const needles = new Set([
    ...tokenize(requirementText),
    ...asTags(entry.tags),
  ]);
  const hay = [
    entry.title,
    entry.role,
    ...(entry.tags || []),
    entry.situation,
    entry.task,
    entry.action,
    entry.result,
    entry.notes,
    entry.kind,
  ]
    .join(' ')
    .toLowerCase();
  let hits = 0;
  for (const needle of needles) {
    if (needle && hay.includes(needle)) hits += 1;
  }
  for (const tag of entry.tags || []) {
    if (String(requirementText || '').toLowerCase().includes(tag)) hits += 2;
  }
  return hits;
}

export function suggestEntries(store, requirement, limit = 6) {
  const text = requirement?.text || requirement || '';
  const used = new Set(requirement?.entryIds || []);
  return (store?.entries || [])
    .filter((entry) => !used.has(entry.id))
    .map((entry) => ({ entry, score: scoreEntry(entry, text) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.updatedAt.localeCompare(a.entry.updatedAt))
    .slice(0, limit)
    .map((row) => row.entry);
}

export function linkedEntries(store, requirement) {
  const ids = [
    ...(requirement?.entryIds || []),
    ...(requirement?.bullets || []).map((bullet) => bullet.entryId).filter(Boolean),
  ];
  return [...new Set(ids)]
    .map((id) => entryById(store, id))
    .filter(Boolean);
}

export function bulletEntry(store, bullet) {
  return bullet?.entryId ? entryById(store, bullet.entryId) : null;
}

export function draftBulletFromEntry(entry) {
  if (!entry) return '';
  return asString(entry.result || entry.action || entry.notes || entry.title, TEXT_MAX);
}

export function applyStoryToQuestion(question, entry) {
  if (!question || !entry) return question;
  return normalizeQuestion({
    ...question,
    answer: starScript(entry) || draftBulletFromEntry(entry) || question.answer,
    situation: entry.situation || question.situation,
    task: entry.task || question.task,
    action: entry.action || question.action,
    result: entry.result || question.result,
  });
}

export function questionAnswered(question) {
  if (!question) return false;
  return Boolean(asString(question.answer, TEXT_MAX) || starFill(question).filled);
}

function resumeGroup(entry) {
  return asString(entry?.role, TITLE_MAX) || asString(entry?.when, 80) || 'Experience';
}

export function compileResume(posting, store) {
  const profile = normalizeProfile(store?.profile || posting?.profile);
  const skillTags = [
    ...asTags(profile.skills),
    ...(store?.entries || [])
      .filter((entry) => entry.kind === 'skillset')
      .flatMap((entry) => [entry.title, ...(entry.tags || [])]),
  ];
  const skills = [...new Set(skillTags.map((item) => String(item || '').trim()).filter(Boolean))];
  const seen = new Set();
  const groups = new Map();
  for (const req of posting?.requirements || []) {
    for (const bullet of req.bullets || req.experiences || []) {
      const text = asString(bullet?.text, TEXT_MAX);
      if (!text) continue;
      const entry = bullet?.entryId ? entryById(store, bullet.entryId) : null;
      const textKey = `text:${text.toLowerCase()}`;
      const idKey = bullet?.entryId ? `id:${bullet.entryId}` : '';
      if (seen.has(textKey) || (idKey && seen.has(idKey))) continue;
      seen.add(textKey);
      if (idKey) seen.add(idKey);
      const role = resumeGroup(entry);
      if (!groups.has(role)) groups.set(role, { id: role, role, bullets: [] });
      groups.get(role).bullets.push(text);
    }
  }
  const sections = [...groups.values()];
  return {
    title: posting?.title || '',
    company: posting?.company || '',
    profile,
    skills,
    sections,
    bullets: sections.flatMap((section) => section.bullets),
  };
}

export function compileResumeText(posting, store) {
  const compiled = compileResume(posting, store);
  const who = [compiled.profile.name, compiled.profile.email, compiled.profile.location].filter(Boolean);
  const head = [compiled.title, compiled.company].filter(Boolean).join(' · ');
  const skillLine = compiled.skills.length ? `Skills: ${compiled.skills.join(', ')}` : '';
  const blocks = compiled.sections
    .filter((section) => section.bullets.length)
    .map((section) => `${section.role}\n${section.bullets.map((b) => `• ${b}`).join('\n')}`);
  return [...who, compiled.profile.summary, head, skillLine, ...blocks].filter(Boolean).join('\n\n');
}

export function compileResumeHtml(posting, store) {
  const compiled = compileResume(posting, store);
  const esc = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
  const who = [compiled.profile.name, compiled.profile.email, compiled.profile.location].filter(Boolean).map(esc);
  const sections = compiled.sections
    .filter((section) => section.bullets.length)
    .map((section) => `<h2>${esc(section.role)}</h2><ul>${section.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`)
    .join('');
  const skills = compiled.skills.length ? `<p><strong>Skills.</strong> ${esc(compiled.skills.join(', '))}</p>` : '';
  const summary = compiled.profile.summary ? `<p>${esc(compiled.profile.summary)}</p>` : '';
  const role = [compiled.title, compiled.company].filter(Boolean).map(esc).join(' · ');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(role || compiled.profile.name || 'Resume')}</title>
<style>body{font:16px/1.45 Georgia,serif;max-width:42rem;margin:2rem auto;padding:0 1.25rem;color:#111}h1{font-size:1.8rem;margin:0 0 .25rem}h2{font-size:1.05rem;margin:1.4rem 0 .4rem}ul{margin:.2rem 0 0 1.1rem}p{margin:0 0 .75rem}.meta{color:#555;font-size:.9rem}</style>
</head><body>
<h1>${esc(compiled.profile.name || role || 'Resume')}</h1>
${who.length ? `<p class="meta">${who.join(' · ')}</p>` : ''}
${role && compiled.profile.name ? `<p class="meta">${role}</p>` : ''}
${summary}${skills}${sections || '<p>Add a resume bullet on a requirement first.</p>'}
</body></html>`;
}

export function resumeTextToWordHtml(text, title = 'Resume') {
  const esc = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
  const body = esc(text).replace(/\n/g, '<br>');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body style="font:12pt Georgia,serif">${body}</body></html>`;
}

export function compilePrep(store, posting) {
  return (posting?.requirements || []).map((req) => {
    const bulletEntryIds = new Set((req.bullets || []).map((bullet) => bullet.entryId).filter(Boolean));
    const stories = linkedEntries(store, req).filter((entry) => !bulletEntryIds.has(entry.id)).map((entry) => ({
      id: entry.id,
      title: entry.title,
      kind: entry.kind,
      when: entry.when,
      tags: entry.tags,
      fill: starFill(entry),
      script: starScript(entry),
      situation: entry.situation,
      task: entry.task,
      action: entry.action,
      result: entry.result,
      notes: entry.notes,
    }));
    const questions = (req.questions || []).map((question) => ({
      id: question.id,
      text: question.text,
      answer: question.answer,
      fill: starFill(question),
      script: starScript(question),
      situation: question.situation,
      task: question.task,
      action: question.action,
      result: question.result,
      answered: questionAnswered(question),
    }));
    const bulletDetails = (req.bullets || []).map((bullet) => {
      const entry = bulletEntry(store, bullet);
      const detail = entry || bullet;
      return {
        id: bullet.id,
        entryId: entry?.id || '',
        title: entry?.title || bullet.text,
        text: bullet.text,
        notes: detail.notes,
        fill: starFill(detail),
        script: starScript(detail),
        situation: detail.situation,
        task: detail.task,
        action: detail.action,
        result: detail.result,
      };
    });
    return {
      id: req.id,
      text: req.text,
      bullets: (req.bullets || []).map((line) => line.text),
      bulletDetails,
      questions,
      stories,
    };
  });
}

export function prepCoverage(store, posting) {
  const cards = compilePrep(store, posting);
  const total = cards.length;
  const withBullet = cards.filter((card) => card.bullets.length).length;
  const withStory = cards.filter((card) =>
    card.stories.length || card.bulletDetails.some((bullet) => bullet.fill.filled || bullet.notes)
  ).length;
  const withQuestion = cards.filter((card) => card.questions.length).length;
  const withAnswer = cards.filter((card) =>
    card.questions.some((question) => question.answered)
    || card.stories.some((story) => story.fill.filled)
    || card.bulletDetails.some((bullet) => bullet.fill.filled)
  ).length;
  const needBullet = total - withBullet;
  const needStory = total - withStory;
  const needQuestion = total - withQuestion;
  const needAnswer = cards.filter((card) =>
    !card.questions.some((question) => question.answered)
    && !card.stories.some((story) => story.fill.filled)
    && !card.bulletDetails.some((bullet) => bullet.fill.filled)
  ).length;
  const hints = [];
  if (needBullet) hints.push(`${needBullet} requirement${needBullet === 1 ? '' : 's'} need a resume bullet`);
  if (needStory) hints.push(`${needStory} need an experience`);
  if (needQuestion) hints.push(`${needQuestion} need a question`);
  if (needAnswer) hints.push(`${needAnswer} need a STAR answer`);
  if (!hints.length && total) hints.push('Every requirement has something to say. Walk Prep, then copy the resume.');
  return { total, withBullet, withStory, withQuestion, withAnswer, needBullet, needStory, needQuestion, needAnswer, hints };
}

const STAR_FIELD_RE = /^(title|situation|task|action|result|notes|when|tags|kind)\s*:\s*(.*)$/im;

function uniqueDrafts(drafts) {
  const seen = new Set();
  const out = [];
  for (const draft of drafts) {
    const title = asString(draft?.title, TITLE_MAX);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...draft, title });
  }
  return out;
}

function starBlockToDraft(chunk) {
  const draft = { kind: 'experience' };
  const leftover = [];
  for (const rawLine of String(chunk || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(STAR_FIELD_RE);
    if (match) {
      draft[match[1].toLowerCase()] = match[2];
      continue;
    }
    const cleaned = stripBullet(line);
    if (cleaned && !isRequirementHeader(cleaned)) leftover.push(cleaned);
  }
  if (!draft.title) draft.title = leftover[0] || asString(draft.situation, TITLE_MAX) || asString(draft.notes, TITLE_MAX);
  if (!draft.notes && leftover.length) {
    draft.notes = (leftover[0] === draft.title ? leftover.slice(1) : leftover).join('\n');
  }
  return draft.title ? draft : null;
}

export function parseExperiences(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  if (STAR_FIELD_RE.test(raw)) {
    return uniqueDrafts(raw.split(/\n{2,}/).map(starBlockToDraft).filter(Boolean));
  }
  const blocks = raw.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length >= 2) {
    return uniqueDrafts(blocks.map((block) => {
      const lines = block.split('\n').map(stripBullet).filter((line) => line && !isRequirementHeader(line));
      if (!lines.length) return null;
      return { title: lines[0], notes: lines.slice(1).join('\n'), kind: 'experience' };
    }).filter(Boolean));
  }
  const lines = [];
  for (const line of raw.split('\n')) {
    const cleaned = stripBullet(line);
    if (!cleaned || isRequirementHeader(cleaned)) continue;
    lines.push({ title: cleaned, kind: 'experience' });
  }
  return uniqueDrafts(lines);
}

export function serializeBook(raw, { maxChars = BOOK_MAX_CHARS } = {}) {
  const book = normalizeStore(raw);
  const json = JSON.stringify(book);
  if (json.length > maxChars) {
    const err = new Error('Book is too large.');
    err.status = 400;
    throw err;
  }
  return { book, json };
}

export function bookIsEmpty(store) {
  const book = store || emptyStore();
  return !book.entries?.length
    && !book.postings?.length
    && !book.jobs?.length
    && !book.education?.length
    && !book.credentials?.length;
}

export function listingSummary(store) {
  return {
    entries: store.entries.length,
    postings: store.postings.length,
    stories: store.entries.filter((entry) => entry.kind === 'experience').length,
    projects: store.entries.filter((entry) => entry.kind === 'project').length,
    skillsets: store.entries.filter((entry) => entry.kind === 'skillset').length,
  };
}
