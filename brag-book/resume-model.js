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

export const RESUME_MODES = ['basics', 'fresh', 'choose'];

export function emptyResumeVariant() {
  return {
    mode: 'basics',
    sectionOrder: [],
    showCredentials: null,
    excludedJobIds: [],
    excludedBulletIds: [],
    pinnedBulletIds: [],
    jobOrder: [],
    bulletOrder: {},
    groupOrder: {},
    groupHeadings: {},
    jobTitles: {},
    overrides: {},
    localJobs: [],
    localEducation: [],
    localCredentials: [],
    localAdditional: [],
    fit: null,
    updatedAt: '',
  };
}

export function normalizeResumeMode(value) {
  if (value === 'fresh' || value === 'choose' || value === 'basics') return value;
  return 'basics';
}

export function resumeCompileMode(variant) {
  return normalizeResumeMode(variant?.mode) === 'fresh' ? 'fresh' : 'basics';
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
    // Set only when the user edits the bullet on this posting. Import copies
    // and other stored overrides stay unmarked so they cannot hide the library.
    if (value.edited === true) out[key].edited = true;
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
    mode: normalizeResumeMode(raw.mode),
    sectionOrder: Array.isArray(raw.sectionOrder) && raw.sectionOrder.length
      ? normalizeSectionOrder(raw.sectionOrder)
      : [],
    showCredentials: show === true ? true : show === false ? false : null,
    excludedJobIds: asIdList(raw.excludedJobIds),
    excludedBulletIds: asIdList(raw.excludedBulletIds),
    pinnedBulletIds: asIdList(raw.pinnedBulletIds),
    jobOrder: asIdList(raw.jobOrder),
    bulletOrder: normalizeBulletOrder(raw.bulletOrder),
    groupOrder: normalizeBulletOrder(raw.groupOrder),
    groupHeadings: normalizeGroupHeadings(raw.groupHeadings),
    jobTitles: normalizeGroupHeadings(raw.jobTitles),
    overrides: normalizeOverrides(raw.overrides),
    localJobs: normalizeCareerJobs(raw.localJobs),
    localEducation: normalizeEducation(raw.localEducation),
    localCredentials: normalizeCredentials(raw.localCredentials),
    localAdditional: normalizeAdditional(raw.localAdditional),
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

export function bulletLineText(bullet) {
  const lead = asString(bullet?.lead, LEAD_MAX);
  const body = asString(bullet?.body, BODY_MAX);
  if (lead && body) return `**${lead}:** ${body}`;
  if (lead) return `**${lead}**`;
  return body;
}

/** Drop ** markers. They are not shown and do not toggle bold. */
export function ignoreBoldMarkers(text) {
  return String(text ?? '')
    .replace(/\*\*/g, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim();
}

/**
 * Resume display: the title is the text before the first colon, and it is the
 * only bold. Stray ** markers are removed before that split.
 */
export function resumeBulletParts(bullet) {
  let lead = ignoreBoldMarkers(asString(bullet?.lead, LEAD_MAX));
  let body = ignoreBoldMarkers(asString(bullet?.body, BODY_MAX));
  if (!lead) {
    const colon = body.indexOf(':');
    if (colon > 0 && colon <= 80) {
      lead = body.slice(0, colon).trim();
      body = body.slice(colon + 1).trim();
    }
  }
  return { lead, body };
}

export function resumeBulletSpans(bullet) {
  const { lead, body } = resumeBulletParts(bullet);
  if (lead && body) {
    return [
      { text: `${lead}:`, bold: true },
      { text: ` ${body}`, bold: false },
    ];
  }
  if (lead) return [{ text: lead, bold: true }];
  return [{ text: body, bold: false }];
}

export function bulletFromLine(text) {
  return { lead: '', body: asString(text, TEXT_MAX) };
}

export function markdownToSpans(text) {
  const raw = String(text || '');
  const spans = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match;
  while ((match = re.exec(raw))) {
    if (match.index > last) spans.push({ text: raw.slice(last, match.index), bold: false });
    spans.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < raw.length) spans.push({ text: raw.slice(last), bold: false });
  return spans.length ? spans : [{ text: '', bold: false }];
}

export function spansToMarkdown(spans) {
  return (spans || []).map((span) => {
    const text = String(span?.text || '');
    if (!text) return '';
    return span.bold ? `**${text}**` : text;
  }).join('');
}

export function bulletPlainText(bullet) {
  const lead = asString(bullet?.lead, LEAD_MAX);
  const body = asString(bullet?.body, BODY_MAX).replace(/\*\*/g, '');
  if (lead && body) return `${lead}: ${body}`;
  return lead || body;
}

// The experience line (entry title, or the requirement copy) is what the
// posting editor shows. Resume lead/body is that same line, split on the
// first colon the way the one-page layout always has.
export function resumeFieldsFromExperience(text, rich) {
  const markdown = Array.isArray(rich) && rich.some((span) => span && String(span.text || '').length)
    ? spansToMarkdown(rich)
    : asString(text, TEXT_MAX);
  return parseBulletText(markdown);
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
  // A stored override is the posting's wording only after an edit on this
  // resume. An import or copied override is left in place for Reset, and the
  // linked library line is what compile shows.
  const applied = over.edited === true && (over.lead != null || over.body != null);
  return {
    ...bullet,
    originalLead: bullet.lead,
    originalBody: bullet.body,
    lead: applied && over.lead != null ? over.lead : bullet.lead,
    body: applied && over.body != null ? over.body : bullet.body,
    pinned: Boolean(bullet.pinned || variant.pinnedBulletIds.includes(bullet.id)),
    included: !excludedJob && !excludedBullet,
    hasOverride: applied,
  };
}

function decorateJob(job, variant, { local = false } = {}) {
  const groups = (job.groups || []).map((group) => {
    const heading = Object.prototype.hasOwnProperty.call(variant.groupHeadings, group.id)
      ? variant.groupHeadings[group.id]
      : group.heading;
    const bullets = reorder(group.bullets, variant.bulletOrder[group.id]).map((bullet) => ({
      ...applyBulletVariant(bullet, job.id, variant),
      local: Boolean(bullet.local || local),
    }));
    return { ...group, heading, bullets, local: Boolean(group.local || local) };
  });
  const titleTailored = Object.prototype.hasOwnProperty.call(variant.jobTitles || {}, job.id);
  return {
    ...job,
    title: titleTailored ? variant.jobTitles[job.id] : job.title,
    originalTitle: job.title,
    titleTailored,
    included: !variant.excludedJobIds.includes(job.id),
    local: Boolean(local),
    groups: reorder(groups, variant.groupOrder?.[job.id]),
  };
}

function jobsFromCareer(store, variant) {
  return normalizeCareerJobs(store?.jobs).map((job) => decorateJob(job, variant));
}

function jobsFromLocal(variant) {
  return normalizeCareerJobs(variant?.localJobs).map((job) => decorateJob(job, variant, { local: true }));
}

function mergeGroupLists(hostGroups, overlayGroups, variant, jobId) {
  const groups = (hostGroups || []).map((group) => ({
    ...group,
    bullets: (group.bullets || []).slice(),
  }));
  const byId = new Map(groups.map((group) => [group.id, group]));
  for (const overlay of overlayGroups || []) {
    const host = byId.get(overlay.id);
    if (host) {
      const seen = new Set(host.bullets.map((bullet) => bullet.id));
      for (const bullet of overlay.bullets || []) {
        if (seen.has(bullet.id)) continue;
        host.bullets.push({
          ...applyBulletVariant(bullet, jobId, variant),
          local: true,
        });
        seen.add(bullet.id);
      }
    } else {
      groups.push({
        ...overlay,
        local: true,
        bullets: (overlay.bullets || []).map((bullet) => ({
          ...applyBulletVariant(bullet, jobId, variant),
          local: true,
        })),
      });
      byId.set(overlay.id, groups[groups.length - 1]);
    }
  }
  return reorder(groups.map((group) => ({
    ...group,
    heading: Object.prototype.hasOwnProperty.call(variant.groupHeadings, group.id)
      ? variant.groupHeadings[group.id]
      : group.heading,
    bullets: reorder(group.bullets, variant.bulletOrder[group.id]),
  })), variant.groupOrder?.[jobId]);
}

function mergeLocalJobs(jobs, variant) {
  const out = jobs.map((job) => ({
    ...job,
    groups: (job.groups || []).map((group) => ({
      ...group,
      bullets: (group.bullets || []).slice(),
    })),
  }));
  const byId = new Map(out.map((job) => [job.id, job]));
  for (const local of normalizeCareerJobs(variant?.localJobs)) {
    const host = byId.get(local.id);
    if (host) {
      host.groups = mergeGroupLists(host.groups, local.groups, variant, host.id);
      host.hasLocalExtras = true;
    } else {
      const job = decorateJob(local, variant, { local: true });
      out.push(job);
      byId.set(job.id, job);
    }
  }
  return reorder(out, variant.jobOrder);
}

function mergeLocalRows(shared, local) {
  const seen = new Set((shared || []).map((item) => item.id));
  const extra = (local || []).filter((item) => !seen.has(item.id));
  return [...(shared || []), ...extra];
}

function priorityForReqIndex(index, total) {
  if (total <= 1) return 1;
  if (index < Math.ceil(total * 0.45)) return 1;
  if (index < Math.ceil(total * 0.8)) return 2;
  return 3;
}

function textKey(bullet) {
  return bulletPlainText(bullet).toLowerCase().replace(/\s+/g, ' ').trim();
}

function sameIdList(a, b) {
  const left = a || [];
  const right = b || [];
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function requirementLines(store) {
  const lines = [];
  for (const posting of store?.postings || []) {
    for (const req of posting.requirements || []) {
      for (const line of req.bullets || []) {
        if (line?.id || line?.text || line?.entryId) lines.push(line);
      }
    }
  }
  return lines;
}

function requirementIndex(store) {
  const byId = new Map();
  for (const line of requirementLines(store)) {
    if (line?.id) byId.set(line.id, line);
  }
  return byId;
}

function liveFieldsForLine(line, store) {
  const entry = line?.entryId ? entryById(store, line.entryId) : null;
  const text = asString(entry?.title || line?.text, TEXT_MAX);
  if (!text) return null;
  return {
    entryId: entry?.id || '',
    ...resumeFieldsFromExperience(text, entry?.title ? entry.rich : line?.rich),
  };
}

function leadOwnerOk(bullet, entryId) {
  const owners = (bullet?.sourceEntryIds || []).filter(Boolean);
  if (!owners.length) return true;
  return Boolean(entryId) && owners.includes(entryId);
}

// A career bullet is the same experience when it shares an id, the entry,
// the current wording, or — if nothing else matches — one long lead-in.
function findClaimTarget(jobs, line, fields) {
  const leadKey = asString(fields?.lead, LEAD_MAX).toLowerCase();
  const liveKey = fields ? textKey(fields) : '';
  let byId = null;
  let bySource = null;
  let byEntry = null;
  let byText = null;
  const leadHits = [];
  for (const job of jobs || []) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        if (!byId && line?.id && bullet.id === line.id) byId = bullet;
        if (!bySource && line?.id && (bullet.sourceBulletIds || []).includes(line.id)) bySource = bullet;
        if (!byEntry && line?.entryId && (bullet.sourceEntryIds || []).includes(line.entryId)) byEntry = bullet;
        if (!byText && liveKey && textKey(bullet) === liveKey) byText = bullet;
        if (leadKey.length >= 12 && asString(bullet.lead, LEAD_MAX).toLowerCase() === leadKey) leadHits.push(bullet);
      }
    }
  }
  if (byId) return byId;
  if (bySource) return bySource;
  if (byEntry) return byEntry;
  if (byText) return byText;
  if (line?.entryId && leadHits.length === 1 && leadOwnerOk(leadHits[0], line.entryId)) return leadHits[0];
  return null;
}

