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
  json: 500_000,
};

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

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyBoard() {
  return {
    v: 1,
    title: 'Wedding',
    buckets: [],
    clips: [],
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
    link: 'Link',
  })[kind] || 'Link';
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

function normalizeClip(raw, used, bucketIds) {
  const rec = raw && typeof raw === 'object' ? raw : {};
  const body = clipStr(rec.body, BOARD_LIMITS.body);
  const url = cleanUrl(rec.url);
  if (!body.trim() && !url) return null;
  let bucketId = rec.bucketId == null || rec.bucketId === '' ? null : String(rec.bucketId);
  if (bucketId && !bucketIds.has(bucketId)) bucketId = null;
  const urlLabel = url ? clipStr(rec.urlLabel, BOARD_LIMITS.urlLabel).trim() : '';
  const createdAt = nowIso(rec.createdAt);
  return {
    id: cleanId(rec.id, 'c', used),
    body,
    url,
    urlLabel,
    bucketId,
    createdAt,
    updatedAt: nowIso(rec.updatedAt || rec.createdAt) || createdAt,
  };
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

  const board = {
    v: 1,
    title: clipStr(src.title, BOARD_LIMITS.title).trim() || 'Wedding',
    buckets,
    clips,
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

/** Clips in a deleted bucket fall back to the inbox (bucketId null). */
export function removeBucket(board, id) {
  const next = clone(board);
  if (!next.buckets.some((b) => b.id === id)) throw new Error('Unknown bucket.');
  next.buckets = next.buckets.filter((b) => b.id !== id);
  for (const clip of next.clips) {
    if (clip.bucketId === id) clip.bucketId = null;
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

export function addClip(board, { body = '', url = '', urlLabel = '', bucketId = null } = {}) {
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
  let dest = bucketId == null || bucketId === '' || bucketId === 'inbox' ? null : String(bucketId);
  if (dest && !next.buckets.some((b) => b.id === dest)) dest = null;
  const used = new Set(next.clips.map((c) => c.id));
  const ts = new Date().toISOString();
  next.clips.unshift({
    id: cleanId('', 'c', used),
    body: clipStr(text, BOARD_LIMITS.body),
    url: href,
    urlLabel: href ? clipStr(urlLabel, BOARD_LIMITS.urlLabel).trim() : '',
    bucketId: dest,
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
  if ('url' in patch) clip.url = cleanUrl(patch.url);
  if ('urlLabel' in patch) clip.urlLabel = clip.url ? clipStr(patch.urlLabel, BOARD_LIMITS.urlLabel).trim() : '';
  if ('bucketId' in patch) {
    let dest = patch.bucketId == null || patch.bucketId === '' || patch.bucketId === 'inbox'
      ? null
      : String(patch.bucketId);
    if (dest && !next.buckets.some((b) => b.id === dest)) dest = null;
    clip.bucketId = dest;
  }
  if (!clip.body.trim() && !clip.url) {
    throw new Error('Write a note or paste a link.');
  }
  if (!clip.url) clip.urlLabel = '';
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
  return updateClip(board, id, { bucketId });
}

export function clipsIn(board, bucketId) {
  const src = board && typeof board === 'object' ? board : emptyBoard();
  const dest = bucketId == null || bucketId === '' || bucketId === 'inbox' ? null : String(bucketId);
  return src.clips.filter((c) => (c.bucketId || null) === dest);
}

export function inboxCount(board) {
  return clipsIn(board, null).length;
}

export function bucketCount(board, id) {
  return clipsIn(board, id).length;
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
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export function bucketById(board, id) {
  return (board?.buckets || []).find((b) => b.id === id) || null;
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
