/**
 * Brag Book document model. Browser-safe ESM — no node: imports.
 *
 * One local store: a running win log (`entries`) plus job postings that pin
 * resume bullets, STAR stories, and practice questions onto each requirement.
 */

export const SCHEMA = 1;
export const STORE_KEY = 'brag-book-store-v1';
export const BOOK_MAX_CHARS = 1_500_000;

export const ENTRY_KINDS = ['experience', 'project', 'skillset'];
export const POSTING_STATUSES = ['draft', 'prepping', 'applied', 'archived'];

const TITLE_MAX = 160;
const TEXT_MAX = 4000;
const TAG_MAX = 32;
const TAGS_MAX = 16;
const URL_MAX = 2048;

export function emptyStore() {
  return { v: SCHEMA, entries: [], postings: [] };
}

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

export function normalizeEntry(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  const title = asString(raw.title, TITLE_MAX);
  if (!title) return null;
  const createdAt = asString(raw.createdAt, 40) || nowIso(clock);
  return {
    id: asString(raw.id, 64) || newId('en', clock),
    kind: asKind(raw.kind),
    title,
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

export function normalizeRequirement(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  const text = asString(raw.text, TEXT_MAX);
  if (!text) return null;
  const entryIds = Array.isArray(raw.entryIds)
    ? [...new Set(raw.entryIds.map((id) => asString(id, 64)).filter(Boolean))]
    : [];
  return {
    id: asString(raw.id, 64) || newId('rq', clock),
    text,
    bullets: normalizeLines(raw.bullets, clock),
    questions: normalizeLines(raw.questions, clock),
    entryIds,
    ready: Boolean(raw.ready),
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
    }));
    store.postings.push(posting);
  }
  return store;
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

export function updateEntry(store, id, patch, clock = Date.now) {
  const current = entryById(store, id);
  if (!current) return store;
  const next = normalizeEntry({ ...current, ...patch, id: current.id, createdAt: current.createdAt }, clock);
  if (!next) return store;
  return { ...store, entries: replaceById(store.entries, id, touched(next, clock)) };
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

export function addBullet(store, postingId, requirementId, text, clock = Date.now) {
  const line = normalizeLine({ text, id: newId('ln', clock) }, clock);
  if (!line) return store;
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => ({ ...req, bullets: [...req.bullets, line] }),
    clock
  );
}

export function updateBullet(store, postingId, requirementId, bulletId, text, clock = Date.now) {
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => ({
      ...req,
      bullets: req.bullets.map((line) =>
        line.id === bulletId ? { ...line, text: asString(text, TEXT_MAX) } : line
      ).filter((line) => line.text),
    }),
    clock
  );
}

export function deleteBullet(store, postingId, requirementId, bulletId, clock = Date.now) {
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => ({ ...req, bullets: dropById(req.bullets, bulletId) }),
    clock
  );
}

export function addQuestion(store, postingId, requirementId, text, clock = Date.now) {
  const line = normalizeLine({ text, id: newId('ln', clock) }, clock);
  if (!line) return store;
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => ({ ...req, questions: [...req.questions, line] }),
    clock
  );
}

export function updateQuestion(store, postingId, requirementId, questionId, text, clock = Date.now) {
  return mapRequirement(
    store,
    postingId,
    requirementId,
    (req) => ({
      ...req,
      questions: req.questions.map((line) =>
        line.id === questionId ? { ...line, text: asString(text, TEXT_MAX) } : line
      ).filter((line) => line.text),
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
  return (requirement?.entryIds || [])
    .map((id) => entryById(store, id))
    .filter(Boolean);
}

export function compileResume(posting) {
  const sections = (posting?.requirements || []).map((req) => ({
    id: req.id,
    requirement: req.text,
    bullets: req.bullets.map((line) => line.text),
  }));
  return {
    title: posting?.title || '',
    company: posting?.company || '',
    sections,
    bullets: sections.flatMap((section) => section.bullets),
  };
}

export function compileResumeText(posting) {
  const compiled = compileResume(posting);
  const head = [compiled.title, compiled.company].filter(Boolean).join(' · ');
  const blocks = compiled.sections
    .filter((section) => section.bullets.length)
    .map((section) => `${section.requirement}\n${section.bullets.map((b) => `• ${b}`).join('\n')}`);
  return [head, ...blocks].filter(Boolean).join('\n\n');
}

export function compilePrep(store, posting) {
  return (posting?.requirements || []).map((req) => ({
    id: req.id,
    text: req.text,
    ready: Boolean(req.ready),
    bullets: req.bullets.map((line) => line.text),
    questions: req.questions.map((line) => line.text),
    stories: linkedEntries(store, req).map((entry) => ({
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
    })),
  }));
}

export function prepCoverage(store, posting) {
  const cards = compilePrep(store, posting);
  const total = cards.length;
  const withBullet = cards.filter((card) => card.bullets.length).length;
  const withStory = cards.filter((card) => card.stories.length).length;
  const withQuestion = cards.filter((card) => card.questions.length).length;
  const ready = cards.filter((card) => card.ready).length;
  return { total, withBullet, withStory, withQuestion, ready };
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
  return !book.entries?.length && !book.postings?.length;
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