function experienceMarkdown(text, rich) {
  if (Array.isArray(rich) && rich.some((span) => span && String(span.text || '').length)) {
    return spansToMarkdown(rich);
  }
  return asString(text, TEXT_MAX);
}

// A resume-editor save stores the whole line as the body (no split lead).
// Compile must keep that text so the preview matches the editor instead of
// re-splitting the experience and wrapping metrics in **.
function isResumeEditorLine(bullet, text, rich) {
  if (asString(bullet?.lead, LEAD_MAX)) return false;
  const markdown = experienceMarkdown(text, rich);
  if (!markdown) return false;
  return asString(bullet.body, BODY_MAX) === asString(markdown, BODY_MAX);
}

function claimExperienceLine(jobs, line, store) {
  const fields = liveFieldsForLine(line, store);
  if (!fields) return { found: false, changed: false };
  const bullet = findClaimTarget(jobs, line, fields);
  if (!bullet) return { found: false, changed: false };
  if (bullet.hasOverride) return { found: true, changed: false };
  const sourceEntryIds = fields.entryId
    ? [...new Set([...(bullet.sourceEntryIds || []), fields.entryId])]
    : [...(bullet.sourceEntryIds || [])];
  const sourceBulletIds = line?.id
    ? [...new Set([...(bullet.sourceBulletIds || []), line.id])]
    : [...(bullet.sourceBulletIds || [])];
  const entry = line?.entryId ? entryById(store, line.entryId) : null;
  const sourceText = entry?.title || line?.text;
  const sourceRich = entry?.title ? entry.rich : line?.rich;
  if (isResumeEditorLine(bullet, sourceText, sourceRich)) {
    const changed = !sameIdList(bullet.sourceEntryIds, sourceEntryIds)
      || !sameIdList(bullet.sourceBulletIds, sourceBulletIds);
    bullet.sourceEntryIds = sourceEntryIds;
    bullet.sourceBulletIds = sourceBulletIds;
    return { found: true, changed };
  }
  if (
    bullet.lead === fields.lead
    && bullet.body === fields.body
    && sameIdList(bullet.sourceEntryIds, sourceEntryIds)
    && sameIdList(bullet.sourceBulletIds, sourceBulletIds)
  ) {
    return { found: true, changed: false };
  }
  bullet.lead = fields.lead;
  bullet.body = fields.body;
  bullet.sourceEntryIds = sourceEntryIds;
  bullet.sourceBulletIds = sourceBulletIds;
  return { found: true, changed: true };
}

