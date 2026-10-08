/**
 * Brag Book document model. Browser-safe ESM — no node: imports.
 *
 * One local store: resume-bullet experiences (`entries`), freeform
 * knowledge notes (`knowledge`), plus job postings. Each requirement
 * holds resume bullets, pinned stories, and questions that each carry
 * their own STAR answer. A slim `profile` rides on the store for resume
 * contact / summary / skills.
 */

import { mergeConcurrentBooks } from './save-controller.js';

export const SCHEMA = 2;
export const STORE_KEY = 'brag-book-store-v1';
export const LOCAL_STORE_KEY = 'brag-book-store-local';
export function accountStoreKey(userId) {
  const id = String(userId || '').trim();
  return id ? `brag-book-store-v2:${id}` : STORE_KEY;
}
export function accountOutboxKey(userId) {
  const id = String(userId || '').trim();
  return id ? `brag-book-outbox-v2:${id}` : '';
}
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
  relocateBullet,
  neighborGroupForBullet,
  placementFromDragRows,
  groupBulletOrders,
  moveKey,
  insertKeyAfter,
  compileResumeDoc,
  projectExperienceOntoJobs,
  resumeFieldsFromExperience,
  resumeBulletSpans,
  bulletPlainText,
  bulletLineText,
  ignoreBoldMarkers,
  addLocalJob,
  updateLocalJob,
  deleteLocalJob,
  addLocalGroup,
  deleteLocalGroup,
  addLocalBullet,
  updateLocalBullet,
  deleteLocalBullet,
  moveLocalBullet,
  moveLocalGroup,
  addLocalEducation,
  updateLocalEducation,
  deleteLocalEducation,
  addLocalCredential,
  updateLocalCredential,
  deleteLocalCredential,
  addLocalAdditional,
  updateLocalAdditional,
  deleteLocalAdditional,
  freshPostingResume,
  basicsPostingResume,
  markdownToSpans,
  bulletFromLine,
  spansToMarkdown,
  additionalItemsSource,
  additionalValueSpans,
  additionalValuePlain,
  findLocalBullet,
  inferEntryJobId,
  insertJobOrder,
  visibleResumeBullets,
  clearBulletOverride,
} from './resume-model.js';

import { STARTER_RESUME_DOC } from './starter-resume.js';
import {
  normalizeKnowledgeDoc,
  knowledgeDocFromLegacy,
  knowledgePlainText,
  knowledgeRichSpans,
  knowledgeSearchText,
} from './knowledge-doc.js';

export { STARTER_RESUME_DOC } from './starter-resume.js';

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
  resumeCompileMode,
  parseBulletText,
  boldMetrics,
  bulletPlainText,
  bulletLineText,
  ignoreBoldMarkers,
  resumeBulletParts,
  resumeBulletSpans,
  bulletFromLine,
  markdownToSpans,
  spansToMarkdown,
  additionalItemsSource,
  additionalValueSpans,
  additionalValuePlain,
  visibleResumeDoc,
  headerFromProfile,
  moveListItem,
  relocateBullet,
  neighborGroupForBullet,
  resumeGroupsByPosition,
  resumeDragRows,
  moveDragRow,
  dropIndexAtY,
  placementFromDragRows,
  groupBulletOrders,
  moveKey,
  insertKeyAfter,
  toggleId,
  findResumeBullet,
  visibleResumeBullets,
  writeBulletBackToSource,
  patchResumeVariant,
  clearBulletOverride,
  clearJobTitle,
  hideResumeRow,
  restoreHiddenResumeRows,
  hiddenResumeRowCount,
  tidyResumeJobs,
  findLocalBullet,
  localJobById,
  insertJobOrder,
  inferEntryJobId,
  postingTiedJobIds,
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
    knowledge: [],
    postings: [],
    profile: emptyProfile(),
    jobs: [],
    education: [],
    credentials: [],
    additional: [],
    resumeSettings: emptyResumeSettings(),
    basicsBackup: null,
    jobSetup: null,
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
  const push = (text, bold, italic) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    if (last && last.bold === Boolean(bold) && Boolean(last.italic) === Boolean(italic)) last.text += text;
    else {
      const span = { text, bold: Boolean(bold) };
      if (italic) span.italic = true;
      spans.push(span);
    }
  };
  if (Array.isArray(value)) {
    for (const span of value) {
      if (!span || typeof span !== 'object') continue;
      let text = String(span.text ?? '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n');
      if (text.length > TEXT_MAX) text = text.slice(0, TEXT_MAX);
      push(text, span.bold, span.italic);
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
      if (text) {
        const spanOut = { text, bold: span.bold };
        if (span.italic) spanOut.italic = true;
        capped.push(spanOut);
      }
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

function richFromText(text) {
  const formatted = normalizeRichSpans(markdownToSpans(text), text);
  return formatted || { text: asString(text, TEXT_MAX), rich: [{ text: asString(text, TEXT_MAX), bold: false }] };
}

export function normalizeEntry(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  // The title is the resume line, so it can be as long as a bullet.
  const title = asString(raw.title, TEXT_MAX);
  if (!title) return null;
  const formatted = Array.isArray(raw.rich) && raw.rich.length
    ? normalizeRichSpans(raw.rich, title)
    : richFromText(title);
  if (!formatted?.text) return null;
  const createdAt = asString(raw.createdAt, 40) || nowIso(clock);
  return {
    id: asString(raw.id, 64) || newId('en', clock),
    kind: asKind(raw.kind),
    title: formatted.text,
    rich: formatted.rich,
    role: asString(raw.role, TITLE_MAX),
    company: asString(raw.company, TITLE_MAX),
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
    legacyVersions: normalizeLegacyVersions(raw.legacyVersions),
  };
}

function normalizeLegacyVersions(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const text = asString(item.text, TEXT_MAX);
    if (!text) continue;
    const rich = Array.isArray(item.rich) && item.rich.length
      ? normalizeRichSpans(item.rich, text)?.rich
      : [{ text, bold: false }];
    out.push({
      text,
      rich: rich || [{ text, bold: false }],
      source: asString(item.source, 120),
      recoveredAt: asString(item.recoveredAt, 40),
      situation: asString(item.situation, TEXT_MAX),
      task: asString(item.task, TEXT_MAX),
      action: asString(item.action, TEXT_MAX),
      result: asString(item.result, TEXT_MAX),
      notes: asString(item.notes, TEXT_MAX),
    });
  }
  return out;
}

export function normalizeKnowledge(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  const title = asString(raw.title, TEXT_MAX);
  const doc = Array.isArray(raw.doc)
    ? normalizeKnowledgeDoc(raw.doc, { keepEmpty: true })
    : knowledgeDocFromLegacy(raw.body, raw.rich);
  const body = knowledgePlainText(doc);
  if (!title && !body) return null;
  const createdAt = asString(raw.createdAt, 40) || nowIso(clock);
  return {
    id: asString(raw.id, 64) || newId('kb', clock),
    title: title || asString(body.split('\n')[0], TEXT_MAX) || 'Note',
    body,
    rich: knowledgeRichSpans(doc),
    doc,
    tags: asTags(raw.tags),
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
  const migrationTimestamps = {
    entries: new Set(),
    postings: new Set(),
  };
  const seenEntries = new Set();
  for (const item of Array.isArray(raw.entries) ? raw.entries : []) {
    const entry = normalizeEntry(item, clock);
    if (!entry || seenEntries.has(entry.id)) continue;
    if (item?.updatedAt || item?.createdAt) migrationTimestamps.entries.add(entry.id);
    seenEntries.add(entry.id);
    store.entries.push(entry);
  }
  const seenKnowledge = new Set();
  for (const item of Array.isArray(raw.knowledge) ? raw.knowledge : []) {
    const note = normalizeKnowledge(item, clock);
    if (!note || seenKnowledge.has(note.id)) continue;
    seenKnowledge.add(note.id);
    store.knowledge.push(note);
  }
  const seenJobs = new Set();
  for (const item of Array.isArray(raw.postings) ? raw.postings : []) {
    const posting = normalizePosting(item, clock);
    if (!posting || seenJobs.has(posting.id)) continue;
    if (item?.updatedAt || item?.createdAt) migrationTimestamps.postings.add(posting.id);
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
  store.basicsBackup = normalizeBasicsBackup(raw.basicsBackup, clock);
  store.jobSetup = normalizeJobSetup(raw.jobSetup);
  store.v = Number(raw.v) === SCHEMA ? SCHEMA : SCHEMA;
  return migrateCanonicalBullets(store, clock, migrationTimestamps);
}

function recordInstant(iso) {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? t : 0;
}

function careerBulletIndex(store) {
  const map = new Map();
  for (const job of store.jobs || []) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        if (bullet?.id) map.set(bullet.id, bullet);
      }
    }
  }
  return map;
}

function appendLegacyVersion(entry, text, rich, source, clock, detail = {}) {
  const plain = asString(text, TEXT_MAX);
  if (!plain) return entry;
  const detailFields = ['situation', 'task', 'action', 'result', 'notes'];
  const hasDetailDifference = detailFields.some(
    (field) => asString(detail[field], TEXT_MAX)
      && asString(detail[field], TEXT_MAX) !== asString(entry[field], TEXT_MAX),
  );
  const hasRichDifference = Array.isArray(rich) && rich.length && !sameRich(entry.rich, rich);
  if (plain === entry.title && !hasDetailDifference && !hasRichDifference) return entry;
  const legacyVersions = [...(entry.legacyVersions || [])];
  if (legacyVersions.some((row) => (
    row.text === plain
    && (!hasRichDifference || sameRich(row.rich, rich))
    && detailFields.every(
      (field) => asString(row[field], TEXT_MAX) === asString(detail[field], TEXT_MAX),
    )
  ))) return entry;
  legacyVersions.push({
    text: plain,
    rich: rich || [{ text: plain, bold: false }],
    source: asString(source, 120),
    recoveredAt: nowIso(clock),
    situation: asString(detail.situation, TEXT_MAX),
    task: asString(detail.task, TEXT_MAX),
    action: asString(detail.action, TEXT_MAX),
    result: asString(detail.result, TEXT_MAX),
    notes: asString(detail.notes, TEXT_MAX),
  });
  return { ...entry, legacyVersions };
}

function syncRequirementLinesFromEntries(store, clock) {
  return {
    ...store,
    postings: (store.postings || []).map((posting) => ({
      ...posting,
      requirements: (posting.requirements || []).map((req) => {
        let changed = false;
        const bullets = (req.bullets || []).map((line) => {
          if (!line.entryId) return line;
          const entry = entryById(store, line.entryId);
          if (!entry) return line;
          if (line.text === entry.title && sameRich(line.rich, entry.rich)) return line;
          changed = true;
          return normalizeBullet({ ...line, text: entry.title, rich: entry.rich, id: line.id }, clock) || line;
        });
        return changed ? withBullets(req, bullets) : req;
      }),
    })),
  };
}

