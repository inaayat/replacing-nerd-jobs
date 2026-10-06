/**
 * Structured resume document for Brag Book. Browser-safe ESM — no node: imports.
 * Career history lives on the book; include/exclude and wording overrides are
 * per posting and never rewrite source bullets unless asked.
 */

const TITLE_MAX = 160;
const TEXT_MAX = 4000;
const LEAD_MAX = 280;
const BODY_MAX = 1200;
const URL_MAX = 2048;
const ID_MAX = 64;
const LIST_MAX = 40;
const ITEM_MAX = 120;

export const RESUME_SECTION_KEYS = ['experience', 'credentials', 'education', 'additional'];
export const DEFAULT_SECTION_ORDER = ['experience', 'credentials', 'education', 'additional'];

function asString(value, max) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

function asUrl(value) {
  const text = asString(value, URL_MAX);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mailto:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

function asId(value, clock, prefix) {
  const id = asString(value, ID_MAX);
  if (id) return id;
  const stamp = Number(clock ? clock() : Date.now()).toString(36);
  return `${prefix}_${stamp}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function asStringList(value, { max = LIST_MAX, itemMax = ITEM_MAX } = {}) {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? '').split(/\n|;|\u00b7|\u2022/).map((part) => part.trim());
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const text = asString(item, itemMax);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function asPriority(value) {
  const n = Number(value);
  if (n === 2 || n === 3) return n;
  return 1;
}

export function emptyResumeSettings() {
  return {
    template: 'classic-serif',
    sectionOrder: DEFAULT_SECTION_ORDER.slice(),
    showCredentials: true,
  };
}

export function emptyResumeVariant() {
  return {
    sectionOrder: [],
    showCredentials: null,
    excludedJobIds: [],
    excludedBulletIds: [],
    pinnedBulletIds: [],
    jobOrder: [],
    bulletOrder: {},
    groupHeadings: {},
    overrides: {},
    fit: null,
    updatedAt: '',
  };
}

export function normalizeSectionOrder(value) {
  const raw = Array.isArray(value) ? value : DEFAULT_SECTION_ORDER;
  const seen = new Set();
  const out = [];
  for (const key of raw) {
    if (!RESUME_SECTION_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  for (const key of DEFAULT_SECTION_ORDER) {
    if (!seen.has(key)) out.push(key);
  }
  return out;
}

export function normalizeResumeSettings(raw) {
  const base = emptyResumeSettings();
  if (!raw || typeof raw !== 'object') return base;
  return {
    template: 'classic-serif',
    sectionOrder: normalizeSectionOrder(raw.sectionOrder),
    showCredentials: raw.showCredentials !== false,
  };
}

function asIdList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const id = asString(item, ID_MAX);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function normalizeOverrides(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, value] of Object.entries(raw)) {
    const key = asString(id, ID_MAX);
    if (!key || !value || typeof value !== 'object') continue;
    const lead = value.lead == null ? undefined : asString(value.lead, LEAD_MAX);
    const body = value.body == null ? undefined : asString(value.body, BODY_MAX);
    if (lead == null && body == null) continue;
    out[key] = {};
    if (lead != null) out[key].lead = lead;
    if (body != null) out[key].body = body;
  }
  return out;
}

function normalizeGroupHeadings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, value] of Object.entries(raw)) {
    const key = asString(id, ID_MAX);
    if (!key) continue;
    out[key] = asString(value, TITLE_MAX);
  }
  return out;
}

function normalizeBulletOrder(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, value] of Object.entries(raw)) {
    const key = asString(id, ID_MAX);
    if (!key) continue;
    out[key] = asIdList(value);
  }
  return out;
}

export function normalizeResumeVariant(raw) {
  const base = emptyResumeVariant();
  if (!raw || typeof raw !== 'object') return base;
  const show = raw.showCredentials;
  return {
    sectionOrder: Array.isArray(raw.sectionOrder) && raw.sectionOrder.length
      ? normalizeSectionOrder(raw.sectionOrder)
      : [],
    showCredentials: show === true ? true : show === false ? false : null,
    excludedJobIds: asIdList(raw.excludedJobIds),
    excludedBulletIds: asIdList(raw.excludedBulletIds),
    pinnedBulletIds: asIdList(raw.pinnedBulletIds),
    jobOrder: asIdList(raw.jobOrder),
    bulletOrder: normalizeBulletOrder(raw.bulletOrder),
    groupHeadings: normalizeGroupHeadings(raw.groupHeadings),
    overrides: normalizeOverrides(raw.overrides),
    fit: raw.fit && typeof raw.fit === 'object' ? {
      fontPt: Number(raw.fit.fontPt) || 10,
      bulletLineHeight: Number(raw.fit.bulletLineHeight) || 1.32,
      droppedBulletIds: asIdList(raw.fit.droppedBulletIds),
      fits: raw.fit.fits !== false,
    } : null,
    updatedAt: asString(raw.updatedAt, 40),
  };
}

export function normalizeResumeLink(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = asUrl(raw.url);
  if (!url) return null;
  return { label: asString(raw.label, 80) || 'Link', url };
}

export function normalizeResumeLinks(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const link = normalizeResumeLink(item);
    if (!link || seen.has(link.url)) continue;
    seen.add(link.url);
    out.push(link);
    if (out.length >= 6) break;
  }
  return out;
}

export function normalizeProfileResume(raw, base = {}) {
  const location = asString(raw?.location ?? base.location, TITLE_MAX);
  const fromList = asStringList(raw?.locations, { max: 6, itemMax: TITLE_MAX });
  const locations = fromList.length ? fromList : (location ? [location] : []);
  return {
    suffix: asString(raw?.suffix ?? base.suffix, 40),
    locations,
    phone: asString(raw?.phone ?? base.phone, 40),
    links: normalizeResumeLinks(raw?.links ?? base.links),
  };
}

export function normalizeResumeBullet(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  const lead = asString(raw.lead, LEAD_MAX);
  const body = asString(raw.body, BODY_MAX);
  const id = asString(raw.id, ID_MAX);
  if (!lead && !body && !id) return null;
  return {
    id: asId(raw.id, clock, 'rb'),
    lead,
    body,
    priority: asPriority(raw.priority),
    pinned: Boolean(raw.pinned),
    sourceBulletIds: asIdList(raw.sourceBulletIds),
    sourceEntryIds: asIdList(raw.sourceEntryIds),
  };
}

export function normalizeResumeGroup(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  const bullets = [];
  const seen = new Set();
  for (const item of Array.isArray(raw.bullets) ? raw.bullets : []) {
    const bullet = normalizeResumeBullet(item, clock);
    if (!bullet || seen.has(bullet.id)) continue;
    seen.add(bullet.id);
    bullets.push(bullet);
  }
  const heading = asString(raw.heading, TITLE_MAX);
  const id = asString(raw.id, ID_MAX);
  if (!bullets.length && !heading && !id) return null;
  return {
    id: asId(raw.id, clock, 'rg'),
    heading,
    bullets,
  };
}

export function normalizeCareerJob(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  const company = asString(raw.company, TITLE_MAX);
  const id = asString(raw.id, ID_MAX);
  if (!company && !id) return null;
  const groups = [];
  const seen = new Set();
  for (const item of Array.isArray(raw.groups) ? raw.groups : []) {
    const group = normalizeResumeGroup(item, clock);
    if (!group || seen.has(group.id)) continue;
    seen.add(group.id);
    groups.push(group);
  }
  const end = asString(raw.end, 80);
  return {
    id: asId(raw.id, clock, 'rj'),
    company,
    title: asString(raw.title, TITLE_MAX),
    location: asString(raw.location, TITLE_MAX),
    start: asString(raw.start, 80),
    end,
    current: raw.current === true || /^present$/i.test(end),
    groups,
  };
}

export function normalizeCareerJobs(value, clock = Date.now) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const job = normalizeCareerJob(item, clock);
    if (!job || seen.has(job.id)) continue;
    seen.add(job.id);
    out.push(job);
  }
  return out;
}

export function normalizeEducationItem(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  const school = asString(raw.school, TITLE_MAX);
  const id = asString(raw.id, ID_MAX);
  if (!school && !id) return null;
  return {
    id: asId(raw.id, clock, 'ed'),
    school,
    location: asString(raw.location, TITLE_MAX),
    degree: asString(raw.degree, TITLE_MAX),
    details: asString(raw.details, TEXT_MAX),
    gpa: asString(raw.gpa, 40),
  };
}

export function normalizeEducation(value, clock = Date.now) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const row = normalizeEducationItem(item, clock);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export function normalizeCredential(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  const name = asString(raw.name, TITLE_MAX);
  const id = asString(raw.id, ID_MAX);
  if (!name && !id) return null;
  return {
    id: asId(raw.id, clock, 'cr'),
    name,
    issuer: asString(raw.issuer, TITLE_MAX),
    credentialId: asString(raw.credentialId, 80),
    issued: asString(raw.issued, 80),
  };
}

export function normalizeCredentials(value, clock = Date.now) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const row = normalizeCredential(item, clock);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function normalizeSkillGroup(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  const label = asString(raw.label, TITLE_MAX);
  const items = asStringList(raw.items);
  const id = asString(raw.id, ID_MAX);
  if (!id && !label && !items.length) return null;
  return { id: asId(raw.id, clock, 'sg'), label, items };
}

export function normalizeAdditionalRow(raw, clock = Date.now) {
  if (!raw || typeof raw !== 'object') return null;
  const label = asString(raw.label, TITLE_MAX);
  const id = asString(raw.id, ID_MAX);
  if (!label && !id) return null;
  const groups = [];
  const seen = new Set();
  for (const item of Array.isArray(raw.groups) ? raw.groups : []) {
    const group = normalizeSkillGroup(item, clock);
    if (!group || seen.has(group.id)) continue;
    seen.add(group.id);
    groups.push(group);
  }
  const items = asStringList(raw.items);
  return {
    id: asId(raw.id, clock, 'ad'),
    label,
    items: groups.length ? [] : items,
    groups,
  };
}

export function normalizeAdditional(value, clock = Date.now) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const row = normalizeAdditionalRow(item, clock);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export function isResumeDoc(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.sections && typeof raw.sections === 'object' && raw.sections.experience) return true;
  if (raw.header && raw.sectionOrder && raw.sections) return true;
  return false;
}

export function headerFromProfile(profile) {
  const extra = normalizeProfileResume(profile);
  return {
    name: asString(profile?.name, TITLE_MAX),
    suffix: extra.suffix,
    locations: extra.locations,
    email: asString(profile?.email, TITLE_MAX),
    phone: extra.phone,
    links: extra.links,
  };
}

const METRIC_RE = /\$\d[\d,]*(?:\.\d+)?[KMB]?|\d[\d,]*\+(?:\s+[A-Za-z][A-Za-z /-]{0,28})?|\d[\d,]*(?:\.\d+)?\s*(?:hours?(?:\s+per\s+quarter)?|hrs?|%|x)\b/gi;

export function boldMetrics(text) {
  const raw = String(text || '');
  if (!raw) return '';
  const skip = [];
  raw.replace(/\*\*[^*]+\*\*/g, (m, offset) => {
    skip.push([offset, offset + m.length]);
    return m;
  });
  const inSkip = (i) => skip.some(([a, b]) => i >= a && i < b);
  let out = '';
  let last = 0;
  const re = new RegExp(METRIC_RE.source, 'gi');
  let match;
  while ((match = re.exec(raw))) {
    if (inSkip(match.index)) continue;
    out += raw.slice(last, match.index);
    out += `**${match[0].trim()}**`;
    last = match.index + match[0].length;
  }
  out += raw.slice(last);
  return out;
}

export function parseBulletText(text) {
  const raw = asString(text, TEXT_MAX);
  if (!raw) return { lead: '', body: '' };
  const colon = raw.indexOf(':');
  if (colon > 0 && colon <= 80) {
    return {
      lead: raw.slice(0, colon).replace(/\*\*/g, '').trim(),
      body: boldMetrics(raw.slice(colon + 1).trim()),
    };
  }
  return { lead: '', body: boldMetrics(raw) };
}

export function bulletPlainText(bullet) {
  const lead = asString(bullet?.lead, LEAD_MAX);
  const body = asString(bullet?.body, BODY_MAX).replace(/\*\*/g, '');
  if (lead && body) return `${lead}: ${body}`;
  return lead || body;
}

function slugKey(text) {
  return asString(text, TITLE_MAX).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';
}

function entryById(store, id) {
  return (store?.entries || []).find((entry) => entry.id === id) || null;
}

function matchJobForEntry(jobs, entry) {
  if (!entry) return null;
  if (entry.jobId) {
    const hit = jobs.find((job) => job.id === entry.jobId);
    if (hit) return hit;
  }
  const hay = `${entry.role || ''} ${entry.title || ''}`.toLowerCase();
  if (!hay.trim()) return null;
  return jobs.find((job) => hay.includes(job.company.toLowerCase()) || (job.title && hay.includes(job.title.toLowerCase()))) || null;
}

function reorder(list, order) {
  if (!order?.length) return list;
  const byId = new Map(list.map((item) => [item.id, item]));
  const out = [];
  const seen = new Set();
  for (const id of order) {
    const item = byId.get(id);
    if (!item || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  for (const item of list) {
    if (seen.has(item.id)) continue;
    out.push(item);
  }
  return out;
}

function applyBulletVariant(bullet, jobId, variant) {
  const over = variant.overrides?.[bullet.id] || {};
  const excludedJob = variant.excludedJobIds.includes(jobId);
  const excludedBullet = variant.excludedBulletIds.includes(bullet.id);
  return {
    ...bullet,
    originalLead: bullet.lead,
    originalBody: bullet.body,
    lead: over.lead != null ? over.lead : bullet.lead,
    body: over.body != null ? over.body : bullet.body,
    pinned: Boolean(bullet.pinned || variant.pinnedBulletIds.includes(bullet.id)),
    included: !excludedJob && !excludedBullet,
    hasOverride: over.lead != null || over.body != null,
  };
}

function jobsFromCareer(store, variant) {
  const jobs = normalizeCareerJobs(store?.jobs);
  return reorder(jobs, variant.jobOrder).map((job) => {
    const groups = job.groups.map((group) => {
      const heading = Object.prototype.hasOwnProperty.call(variant.groupHeadings, group.id)
        ? variant.groupHeadings[group.id]
        : group.heading;
      const bullets = reorder(group.bullets, variant.bulletOrder[group.id]).map((bullet) =>
        applyBulletVariant(bullet, job.id, variant)
      );
      return { ...group, heading, bullets };
    });
    return {
      ...job,
      included: !variant.excludedJobIds.includes(job.id),
      groups,
    };
  });
}

function priorityForReqIndex(index, total) {
  if (total <= 1) return 1;
  if (index < Math.ceil(total * 0.45)) return 1;
  if (index < Math.ceil(total * 0.8)) return 2;
  return 3;
}

function textKey(bullet) {
  return bulletPlainText(bullet).toLowerCase().replace(/\s+/g, ' ');
}

function knownKeys(jobs) {
  const keys = new Set();
  for (const job of jobs) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        keys.add(bullet.id);
        for (const id of bullet.sourceBulletIds || []) keys.add(`src:${id}`);
        const key = textKey(bullet);
        if (key) keys.add(`text:${key}`);
      }
    }
  }
  return keys;
}

function ensureJob(jobs, spec) {
  let job = jobs.find((item) => item.id === spec.id);
  if (job) return job;
  job = {
    id: spec.id,
    company: spec.company,
    title: spec.title || '',
    location: spec.location || '',
    start: spec.start || '',
    end: spec.end || '',
    current: Boolean(spec.current),
    included: true,
    groups: [{ id: `${spec.id}_g`, heading: '', bullets: [] }],
  };
  jobs.push(job);
  return job;
}

function mergePostingBullets(jobs, posting, store, variant) {
  const keys = knownKeys(jobs);
  const reqs = posting?.requirements || [];
  reqs.forEach((req, reqIndex) => {
    const priority = priorityForReqIndex(reqIndex, reqs.length);
    for (const line of req.bullets || []) {
      const text = asString(line?.text, TEXT_MAX);
      if (!text) continue;
      if (keys.has(line.id) || keys.has(`src:${line.id}`)) continue;
      const parsed = parseBulletText(text);
      if (keys.has(`text:${textKey(parsed)}`)) continue;
      const entry = line.entryId ? entryById(store, line.entryId) : null;
      const matched = matchJobForEntry(jobs, entry);
      const job = matched || ensureJob(jobs, {
        id: entry?.jobId || `job_role_${slugKey(entry?.role || entry?.when || 'other')}`,
        company: entry?.role || 'Experience',
        title: '',
      });
      if (!job.groups.length) job.groups.push({ id: `${job.id}_g`, heading: '', bullets: [] });
      const group = job.groups[job.groups.length - 1];
      const bullet = applyBulletVariant({
        id: line.id,
        lead: parsed.lead,
        body: parsed.body,
        priority,
        pinned: false,
        sourceBulletIds: [line.id],
        sourceEntryIds: line.entryId ? [line.entryId] : [],
      }, job.id, variant);
      group.bullets.push(bullet);
      keys.add(line.id);
      keys.add(`src:${line.id}`);
      keys.add(`text:${textKey(bullet)}`);
    }
  });
  return jobs;
}

export function compileResumeDoc(posting, store) {
  const settings = normalizeResumeSettings(store?.resumeSettings);
  const variant = normalizeResumeVariant(posting?.resume);
  const sectionOrder = variant.sectionOrder.length ? variant.sectionOrder : settings.sectionOrder;
  const showCredentials = variant.showCredentials == null ? settings.showCredentials : variant.showCredentials;
  const header = headerFromProfile(store?.profile);
  let jobs = jobsFromCareer(store, variant);
  jobs = mergePostingBullets(jobs, posting, store, variant);

  const credentials = normalizeCredentials(store?.credentials);
  const education = normalizeEducation(store?.education);
  const additional = normalizeAdditional(store?.additional);

  return {
    v: 1,
    template: 'classic-serif',
    header,
    sectionOrder,
    sections: {
      experience: { title: 'Work Experience', jobs },
      credentials: { title: 'Credentials', enabled: showCredentials && credentials.length > 0, items: credentials },
      education: { title: 'Education', items: education },
      additional: { title: 'Additional Info', rows: additional },
    },
    fit: variant.fit || { fontPt: 10, bulletLineHeight: 1.32, droppedBulletIds: [], fits: true },
  };
}

export function visibleResumeDoc(doc, { includeFitDrops = false } = {}) {
  const dropped = new Set(includeFitDrops ? [] : (doc?.fit?.droppedBulletIds || []));
  const jobs = (doc?.sections?.experience?.jobs || [])
    .filter((job) => job.included !== false)
    .map((job) => ({
      ...job,
      groups: (job.groups || []).map((group) => ({
        ...group,
        bullets: (group.bullets || []).filter((b) => b.included !== false && !dropped.has(b.id) && !b.fitDropped),
      })).filter((group) => group.bullets.length),
    }));
  return {
    ...doc,
    sections: {
      ...doc.sections,
      experience: { ...(doc.sections?.experience || {}), jobs },
    },
  };
}

export function jobsFromResumeDoc(raw, clock = Date.now) {
  const jobs = raw?.sections?.experience?.jobs ?? raw?.jobs;
  return normalizeCareerJobs(jobs, clock);
}

export function importResumeDoc(store, raw, clock = Date.now) {
  const header = raw?.header || {};
  const extra = normalizeProfileResume({
    suffix: header.suffix,
    locations: header.locations,
    phone: header.phone,
    links: header.links,
    location: (header.locations || [])[0],
  });
  const profile = {
    ...(store?.profile || {}),
    name: asString(header.name, TITLE_MAX) || store?.profile?.name || '',
    email: asString(header.email, TITLE_MAX) || store?.profile?.email || '',
    location: extra.locations.join(' / '),
    ...extra,
  };
  const sectionOrder = normalizeSectionOrder(raw?.sectionOrder);
  const credentials = normalizeCredentials(raw?.sections?.credentials?.items ?? raw?.credentials, clock);
  const showCredentials = raw?.sections?.credentials?.enabled !== false && credentials.length > 0;
  return {
    ...store,
    profile,
    jobs: jobsFromResumeDoc(raw, clock),
    education: normalizeEducation(raw?.sections?.education?.items ?? raw?.education, clock),
    credentials,
    additional: normalizeAdditional(raw?.sections?.additional?.rows ?? raw?.additional, clock),
    resumeSettings: {
      template: 'classic-serif',
      sectionOrder,
      showCredentials,
    },
  };
}

export function moveListItem(list, id, delta) {
  const items = Array.isArray(list) ? list.slice() : [];
  const index = items.findIndex((item) => item.id === id);
  const nextIndex = index + Number(delta || 0);
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const [row] = items.splice(index, 1);
  items.splice(nextIndex, 0, row);
  return items;
}

export function moveKey(order, key, delta) {
  const items = Array.isArray(order) ? order.slice() : [];
  const index = items.indexOf(key);
  const nextIndex = index + Number(delta || 0);
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const [row] = items.splice(index, 1);
  items.splice(nextIndex, 0, row);
  return items;
}

export function toggleId(list, id) {
  const items = asIdList(list);
  if (items.includes(id)) return items.filter((item) => item !== id);
  return [...items, id];
}

export function findResumeBullet(doc, bulletId) {
  for (const job of doc?.sections?.experience?.jobs || []) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        if (bullet.id === bulletId) return { job, group, bullet };
      }
    }
  }
  return null;
}

export function writeBulletBackToSource(store, postingId, bullet) {
  if (!store || !bullet) return store;
  let next = store;
  const jobs = normalizeCareerJobs(store.jobs).map((job) => ({
    ...job,
    groups: job.groups.map((group) => ({
      ...group,
      bullets: group.bullets.map((item) => (
        item.id === bullet.id
          ? { ...item, lead: bullet.lead, body: bullet.body }
          : item
      )),
    })),
  }));
  next = { ...next, jobs };
  const posting = (next.postings || []).find((job) => job.id === postingId);
  if (!posting) return next;
  const sourceIds = new Set(bullet.sourceBulletIds || [bullet.id]);
  const text = bulletPlainText(bullet);
  const requirements = posting.requirements.map((req) => {
    const bullets = req.bullets.map((line) => (
      sourceIds.has(line.id) ? { ...line, text } : line
    ));
    return { ...req, bullets, experiences: bullets };
  });
  return {
    ...next,
    postings: next.postings.map((job) => (
      job.id === postingId ? { ...job, requirements } : job
    )),
  };
}

export function patchResumeVariant(current, patch) {
  const base = normalizeResumeVariant(current);
  const next = { ...base, ...patch };
  if (patch && patch.overrides) next.overrides = { ...base.overrides, ...patch.overrides };
  if (patch && patch.groupHeadings) next.groupHeadings = { ...base.groupHeadings, ...patch.groupHeadings };
  if (patch && patch.bulletOrder) next.bulletOrder = { ...base.bulletOrder, ...patch.bulletOrder };
  return normalizeResumeVariant(next);
}

export function clearBulletOverride(variant, bulletId) {
  const next = normalizeResumeVariant(variant);
  const overrides = { ...next.overrides };
  delete overrides[bulletId];
  next.overrides = overrides;
  return normalizeResumeVariant(next);
}