function fieldsFromLinks(bullet, store, byId) {
  const entryId = (bullet.sourceEntryIds || [])[0] || '';
  const linked = entryId ? entryById(store, entryId) : null;
  if (linked?.title) {
    return { entryId: linked.id, ...resumeFieldsFromExperience(linked.title, linked.rich) };
  }
  const ids = [...(bullet.sourceBulletIds || [])];
  if (bullet.id) ids.push(bullet.id);
  for (const id of ids) {
    const line = byId.get(id);
    if (!line) continue;
    const fields = liveFieldsForLine(line, store);
    if (fields) return fields;
  }
  return null;
}

export function projectExperienceOntoJobs(jobs, store) {
  const copy = (jobs || []).map((job) => ({
    ...job,
    groups: (job.groups || []).map((group) => ({
      ...group,
      bullets: (group.bullets || []).map((bullet) => ({
        ...bullet,
        sourceEntryIds: [...(bullet.sourceEntryIds || [])],
        sourceBulletIds: [...(bullet.sourceBulletIds || [])],
      })),
    })),
  }));
  let changed = false;
  for (const line of requirementLines(store)) {
    if (claimExperienceLine(copy, line, store).changed) changed = true;
  }
  const byId = requirementIndex(store);
  for (const job of copy) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        const fields = fieldsFromLinks(bullet, store, byId);
        if (!fields) continue;
        const sourceEntryIds = fields.entryId
          ? [...new Set([...(bullet.sourceEntryIds || []), fields.entryId])]
          : [...(bullet.sourceEntryIds || [])];
        if (
          bullet.lead === fields.lead
          && bullet.body === fields.body
          && sameIdList(bullet.sourceEntryIds, sourceEntryIds)
        ) continue;
        bullet.lead = fields.lead;
        bullet.body = fields.body;
        bullet.sourceEntryIds = sourceEntryIds;
        changed = true;
      }
    }
  }
  return changed ? copy : (jobs || []);
}