function syncCareerBulletsFromEntries(store) {
  const jobs = (store.jobs || []).map((job) => ({
    ...job,
    groups: (job.groups || []).map((group) => ({
      ...group,
      bullets: (group.bullets || []).map((bullet) => {
        const entryId = (bullet.sourceEntryIds || [])[0] || '';
        const entry = entryId ? entryById(store, entryId) : null;
        if (!entry?.title) return bullet;
        const fields = resumeFieldsFromExperience(entry.title, entry.rich);
        if (bullet.lead === fields.lead && bullet.body === fields.body) return bullet;
        return { ...bullet, lead: fields.lead, body: fields.body };
      }),
    })),
  }));
  if (jobs === store.jobs) return store;
  return { ...store, jobs };
}

export function migrateCanonicalBullets(store, clock = Date.now, migrationTimestamps = null) {
  let next = { ...store, v: SCHEMA };
  let entries = [...(next.entries || [])];
  const entryFor = (id) => entries.find((entry) => entry.id === id) || null;
  const replaceEntryInList = (entry) => {
    const index = entries.findIndex((row) => row.id === entry.id);
    if (index < 0) entries.push(entry);
    else entries[index] = entry;
  };
  const createCanonicalEntry = (candidate, source, jobId = '') => {
    const text = asString(candidate?.text, TEXT_MAX);
    if (!text) return null;
    const created = normalizeEntry({
      id: newId('en', clock),
      title: text,
      rich: candidate?.rich,
      jobId,
      situation: candidate?.situation,
      task: candidate?.task,
      action: candidate?.action,
      result: candidate?.result,
      notes: candidate?.notes,
      legacyVersions: [],
      createdAt: candidate?.updatedAt || nowIso(clock),
      updatedAt: candidate?.updatedAt || nowIso(clock),
    }, clock);
    if (!created) return null;
    replaceEntryInList(created);
    return created;
  };
  const mergeRequirementCandidate = (entry, line, source) => {
    let merged = entry;
    const patch = {};
    let hasDetailConflict = false;
    for (const field of ['situation', 'task', 'action', 'result', 'notes']) {
      const candidate = asString(line?.[field], TEXT_MAX);
      if (!candidate) continue;
      if (!merged[field]) patch[field] = candidate;
      else if (merged[field] !== candidate) hasDetailConflict = true;
    }
    if (Object.keys(patch).length) {
      merged = normalizeEntry({ ...merged, ...patch }, clock) || merged;
    }
    const candidateText = asString(line?.text, TEXT_MAX);
    if ((candidateText && candidateText !== merged.title) || hasDetailConflict) {
      merged = appendLegacyVersion(
        merged,
        candidateText || merged.title,
        line?.rich,
        source,
        clock,
        line,
      );
    }
    replaceEntryInList(merged);
    return merged;
  };

  const lineEntries = new Map();
  let postings = (next.postings || []).map((posting) => ({
    ...posting,
    requirements: (posting.requirements || []).map((req) => {
      const linkedIds = new Set(req.entryIds || []);
      const bullets = (req.bullets || []).map((line) => {
        let entry = line.entryId ? entryFor(line.entryId) : null;
        if (!entry) {
          entry = createCanonicalEntry(line, `requirement:${posting.id}:${req.id}:${line.id}`);
        } else {
          entry = mergeRequirementCandidate(
            entry,
            line,
            `requirement:${posting.id}:${req.id}:${line.id}`,
          );
        }
        if (!entry) return line;
        lineEntries.set(line.id, entry.id);
        linkedIds.add(entry.id);
        return { ...line, entryId: entry.id };
      });
      return withBullets({ ...req, entryIds: [...linkedIds] }, bullets);
    }),
  }));

  const titleMatches = (text) => {
    const key = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return key ? entries.filter((entry) => entry.title.replace(/\s+/g, ' ').trim().toLowerCase() === key) : [];
  };
  const canonicalizeJobs = (jobs, sourcePrefix) => (jobs || []).map((job) => ({
    ...job,
    groups: (job.groups || []).map((group) => ({
      ...group,
      bullets: (group.bullets || []).map((bullet) => {
        let entry = (bullet.sourceEntryIds || []).map(entryFor).find(Boolean) || null;
        if (!entry) {
          entry = (bullet.sourceBulletIds || []).map((id) => entryFor(lineEntries.get(id))).find(Boolean) || null;
        }
        const copiedText = bulletPlainText(bullet);
        if (!entry) {
          const matches = titleMatches(copiedText);
          if (matches.length === 1) entry = matches[0];
        }
        if (!entry && String(bullet.lead || '').trim().length >= 12) {
          const leadKey = String(bullet.lead).trim().toLowerCase();
          const matches = entries.filter((candidate) => (
            resumeFieldsFromExperience(candidate.title, candidate.rich).lead.trim().toLowerCase() === leadKey
          ));
          if (matches.length === 1) entry = matches[0];
        }
        if (!entry) {
          entry = createCanonicalEntry(
            { text: copiedText, rich: resumeBulletSpans(bullet) },
            `${sourcePrefix}:${job.id}:${group.id}:${bullet.id}`,
            job.jobId || job.id,
          );
        } else if (copiedText && copiedText !== entry.title) {
          entry = appendLegacyVersion(
            entry,
            copiedText,
            resumeBulletSpans(bullet),
            `${sourcePrefix}:${job.id}:${group.id}:${bullet.id}`,
            clock,
          );
          replaceEntryInList(entry);
        }
        return entry ? { ...bullet, sourceEntryIds: [entry.id] } : bullet;
      }),
    })),
  }));

  const jobs = canonicalizeJobs(next.jobs, 'career');
  postings = postings.map((posting) => ({
    ...posting,
    resume: normalizeResumeVariant({
      ...posting.resume,
      localJobs: canonicalizeJobs(posting.resume?.localJobs, `local:${posting.id}`),
    }),
  }));

  const sharedBullets = careerBulletIndex({ ...next, jobs });
  postings = postings.map((posting) => {
    const localBullets = careerBulletIndex({ jobs: posting.resume?.localJobs || [] });
    const overrides = posting.resume?.overrides || {};
    for (const [bulletId, over] of Object.entries(overrides)) {
      const careerBullet = localBullets.get(bulletId) || sharedBullets.get(bulletId);
      let entry = (careerBullet?.sourceEntryIds || []).map(entryFor).find(Boolean) || null;
      const candidateText = bulletPlainText({ lead: over?.lead || '', body: over?.body || '' });
      const candidateRich = resumeBulletSpans({ lead: over?.lead || '', body: over?.body || '' });
      if (!entry && candidateText) {
        entry = createCanonicalEntry(
          { text: candidateText, rich: candidateRich, updatedAt: posting.updatedAt },
          `override:${posting.id}:${bulletId}`,
        );
      }
      if (!entry || !candidateText) continue;
      const hasRealTimestamps = !migrationTimestamps || (
        migrationTimestamps.entries.has(entry.id)
        && migrationTimestamps.postings.has(posting.id)
      );
      const overrideWins = over?.edited === true
        && hasRealTimestamps
        && recordInstant(posting.updatedAt) > recordInstant(entry.updatedAt);
      if (overrideWins) {
        const previous = entry;
        entry = normalizeEntry({
          ...entry,
          title: candidateText,
          rich: candidateRich,
          updatedAt: posting.updatedAt,
        }, clock) || entry;
        entry = appendLegacyVersion(
          entry,
          previous.title,
          previous.rich,
          `entry-before-override:${posting.id}:${bulletId}`,
          clock,
          previous,
        );
      } else {
        entry = appendLegacyVersion(
          entry,
          candidateText,
          candidateRich,
          `override:${posting.id}:${bulletId}`,
          clock,
        );
      }
      replaceEntryInList(entry);
    }
    return {
      ...posting,
      resume: normalizeResumeVariant({ ...posting.resume, overrides: {} }),
    };
  });

  next = { ...next, entries, jobs, postings };
  next = syncRequirementLinesFromEntries(next, clock);
  next = syncCareerBulletsFromEntries(next);
  return projectResumeStore({ ...next, v: SCHEMA });
}

function legacyVersionIdentity(version) {
  return JSON.stringify([
    version?.text || '',
    version?.rich || [],
    version?.situation || '',
    version?.task || '',
    version?.action || '',
    version?.result || '',
    version?.notes || '',
  ]);
}

// Recovery history is append-only server data. Older clients do not know about
// legacyVersions and strip it during their normalize/save round trip, so fold
// the saved archive back into their otherwise valid timestamp-guarded write.
export function preserveLegacyVersions(incoming, current, clock = Date.now) {
  const next = normalizeStore(incoming, clock);
  const saved = normalizeStore(current, clock);
  const savedById = new Map(saved.entries.map((entry) => [entry.id, entry]));
  return {
    ...next,
    entries: next.entries.map((entry) => {
      const archived = savedById.get(entry.id)?.legacyVersions || [];
      if (!archived.length) return entry;
      const legacyVersions = [...(entry.legacyVersions || [])];
      const seen = new Set(legacyVersions.map(legacyVersionIdentity));
      for (const version of archived) {
        const key = legacyVersionIdentity(version);
        if (seen.has(key)) continue;
        seen.add(key);
        legacyVersions.push(version);
      }
      return { ...entry, legacyVersions };
    }),
  };
}

function normalizeJobSetup(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const status = raw.status === 'done' || raw.status === 'later' ? raw.status : '';
  if (!status) return null;
  return { status, savedAt: asString(raw.savedAt, 40) };
}

function normalizeBasicsBackup(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    profile: normalizeProfile(raw.profile),
    jobs: normalizeCareerJobs(raw.jobs, clock),
    education: normalizeEducation(raw.education, clock),
    credentials: normalizeCredentials(raw.credentials, clock),
    additional: normalizeAdditional(raw.additional, clock),
    resumeSettings: normalizeResumeSettings(raw.resumeSettings),
    savedAt: asString(raw.savedAt, 40),
  };
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
  return left.every((span, index) => (
    span.text === right[index].text
    && Boolean(span.bold) === Boolean(right[index].bold)
    && Boolean(span.italic) === Boolean(right[index].italic)
  ));
}

// One experience has one line: the entry. Requirement bullets keep a copy for
// older books, but that copy follows the entry whenever entryId still resolves.
function experienceLineMatches(store, entryId, formatted) {
  const entry = entryById(store, entryId);
  if (!entry || entry.title !== formatted.text || !sameRich(entry.rich, formatted.rich)) return false;
  for (const job of store.postings || []) {
    for (const req of job.requirements || []) {
      for (const line of req.bullets || []) {
        if (line.entryId === entryId && (line.text !== formatted.text || !sameRich(line.rich, formatted.rich))) return false;
      }
    }
  }
  return true;
}

function experiencePlain(text, rich) {
  return bulletPlainText(resumeFieldsFromExperience(text, rich)).toLowerCase().replace(/\s+/g, ' ').trim();
}

function resumePlain(bullet) {
  return bulletPlainText(bullet).toLowerCase().replace(/\s+/g, ' ').trim();
}

function entryLineIds(store, entryId) {
  const ids = new Set();
  for (const posting of store?.postings || []) {
    for (const req of posting.requirements || []) {
      for (const line of req.bullets || []) {
        if (line.entryId === entryId && line.id) ids.add(line.id);
      }
    }
  }
  return ids;
}

