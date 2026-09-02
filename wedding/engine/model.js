/**
 * Wedding board document: buckets + clips (loose notes and labelled links).
 * Imported by the browser and by `lib/wedding.js` — keep this file
 * dependency-free ESM (no `node:` imports, no npm packages).
 */

export const BOARD_LIMITS = {
  title: 80,
  buckets: 80,
  bucketName: 48,
  clips: 2500,
  body: 4000,
  url: 2048,
  urlLabel: 120,
  tasks: 400,
  taskTitle: 120,
  taskNotes: 2000,
  decisions: 120,
  decisionTitle: 120,
  decisionNotes: 4000,
  json: 500_000,
};

export const CLIP_STATUSES = ['saved', 'shortlist', 'chosen', 'archived'];
export const TASK_STATUSES = ['someday', 'next', 'done'];
export const DECISION_STATUSES = ['exploring', 'decided'];

export const SUGGESTED_BUCKETS = [
  { name: 'Venue', hint: 'places, rooms, outdoor spots' },
  { name: 'Looks', hint: 'dress, suits, jewelry' },
  { name: 'Flowers', hint: 'bouquets, tables, arches' },
  { name: 'Table', hint: 'food, drink, stationery' },
  { name: 'Music', hint: 'ceremony, dance, playlists' },
  { name: 'People', hint: 'party, vendors, guests' },
];

const ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
const IMAGE_EXT = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?|#|$)/i;
const VIDEO_EXT = /\.(m4v|mov|mp4|webm)(\?|#|$)/i;

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyBoard() {
  return {
    v: 2,
    title: 'Wedding',
    buckets: [],
    clips: [],
    tasks: [],
    decisions: [],
    meta: { weddingDate: null },
  };
}

function clipStr(value, max) {
  return String(value ?? '').slice(0, max);
}

function cleanId(value, prefix, used) {
  const raw = String(value || '');
  let id = ID_RE.test(raw) ? raw : newId(prefix);
  while (used.has(id)) id = newId(prefix);
  used.add(id);
  return id;
}

function nowIso(value) {
  const raw = String(value || '');
  if (raw && !Number.isNaN(Date.parse(raw))) return raw;
  return new Date().toISOString();
}

/** True when `text` is a lone http(s) URL. */
export function isHttpUrl(text) {
  const t = String(text || '').trim();
  if (!t || /\s/.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Keep only http(s) URLs. Bare domains like `tiktok.com/@x` are accepted
 * by prefixing https:// so a paste from Notes still works.
 */
export function cleanUrl(value) {
  const raw = clipStr(value, BOARD_LIMITS.url).trim();
  if (!raw) return null;
  if (/\s/.test(raw)) return null;
  let candidate = raw;
  if (!/^https?:\/\//i.test(raw)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
    candidate = `https://${raw}`;
  }
  return isHttpUrl(candidate) ? candidate : null;
}

export function urlDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isImageUrl(url) {
  const href = cleanUrl(url);
  if (!href) return false;
  try {
    const u = new URL(href);
    if (IMAGE_EXT.test(u.pathname)) return true;
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'i.imgur.com' || host === 'pbs.twimg.com' || host === 'media.giphy.com') return true;
    return false;
  } catch {
    return false;
  }
}

export function isVideoFileUrl(url) {
  const href = cleanUrl(url);
  if (!href) return false;
  try {
    return VIDEO_EXT.test(new URL(href).pathname);
  } catch {
    return false;
  }
}

export function linkKind(url) {
  const href = cleanUrl(url);
  if (!href) return null;
  if (isImageUrl(href)) return 'image';
  let host = '';
  try {
    host = new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
  if (isVideoFileUrl(href)) return 'video';
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com') || host === 'vm.tiktok.com') return 'tiktok';
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'youtube';
  if (host === 'pinterest.com' || host.endsWith('.pinterest.com') || host === 'pin.it') return 'pinterest';
  return 'link';
}

export function linkKindLabel(kind) {
  return ({
    tiktok: 'TikTok',
    instagram: 'Instagram',
    youtube: 'YouTube',
    pinterest: 'Pinterest',
    image: 'Image',
    video: 'Video',
    link: 'Link',
  })[kind] || 'Link';
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Numeric pin id from a pinterest.com or assets.pinterest.com URL. */
export function pinterestPinId(url) {
  const href = String(url || '');
  const m = href.match(/\/pin\/(\d{5,})/)
    || href.match(/[?&](?:pin_)?id=(\d{5,})/);
  return m ? m[1] : '';
}

export function pinterestThumbFromHtml(html) {
  const m = String(html || '').match(/https?:\/\/i\.pinimg\.com\/[^"'\\\s<>]+/i);
  return m ? decodeEntities(m[0]) : '';
}

/** Best still from widgets.pinterest.com/v3/pidgets/pins/info/. */
export function pinterestWidgetThumbnail(payload) {
  const row = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
  const images = row?.images && typeof row.images === 'object' ? row.images : null;
  if (!images) return '';
  const prefer = ['564x', '474x', '236x', '237x', 'orig'];
  for (const key of prefer) {
    const src = images[key]?.url;
    if (typeof src === 'string' && /^https?:\/\//i.test(src)) return src;
  }
  for (const value of Object.values(images)) {
    const src = value?.url;
    if (typeof src === 'string' && /^https?:\/\//i.test(src)) return src;
  }
  return '';
}

/**
 * How a clip can be previewed in the board: a direct photo/video file, a
 * YouTube poster, or an official embed player (TikTok / Instagram / Pinterest).
 * Short links (pin.it, vm.tiktok) have no id until a server unfurl follows them.
 * Pinterest is a still — never a playable video.
 */
export function mediaPreview(url) {
  const href = cleanUrl(url);
  if (!href) return null;
  const kind = linkKind(href);
  if (!kind) return null;
  let parsed;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }
  const path = parsed.pathname;

  if (kind === 'image') {
    return { kind: 'image', src: href, thumbnail: href, embedUrl: null, playable: false, still: true };
  }
  if (kind === 'video') {
    return { kind: 'video', src: href, thumbnail: null, embedUrl: null, playable: true, still: false };
  }
  if (kind === 'youtube') {
    let id = '';
    if (hostOf(href) === 'youtu.be') id = path.replace(/^\//, '').split('/')[0] || '';
    else if (path.startsWith('/shorts/')) id = path.split('/')[2] || '';
    else if (path.startsWith('/embed/')) id = path.split('/')[2] || '';
    else id = parsed.searchParams.get('v') || '';
    id = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
    if (!id) return { kind: 'youtube', src: href, thumbnail: null, embedUrl: null, playable: false, still: false };
    return {
      kind: 'youtube',
      src: href,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      embedUrl: `https://www.youtube.com/embed/${id}?rel=0`,
      playable: true,
      still: false,
    };
  }
  if (kind === 'tiktok') {
    const m = path.match(/\/video\/(\d{5,})/) || path.match(/\/embed\/v2\/(\d{5,})/) || path.match(/\/player\/v1\/(\d{5,})/);
    const id = m ? m[1] : '';
    return {
      kind: 'tiktok',
      src: href,
      thumbnail: null,
      embedUrl: id ? `https://www.tiktok.com/player/v1/${id}` : null,
      playable: true,
      still: false,
    };
  }
  if (kind === 'instagram') {
    const m = path.match(/\/(reels?|p|tv)\/([A-Za-z0-9_-]+)/);
    const type = m ? (m[1] === 'reels' ? 'reel' : m[1]) : '';
    const id = m ? m[2] : '';
    return {
      kind: 'instagram',
      src: href,
      thumbnail: null,
      embedUrl: id ? `https://www.instagram.com/${type}/${id}/embed/` : null,
      playable: true,
      still: false,
    };
  }
  if (kind === 'pinterest') {
    const id = pinterestPinId(href);
    return {
      kind: 'pinterest',
      src: href,
      thumbnail: null,
      embedUrl: id ? `https://assets.pinterest.com/ext/embed.html?id=${id}` : null,
      playable: false,
      still: true,
    };
  }
  return { kind: 'link', src: href, thumbnail: null, embedUrl: null, playable: false, still: false };
}

export function isStillMedia(media) {
  return media?.kind === 'image' || media?.kind === 'pinterest' || media?.still === true;
}

/**
 * What the card should paint: a photo, an auto-loaded still embed, a branded
 * placeholder, or a play control for real video.
 */
export function previewPresentation(clip) {
  if (!clip?.url) return { mode: 'none' };
  const media = mediaPreview(previewHref(clip)) || mediaPreview(clip.url);
  const thumb = clip.preview?.thumbnail || media?.thumbnail || '';
  if (!media) return thumb ? { mode: 'image', src: thumb } : { mode: 'none' };
  if (media.kind === 'image') {
    return { mode: 'image', src: thumb || media.src };
  }
  if (isStillMedia(media)) {
    if (thumb) return { mode: 'image', src: thumb };
    if (media.embedUrl) return { mode: 'embed', embedUrl: media.embedUrl, kind: media.kind };
    return { mode: 'placeholder', kind: media.kind };
  }
  if (media.kind === 'video') {
    return { mode: 'play', kind: 'video', poster: thumb, embedUrl: null };
  }
  if (media.playable || media.embedUrl) {
    return { mode: 'play', kind: media.kind, poster: thumb, embedUrl: media.embedUrl };
  }
  if (thumb) return { mode: 'image', src: thumb };
  return { mode: 'none' };
}

/** How the collage (and any image-forward surface) should paint a clip. */
export function previewPaint(clip) {
  const shown = previewPresentation(clip);
  if (shown.mode === 'image' && shown.src) {
    return { paint: 'image', src: shown.src, kind: shown.kind || 'image', play: false };
  }
  if (shown.mode === 'play' && shown.poster) {
    return { paint: 'image', src: shown.poster, kind: shown.kind, play: true };
  }
  if (shown.embedUrl && (shown.mode === 'embed' || shown.mode === 'play')) {
    return { paint: 'embed', embedUrl: shown.embedUrl, kind: shown.kind, play: shown.mode === 'play' };
  }
  if (shown.mode === 'placeholder' || shown.mode === 'play') {
    return { paint: 'placeholder', kind: shown.kind || 'link', play: shown.mode === 'play' };
  }
  return { paint: 'none' };
}

/** Photo, pin, embed, or playable clip — anything the collage can paint. */
export function clipHasVisual(clip) {
  return previewPresentation(clip).mode !== 'none';
}

export function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}

export function extractOpenGraph(html) {
  const source = String(html || '').slice(0, 200_000);
  const pick = (prop) => {
    const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const a = source.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'));
    if (a) return decodeEntities(a[1]).trim();
    const b = source.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i'));
    if (b) return decodeEntities(b[1]).trim();
    return '';
  };
  return {
    title: pick('og:title') || pick('twitter:title'),
    image: pick('og:image') || pick('twitter:image') || pick('og:image:url'),
    url: pick('og:url'),
  };
}

export function normalizePreview(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const thumbnail = cleanUrl(raw.thumbnail);
  const canonical = cleanUrl(raw.canonical);
  const title = clipStr(raw.title, 200).trim();
  if (!thumbnail && !canonical && !title) return null;
  return { thumbnail, canonical, title };
}

/** Local posters we can stamp without a server (YouTube, direct photos). */
export function localPreview(url) {
  const media = mediaPreview(url);
  if (!media?.thumbnail) return null;
  return normalizePreview({ thumbnail: media.thumbnail, canonical: url });
}

export function defaultUrlLabel(url) {
  const domain = urlDomain(url);
  const kind = linkKind(url);
  if (kind && kind !== 'link' && kind !== 'image') return linkKindLabel(kind);
  return domain || 'Link';
}

/**
 * If the whole thought is a URL, split it into the link field. If a URL
 * sits on its own last line, peel that off so a caption + paste still works.
 */
export function extractPastedUrl(text) {
  const raw = String(text || '');
  const trimmed = raw.trim();
  if (!trimmed) return { body: '', url: null };
  if (isHttpUrl(trimmed) || cleanUrl(trimmed)) {
    return { body: '', url: cleanUrl(trimmed) };
  }
  const lines = raw.split(/\n/);
  const last = lines[lines.length - 1].trim();
  const url = cleanUrl(last);
  if (url && lines.length > 1) {
    return { body: lines.slice(0, -1).join('\n').trimEnd(), url };
  }
  return { body: raw, url: null };
}

export function clipDisplayLabel(clip) {
  const label = String(clip?.urlLabel || '').trim();
  if (label) return label;
  if (clip?.url) return defaultUrlLabel(clip.url);
  return '';
}

function normalizeBucket(raw, used) {
  const rec = raw && typeof raw === 'object' ? raw : {};
  const name = clipStr(rec.name, BOARD_LIMITS.bucketName).trim();
  if (!name) return null;
  return {
    id: cleanId(rec.id, 'b', used),
    name,
  };
}

function normalizeTagIds(raw, bucketIds) {
  let ids = [];
  if (Array.isArray(raw?.tagIds)) {
    ids = raw.tagIds.map((id) => String(id)).filter((id) => bucketIds.has(id));
  } else {
    const legacy = raw?.bucketId == null || raw?.bucketId === '' ? null : String(raw.bucketId);
    if (legacy && bucketIds.has(legacy)) ids = [legacy];
  }
  const seen = new Set();
  return ids.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function normalizeClipStatus(value) {
  const s = String(value || 'saved').trim();
  return CLIP_STATUSES.includes(s) ? s : 'saved';
}

function normalizeClip(raw, used, bucketIds) {
  const rec = raw && typeof raw === 'object' ? raw : {};
  const body = clipStr(rec.body, BOARD_LIMITS.body);
  const url = cleanUrl(rec.url);
  if (!body.trim() && !url) return null;
  const tagIds = normalizeTagIds(rec, bucketIds);
  const urlLabel = url ? clipStr(rec.urlLabel, BOARD_LIMITS.urlLabel).trim() : '';
  const createdAt = nowIso(rec.createdAt);
  const preview = url ? normalizePreview(rec.preview) : null;
  return {
    id: cleanId(rec.id, 'c', used),
    body,
    url,
    urlLabel,
    preview,
    tagIds,
    favorite: !!rec.favorite,
    status: normalizeClipStatus(rec.status),
    createdAt,
    updatedAt: nowIso(rec.updatedAt || rec.createdAt) || createdAt,
  };
}

function normalizeTask(raw, used, clipIds) {
  const rec = raw && typeof raw === 'object' ? raw : {};
  const title = clipStr(rec.title, BOARD_LIMITS.taskTitle).trim();
  if (!title) return null;
  const status = TASK_STATUSES.includes(rec.status) ? rec.status : 'someday';
  const notes = clipStr(rec.notes, BOARD_LIMITS.taskNotes);
  const due = rec.due == null || rec.due === '' ? null : nowIso(rec.due);
  let linked = Array.isArray(rec.clipIds) ? rec.clipIds.map(String) : [];
  linked = linked.filter((id) => clipIds.has(id)).slice(0, 24);
  const decisionId = rec.decisionId ? String(rec.decisionId) : null;
  const createdAt = nowIso(rec.createdAt);
  return {
    id: cleanId(rec.id, 't', used),
    title,
    notes,
    status,
    due,
    clipIds: linked,
    decisionId: decisionId || null,
    createdAt,
    updatedAt: nowIso(rec.updatedAt || rec.createdAt) || createdAt,
  };
}

function normalizeDecision(raw, used, clipIds) {
  const rec = raw && typeof raw === 'object' ? raw : {};
  const title = clipStr(rec.title, BOARD_LIMITS.decisionTitle).trim();
  if (!title) return null;
  const status = DECISION_STATUSES.includes(rec.status) ? rec.status : 'exploring';
  const notes = clipStr(rec.notes, BOARD_LIMITS.decisionNotes);
  let linked = Array.isArray(rec.clipIds) ? rec.clipIds.map(String) : [];
  linked = linked.filter((id) => clipIds.has(id)).slice(0, 48);
  const createdAt = nowIso(rec.createdAt);
  const decidedAt = status === 'decided' ? nowIso(rec.decidedAt || rec.updatedAt || rec.createdAt) : null;
  return {
    id: cleanId(rec.id, 'd', used),
    title,
    notes,
    status,
    clipIds: linked,
    decidedAt,
    createdAt,
    updatedAt: nowIso(rec.updatedAt || rec.createdAt) || createdAt,
  };
}

function normalizeMeta(raw) {
  const rec = raw && typeof raw === 'object' ? raw : {};
  const weddingDate = rec.weddingDate == null || rec.weddingDate === '' ? null : nowIso(rec.weddingDate);
  return { weddingDate };
}

export function normalizeBoard(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const usedBuckets = new Set();
  const usedClips = new Set();

  let buckets = Array.isArray(src.buckets) ? src.buckets : [];
  buckets = buckets
    .slice(0, BOARD_LIMITS.buckets)
    .map((row) => normalizeBucket(row, usedBuckets))
    .filter(Boolean);

  const bucketIds = new Set(buckets.map((b) => b.id));
  let clips = Array.isArray(src.clips) ? src.clips : [];
  clips = clips
    .slice(0, BOARD_LIMITS.clips)
    .map((row) => normalizeClip(row, usedClips, bucketIds))
    .filter(Boolean);

  const clipIdSet = new Set(clips.map((c) => c.id));
  const usedTasks = new Set();
  let tasks = Array.isArray(src.tasks) ? src.tasks : [];
  tasks = tasks
    .slice(0, BOARD_LIMITS.tasks)
    .map((row) => normalizeTask(row, usedTasks, clipIdSet))
    .filter(Boolean);

  const decisionIds = new Set();
  const usedDecisions = new Set();
  let decisions = Array.isArray(src.decisions) ? src.decisions : [];
  decisions = decisions
    .slice(0, BOARD_LIMITS.decisions)
    .map((row) => normalizeDecision(row, usedDecisions, clipIdSet))
    .filter(Boolean);
  for (const row of decisions) decisionIds.add(row.id);

  tasks = tasks.map((task) => ({
    ...task,
    decisionId: task.decisionId && decisionIds.has(task.decisionId) ? task.decisionId : null,
  }));

  const board = {
    v: 2,
    title: clipStr(src.title, BOARD_LIMITS.title).trim() || 'Wedding',
    buckets,
    clips,
    tasks,
    decisions,
    meta: normalizeMeta(src.meta),
  };
  const json = JSON.stringify(board);
  if (json.length > BOARD_LIMITS.json) {
    throw new Error('Board is too large to save.');
  }
  return board;
}

function clone(board) {
  return normalizeBoard(board);
}

export function addBucket(board, name) {
  const next = clone(board);
  const trimmed = clipStr(name, BOARD_LIMITS.bucketName).trim();
  if (!trimmed) throw new Error('Name the bucket first.');
  if (next.buckets.length >= BOARD_LIMITS.buckets) {
    throw new Error('Too many buckets.');
  }
  const exists = next.buckets.some((b) => b.name.toLowerCase() === trimmed.toLowerCase());
  if (exists) throw new Error('That bucket is already on the board.');
  const used = new Set(next.buckets.map((b) => b.id));
  next.buckets.push({ id: cleanId('', 'b', used), name: trimmed });
  return next;
}

export function renameBucket(board, id, name) {
  const next = clone(board);
  const bucket = next.buckets.find((b) => b.id === id);
  if (!bucket) throw new Error('Unknown bucket.');
  const trimmed = clipStr(name, BOARD_LIMITS.bucketName).trim();
  if (!trimmed) throw new Error('Name the bucket first.');
  const clash = next.buckets.some((b) => b.id !== id && b.name.toLowerCase() === trimmed.toLowerCase());
  if (clash) throw new Error('That bucket is already on the board.');
  bucket.name = trimmed;
  return next;
}

/** Clips lose a deleted tag; other tags stay. */
export function removeBucket(board, id) {
  const next = clone(board);
  if (!next.buckets.some((b) => b.id === id)) throw new Error('Unknown bucket.');
  next.buckets = next.buckets.filter((b) => b.id !== id);
  for (const clip of next.clips) {
    clip.tagIds = (clip.tagIds || []).filter((tagId) => tagId !== id);
  }
  return next;
}

export function moveBucket(board, id, dir) {
  const next = clone(board);
  const i = next.buckets.findIndex((b) => b.id === id);
  if (i < 0) throw new Error('Unknown bucket.');
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= next.buckets.length) return next;
  const [row] = next.buckets.splice(i, 1);
  next.buckets.splice(j, 0, row);
  return next;
}

function resolveTagIds(board, raw) {
  if (Array.isArray(raw)) {
    const ids = raw.map(String).filter((id) => board.buckets.some((b) => b.id === id));
    const seen = new Set();
    return ids.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  const legacy = raw == null || raw === '' || raw === 'inbox' ? null : String(raw);
  if (legacy && board.buckets.some((b) => b.id === legacy)) return [legacy];
  return [];
}

export function addClip(board, {
  body = '',
  url = '',
  urlLabel = '',
  bucketId = null,
  tagIds = null,
  status = 'saved',
  favorite = false,
} = {}) {
  const next = clone(board);
  if (next.clips.length >= BOARD_LIMITS.clips) {
    throw new Error('Too many notes.');
  }
  const extracted = extractPastedUrl(body);
  const href = cleanUrl(url) || extracted.url;
  const text = href && !String(url || '').trim() ? extracted.body : clipStr(body, BOARD_LIMITS.body);
  if (!String(text || '').trim() && !href) {
    throw new Error('Write a note or paste a link.');
  }
  const tags = tagIds == null ? resolveTagIds(next, bucketId) : resolveTagIds(next, tagIds);
  const used = new Set(next.clips.map((c) => c.id));
  const ts = new Date().toISOString();
  next.clips.unshift({
    id: cleanId('', 'c', used),
    body: clipStr(text, BOARD_LIMITS.body),
    url: href,
    urlLabel: href ? clipStr(urlLabel, BOARD_LIMITS.urlLabel).trim() : '',
    preview: href ? localPreview(href) : null,
    tagIds: tags,
    favorite: !!favorite,
    status: normalizeClipStatus(status),
    createdAt: ts,
    updatedAt: ts,
  });
  return next;
}

export function updateClip(board, id, patch = {}) {
  const next = clone(board);
  const clip = next.clips.find((c) => c.id === id);
  if (!clip) throw new Error('Unknown note.');
  if ('body' in patch) clip.body = clipStr(patch.body, BOARD_LIMITS.body);
  if ('url' in patch) {
    const nextUrl = cleanUrl(patch.url);
    if (nextUrl !== clip.url) clip.preview = nextUrl ? localPreview(nextUrl) : null;
    clip.url = nextUrl;
  }
  if ('preview' in patch) clip.preview = clip.url ? normalizePreview(patch.preview) : null;
  if ('urlLabel' in patch) clip.urlLabel = clip.url ? clipStr(patch.urlLabel, BOARD_LIMITS.urlLabel).trim() : '';
  if ('tagIds' in patch) clip.tagIds = resolveTagIds(next, patch.tagIds);
  if ('bucketId' in patch) clip.tagIds = resolveTagIds(next, patch.bucketId);
  if ('favorite' in patch) clip.favorite = !!patch.favorite;
  if ('status' in patch) clip.status = normalizeClipStatus(patch.status);
  if (!clip.body.trim() && !clip.url) {
    throw new Error('Write a note or paste a link.');
  }
  if (!clip.url) {
    clip.urlLabel = '';
    clip.preview = null;
  }
  clip.updatedAt = new Date().toISOString();
  return next;
}

export function toggleClipFavorite(board, id) {
  const clip = board.clips.find((c) => c.id === id);
  if (!clip) throw new Error('Unknown note.');
  return updateClip(board, id, { favorite: !clip.favorite });
}

export function setClipStatus(board, id, status) {
  return updateClip(board, id, { status: normalizeClipStatus(status) });
}

export function toggleClipTag(board, clipId, tagId) {
  const next = clone(board);
  const clip = next.clips.find((c) => c.id === clipId);
  if (!clip) throw new Error('Unknown note.');
  if (!next.buckets.some((b) => b.id === tagId)) throw new Error('Unknown bucket.');
  const has = (clip.tagIds || []).includes(tagId);
  clip.tagIds = has
    ? clip.tagIds.filter((id) => id !== tagId)
    : [...(clip.tagIds || []), tagId];
  clip.updatedAt = new Date().toISOString();
  return next;
}

export function removeClip(board, id) {
  const next = clone(board);
  if (!next.clips.some((c) => c.id === id)) throw new Error('Unknown note.');
  next.clips = next.clips.filter((c) => c.id !== id);
  return next;
}

export function moveClip(board, id, bucketId) {
  const tags = bucketId == null || bucketId === '' || bucketId === 'inbox'
    ? []
    : [String(bucketId)];
  return updateClip(board, id, { tagIds: tags });
}

export function clipsIn(board, bucketId) {
  const src = board && typeof board === 'object' ? board : emptyBoard();
  const dest = bucketId == null || bucketId === '' || bucketId === 'inbox' ? null : String(bucketId);
  if (!dest) {
    return src.clips.filter((c) => !(c.tagIds || []).length && c.status !== 'archived');
  }
  return src.clips.filter((c) => (c.tagIds || []).includes(dest) && c.status !== 'archived');
}

export function inboxCount(board) {
  return clipsIn(board, null).length;
}

export function bucketCount(board, id) {
  const src = board && typeof board === 'object' ? board : emptyBoard();
  return src.clips.filter((c) => (c.tagIds || []).includes(id) && c.status !== 'archived').length;
}

export function sortClips(clips, sort = 'newest') {
  const rows = clips.slice();
  if (sort === 'oldest') {
    rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return rows;
  }
  if (sort === 'updated') {
    rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return rows;
  }
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return rows;
}

export function filterClips(board, { view = 'all', query = '', sort = 'newest', media = 'all' } = {}) {
  let rows = query.trim() ? searchClips(board, query) : board.clips.slice();
  if (!query.trim()) {
    if (view === 'inbox') rows = clipsIn(board, null);
    else if (view === 'all') rows = rows.filter((c) => c.status !== 'archived');
    else if (view === 'favorites') rows = rows.filter((c) => c.favorite && c.status !== 'archived');
    else if (view === 'shortlist') rows = rows.filter((c) => c.status === 'shortlist');
    else if (view === 'chosen') rows = rows.filter((c) => c.status === 'chosen');
    else if (view === 'archived') rows = rows.filter((c) => c.status === 'archived');
    else if (view?.kind === 'tag') rows = rows.filter((c) => (c.tagIds || []).includes(view.id) && c.status !== 'archived');
  }
  if (media === 'visual') rows = rows.filter((c) => clipHasVisual(c));
  else if (media === 'notes') rows = rows.filter((c) => !clipHasVisual(c));
  return sortClips(rows, sort);
}

export function homeSummary(board) {
  const src = board && typeof board === 'object' ? board : emptyBoard();
  return {
    inbox: inboxCount(src),
    recent: sortClips(src.clips.filter((c) => c.status !== 'archived'), 'newest').slice(0, 6),
    nextTasks: (src.tasks || []).filter((t) => t.status === 'next').slice(0, 4),
    openDecisions: (src.decisions || []).filter((d) => d.status === 'exploring').length,
    favorites: src.clips.filter((c) => c.favorite && c.status !== 'archived').length,
    shortlist: src.clips.filter((c) => c.status === 'shortlist').length,
  };
}

export function tasksIn(board, status) {
  const src = board && typeof board === 'object' ? board : emptyBoard();
  return (src.tasks || []).filter((t) => t.status === status);
}

export function decisionById(board, id) {
  return (board?.decisions || []).find((d) => d.id === id) || null;
}

export function taskById(board, id) {
  return (board?.tasks || []).find((t) => t.id === id) || null;
}

export function addTask(board, { title = '', notes = '', status = 'someday', due = null, clipIds = [], decisionId = null } = {}) {
  const next = clone(board);
  if ((next.tasks || []).length >= BOARD_LIMITS.tasks) throw new Error('Too many tasks.');
  const trimmed = clipStr(title, BOARD_LIMITS.taskTitle).trim();
  if (!trimmed) throw new Error('Name the task first.');
  const used = new Set(next.tasks.map((t) => t.id));
  const clipSet = new Set(next.clips.map((c) => c.id));
  const ts = new Date().toISOString();
  next.tasks.unshift({
    id: cleanId('', 't', used),
    title: trimmed,
    notes: clipStr(notes, BOARD_LIMITS.taskNotes),
    status: TASK_STATUSES.includes(status) ? status : 'someday',
    due: due ? nowIso(due) : null,
    clipIds: (Array.isArray(clipIds) ? clipIds : []).filter((id) => clipSet.has(String(id))).slice(0, 24),
    decisionId: decisionId && next.decisions.some((d) => d.id === decisionId) ? decisionId : null,
    createdAt: ts,
    updatedAt: ts,
  });
  return next;
}

export function updateTask(board, id, patch = {}) {
  const next = clone(board);
  const task = next.tasks.find((t) => t.id === id);
  if (!task) throw new Error('Unknown task.');
  if ('title' in patch) {
    const trimmed = clipStr(patch.title, BOARD_LIMITS.taskTitle).trim();
    if (!trimmed) throw new Error('Name the task first.');
    task.title = trimmed;
  }
  if ('notes' in patch) task.notes = clipStr(patch.notes, BOARD_LIMITS.taskNotes);
  if ('status' in patch && TASK_STATUSES.includes(patch.status)) task.status = patch.status;
  if ('due' in patch) task.due = patch.due ? nowIso(patch.due) : null;
  if ('clipIds' in patch) {
    const clipSet = new Set(next.clips.map((c) => c.id));
    task.clipIds = (Array.isArray(patch.clipIds) ? patch.clipIds : [])
      .filter((cid) => clipSet.has(String(cid))).slice(0, 24);
  }
  if ('decisionId' in patch) {
    task.decisionId = patch.decisionId && next.decisions.some((d) => d.id === patch.decisionId)
      ? patch.decisionId
      : null;
  }
  task.updatedAt = new Date().toISOString();
  return next;
}

export function removeTask(board, id) {
  const next = clone(board);
  if (!next.tasks.some((t) => t.id === id)) throw new Error('Unknown task.');
  next.tasks = next.tasks.filter((t) => t.id !== id);
  return next;
}

export function addDecision(board, { title = '', notes = '', status = 'exploring', clipIds = [] } = {}) {
  const next = clone(board);
  if ((next.decisions || []).length >= BOARD_LIMITS.decisions) throw new Error('Too many decisions.');
  const trimmed = clipStr(title, BOARD_LIMITS.decisionTitle).trim();
  if (!trimmed) throw new Error('Name the decision first.');
  const used = new Set(next.decisions.map((d) => d.id));
  const clipSet = new Set(next.clips.map((c) => c.id));
  const ts = new Date().toISOString();
  next.decisions.unshift({
    id: cleanId('', 'd', used),
    title: trimmed,
    notes: clipStr(notes, BOARD_LIMITS.decisionNotes),
    status: DECISION_STATUSES.includes(status) ? status : 'exploring',
    clipIds: (Array.isArray(clipIds) ? clipIds : []).filter((id) => clipSet.has(String(id))).slice(0, 48),
    decidedAt: null,
    createdAt: ts,
    updatedAt: ts,
  });
  return next;
}

export function updateDecision(board, id, patch = {}) {
  const next = clone(board);
  const decision = next.decisions.find((d) => d.id === id);
  if (!decision) throw new Error('Unknown decision.');
  if ('title' in patch) {
    const trimmed = clipStr(patch.title, BOARD_LIMITS.decisionTitle).trim();
    if (!trimmed) throw new Error('Name the decision first.');
    decision.title = trimmed;
  }
  if ('notes' in patch) decision.notes = clipStr(patch.notes, BOARD_LIMITS.decisionNotes);
  if ('status' in patch && DECISION_STATUSES.includes(patch.status)) {
    decision.status = patch.status;
    decision.decidedAt = patch.status === 'decided'
      ? nowIso(patch.decidedAt || new Date().toISOString())
      : null;
  }
  if ('clipIds' in patch) {
    const clipSet = new Set(next.clips.map((c) => c.id));
    decision.clipIds = (Array.isArray(patch.clipIds) ? patch.clipIds : [])
      .filter((cid) => clipSet.has(String(cid))).slice(0, 48);
  }
  decision.updatedAt = new Date().toISOString();
  return next;
}

export function removeDecision(board, id) {
  const next = clone(board);
  if (!next.decisions.some((d) => d.id === id)) throw new Error('Unknown decision.');
  next.decisions = next.decisions.filter((d) => d.id !== id);
  for (const task of next.tasks) {
    if (task.decisionId === id) task.decisionId = null;
  }
  return next;
}

export function setMeta(board, patch = {}) {
  const next = clone(board);
  if ('weddingDate' in patch) {
    next.meta.weddingDate = patch.weddingDate ? nowIso(patch.weddingDate) : null;
  }
  return next;
}

export function searchClips(board, query) {
  const q = String(query || '').trim().toLowerCase();
  const src = board && typeof board === 'object' ? board : emptyBoard();
  if (!q) return src.clips.slice();
  return src.clips.filter((clip) => {
    const hay = [
      clip.body,
      clip.urlLabel,
      clip.url || '',
      urlDomain(clip.url),
      clipDisplayLabel(clip),
      clip.preview?.title || '',
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export function bucketById(board, id) {
  return (board?.buckets || []).find((b) => b.id === id) || null;
}

export function previewHref(clip) {
  return clip?.preview?.canonical || clip?.url || null;
}

export function clipNeedsUnfurl(clip) {
  if (!clip?.url) return false;
  if (clip.preview?.thumbnail) return false;
  const media = mediaPreview(previewHref(clip));
  if (media?.kind === 'image' || media?.kind === 'video') return false;
  if (media?.thumbnail) return false;
  return media?.kind === 'tiktok'
    || media?.kind === 'instagram'
    || media?.kind === 'pinterest'
    || media?.kind === 'link'
    || !media?.embedUrl;
}

export function seedSuggestedBuckets(board, names = SUGGESTED_BUCKETS.map((b) => b.name)) {
  let next = clone(board);
  for (const name of names) {
    const exists = next.buckets.some((b) => b.name.toLowerCase() === String(name).toLowerCase());
    if (exists) continue;
    next = addBucket(next, name);
  }
  return next;
}