function knownKeys(jobs) {
  const keys = new Set();
  for (const job of jobs) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        keys.add(bullet.id);
        for (const id of bullet.sourceBulletIds || []) keys.add(`src:${id}`);
        for (const id of bullet.sourceEntryIds || []) keys.add(`entry:${id}`);
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
      const fields = liveFieldsForLine(line, store);
      if (!fields) continue;
      const claim = claimExperienceLine(jobs, line, store);
      if (claim.found) {
        keys.add(line.id);
        keys.add(`src:${line.id}`);
        if (line.entryId) keys.add(`entry:${line.entryId}`);
        keys.add(`text:${textKey(fields)}`);
        continue;
      }
      if (keys.has(line.id) || keys.has(`src:${line.id}`)) continue;
      if (line.entryId && keys.has(`entry:${line.entryId}`)) continue;
      if (keys.has(`text:${textKey(fields)}`)) continue;
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
        lead: fields.lead,
        body: fields.body,
        priority,
        pinned: false,
        sourceBulletIds: [line.id],
        sourceEntryIds: line.entryId ? [line.entryId] : [],
      }, job.id, variant);
      group.bullets.push(bullet);
      keys.add(line.id);
      keys.add(`src:${line.id}`);
      if (line.entryId) keys.add(`entry:${line.entryId}`);
      keys.add(`text:${textKey(bullet)}`);
    }
  });
  return jobs;
}

function editorSourceForBullet(bullet, store, byId) {
  const entryId = (bullet.sourceEntryIds || [])[0] || '';
  const linked = entryId ? entryById(store, entryId) : null;
  if (linked?.title) return { entryId: linked.id, text: linked.title, rich: linked.rich };
  const ids = [...(bullet.sourceBulletIds || [])];
  if (bullet.id) ids.push(bullet.id);
  for (const id of ids) {
    const line = byId.get(id);
    if (!line) continue;
    const entry = line.entryId ? entryById(store, line.entryId) : null;
    const text = entry?.title || line.text;
    if (!text) continue;
    return { entryId: entry?.id || '', text, rich: entry?.title ? entry.rich : line.rich };
  }
  return null;
}

function projectEntryLines(jobs, store) {
  const byId = requirementIndex(store);
  return (jobs || []).map((job) => ({
    ...job,
    groups: (job.groups || []).map((group) => ({
      ...group,
      bullets: (group.bullets || []).map((bullet) => {
        if (bullet.hasOverride) return bullet;
        const source = editorSourceForBullet(bullet, store, byId);
        if (source && isResumeEditorLine(bullet, source.text, source.rich)) {
          const sourceEntryIds = source.entryId
            ? [...new Set([...(bullet.sourceEntryIds || []), source.entryId])]
            : bullet.sourceEntryIds;
          if (sameIdList(bullet.sourceEntryIds, sourceEntryIds)) return bullet;
          return { ...bullet, sourceEntryIds };
        }
        const fields = fieldsFromLinks(bullet, store, byId);
        if (!fields) return bullet;
        const sourceEntryIds = fields.entryId
          ? [...new Set([...(bullet.sourceEntryIds || []), fields.entryId])]
          : bullet.sourceEntryIds;
        if (bullet.lead === fields.lead && bullet.body === fields.body && sameIdList(bullet.sourceEntryIds, sourceEntryIds)) {
          return bullet;
        }
        return { ...bullet, lead: fields.lead, body: fields.body, sourceEntryIds };
      }),
    })),
  }));
}