function plainsForEntry(store, entryId) {
  const plains = new Set();
  const entry = entryById(store, entryId);
  if (entry?.title) plains.add(experiencePlain(entry.title, entry.rich));
  for (const posting of store?.postings || []) {
    for (const req of posting.requirements || []) {
      for (const line of req.bullets || []) {
        if (line.entryId === entryId && line.text) plains.add(experiencePlain(line.text, line.rich));
      }
    }
  }
  return plains;
}

function sameStringList(a, b) {
  const left = a || [];
  const right = b || [];
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function withExperienceFields(bullet, fields, entryId, sourceIds) {
  const sourceEntryIds = entryId
    ? [...new Set([...(bullet.sourceEntryIds || []), entryId])]
    : [...(bullet.sourceEntryIds || [])];
  const sourceBulletIds = sourceIds?.size
    ? [...new Set([...(bullet.sourceBulletIds || []), ...sourceIds])]
    : [...(bullet.sourceBulletIds || [])];
  if (
    bullet.lead === fields.lead
    && bullet.body === fields.body
    && sameStringList(bullet.sourceEntryIds, sourceEntryIds)
    && sameStringList(bullet.sourceBulletIds, sourceBulletIds)
  ) return bullet;
  return { ...bullet, lead: fields.lead, body: fields.body, sourceEntryIds, sourceBulletIds };
}

function rewriteJobWording(jobs, entryId, fields, previous, sourceIds) {
  let changed = false;
  const next = (jobs || []).map((job) => {
    let jobChanged = false;
    const groups = (job.groups || []).map((group) => {
      let groupChanged = false;
      const bullets = (group.bullets || []).map((bullet) => {
        const owners = (bullet.sourceEntryIds || []).filter(Boolean);
        const linkedHere = owners.includes(entryId)
          || (bullet.sourceBulletIds || []).some((id) => sourceIds.has(id))
          || sourceIds.has(bullet.id);
        const plain = resumePlain(bullet);
        const sameWords = plain && previous.has(plain) && (!owners.length || owners.includes(entryId));
        if (!linkedHere && !sameWords) return bullet;
        const updated = withExperienceFields(bullet, fields, entryId, sourceIds);
        if (updated === bullet) return bullet;
        groupChanged = true;
        return updated;
      });
      if (!groupChanged) return group;
      jobChanged = true;
      return { ...group, bullets };
    });
    if (!jobChanged) return job;
    changed = true;
    return { ...job, groups };
  });
  return changed ? next : jobs;
}

function rewriteResumeWording(store, entryId, formatted, previous) {
  const fields = resumeFieldsFromExperience(formatted.text, formatted.rich);
  const sourceIds = entryLineIds(store, entryId);
  const jobs = rewriteJobWording(store.jobs, entryId, fields, previous, sourceIds);
  let postingsChanged = false;
  const postings = (store.postings || []).map((posting) => {
    const localJobs = posting.resume?.localJobs;
    if (!localJobs?.length) return posting;
    const projected = rewriteJobWording(localJobs, entryId, fields, previous, sourceIds);
    if (projected === localJobs) return posting;
    postingsChanged = true;
    return {
      ...posting,
      resume: normalizeResumeVariant({ ...posting.resume, localJobs: projected }),
    };
  });
  if (jobs === store.jobs && !postingsChanged) return store;
  return { ...store, jobs, postings: postingsChanged ? postings : store.postings };
}

function clearStaleOverrides(store, previous) {
  if (!previous?.size) return store;
  let changed = false;
  const postings = (store.postings || []).map((posting) => {
    const overrides = posting.resume?.overrides;
    if (!overrides || !Object.keys(overrides).length) return posting;
    let nextOverrides = null;
    for (const [id, over] of Object.entries(overrides)) {
      const plain = resumePlain({ lead: over?.lead || '', body: over?.body || '' });
      if (!plain || !previous.has(plain)) continue;
      if (!nextOverrides) nextOverrides = { ...overrides };
      delete nextOverrides[id];
      changed = true;
    }
    if (!nextOverrides) return posting;
    return {
      ...posting,
      resume: normalizeResumeVariant({ ...posting.resume, overrides: nextOverrides }),
    };
  });
  return changed ? { ...store, postings } : store;
}

function projectResumeStore(store) {
  const jobs = projectExperienceOntoJobs(store.jobs, store);
  let postingsChanged = false;
  const postings = (store.postings || []).map((posting) => {
    const localJobs = posting.resume?.localJobs;
    if (!localJobs?.length) return posting;
    const projected = projectExperienceOntoJobs(localJobs, store);
    if (projected === localJobs) return posting;
    postingsChanged = true;
    return {
      ...posting,
      resume: normalizeResumeVariant({ ...posting.resume, localJobs: projected }),
    };
  });
  if (jobs === store.jobs && !postingsChanged) return store;
  return { ...store, jobs, postings: postingsChanged ? postings : store.postings };
}

function applyExperienceLine(store, entryId, text, rich, clock, extraPlains) {
  const formatted = normalizeRichSpans(rich, text);
  if (!entryId || !formatted) return store;
  const previous = plainsForEntry(store, entryId);
  for (const plain of extraPlains || []) {
    if (plain) previous.add(plain);
  }
  let next = store;
  if (!experienceLineMatches(store, entryId, formatted)) {
    next = replaceEntry(store, entryId, { title: formatted.text, rich: formatted.rich }, clock);
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
  }
  next = rewriteResumeWording(next, entryId, formatted, previous);
  next = clearStaleOverrides(next, previous);
  return projectResumeStore(next);
}

function alignExperienceLines(store, clock) {
  let next = store;
  for (const entry of next.entries || []) {
    if (!entry?.id) continue;
    next = applyExperienceLine(next, entry.id, entry.title, entry.rich, clock);
  }
  return projectResumeStore(next);
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
  for (const draft of [...(drafts || [])].reverse()) {
    next = createSharedBullet(next, draft, clock).store;
  }
  return next;
}

export function createSharedBullet(store, draft = {}, clock = Date.now) {
  const fields = experienceDetailPatch(draft);
  const jobId = fields.jobId || draft.jobId || '';
  delete fields.jobId;
  if (!fields.title && !fields.rich && !draft.title) return { store, entryId: '' };
  const { jobId: _ignored, ...rest } = draft;
  let next = addEntry(store, {
    ...rest,
    ...fields,
    jobId: '',
    kind: draft.kind || 'experience',
  }, clock);
  const entryId = next.entries[0]?.id || '';
  if (entryId && jobId) next = assignEntryJob(next, entryId, jobId, clock);
  return { store: next, entryId };
}

export function saveSharedBullet(store, entryId, patch = {}, clock = Date.now) {
  const entry = entryById(store, entryId);
  if (!entry) return store;
  const fields = experienceDetailPatch(patch);
  let next = store;
  if (Object.prototype.hasOwnProperty.call(fields, 'jobId')) {
    next = assignEntryJob(next, entryId, fields.jobId, clock);
    delete fields.jobId;
  }
  if (Object.keys(fields).length) next = updateEntry(next, entryId, fields, clock);
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
  const rich = Object.prototype.hasOwnProperty.call(patch, 'rich')
    ? patch.rich
    : entry.rich;
  return applyExperienceLine(next, id, entry.title, rich, clock);
}

export function knowledgeById(store, id) {
  return (store?.knowledge || []).find((note) => note.id === id) || null;
}

export function addKnowledge(store, draft, clock = Date.now) {
  const note = normalizeKnowledge({ ...draft, id: draft?.id || newId('kb', clock), createdAt: nowIso(clock) }, clock);
  if (!note) return store;
  return { ...store, knowledge: [note, ...(store.knowledge || [])] };
}

export function addKnowledgeNotes(store, drafts, clock = Date.now) {
  let next = store;
  for (const draft of [...(drafts || [])].reverse()) next = addKnowledge(next, draft, clock);
  return next;
}

export function updateKnowledge(store, id, patch, clock = Date.now) {
  const current = knowledgeById(store, id);
  if (!current) return store;
  const nextRaw = { ...current, ...patch, id: current.id, createdAt: current.createdAt };
  // A body/rich patch from an older caller does not carry `doc`. Drop the stored
  // document so normalize rebuilds from the new text instead of keeping the old blocks.
  if (
    patch &&
    !Object.prototype.hasOwnProperty.call(patch, 'doc') &&
    (Object.prototype.hasOwnProperty.call(patch, 'body') || Object.prototype.hasOwnProperty.call(patch, 'rich'))
  ) {
    delete nextRaw.doc;
  }
  const next = normalizeKnowledge(nextRaw, clock);
  if (!next) return store;
  return { ...store, knowledge: replaceById(store.knowledge, id, touched(next, clock)) };
}

export function deleteKnowledge(store, id) {
  if (!knowledgeById(store, id)) return store;
  return { ...store, knowledge: dropById(store.knowledge || [], id) };
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
    {
      ...draft,
      id: draft?.id || newId('job', clock),
      createdAt: nowIso(clock),
      resume: { mode: 'choose', ...(draft?.resume || {}) },
    },
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

function patchPostingVariant(store, postingId, fn, clock = Date.now) {
  const current = postingById(store, postingId);
  if (!current) return store;
  return replacePostingResume(store, postingId, fn(normalizeResumeVariant(current.resume), current), clock);
}

export function addPostingLocalJob(store, postingId, draft = {}, opts = {}, clock = Date.now, random = Math.random) {
  return patchPostingVariant(store, postingId, (variant, posting) => {
    const currentJobIds = compileResumeDoc(posting, store).sections.experience.jobs.map((job) => job.id);
    return addLocalJob(variant, {
      ...draft,
      id: draft.id || newId('rj', clock, random),
    }, { afterId: opts.afterId, currentJobIds }, clock);
  }, clock);
}

export function updatePostingLocalJob(store, postingId, jobId, patch, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => updateLocalJob(variant, jobId, patch, clock), clock);
}

export function deletePostingLocalJob(store, postingId, jobId, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => deleteLocalJob(variant, jobId), clock);
}

export function addPostingLocalGroup(store, postingId, jobId, draft = {}, clock = Date.now, random = Math.random) {
  return patchPostingVariant(store, postingId, (variant) => addLocalGroup(variant, jobId, {
    ...draft,
    id: draft.id || newId('rg', clock, random),
  }, clock), clock);
}

export function deletePostingLocalGroup(store, postingId, jobId, groupId, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => deleteLocalGroup(variant, jobId, groupId, clock), clock);
}

export function addPostingLocalBullet(store, postingId, jobId, groupId, draft = {}, clock = Date.now, random = Math.random) {
  return patchPostingVariant(store, postingId, (variant) => addLocalBullet(variant, jobId, groupId, {
    ...draft,
    id: draft.id || newId('rb', clock, random),
  }, clock), clock);
}

export function updatePostingLocalBullet(store, postingId, jobId, groupId, bulletId, patch, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => (
    updateLocalBullet(variant, jobId, groupId, bulletId, patch, clock)
  ), clock);
}

export function deletePostingLocalBullet(store, postingId, jobId, groupId, bulletId, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => (
    deleteLocalBullet(variant, jobId, groupId, bulletId, clock)
  ), clock);
}

export function movePostingLocalBullet(store, postingId, jobId, groupId, bulletId, delta, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => (
    moveLocalBullet(variant, jobId, groupId, bulletId, delta, clock)
  ), clock);
}

function compiledExperienceJob(store, postingId, jobId) {
  const jobs = postingId
    ? (compileResumeDoc(postingById(store, postingId), store).sections.experience.jobs || [])
    : (store?.jobs || []);
  return jobs.find((job) => job.id === jobId) || null;
}

function relocateCareerBullet(store, jobId, fromGroupId, toGroupId, bulletId, index, clock = Date.now) {
  return mapCareerJob(store, jobId, (job) => ({
    ...job,
    groups: relocateBullet(job.groups, fromGroupId, toGroupId, bulletId, index),
  }), clock);
}

function postingNeighborStep(groups, groupId, bulletId, delta) {
  const list = Array.isArray(groups) ? groups : [];
  const visible = list.map((group) => ({
    ...group,
    bullets: visibleResumeBullets(group.bullets),
  }));
  const step = neighborGroupForBullet(visible, groupId, bulletId, delta);
  if (!step || step.fromGroupId === step.toGroupId) return step;
  const dest = list.find((group) => group.id === step.toGroupId);
  if (!dest) return null;
  const visibleDest = visibleResumeBullets(dest.bullets);
  if (step.index <= 0) return { ...step, index: 0 };
  if (step.index >= visibleDest.length) return { ...step, index: (dest.bullets || []).length };
  const target = visibleDest[step.index];
  const at = (dest.bullets || []).findIndex((bullet) => bullet.id === target.id);
  return { ...step, index: at < 0 ? (dest.bullets || []).length : at };
}

export function moveResumeBullet(store, postingId, career, fromGroupId, toGroupId, bulletId, { index } = {}, clock = Date.now) {
  const jobId = career?.id;
  if (!jobId || !bulletId || !toGroupId) return store;
  if (!postingId) {
    const next = adoptCompiledJob(store, null, career, clock);
    return relocateCareerBullet(next, jobId, fromGroupId, toGroupId, bulletId, index, clock);
  }
  // Posting placement lives on resume.bulletGroup + bulletOrder. Do not
  // relocate the shared career catalog or rewrite localJobs / overrides.
  const compiled = compiledExperienceJob(store, postingId, jobId);
  if (!compiled) return store;
  const from = (compiled.groups || []).find((group) => group.id === fromGroupId);
  const to = (compiled.groups || []).find((group) => group.id === toGroupId);
  if (!from || !to || !(from.bullets || []).some((bullet) => bullet.id === bulletId)) return store;
  const posting = postingById(store, postingId);
  if (fromGroupId === toGroupId) {
    const visible = visibleResumeBullets(from.bullets);
    const at = visible.findIndex((bullet) => bullet.id === bulletId);
    const destIndex = index == null || index === '' ? at : Number(index);
    const other = destIndex >= 0 && destIndex !== at ? visible[destIndex] : null;
    if (!other) return store;
    const current = (from.bullets || []).map((bullet) => bullet.id);
    const ids = swapIds(current, bulletId, other.id);
    if (ids === current) return store;
    return updatePostingResume(store, postingId, {
      bulletOrder: {
        ...(posting?.resume?.bulletOrder || {}),
        [fromGroupId]: ids,
      },
    }, clock);
  }
  const destIndex = index == null || index === ''
    ? (to.bullets || []).length
    : Math.max(0, Math.min(Number(index) || 0, to.bullets.length));
  const moved = relocateBullet(compiled.groups, fromGroupId, toGroupId, bulletId, destIndex);
  if (moved === compiled.groups) return store;
  return updatePostingResume(store, postingId, {
    bulletGroup: {
      ...(posting?.resume?.bulletGroup || {}),
      [bulletId]: toGroupId,
    },
    bulletOrder: {
      ...(posting?.resume?.bulletOrder || {}),
      ...groupBulletOrders(moved),
    },
  }, clock);
}

function swapIds(ids, a, b) {
  const next = Array.isArray(ids) ? ids.slice() : [];
  const i = next.indexOf(a);
  const j = next.indexOf(b);
  if (i < 0 || j < 0 || i === j) return ids;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function stepResumeBullet(store, postingId, career, groupId, bulletId, delta, clock = Date.now) {
  const compiled = compiledExperienceJob(store, postingId, career?.id);
  if (!postingId) {
    const step = neighborGroupForBullet(compiled?.groups, groupId, bulletId, delta);
    if (!step) return store;
    return moveResumeBullet(store, postingId, career, step.fromGroupId, step.toGroupId, bulletId, { index: step.index }, clock);
  }
  const step = postingNeighborStep(compiled?.groups || [], groupId, bulletId, delta);
  if (!step) return store;
  return moveResumeBullet(store, postingId, career, step.fromGroupId, step.toGroupId, bulletId, { index: step.index }, clock);
}

export function movePostingLocalGroup(store, postingId, jobId, groupId, delta, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => (
    moveLocalGroup(variant, jobId, groupId, delta, clock)
  ), clock);
}

export function movePostingJob(store, postingId, jobId, delta) {
  const posting = postingById(store, postingId);
  if (!posting) return store;
  const ids = compileResumeDoc(posting, store).sections.experience.jobs.map((job) => ({ id: job.id }));
  return updatePostingResume(store, postingId, {
    jobOrder: moveListItem(ids, jobId, delta).map((job) => job.id),
  });
}

export function compiledJobGroups(store, postingId, jobId) {
  const posting = postingId ? postingById(store, postingId) : null;
  const jobs = posting
    ? compileResumeDoc(posting, store).sections.experience.jobs
    : (store?.jobs || []);
  return (jobs.find((job) => job.id === jobId)?.groups || []).map((group) => group.id);
}

export function moveResumeGroup(store, postingId, jobId, groupId, delta, clock = Date.now) {
  if (!postingId) return moveCareerGroup(store, jobId, groupId, delta, clock);
  const ids = compiledJobGroups(store, postingId, jobId);
  return updatePostingResume(store, postingId, {
    groupOrder: { [jobId]: moveKey(ids, groupId, delta) },
  }, clock);
}

function dragBulletSnapshot(bullet) {
  return {
    id: bullet.id,
    lead: bullet.lead || '',
    body: bullet.body || '',
    priority: bullet.priority,
    pinned: Boolean(bullet.pinned),
    sourceBulletIds: bullet.sourceBulletIds || [],
    sourceEntryIds: bullet.sourceEntryIds || [],
  };
}

function groupsFromDragPlacement(groups, placement, leadingId) {
  const byId = new Map((groups || []).map((group) => [group.id, group]));
  const bulletById = new Map();
  for (const group of groups || []) {
    for (const bullet of group.bullets || []) {
      if (bullet?.id) bulletById.set(bullet.id, bullet);
    }
  }
  const order = placement.groupOrder.slice();
  const bulletOrder = { ...placement.bulletOrder };
  if (leadingId && placement.leadingBulletIds?.length) {
    const at = placement.leadingIndex < 0 ? order.length : placement.leadingIndex;
    order.splice(at, 0, leadingId);
    bulletOrder[leadingId] = placement.leadingBulletIds;
  }
  return order.map((id) => {
    const group = byId.get(id);
    const bullets = (bulletOrder[id] || []).map((bulletId) => bulletById.get(bulletId)).filter(Boolean).map(dragBulletSnapshot);
    if (group) return { ...group, id: group.id, heading: group.heading || '', bullets };
    return { id, heading: '', bullets };
  });
}

export function applyResumeDrag(store, postingId, career, rows, clock = Date.now, random = Math.random) {
  const jobId = career?.id;
  if (!jobId || !Array.isArray(rows)) return store;
  if (!postingId) {
    const job = (store?.jobs || []).find((item) => item.id === jobId);
    if (!job) return store;
    const placement = placementFromDragRows(job.groups, rows);
    const leadingId = placement.leadingBulletIds.length ? newId('rg', clock, random) : '';
    const groups = groupsFromDragPlacement(job.groups, placement, leadingId);
    return mapCareerJob(store, jobId, (current) => ({ ...current, groups }), clock);
  }
  const compiled = compiledExperienceJob(store, postingId, jobId);
  if (!compiled) return store;
  const placement = placementFromDragRows(compiled.groups, rows);
  let next = store;
  let leadingId = '';
  if (placement.leadingBulletIds.length) {
    leadingId = newId('rg', clock, random);
    next = addPostingLocalGroup(next, postingId, jobId, { id: leadingId, heading: '' }, clock, random);
  }
  const groupOrder = placement.groupOrder.slice();
  const bulletOrder = { ...placement.bulletOrder };
  const bulletGroup = { ...(placement.bulletGroup || {}) };
  if (leadingId) {
    const at = placement.leadingIndex < 0 ? groupOrder.length : placement.leadingIndex;
    groupOrder.splice(at, 0, leadingId);
    bulletOrder[leadingId] = placement.leadingBulletIds.slice();
    for (const id of placement.leadingBulletIds) bulletGroup[id] = leadingId;
  }
  const posting = postingById(next, postingId);
  return updatePostingResume(next, postingId, {
    groupOrder: { [jobId]: groupOrder },
    bulletOrder,
    bulletGroup: { ...(posting?.resume?.bulletGroup || {}), ...bulletGroup },
  }, clock);
}

export function removeResumeGroup(store, postingId, career, groupId, clock = Date.now) {
  if (!postingId || !groupId || !career?.id) return store;
  // Posting-only: clear the heading overlay. Groups and bullets stay put so
  // existing empty groups do not need a load rewrite.
  return updatePostingResume(store, postingId, {
    groupHeadings: { [groupId]: '' },
  }, clock);
}

export function addResumeGroup(store, postingId, career, { afterId } = {}, clock = Date.now, random = Math.random) {
  const jobId = career?.id;
  if (!jobId) return { store, groupId: null };
  const groupId = newId('rg', clock, random);
  let next = adoptCompiledJob(store, postingId || null, career, clock, random);
  if (postingId) {
    next = addPostingLocalGroup(next, postingId, jobId, { id: groupId }, clock, random);
    const ids = insertKeyAfter(compiledJobGroups(next, postingId, jobId), groupId, afterId);
    next = updatePostingResume(next, postingId, { groupOrder: { [jobId]: ids } }, clock);
  } else {
    next = addCareerGroup(next, jobId, { id: groupId }, clock, random);
    if (afterId) {
      const job = (next.jobs || []).find((item) => item.id === jobId);
      const ordered = insertKeyAfter((job?.groups || []).map((group) => group.id), groupId, afterId)
        .map((id) => (job?.groups || []).find((group) => group.id === id))
        .filter(Boolean);
      next = updateCareerJob(next, jobId, { groups: ordered }, clock);
    }
  }
  return { store: next, groupId };
}

export function addPostingLocalEducation(store, postingId, draft = {}, clock = Date.now, random = Math.random) {
  return patchPostingVariant(store, postingId, (variant) => addLocalEducation(variant, {
    ...draft,
    id: draft.id || newId('ed', clock, random),
  }, clock), clock);
}

export function updatePostingLocalEducation(store, postingId, id, patch, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => updateLocalEducation(variant, id, patch, clock), clock);
}

export function deletePostingLocalEducation(store, postingId, id, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => deleteLocalEducation(variant, id), clock);
}