export function compileResumeDoc(posting, store) {
  const settings = normalizeResumeSettings(store?.resumeSettings);
  const variant = normalizeResumeVariant(posting?.resume);
  const sectionOrder = variant.sectionOrder.length ? variant.sectionOrder : settings.sectionOrder;
  const showCredentials = variant.showCredentials == null ? settings.showCredentials : variant.showCredentials;
  const header = headerFromProfile(store?.profile);
  const fresh = resumeCompileMode(variant) === 'fresh';
  let jobs;
  let credentials;
  let education;
  let additional;
  if (fresh) {
    jobs = reorder(jobsFromLocal(variant), variant.jobOrder);
    credentials = normalizeCredentials(variant.localCredentials);
    education = normalizeEducation(variant.localEducation);
    additional = normalizeAdditional(variant.localAdditional);
  } else {
    jobs = mergeLocalJobs(jobsFromCareer(store, variant), variant);
    jobs = mergePostingBullets(jobs, posting, store, variant);
    jobs = projectEntryLines(jobs, store);
    jobs = reorder(jobs, variant.jobOrder);
    credentials = mergeLocalRows(normalizeCredentials(store?.credentials), variant.localCredentials);
    education = mergeLocalRows(normalizeEducation(store?.education), variant.localEducation);
    additional = mergeLocalRows(normalizeAdditional(store?.additional), variant.localAdditional);
  }

  return {
    v: 1,
    template: 'classic-serif',
    header,
    sectionOrder,
    mode: variant.mode,
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

export function relocateBullet(groups, fromGroupId, toGroupId, bulletId, index) {
  const next = (Array.isArray(groups) ? groups : []).map((group) => ({
    ...group,
    bullets: (group.bullets || []).slice(),
  }));
  const from = next.find((group) => group.id === fromGroupId);
  const to = next.find((group) => group.id === toGroupId);
  if (!from || !to) return groups || [];
  const at = from.bullets.findIndex((bullet) => bullet.id === bulletId);
  if (at < 0) return groups || [];
  const [bullet] = from.bullets.splice(at, 1);
  const dest = index == null || index === ''
    ? to.bullets.length
    : Math.max(0, Math.min(Number(index) || 0, to.bullets.length));
  to.bullets.splice(dest, 0, bullet);
  return next;
}

export function neighborGroupForBullet(groups, groupId, bulletId, delta) {
  const list = Array.isArray(groups) ? groups : [];
  const gi = list.findIndex((group) => group.id === groupId);
  if (gi < 0) return null;
  const bullets = list[gi].bullets || [];
  const bi = bullets.findIndex((bullet) => bullet.id === bulletId);
  if (bi < 0) return null;
  const step = Number(delta) || 0;
  const nextBi = bi + step;
  if (nextBi >= 0 && nextBi < bullets.length) {
    return { fromGroupId: groupId, toGroupId: groupId, index: nextBi };
  }
  if (step < 0 && gi > 0) {
    const prev = list[gi - 1];
    return { fromGroupId: groupId, toGroupId: prev.id, index: (prev.bullets || []).length };
  }
  if (step > 0 && gi < list.length - 1) {
    return { fromGroupId: groupId, toGroupId: list[gi + 1].id, index: 0 };
  }
  return null;
}

export function groupBulletOrders(groups) {
  const order = {};
  for (const group of groups || []) {
    if (!group?.id) continue;
    order[group.id] = (group.bullets || []).map((bullet) => bullet.id);
  }
  return order;
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

export function insertKeyAfter(order, key, afterId) {
  const items = (Array.isArray(order) ? order : []).filter((item) => item && item !== key);
  if (!key) return items;
  const idx = afterId ? items.indexOf(afterId) : -1;
  if (idx < 0) return [...items, key];
  items.splice(idx + 1, 0, key);
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

export function insertJobOrder(order, newId, afterId, currentIds = []) {
  const seen = new Set();
  const ids = [];
  const source = (order?.length ? order : currentIds).concat(currentIds);
  for (const id of source) {
    const key = asString(id, ID_MAX);
    if (!key || seen.has(key) || key === newId) continue;
    seen.add(key);
    ids.push(key);
  }
  const nid = asString(newId, ID_MAX);
  if (!nid) return ids;
  if (!afterId) {
    ids.push(nid);
    return ids;
  }
  const idx = ids.indexOf(afterId);
  if (idx >= 0) ids.splice(idx + 1, 0, nid);
  else ids.push(nid);
  return ids;
}

export function findLocalBullet(variant, bulletId) {
  const jobs = normalizeCareerJobs(variant?.localJobs);
  for (const job of jobs) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        if (bullet.id === bulletId) return { job, group, bullet };
      }
    }
  }
  return null;
}

export function localJobById(variant, jobId) {
  return normalizeCareerJobs(variant?.localJobs).find((job) => job.id === jobId) || null;
}

function stubLocalJob(jobId, groupId, clock) {
  const groups = [{
    id: groupId || asId('', clock, 'rg'),
    heading: '',
    bullets: [],
  }];
  return normalizeCareerJob({
    id: jobId,
    company: '',
    title: '',
    location: '',
    start: '',
    end: '',
    groups,
  }, clock);
}

function mapLocalJobs(variant, fn, clock = Date.now) {
  const next = normalizeResumeVariant(variant);
  next.localJobs = normalizeCareerJobs(next.localJobs.map((job) => fn(job) || job), clock);
  return normalizeResumeVariant(next);
}

function upsertLocalJob(variant, jobId, fn, clock = Date.now, groupId) {
  const next = normalizeResumeVariant(variant);
  const jobs = normalizeCareerJobs(next.localJobs);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index >= 0) {
    const mapped = fn(jobs[index]);
    jobs[index] = normalizeCareerJob(mapped || jobs[index], clock) || jobs[index];
  } else {
    const stub = stubLocalJob(jobId, groupId, clock);
    jobs.push(normalizeCareerJob(fn(stub) || stub, clock) || stub);
  }
  next.localJobs = normalizeCareerJobs(jobs, clock);
  return normalizeResumeVariant(next);
}

export function addLocalJob(variant, draft = {}, { afterId, currentJobIds } = {}, clock = Date.now) {
  const next = normalizeResumeVariant(variant);
  const job = normalizeCareerJob({
    company: '',
    title: '',
    location: '',
    start: '',
    end: '',
    groups: [{ id: asId('', clock, 'rg'), heading: '', bullets: [] }],
    ...draft,
  }, clock);
  if (!job) return next;
  next.localJobs = [...next.localJobs, job];
  next.jobOrder = insertJobOrder(next.jobOrder, job.id, afterId, currentJobIds);
  return normalizeResumeVariant(next);
}

export function updateLocalJob(variant, jobId, patch, clock = Date.now) {
  return upsertLocalJob(variant, jobId, (job) => ({ ...job, ...patch, id: job.id }), clock);
}

export function deleteLocalJob(variant, jobId) {
  const next = normalizeResumeVariant(variant);
  next.localJobs = next.localJobs.filter((job) => job.id !== jobId);
  next.jobOrder = next.jobOrder.filter((id) => id !== jobId);
  return normalizeResumeVariant(next);
}

export function addLocalGroup(variant, jobId, draft = {}, clock = Date.now) {
  return upsertLocalJob(variant, jobId, (job) => ({
    ...job,
    groups: [...(job.groups || []), {
      id: asId(draft.id, clock, 'rg'),
      heading: draft.heading || '',
      bullets: Array.isArray(draft.bullets) ? draft.bullets : [],
    }],
  }), clock);
}

export function deleteLocalGroup(variant, jobId, groupId, clock = Date.now) {
  return mapLocalJobs(variant, (job) => {
    if (job.id !== jobId) return job;
    return { ...job, groups: (job.groups || []).filter((group) => group.id !== groupId) };
  }, clock);
}

export function addLocalBullet(variant, jobId, groupId, draft = {}, clock = Date.now) {
  return upsertLocalJob(variant, jobId, (job) => {
    let groups = (job.groups || []).slice();
    if (groupId && !groups.some((group) => group.id === groupId)) {
      groups.push({ id: groupId, heading: '', bullets: [] });
    }
    if (!groups.length) groups = [{ id: asId('', clock, 'rg'), heading: '', bullets: [] }];
    const targetId = (groupId && groups.some((group) => group.id === groupId))
      ? groupId
      : groups[groups.length - 1].id;
    const bullet = {
      id: asId(draft.id, clock, 'rb'),
      lead: draft.lead || '',
      body: draft.body || '',
      priority: draft.priority,
      pinned: draft.pinned,
    };
    return {
      ...job,
      groups: groups.map((group) => (
        group.id === targetId
          ? { ...group, bullets: [...(group.bullets || []), bullet] }
          : group
      )),
    };
  }, clock, groupId);
}

export function updateLocalBullet(variant, jobId, groupId, bulletId, patch, clock = Date.now) {
  return mapLocalJobs(variant, (job) => {
    if (job.id !== jobId) return job;
    return {
      ...job,
      groups: (job.groups || []).map((group) => (
        group.id === groupId
          ? {
            ...group,
            bullets: (group.bullets || []).map((bullet) => (
              bullet.id === bulletId ? { ...bullet, ...patch, id: bullet.id } : bullet
            )),
          }
          : group
      )),
    };
  }, clock);
}