export function addPostingLocalCredential(store, postingId, draft = {}, clock = Date.now, random = Math.random) {
  return patchPostingVariant(store, postingId, (variant) => addLocalCredential(variant, {
    ...draft,
    id: draft.id || newId('cr', clock, random),
  }, clock), clock);
}

export function updatePostingLocalCredential(store, postingId, id, patch, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => updateLocalCredential(variant, id, patch, clock), clock);
}

export function deletePostingLocalCredential(store, postingId, id, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => deleteLocalCredential(variant, id), clock);
}

export function addPostingLocalAdditional(store, postingId, draft = {}, clock = Date.now, random = Math.random) {
  return patchPostingVariant(store, postingId, (variant) => addLocalAdditional(variant, {
    ...draft,
    id: draft.id || newId('ad', clock, random),
  }, clock), clock);
}

export function updatePostingLocalAdditional(store, postingId, id, patch, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => updateLocalAdditional(variant, id, patch, clock), clock);
}

export function deletePostingLocalAdditional(store, postingId, id, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => deleteLocalAdditional(variant, id), clock);
}

export function startPostingResumeFresh(store, postingId, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => freshPostingResume(variant), clock);
}

export function resetPostingResumeToBasics(store, postingId, clock = Date.now) {
  return patchPostingVariant(store, postingId, (variant) => basicsPostingResume(variant), clock);
}

export function choosePostingResumeMode(store, postingId, mode, clock = Date.now) {
  if (mode === 'fresh') return startPostingResumeFresh(store, postingId, clock);
  return patchPostingVariant(store, postingId, (variant) => ({ ...variant, mode: 'basics' }), clock);
}

export function applyImportedResume(store, raw, clock = Date.now) {
  return normalizeStore(importResumeDoc(store || emptyStore(), raw, clock), clock);
}

function hasCareerText(value) {
  return String(value || '').trim().length > 0;
}

export function careerNeedsSeed(store) {
  const profile = store?.profile || emptyProfile();
  if ([
    profile.name,
    profile.email,
    profile.phone,
    profile.suffix,
    profile.summary,
    profile.skills,
    profile.location,
  ].some(hasCareerText)) return false;
  if ((profile.locations || []).some(hasCareerText)) return false;
  if ((profile.links || []).some((link) => hasCareerText(link?.url) || hasCareerText(link?.label))) return false;
  return !(store?.jobs || []).length
    && !(store?.education || []).length
    && !(store?.credentials || []).length
    && !(store?.additional || []).length;
}

export function seedStarterResume(store, clock = Date.now) {
  if (!careerNeedsSeed(store)) return store || emptyStore();
  return applyImportedResume(store || emptyStore(), STARTER_RESUME_DOC, clock);
}

export function resumeTakenEntryIds(store, posting = null, { includeExcluded = true } = {}) {
  const doc = compileResumeDoc(posting, store);
  const ids = [];
  const plains = new Set();
  for (const job of doc?.sections?.experience?.jobs || []) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        if (!includeExcluded && posting && bullet.included === false) continue;
        for (const id of bullet.sourceEntryIds || []) ids.push(id);
        const plain = resumePlain(bullet);
        if (plain) plains.add(plain);
      }
    }
  }
  for (const entry of store?.entries || []) {
    if (!entry?.id || ids.includes(entry.id)) continue;
    const plain = experiencePlain(entry.title, entry.rich);
    if (plain && plains.has(plain)) ids.push(entry.id);
  }
  return ids;
}

function findCompiledBulletByEntry(store, posting, entryId) {
  if (!entryId) return null;
  const doc = compileResumeDoc(posting, store);
  for (const job of doc?.sections?.experience?.jobs || []) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        if ((bullet.sourceEntryIds || []).includes(entryId)) {
          return { job, group, bullet };
        }
      }
    }
  }
  return null;
}

export function libraryBulletChoices(store, { query = '', takenIds = [], limit = 8, jobId = '' } = {}) {
  const taken = new Set(takenIds || []);
  const wanted = String(jobId || '').trim();
  const q = String(query || '').trim();
  if (!q) return [];
  let ordered = searchEntries(store, query);
  if (wanted) {
    const matched = ordered.filter((entry) => entry.jobId === wanted);
    const rest = ordered.filter((entry) => entry.jobId !== wanted);
    ordered = [...matched, ...rest];
  }
  const out = [];
  for (const entry of ordered) {
    if (!entry?.id || !String(entry.title || '').trim() || taken.has(entry.id)) continue;
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

export function placeLibraryBullet(store, {
  postingId = null,
  jobId,
  groupId,
  entryId,
} = {}, clock = Date.now, random = Math.random) {
  const entry = entryById(store, entryId);
  if (!entry?.title || !jobId) return store;
  const posting = postingId ? postingById(store, postingId) : null;
  if (posting) {
    const existing = findCompiledBulletByEntry(store, posting, entry.id);
    if (existing) {
      if (existing.bullet.included !== false) return store;
      const excluded = (posting.resume?.excludedBulletIds || []).filter((id) => id !== existing.bullet.id);
      return updatePostingResume(store, postingId, { excludedBulletIds: excluded }, clock);
    }
  }
  if (resumeTakenEntryIds(store, posting).includes(entry.id)) return store;
  const fields = resumeFieldsFromExperience(entry.title, entry.rich);
  const draft = {
    lead: fields.lead,
    body: fields.body,
    sourceEntryIds: [entry.id],
  };
  if (postingId && posting) {
    return addPostingLocalBullet(store, postingId, jobId, groupId, draft, clock, random);
  }
  return addCareerBullet(store, jobId, groupId, draft, clock, random);
}

function jobIdentityChanged(before, after) {
  return ['company', 'title', 'location', 'start', 'end', 'current'].some((key) => before?.[key] !== after?.[key]);
}

function syncJobIdentity(store, job, clock) {
  let next = store;
  for (const entry of next.entries || []) {
    if (entry.jobId !== job.id) continue;
    if (entry.company === job.company && entry.role === job.title) continue;
    next = updateEntry(next, entry.id, { company: job.company, role: job.title }, clock);
  }
  for (const posting of [...(next.postings || [])]) {
    for (const local of posting.resume?.localJobs || []) {
      if (local.jobId !== job.id) continue;
      const same = local.company === job.company
        && local.title === job.title
        && local.location === job.location
        && local.start === job.start
        && local.end === job.end
        && Boolean(local.current) === Boolean(job.current);
      if (same) continue;
      next = updatePostingLocalJob(next, posting.id, local.id, {
        company: job.company,
        title: job.title,
        location: job.location,
        start: job.start,
        end: job.end,
        current: job.current,
      }, clock);
    }
  }
  return next;
}

export function updateCareerJob(store, id, patch, clock = Date.now) {
  const current = (store?.jobs || []).find((job) => job.id === id);
  if (!current) return store;
  const nextJob = normalizeCareerJob({ ...current, ...patch, id: current.id }, clock) || current;
  const next = { ...store, jobs: (store.jobs || []).map((job) => (job.id === id ? nextJob : job)) };
  if (!jobIdentityChanged(current, nextJob)) return next;
  return syncJobIdentity(next, nextJob, clock);
}

export function assignEntryJob(store, entryId, jobId, clock = Date.now) {
  const entry = entryById(store, entryId);
  if (!entry) return store;
  const id = String(jobId || '').trim();
  if (!id) return updateEntry(store, entryId, { jobId: '' }, clock);
  const job = (store?.jobs || []).find((item) => item.id === id);
  if (!job) return store;
  return updateEntry(store, entryId, {
    jobId: job.id,
    company: job.company,
    role: job.title,
  }, clock);
}

export function placeJobOnResume(store, postingId, jobId, clock = Date.now) {
  const job = (store?.jobs || []).find((item) => item.id === jobId);
  if (!job) return store;
  if (!postingId) return updateCareerJob(store, jobId, { onResume: true }, clock);
  const posting = postingById(store, postingId);
  if (!posting) return store;
  const variant = normalizeResumeVariant(posting.resume);
  const excludedJobIds = (variant.excludedJobIds || []).filter((id) => id !== jobId);
  const includedJobIds = variant.includedJobIds.slice();
  if (!includedJobIds.includes(jobId)) includedJobIds.push(jobId);
  const next = updatePostingResume(store, postingId, { excludedJobIds, includedJobIds }, clock);
  return attachPostingJobBullets(next, postingId, jobId, clock);
}

export function attachPostingJobBullets(store, postingId, jobId, clock = Date.now, random = Math.random) {
  const posting = postingById(store, postingId);
  const job = (store?.jobs || []).find((item) => item.id === jobId);
  if (!posting || !job) return store;
  let next = store;
  const taken = new Set(resumeTakenEntryIds(next, postingById(next, postingId)));
  for (const req of posting.requirements || []) {
    for (const line of req.bullets || []) {
      const entry = bulletEntry(next, line);
      if (!entry?.id || taken.has(entry.id)) continue;
      const tied = inferEntryJobId(entry, next) || entry.jobId;
      if (tied !== jobId) continue;
      const groupId = job.groups?.[0]?.id || '';
      next = placeLibraryBullet(next, {
        postingId,
        jobId,
        groupId,
        entryId: entry.id,
      }, clock, random);
      taken.add(entry.id);
    }
  }
  return next;
}

export function addPostingResumeJob(store, postingId, jobId, opts = {}, clock = Date.now, random = Math.random) {
  if (!postingId) return placeJobOnResume(store, null, jobId, clock);
  let next = placeJobOnResume(store, postingId, jobId, clock);
  if (opts.afterId) {
    const posting = postingById(next, postingId);
    const currentIds = compileResumeDoc(posting, next).sections.experience.jobs.map((job) => job.id);
    next = updatePostingResume(next, postingId, {
      jobOrder: insertJobOrder(posting.resume?.jobOrder, jobId, opts.afterId, currentIds),
    }, clock);
  }
  return next;
}

function normJobLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function editDistance(a, b) {
  if (a === b) return 0;
  const left = String(a || '');
  const right = String(b || '');
  const prev = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const next = left[i - 1] === right[j - 1]
        ? diagonal
        : Math.min(diagonal, prev[j - 1], prev[j]) + 1;
      diagonal = prev[j];
      prev[j] = next;
    }
  }
  return prev[right.length];
}

function titlesNear(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return Math.abs(a.length - b.length) <= 16;
  if (Math.abs(a.length - b.length) > 3) return false;
  return editDistance(a, b) <= 2;
}