export function deleteLocalBullet(variant, jobId, groupId, bulletId, clock = Date.now) {
  return mapLocalJobs(variant, (job) => {
    if (job.id !== jobId) return job;
    return {
      ...job,
      groups: (job.groups || []).map((group) => (
        group.id === groupId
          ? { ...group, bullets: (group.bullets || []).filter((bullet) => bullet.id !== bulletId) }
          : group
      )),
    };
  }, clock);
}

export function moveLocalBullet(variant, jobId, groupId, bulletId, delta, clock = Date.now) {
  return mapLocalJobs(variant, (job) => {
    if (job.id !== jobId) return job;
    return {
      ...job,
      groups: (job.groups || []).map((group) => (
        group.id === groupId
          ? { ...group, bullets: moveListItem(group.bullets || [], bulletId, delta) }
          : group
      )),
    };
  }, clock);
}

export function relocateLocalBullet(variant, jobId, fromGroupId, toGroupId, bulletId, index, clock = Date.now) {
  return mapLocalJobs(variant, (job) => {
    if (job.id !== jobId) return job;
    return { ...job, groups: relocateBullet(job.groups, fromGroupId, toGroupId, bulletId, index) };
  }, clock);
}

export function moveLocalGroup(variant, jobId, groupId, delta, clock = Date.now) {
  return mapLocalJobs(variant, (job) => {
    if (job.id !== jobId) return job;
    return { ...job, groups: moveListItem(job.groups || [], groupId, delta) };
  }, clock);
}

function appendLocalRow(list, draft, clock) {
  return list.concat(draft ? [draft] : []);
}

export function addLocalEducation(variant, draft = {}, clock = Date.now) {
  const next = normalizeResumeVariant(variant);
  next.localEducation = normalizeEducation(appendLocalRow(next.localEducation, {
    school: '',
    ...draft,
    id: asId(draft.id, clock, 'ed'),
  }, clock), clock);
  return normalizeResumeVariant(next);
}

export function updateLocalEducation(variant, id, patch, clock = Date.now) {
  const next = normalizeResumeVariant(variant);
  next.localEducation = normalizeEducation(
    next.localEducation.map((item) => (item.id === id ? { ...item, ...patch, id: item.id } : item)),
    clock
  );
  return normalizeResumeVariant(next);
}

export function deleteLocalEducation(variant, id) {
  const next = normalizeResumeVariant(variant);
  next.localEducation = next.localEducation.filter((item) => item.id !== id);
  return normalizeResumeVariant(next);
}

export function addLocalCredential(variant, draft = {}, clock = Date.now) {
  const next = normalizeResumeVariant(variant);
  next.localCredentials = normalizeCredentials(appendLocalRow(next.localCredentials, {
    name: '',
    ...draft,
    id: asId(draft.id, clock, 'cr'),
  }, clock), clock);
  return normalizeResumeVariant(next);
}

export function updateLocalCredential(variant, id, patch, clock = Date.now) {
  const next = normalizeResumeVariant(variant);
  next.localCredentials = normalizeCredentials(
    next.localCredentials.map((item) => (item.id === id ? { ...item, ...patch, id: item.id } : item)),
    clock
  );
  return normalizeResumeVariant(next);
}

export function deleteLocalCredential(variant, id) {
  const next = normalizeResumeVariant(variant);
  next.localCredentials = next.localCredentials.filter((item) => item.id !== id);
  return normalizeResumeVariant(next);
}

export function addLocalAdditional(variant, draft = {}, clock = Date.now) {
  const next = normalizeResumeVariant(variant);
  next.localAdditional = normalizeAdditional(appendLocalRow(next.localAdditional, {
    label: '',
    items: [],
    groups: [],
    ...draft,
    id: asId(draft.id, clock, 'ad'),
  }, clock), clock);
  return normalizeResumeVariant(next);
}

export function updateLocalAdditional(variant, id, patch, clock = Date.now) {
  const next = normalizeResumeVariant(variant);
  next.localAdditional = normalizeAdditional(
    next.localAdditional.map((item) => (item.id === id ? { ...item, ...patch, id: item.id } : item)),
    clock
  );
  return normalizeResumeVariant(next);
}

export function deleteLocalAdditional(variant, id) {
  const next = normalizeResumeVariant(variant);
  next.localAdditional = next.localAdditional.filter((item) => item.id !== id);
  return normalizeResumeVariant(next);
}

export function freshPostingResume(current) {
  const base = normalizeResumeVariant(current);
  return normalizeResumeVariant({
    ...emptyResumeVariant(),
    mode: 'fresh',
    sectionOrder: base.sectionOrder,
    showCredentials: base.showCredentials,
  });
}

export function basicsPostingResume(current) {
  const base = normalizeResumeVariant(current);
  return normalizeResumeVariant({
    ...emptyResumeVariant(),
    mode: 'basics',
    sectionOrder: base.sectionOrder,
    showCredentials: base.showCredentials,
  });
}