function jobSetupProposals(store) {
  const clusters = [];
  const place = (item) => {
    const companyKey = normJobLabel(item.company);
    const titleKey = normJobLabel(item.title);
    if (!companyKey && !titleKey) return;
    let cluster = clusters.find((row) => row.companyKey === companyKey && titlesNear(row.titleKey, titleKey));
    if (!cluster) {
      cluster = {
        companyKey,
        titleKey,
        company: item.company || '',
        title: item.title || '',
        location: item.location || '',
        start: item.start || '',
        end: item.end || '',
        entryIds: [],
        jobIds: [],
        sources: [],
        fromJob: false,
      };
      clusters.push(cluster);
    } else if (!cluster.fromJob && titleKey.length > cluster.titleKey.length && titlesNear(cluster.titleKey, titleKey)) {
      cluster.titleKey = titleKey;
      cluster.title = item.title || cluster.title;
    }
    if (item.fromJob) {
      if (!cluster.fromJob) {
        cluster.company = item.company || cluster.company;
        cluster.title = item.title || cluster.title;
        cluster.titleKey = titleKey || cluster.titleKey;
        cluster.companyKey = companyKey;
        cluster.fromJob = true;
      }
      if (item.location && !cluster.location) cluster.location = item.location;
      if (item.start && !cluster.start) cluster.start = item.start;
      if (item.end && !cluster.end) cluster.end = item.end;
      if (item.jobId && !cluster.jobIds.includes(item.jobId)) cluster.jobIds.push(item.jobId);
    }
    if (item.entryId && !cluster.entryIds.includes(item.entryId)) cluster.entryIds.push(item.entryId);
    const label = [item.company, item.title].filter(Boolean).join(' · ');
    if (label && !cluster.sources.includes(label)) cluster.sources.push(label);
  };
  for (const job of store?.jobs || []) {
    if (job?.jobId) continue;
    place({
      company: job.company,
      title: job.title,
      location: job.location,
      start: job.start,
      end: job.end,
      jobId: job.id,
      fromJob: true,
    });
  }
  for (const entry of store?.entries || []) {
    if (entry?.jobId) continue;
    if (!String(entry?.company || '').trim() && !String(entry?.role || '').trim()) continue;
    place({
      company: entry.company,
      title: entry.role,
      entryId: entry.id,
    });
  }
  return clusters
    .filter((cluster) => cluster.entryIds.length > 0 || cluster.jobIds.length > 1)
    .map((cluster) => ({
      id: `js_${normJobLabel(`${cluster.companyKey} ${cluster.titleKey}`).replace(/ /g, '-').slice(0, 48) || 'job'}`,
      company: cluster.company,
      title: cluster.title,
      location: cluster.location,
      start: cluster.start,
      end: cluster.end,
      entryIds: cluster.entryIds,
      jobIds: cluster.jobIds,
      sources: cluster.sources,
    }));
}

export function suggestJobSetup(store) {
  const status = store?.jobSetup?.status;
  if (status === 'done' || status === 'later') return { needed: false, proposals: [] };
  const proposals = jobSetupProposals(store);
  return { needed: proposals.length > 0, proposals };
}

export function applyJobSetup(store, { proposalIds = [] } = {}, clock = Date.now, random = Math.random) {
  const wanted = new Set(proposalIds || []);
  let next = store || emptyStore();
  for (const proposal of jobSetupProposals(next)) {
    if (!wanted.has(proposal.id)) continue;
    let keepId = proposal.jobIds[0] || '';
    if (!keepId) {
      next = addCareerJob(next, {
        company: proposal.company,
        title: proposal.title,
        location: proposal.location,
        start: proposal.start,
        end: proposal.end,
        onResume: false,
      }, clock, random);
      keepId = next.jobs[next.jobs.length - 1]?.id || '';
    } else {
      for (const dropId of proposal.jobIds.slice(1)) next = mergeJobs(next, keepId, dropId, clock);
    }
    if (!keepId) continue;
    for (const entryId of proposal.entryIds) next = assignEntryJob(next, entryId, keepId, clock);
  }
  return {
    ...next,
    jobSetup: { status: 'done', savedAt: nowIso(clock) },
  };
}

export function dismissJobSetup(store, clock = Date.now) {
  return {
    ...(store || emptyStore()),
    jobSetup: { status: 'later', savedAt: nowIso(clock) },
  };
}

export function mergeJobs(store, keepId, dropId, clock = Date.now) {
  if (!keepId || !dropId || keepId === dropId) return store;
  const keep = (store?.jobs || []).find((job) => job.id === keepId);
  const drop = (store?.jobs || []).find((job) => job.id === dropId);
  if (!keep || !drop) return store;
  const seen = new Set((keep.groups || []).map((group) => group.id));
  const groups = (keep.groups || []).slice();
  for (const group of drop.groups || []) {
    if (seen.has(group.id)) continue;
    seen.add(group.id);
    groups.push(group);
  }
  const onResume = keep.onResume !== false || drop.onResume !== false;
  let next = updateCareerJob(store, keepId, { groups, onResume }, clock);
  const keeper = (next.jobs || []).find((job) => job.id === keepId) || keep;
  next = {
    ...next,
    jobs: (next.jobs || []).filter((job) => job.id !== dropId),
    entries: (next.entries || []).map((entry) => (
      entry.jobId === dropId
        ? { ...entry, jobId: keepId, company: keeper.company, role: keeper.title }
        : entry
    )),
    postings: (next.postings || []).map((posting) => {
      const localJobs = posting.resume?.localJobs;
      if (!Array.isArray(localJobs) || !localJobs.some((job) => job.jobId === dropId)) return posting;
      return {
        ...posting,
        resume: {
          ...posting.resume,
          localJobs: localJobs.map((job) => (
            job.jobId === dropId
              ? {
                ...job,
                jobId: keepId,
                company: keeper.company,
                title: keeper.title,
                location: keeper.location,
                start: keeper.start,
                end: keeper.end,
                current: keeper.current,
              }
              : job
          )),
        },
      };
    }),
  };
  return next;
}

// Every resume wording edit updates the one shared library record. Schema-v2
// normalization has already folded legacy posting overrides into that entry.
export function applyResumeBulletEdit(store, {
  postingId = null,
  jobId,
  groupId,
  bullet,
  spans,
  local = false,
} = {}, clock = Date.now) {
  if (!bullet?.id) return store;
  const entryText = (spans || []).map((span) => String(span?.text || '')).join('');
  if (!entryText.trim()) return store;
  let nextStore = store;
  let entryId = (bullet.sourceEntryIds || [])[0];
  if (!entryId || !entryById(nextStore, entryId)) {
    const created = createSharedBullet(nextStore, {
      title: entryText,
      rich: spans,
      jobId: (nextStore.jobs || []).some((job) => job.id === jobId) ? jobId : '',
    }, clock);
    nextStore = created.store;
    entryId = created.entryId;
    if (entryId) {
      nextStore = attachResumeBulletSource(nextStore, {
        postingId,
        jobId,
        groupId,
        bulletId: bullet.id,
        entryId,
        local,
      }, clock);
    }
  }
  if (!entryId) return nextStore;
  nextStore = updateEntry(nextStore, entryId, { title: entryText, rich: spans }, clock);
  if (!postingId) return nextStore;
  const variant = postingById(nextStore, postingId)?.resume;
  const over = variant?.overrides?.[bullet.id];
  // Be defensive when called with a not-yet-normalized legacy object.
  if (over?.edited === true) {
    nextStore = replacePostingResume(nextStore, postingId, clearBulletOverride(variant, bullet.id), clock);
  }
  return nextStore;
}

function attachResumeBulletSource(store, {
  postingId,
  jobId,
  groupId,
  bulletId,
  entryId,
  local = false,
} = {}, clock = Date.now) {
  if (!bulletId || !entryId) return store;
  const shared = (store.jobs || []).some((job) => job.id === jobId);
  if (!postingId || shared) {
    const job = (store.jobs || []).find((item) => item.id === jobId);
    if (!job) return store;
    return updateCareerJob(store, jobId, {
      groups: (job.groups || []).map((item) => (
        item.id === groupId
          ? {
            ...item,
            bullets: (item.bullets || []).map((row) => (
              row.id === bulletId
                ? { ...row, sourceEntryIds: [...new Set([...(row.sourceEntryIds || []), entryId])] }
                : row
            )),
          }
          : item
      )),
    }, clock);
  }
  if (local) {
    const current = findLocalBullet(postingById(store, postingId)?.resume, bulletId);
    return updatePostingLocalBullet(store, postingId, jobId, groupId, bulletId, {
      sourceEntryIds: [...new Set([...(current?.sourceEntryIds || []), entryId])],
    }, clock);
  }
  return store;
}