function careerHasBullet(jobs, bulletId) {
  for (const job of jobs || []) {
    for (const group of job.groups || []) {
      if ((group.bullets || []).some((bullet) => bullet.id === bulletId)) return { job, group };
    }
  }
  return null;
}

function ensureSharedBullet(jobs, hostJob, hostGroup, bullet, clock) {
  const list = normalizeCareerJobs(jobs, clock).map((job) => ({
    ...job,
    groups: job.groups.map((group) => ({ ...group, bullets: group.bullets.slice() })),
  }));
  let job = list.find((item) => item.id === hostJob.id);
  if (!job) {
    job = normalizeCareerJob({
      id: hostJob.id,
      company: hostJob.company,
      title: hostJob.title,
      location: hostJob.location,
      start: hostJob.start,
      end: hostJob.end,
      current: hostJob.current,
      groups: (hostJob.groups || []).map((group) => ({
        id: group.id,
        heading: group.heading,
        bullets: [],
      })),
    }, clock);
    if (job) list.push(job);
  }
  if (!job) return list;
  if (!job.groups.some((group) => group.id === hostGroup.id)) {
    job.groups.push({ id: hostGroup.id, heading: hostGroup.heading || '', bullets: [] });
  }
  job.groups = job.groups.map((group) => {
    if (group.id !== hostGroup.id) return group;
    const index = group.bullets.findIndex((item) => item.id === bullet.id);
    const nextBullet = {
      ...(index >= 0 ? group.bullets[index] : {}),
      id: bullet.id,
      lead: bullet.lead,
      body: bullet.body,
      priority: bullet.priority,
      pinned: bullet.pinned,
      sourceBulletIds: bullet.sourceBulletIds,
      sourceEntryIds: bullet.sourceEntryIds,
    };
    if (index >= 0) {
      const bullets = group.bullets.slice();
      bullets[index] = nextBullet;
      return { ...group, bullets };
    }
    return { ...group, bullets: [...group.bullets, nextBullet] };
  });
  return list;
}

export function writeBulletBackToSource(store, postingId, bullet) {
  if (!store || !bullet) return store;
  let next = store;
  const posting = (next.postings || []).find((job) => job.id === postingId);
  const variant = normalizeResumeVariant(posting?.resume);
  const localHit = findLocalBullet(variant, bullet.id);
  const sharedHit = careerHasBullet(next.jobs, bullet.id);
  if (sharedHit) {
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
  } else if (localHit) {
    next = {
      ...next,
      jobs: ensureSharedBullet(next.jobs, localHit.job, localHit.group, {
        ...localHit.bullet,
        lead: bullet.lead,
        body: bullet.body,
      }),
    };
  } else {
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
  }
  const current = (next.postings || []).find((job) => job.id === postingId);
  if (!current) return next;
  const sourceIds = new Set(bullet.sourceBulletIds || [bullet.id]);
  const text = bulletPlainText(bullet);
  const requirements = current.requirements.map((req) => {
    const bullets = req.bullets.map((line) => (
      sourceIds.has(line.id) ? { ...line, text } : line
    ));
    return { ...req, bullets, experiences: bullets };
  });
  let resume = current.resume;
  if (localHit && resumeCompileMode(variant) !== 'fresh') {
    resume = deleteLocalBullet(variant, localHit.job.id, localHit.group.id, bullet.id);
  }
  return {
    ...next,
    postings: next.postings.map((job) => (
      job.id === postingId ? { ...job, requirements, resume: normalizeResumeVariant(resume) } : job
    )),
  };
}

export function patchResumeVariant(current, patch) {
  const base = normalizeResumeVariant(current);
  const next = { ...base, ...patch };
  if (patch && patch.overrides) next.overrides = { ...base.overrides, ...patch.overrides };
  if (patch && patch.groupHeadings) next.groupHeadings = { ...base.groupHeadings, ...patch.groupHeadings };
  if (patch && patch.jobTitles) {
    const jobTitles = { ...base.jobTitles };
    for (const [id, value] of Object.entries(patch.jobTitles)) {
      if (value == null) delete jobTitles[id];
      else jobTitles[id] = value;
    }
    next.jobTitles = jobTitles;
  }
  if (patch && patch.bulletOrder) next.bulletOrder = { ...base.bulletOrder, ...patch.bulletOrder };
  if (patch && patch.groupOrder) next.groupOrder = { ...base.groupOrder, ...patch.groupOrder };
  return normalizeResumeVariant(next);
}

export function clearJobTitle(variant, jobId) {
  const next = normalizeResumeVariant(variant);
  const jobTitles = { ...next.jobTitles };
  delete jobTitles[jobId];
  next.jobTitles = jobTitles;
  return normalizeResumeVariant(next);
}

export function clearBulletOverride(variant, bulletId) {
  const next = normalizeResumeVariant(variant);
  const overrides = { ...next.overrides };
  delete overrides[bulletId];
  next.overrides = overrides;
  return normalizeResumeVariant(next);
}