export function bulletConsistency(store) {
  const issues = [];
  const checkDoc = (posting, doc) => {
    for (const job of doc?.sections?.experience?.jobs || []) {
      for (const group of job.groups || []) {
        for (const bullet of group.bullets || []) {
          const entryId = (bullet.sourceEntryIds || [])[0];
          const entry = entryId ? entryById(store, entryId) : null;
          if (!entry) continue;
          if (bullet.hasOverride) continue;
          const plainLine = (text) => ignoreBoldMarkers(text).replace(/\*/g, '').replace(/[^\S\n]{2,}/g, ' ').trim();
          const compiled = plainLine(bulletLineText(bullet));
          const library = plainLine(entry.title || '');
          if (compiled === library) continue;
          issues.push({
            kind: 'resume',
            postingId: posting?.id || '',
            bulletId: bullet.id,
            entryId,
          });
        }
      }
    }
  };
  checkDoc(null, compileResumeDoc(null, store));
  for (const posting of store?.postings || []) {
    checkDoc(posting, compileResumeDoc(posting, store));
    for (const req of posting.requirements || []) {
      for (const line of req.bullets || []) {
        if (!line.entryId) continue;
        const entry = entryById(store, line.entryId);
        if (!entry) continue;
        if ((line.text || '') === (entry.title || '')) continue;
        issues.push({
          kind: 'requirement',
          postingId: posting.id,
          bulletId: line.id,
          entryId: line.entryId,
        });
      }
    }
  }
  return issues;
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

function basicsSnapshot(store, clock) {
  return normalizeBasicsBackup({
    profile: store?.profile,
    jobs: store?.jobs,
    education: store?.education,
    credentials: store?.credentials,
    additional: store?.additional,
    resumeSettings: store?.resumeSettings,
    savedAt: nowIso(clock),
  }, clock);
}

function careerJobsFromCompiled(doc) {
  const jobs = [];
  for (const job of doc?.sections?.experience?.jobs || []) {
    if (job?.included === false) continue;
    const groups = [];
    for (const group of job.groups || []) {
      const bullets = [];
      for (const bullet of group.bullets || []) {
        if (bullet?.included === false) continue;
        const lead = bullet.hasOverride ? (bullet.originalLead ?? '') : (bullet.lead || '');
        const body = bullet.hasOverride ? (bullet.originalBody ?? '') : (bullet.body || '');
        bullets.push({
          id: bullet.id,
          lead,
          body,
          priority: bullet.priority,
          pinned: false,
          sourceBulletIds: bullet.sourceBulletIds || [],
          sourceEntryIds: bullet.sourceEntryIds || [],
        });
      }
      const heading = String(group.heading || '').trim();
      if (!heading && !bullets.length) continue;
      groups.push({ id: group.id, heading: group.heading || '', bullets });
    }
    jobs.push({
      id: job.id,
      company: job.company || '',
      title: job.title || '',
      location: job.location || '',
      start: job.start || '',
      end: job.end || '',
      current: Boolean(job.current),
      groups,
    });
  }
  return normalizeCareerJobs(jobs);
}

function basicsLayoutBits(doc) {
  const jobs = (doc?.sections?.experience?.jobs || []).filter((job) => job?.included !== false);
  const companies = jobs.map((job) => job.company || job.title || 'Untitled role');
  let bullets = 0;
  for (const job of jobs) {
    for (const group of job.groups || []) {
      bullets += (group.bullets || []).filter((bullet) => bullet?.included !== false).length;
    }
  }
  const schools = (doc?.sections?.education?.items || []).map((item) => item.school).filter(Boolean);
  const credentials = (doc?.sections?.credentials?.items || []).map((item) => item.name).filter(Boolean);
  const additional = (doc?.sections?.additional?.rows || []).map((row) => row.label).filter(Boolean);
  const bulletLabel = `${bullets} ${bullets === 1 ? 'bullet' : 'bullets'}`;
  return [
    companies.length ? companies.join(', ') : 'no jobs',
    bulletLabel,
    schools.length ? schools.join(', ') : 'no education',
    credentials.length ? credentials.join(', ') : 'no credentials',
    additional.length ? additional.join(', ') : 'no additional info',
  ].join('; ');
}

export function hasBasicsBackup(store) {
  return Boolean(normalizeBasicsBackup(store?.basicsBackup));
}

export function basicsReplaceConfirm(store, postingId) {
  const posting = postingById(store, postingId);
  const title = String(posting?.title || '').trim() || 'this posting';
  const current = basicsLayoutBits(compileResumeDoc(null, store));
  const next = basicsLayoutBits(compileResumeDoc(posting, store));
  return `Replace Resume basics with ${title}? This replaces ${current} with ${next}. Other postings keep their own edits. You can restore the previous basics.`;
}

export function basicsRestoreConfirm(store) {
  const backup = normalizeBasicsBackup(store?.basicsBackup);
  const names = (backup?.jobs || []).map((job) => job.company || job.title || 'Untitled role').filter(Boolean);
  const named = names.length ? names.join(', ') : 'the saved snapshot';
  return `Restore previous basics (${named})? This replaces the current Resume basics with that snapshot. Posting edits stay.`;
}

// Copy one posting's visible resume into the shared template. Posting
// variants stay as they are. The snapshot is only the basics this call
// replaces, so Restore undoes the latest replace.
export function replaceBasicsWithPosting(store, postingId, clock = Date.now) {
  const posting = postingById(store, postingId);
  if (!posting) return store;
  const doc = compileResumeDoc(posting, store);
  const variant = normalizeResumeVariant(posting.resume);
  const resumeSettings = {
    ...(store?.resumeSettings || emptyResumeSettings()),
    sectionOrder: doc.sectionOrder,
  };
  if (variant.showCredentials != null) resumeSettings.showCredentials = variant.showCredentials;
  return {
    ...store,
    jobs: careerJobsFromCompiled(doc),
    education: normalizeEducation(doc.sections?.education?.items, clock),
    credentials: normalizeCredentials(doc.sections?.credentials?.items, clock),
    additional: normalizeAdditional(doc.sections?.additional?.rows, clock),
    resumeSettings: normalizeResumeSettings(resumeSettings),
    basicsBackup: basicsSnapshot(store, clock),
  };
}

export function restorePreviousBasics(store, clock = Date.now) {
  const backup = normalizeBasicsBackup(store?.basicsBackup, clock);
  if (!backup) return store;
  return {
    ...store,
    profile: backup.profile,
    jobs: backup.jobs,
    education: backup.education,
    credentials: backup.credentials,
    additional: backup.additional,
    resumeSettings: backup.resumeSettings,
    basicsBackup: null,
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

function cloneAdditionalRow(row) {
  return {
    ...row,
    items: [...(row.items || [])],
    groups: (row.groups || []).map((group) => ({
      ...group,
      items: [...(group.items || [])],
    })),
    ...(Array.isArray(row?.rich) ? { rich: row.rich.map((span) => ({ ...span })) } : {}),
  };
}

function nextAdditionalGroup(draft, clock, random) {
  return {
    id: draft?.id || newId('sg', clock, random),
    label: draft?.label || '',
    items: Array.isArray(draft?.items) ? draft.items : [],
  };
}

function withAdditionalGroup(row, draft, clock, random) {
  const incoming = nextAdditionalGroup(draft, clock, random);
  if (row.groups?.length) {
    return { ...row, items: [], groups: [...row.groups, incoming] };
  }
  return {
    ...row,
    items: [],
    groups: [{
      ...incoming,
      items: incoming.items.length ? incoming.items : [...(row.items || [])],
    }],
  };
}

// Basics edits `store.additional`. A posting edits `localAdditional`: an
// existing local row updates in place, and a Resume basics row is copied
// under the same id so other postings stay on the shared row.
export function editResumeAdditionalRow(store, postingId, rowId, fn, clock = Date.now) {
  const edit = (row) => {
    const next = fn(cloneAdditionalRow(row));
    if (!next) return null;
    return { ...next, id: row.id, updatedAt: nowIso(clock) };
  };
  if (!postingId) {
    let changed = false;
    const additional = (store?.additional || []).map((row) => {
      if (row.id !== rowId) return row;
      const next = edit(row);
      if (!next) return row;
      changed = true;
      return next;
    });
    if (!changed) return store;
    return { ...store, additional: normalizeAdditional(additional, clock) };
  }
  const posting = postingById(store, postingId);
  if (!posting) return store;
  const variant = normalizeResumeVariant(posting.resume);
  const local = variant.localAdditional.find((row) => row.id === rowId);
  if (local) {
    const next = edit(local);
    if (!next) return store;
    return patchPostingVariant(
      store,
      postingId,
      (current) => updateLocalAdditional(current, rowId, next, clock),
      clock,
    );
  }
  const shared = (store?.additional || []).find((row) => row.id === rowId);
  if (!shared) return store;
  const next = edit(shared);
  if (!next) return store;
  return patchPostingVariant(
    store,
    postingId,
    (current) => addLocalAdditional(current, next, clock),
    clock,
  );
}

export function updateAdditionalRow(store, id, patch, clock = Date.now) {
  return editResumeAdditionalRow(store, null, id, (row) => ({ ...row, ...patch }), clock);
}

function mapCareerJob(store, jobId, fn, clock = Date.now) {
  const current = (store?.jobs || []).find((job) => job.id === jobId);
  if (!current) return store;
  const next = normalizeCareerJob(fn(current), clock);
  if (!next) return store;
  return { ...store, jobs: replaceById(store.jobs, jobId, next) };
}

function careerDraftFromCompiled(career) {
  return {
    id: career?.id,
    company: career?.company || '',
    title: career?.title || '',
    location: career?.location || '',
    start: career?.start || '',
    end: career?.end || '',
    current: Boolean(career?.current),
    groups: (career?.groups || []).map((group) => ({
      id: group.id,
      heading: group.heading || '',
      bullets: (group.bullets || []).map((bullet) => ({
        id: bullet.id,
        lead: bullet.lead || '',
        body: bullet.body || '',
        priority: bullet.priority,
        pinned: bullet.pinned,
        sourceBulletIds: bullet.sourceBulletIds || [],
        sourceEntryIds: bullet.sourceEntryIds || [],
      })),
    })),
  };
}

export function adoptCompiledJob(store, postingId, career, clock = Date.now, random = Math.random) {
  const id = String(career?.id || '').trim();
  if (!id) return store;
  if ((store?.jobs || []).some((job) => job.id === id)) return store;
  const draft = careerDraftFromCompiled(career);
  if (postingId) {
    const posting = postingById(store, postingId);
    if (!posting) return store;
    if ((posting.resume?.localJobs || []).some((job) => job.id === id)) return store;
    return addPostingLocalJob(store, postingId, draft, {}, clock, random);
  }
  return addCareerJob(store, draft, clock, random);
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
    sourceBulletIds: draft.sourceBulletIds,
    sourceEntryIds: draft.sourceEntryIds,
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

export function addResumeAdditionalGroup(store, postingId, rowId, draft = {}, clock = Date.now, random = Math.random) {
  return editResumeAdditionalRow(
    store,
    postingId,
    rowId,
    (row) => withAdditionalGroup(row, draft, clock, random),
    clock,
  );
}

export function addAdditionalGroup(store, rowId, draft = {}, clock = Date.now, random = Math.random) {
  return addResumeAdditionalGroup(store, null, rowId, draft, clock, random);
}

export function updateResumeAdditionalGroup(store, postingId, rowId, groupId, patch, clock = Date.now) {
  return editResumeAdditionalRow(store, postingId, rowId, (row) => ({
    ...row,
    groups: (row.groups || []).map((group) => (
      group.id === groupId ? { ...group, ...patch, id: group.id } : group
    )),
  }), clock);
}

export function updateAdditionalGroup(store, rowId, groupId, patch, clock = Date.now) {
  return updateResumeAdditionalGroup(store, null, rowId, groupId, patch, clock);
}

export function moveResumeAdditionalGroup(store, postingId, rowId, groupId, delta, clock = Date.now) {
  return editResumeAdditionalRow(store, postingId, rowId, (row) => ({
    ...row,
    groups: moveListItem(row.groups || [], groupId, delta),
  }), clock);
}

export function moveAdditionalGroup(store, rowId, groupId, delta, clock = Date.now) {
  return moveResumeAdditionalGroup(store, null, rowId, groupId, delta, clock);
}

export function deleteResumeAdditionalGroup(store, postingId, rowId, groupId, clock = Date.now) {
  return editResumeAdditionalRow(store, postingId, rowId, (row) => ({
    ...row,
    groups: (row.groups || []).filter((group) => group.id !== groupId),
  }), clock);
}

export function deleteAdditionalGroup(store, rowId, groupId, clock = Date.now) {
  return deleteResumeAdditionalGroup(store, null, rowId, groupId, clock);
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
  if (!sibling && (line.text !== entry.title || !sameRich(line.rich, entry.rich))) {
    next = replaceEntry(next, entryId, { title: line.text, rich: line.rich }, clock);
  }
  return applyExperienceLine(next, entryId, line.text, line.rich, clock);
}

export function createEntryBullet(store, postingId, requirementId, text, clock = Date.now, rich, extra = {}) {
  const formatted = normalizeRichSpans(rich, text);
  const title = asString(formatted?.text || text, TEXT_MAX);
  if (!title || !formatted) return store;
  const created = createSharedBullet(store, {
    ...extra,
    title: formatted.text,
    rich: formatted.rich,
    kind: 'experience',
  }, clock);
  if (!created.entryId) return store;
  return addEntryBullet(created.store, postingId, requirementId, created.entryId, formatted.text, clock, formatted.rich);
}

export function updateBullet(store, postingId, requirementId, bulletId, patch, clock = Date.now) {
  const nextPatch = typeof patch === 'string' ? { text: patch } : { ...(patch || {}) };
  // A plain-text edit replaces the line. Keeping the previous spans would
  // ignore the new text, because those spans are the source of the line.
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'text') && !Object.prototype.hasOwnProperty.call(nextPatch, 'rich')) {
    nextPatch.rich = null;
  }
  const before = requirementById(postingById(store, postingId), requirementId)?.bullets.find((line) => line.id === bulletId);
  const priorPlain = before?.text ? experiencePlain(before.text, before.rich) : '';
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
  if (!bullet?.entryId) return projectResumeStore(next);
  return applyExperienceLine(next, bullet.entryId, bullet.text, bullet.rich, clock, priorPlain ? [priorPlain] : []);
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
      entry.company,
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

export function searchKnowledge(store, query) {
  const q = asString(query, 200).toLowerCase();
  const list = store?.knowledge || [];
  if (!q) return list;
  const tokens = tokenize(q);
  return list.filter((note) => {
    const hay = [note.title, knowledgeSearchText(note), ...(note.tags || [])].join(' ').toLowerCase();
    if (hay.includes(q)) return true;
    // Markup-only queries (`**`, `<em>`) leave no tokens. An empty token list
    // would otherwise match every page.
    if (!tokens.length) return false;
    return tokens.every((token) => hay.includes(token));
  });
}

// Fields the Experiences list is allowed to edit. Kind and dates stay on the
// record for older books, but this view does not show or write them.
export const EXPERIENCE_ROW_FIELDS = ['title', 'rich', 'company', 'role', 'jobId', 'tags', 'situation', 'task', 'action', 'result', 'notes'];

export function experienceRowField(name) {
  return EXPERIENCE_ROW_FIELDS.includes(name);
}

export function experienceDetailPatch(patch) {
  const source = patch && typeof patch === 'object' ? patch : {};
  const out = {};
  for (const key of EXPERIENCE_ROW_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return out;
}

export function postingsUsingEntry(store, entryId) {
  if (!entryId) return [];
  const out = [];
  for (const job of store?.postings || []) {
    const used = (job.requirements || []).some((req) => (req.bullets || []).some((line) => line.entryId === entryId));
    if (used) out.push({ id: job.id, title: job.title || 'Posting', company: job.company || '' });
  }
  return out;
}

// Experiences is resume lines only. Knowledge pages have their own section.
export function experienceCatalog(store, { query = '' } = {}) {
  return searchEntries(store, query)
    .map((entry) => ({ type: 'entry', id: entry.id, updatedAt: entry.updatedAt || '' }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export const KNOWLEDGE_SAVE_MS = 600;

export function noteKnowledgeInput(state, noteId, patch, now, delay = KNOWLEDGE_SAVE_MS) {
  const same = state?.noteId === noteId && state.patch;
  return {
    noteId,
    patch: same ? { ...state.patch, ...patch } : { ...(patch || {}) },
    due: now + delay,
    status: 'pending',
  };
}

export function knowledgeSaveStatus(state, now) {
  if (!state || state.status !== 'pending') return state?.status || 'saved';
  return now >= state.due ? 'due' : 'pending';
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

// Requirement rows store their own text. When the link still resolves, the
// entry is the line — the copy is only a fallback for an unlinked bullet.
export function linkedBulletLine(store, bullet) {
  const entry = bulletEntry(store, bullet);
  if (!entry) return { entry: null, text: asString(bullet?.text, TEXT_MAX), rich: bullet?.rich || null };
  return { entry, text: entry.title, rich: entry.rich || null };
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
      const entry = bullet?.entryId ? entryById(store, bullet.entryId) : null;
      const text = asString(entry?.title || bullet?.text, TEXT_MAX);
      if (!text) continue;
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
      const linked = linkedBulletLine(store, bullet);
      const entry = linked.entry;
      const detail = entry || bullet;
      return {
        id: bullet.id,
        entryId: entry?.id || '',
        title: linked.text,
        text: linked.text,
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
      bullets: (req.bullets || []).map((line) => linkedBulletLine(store, line).text),
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
    const title = asString(draft?.title, TEXT_MAX);
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

export function parseKnowledge(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  return raw.split(/\n{2,}/).map((chunk) => {
    const lines = chunk.split('\n').map((line) => line.replace(/^\s*[-*•–—●▪‣∙]\s+/, '').trim()).filter(Boolean);
    if (!lines.length) return null;
    const title = lines[0];
    const body = lines.slice(1).join('\n');
    return { title, body };
  }).filter(Boolean);
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

export const STALE_BOOK_MESSAGE = 'This book was saved somewhere else. Reload to keep the latest copy.';

export function normalizeBookRevision(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? value.toISOString() : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const t = Date.parse(text);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function bookSaveGuard(serverUpdatedAt, expectedUpdatedAt) {
  const server = normalizeBookRevision(serverUpdatedAt);
  const expected = normalizeBookRevision(expectedUpdatedAt);
  if (!server) return { ok: true, reason: 'create' };
  if (expectedUpdatedAt === undefined) return { ok: false, status: 428, reason: 'missing' };
  if (!expected || server !== expected) return { ok: false, status: 409, reason: 'stale' };
  return { ok: true, reason: 'match' };
}

export function bookRevisionGuard(serverRevision, expectedRevision) {
  if (serverRevision == null) return { ok: true, reason: 'create' };
  if (expectedRevision == null || expectedRevision === undefined) {
    return { ok: false, status: 428, reason: 'missing' };
  }
  const server = Number(serverRevision);
  const expected = Number(expectedRevision);
  if (!Number.isFinite(expected) || server !== expected) {
    return { ok: false, status: 409, reason: 'stale' };
  }
  return { ok: true, reason: 'match' };
}

export function shouldPullRemoteBook({
  dirty = false,
  persistPending = false,
  pushing = false,
  visible = true,
} = {}) {
  return visible !== false && !dirty && !persistPending && !pushing;
}

export function resumeRoleKey(scopeId, roleId) {
  const id = String(roleId || '').trim();
  if (!id) return '';
  return `${String(scopeId || 'basics').trim() || 'basics'}:${id}`;
}

export function roleIsCollapsed(keys, scopeId, roleId) {
  const key = resumeRoleKey(scopeId, roleId);
  return Boolean(key && (keys || []).includes(key));
}

export function toggleRoleCollapsed(keys, scopeId, roleId) {
  const key = resumeRoleKey(scopeId, roleId);
  const items = [...(keys || [])].filter(Boolean);
  if (!key) return items;
  return items.includes(key) ? items.filter((item) => item !== key) : [...items, key];
}

export function resumeRoleSummary(career) {
  const company = String(career?.company || '').trim();
  const title = String(career?.title || '').trim();
  const bullets = (career?.groups || []).reduce((sum, group) => sum + (group.bullets || []).length, 0);
  return {
    title: [company, title].filter(Boolean).join(' · ') || 'Untitled role',
    bullets,
  };
}

export function isRoleHeaderToggleTarget(tagName, closestInteractive = false) {
  if (closestInteractive) return false;
  return !['input', 'textarea', 'select', 'button', 'option', 'label', 'a'].includes(String(tagName || '').toLowerCase());
}

export function applyBookWrite(record, expectedUpdatedAt, nextBook, clock = Date.now) {
  const serverAt = record?.updatedAt ?? null;
  const guard = bookSaveGuard(serverAt, expectedUpdatedAt);
  if (!guard.ok) {
    return { ok: false, status: 409, record, reason: guard.reason };
  }
  const ms = typeof clock === 'function' ? clock() : clock;
  return {
    ok: true,
    status: 200,
    reason: guard.reason,
    record: { book: nextBook, updatedAt: new Date(ms).toISOString() },
  };
}

export function bookConflictError(latest) {
  const err = new Error(STALE_BOOK_MESSAGE);
  err.status = 409;
  err.conflict = true;
  err.updatedAt = normalizeBookRevision(latest?.updatedAt) || null;
  err.revision = latest?.revision ?? null;
  err.book = latest?.book ?? null;
  return err;
}

function postingBulletCount(store) {
  let n = 0;
  for (const posting of store?.postings || []) {
    for (const req of posting.requirements || []) {
      n += (req.bullets || []).length;
    }
  }
  return n;
}

function sameBookValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function recordStamp(item) {
  const n = Date.parse(item?.updatedAt || '');
  return Number.isFinite(n) ? n : 0;
}

function pickRecord(base, local, remote) {
  if (!local && !remote) return null;
  if (!base && !local) return remote;
  if (!base && !remote) return local;
  if (!local) return sameBookValue(base, remote) ? null : remote;
  if (!remote) return sameBookValue(base, local) ? null : local;
  if (sameBookValue(local, remote)) return local;
  if (sameBookValue(base, local)) return remote;
  if (sameBookValue(base, remote)) return local;
  return recordStamp(remote) > recordStamp(local) ? remote : local;
}

function mergeRecords(baseList, localList, remoteList) {
  const base = new Map();
  const local = new Map();
  const remote = new Map();
  for (const item of baseList || []) if (item?.id) base.set(item.id, item);
  for (const item of localList || []) if (item?.id) local.set(item.id, item);
  for (const item of remoteList || []) if (item?.id) remote.set(item.id, item);
  const chosen = new Map();
  for (const id of new Set([...base.keys(), ...local.keys(), ...remote.keys()])) {
    const next = pickRecord(base.get(id), local.get(id), remote.get(id));
    if (next) chosen.set(id, next);
  }
  const out = [];
  const seen = new Set();
  for (const item of localList || []) {
    if (!item?.id || !chosen.has(item.id) || remote.has(item.id) || seen.has(item.id)) continue;
    out.push(chosen.get(item.id));
    seen.add(item.id);
  }
  for (const item of remoteList || []) {
    if (!item?.id || !chosen.has(item.id) || seen.has(item.id)) continue;
    out.push(chosen.get(item.id));
    seen.add(item.id);
  }
  for (const item of localList || []) {
    if (!item?.id || !chosen.has(item.id) || seen.has(item.id)) continue;
    out.push(chosen.get(item.id));
    seen.add(item.id);
  }
  return out;
}

function mergePlain(base, local, remote) {
  if (sameBookValue(local, remote)) return local ?? remote ?? null;
  if (sameBookValue(base, local)) return remote ?? null;
  if (sameBookValue(base, remote)) return local ?? null;
  return remote ?? local ?? null;
}

const BOOK_LIST_KEYS = ['entries', 'knowledge', 'postings', 'jobs', 'education', 'credentials', 'additional'];

// Three-way merge for a full-book save. A debounced knowledge edit keeps its
// page, and a newer entry written in another tab stays on the book.
export function mergeBook(base, local, remote) {
  return mergeConcurrentBooks(base, local, remote).book;
}

export function shouldBlockEmptyOverwrite(next, previous) {
  if (!previous) return false;
  const hadLog = (previous.entries || []).length > 0
    || postingBulletCount(previous) > 0
    || (previous.knowledge || []).length > 0;
  if (!hadLog) return false;
  return (next?.entries || []).length === 0
    && postingBulletCount(next) === 0
    && (next?.knowledge || []).length === 0;
}

export function bookIsEmpty(store) {
  const book = store || emptyStore();
  return !book.entries?.length
    && !book.knowledge?.length
    && !book.postings?.length
    && !book.jobs?.length
    && !book.education?.length
    && !book.credentials?.length;
}

export function listingSummary(store) {
  return {
    entries: store.entries.length,
    knowledge: (store.knowledge || []).length,
    postings: store.postings.length,
    stories: store.entries.filter((entry) => entry.kind === 'experience').length,
    projects: store.entries.filter((entry) => entry.kind === 'project').length,
    skillsets: store.entries.filter((entry) => entry.kind === 'skillset').length,
  };
}
