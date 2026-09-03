import { getAuth } from '../lib/neon-auth.js';
import { upsertUser } from '../lib/a-list.js';
import { getState, applyOps } from '../lib/sticky-notes.js';
import {
  instagramStillUrl,
  localMediaDetails,
  mediaKind,
  normalizeHref,
  normalizeMedia,
} from '../sticky-notes/notes.js';

export default async function handler(req, res) {
  const route = String(req.query?.route || '').trim();
  if (route === 'state') return handleState(req, res);
  if (route === 'ops') return handleOps(req, res);
  if (route === 'legend') return handleLegend(req, res);
  if (route === 'unfurl') return handleUnfurl(req, res);
  if (route === 'ig-still') return handleIgStill(req, res);
  res.status(404).json({ error: 'Unknown sticky-notes route.' });
}

function requireDb(res) {
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: 'DATABASE_URL not configured.' });
    return false;
  }
  if (!process.env.NEON_AUTH_BASE_URL) {
    res.status(503).json({ error: 'NEON_AUTH_BASE_URL not configured.' });
    return false;
  }
  return true;
}

async function requireUser(req, res) {
  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return null;
  }
  try {
    const userId = await upsertUser(auth);
    return { auth, userId };
  } catch (err) {
    res.status(502).json({ error: err.message });
    return null;
  }
}

async function handleState(req, res) {
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  try {
    const state = await getState(session.userId);
    res.status(200).json({ state });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

async function handleOps(req, res) {
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }
  const ops = req.body?.ops;
  if (!Array.isArray(ops)) {
    res.status(400).json({ error: 'Body must be { ops: [...] }.' });
    return;
  }
  if (ops.length > 200) {
    res.status(400).json({ error: 'At most 200 ops per request.' });
    return;
  }
  try {
    const applied = await applyOps(session.userId, ops);
    res.status(200).json({ ok: true, applied });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

async function handleLegend(req, res) {
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;
  if (req.method !== 'PUT') {
    res.status(405).json({ error: 'Use PUT.' });
    return;
  }
  const { kind, key, label, imageUrl } = req.body || {};
  try {
    const applied = await applyOps(session.userId, [{ op: 'legend.set', kind, key, label, imageUrl }]);
    res.status(200).json({ ok: true, applied });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const META_RE = /<meta\s+[^>]*>/gi;
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function metaContent(html, names) {
  for (const tag of String(html || '').match(META_RE) || []) {
    const key = /\b(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (!key || !names.includes(key)) continue;
    const value = /\bcontent=["']([^"']*)["']/i.exec(tag)?.[1];
    if (value) return decodeEntities(value).trim();
  }
  return '';
}

function pageMetadata(html) {
  const titleMatch = TITLE_RE.exec(String(html || ''));
  return {
    title: metaContent(html, ['og:title', 'twitter:title'])
      || (titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : ''),
    thumbnail: metaContent(html, ['og:image', 'twitter:image', 'og:image:url']),
    canonical: metaContent(html, ['og:url']),
  };
}

async function fetchPreview(url, { json = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const page = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: json ? 'application/json' : 'text/html,application/xhtml+xml,image/*,*/*;q=0.8',
      },
    });
    const contentType = String(page.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const finalUrl = page.url || url;
    if (contentType.startsWith('image/') || contentType.startsWith('video/')) {
      try { await page.body?.cancel?.(); } catch { /* ignore */ }
      return { ok: page.ok, url: finalUrl, data: null, contentType };
    }
    if (!page.ok) return { ok: false, url: finalUrl, data: null, contentType };
    let data = null;
    if (json) {
      data = await page.json().catch(() => null);
    } else {
      data = (await page.text()).slice(0, 200000);
    }
    return { ok: true, url: finalUrl, data, contentType };
  } catch {
    return { ok: false, url, data: null, contentType: '' };
  } finally {
    clearTimeout(timer);
  }
}

/** Login walls and bare site titles are not a post caption. */
function usableInstagramTitle(title) {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (/^(?:log\s*in|sign\s*up)?\s*[•·|\-]?\s*instagram\s*[•·|\-]?\s*(?:log\s*in|sign\s*up)?$/i.test(t)) {
    return '';
  }
  return t;
}

async function handleUnfurl(req, res) {
  const session = await requireUser(req, res);
  if (!session) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  const url = normalizeHref(req.query?.url);
  if (!url) {
    res.status(200).json({ title: null, media: null });
    return;
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const isShort = host === 'pin.it'
      || host === 'vm.tiktok.com'
      || /\/(?:t|share)\//.test(parsed.pathname);
    const followed = isShort ? await fetchPreview(url) : null;
    let canonical = normalizeHref(followed?.url) || url;
    let kind = mediaKind(canonical) || mediaKind(url);
    let title = '';
    let thumbnail = localMediaDetails(canonical)?.thumbnail || null;
    let html = typeof followed?.data === 'string' ? followed.data : '';

    if (kind === 'tiktok') {
      const oembed = await fetchPreview(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonical)}`,
        { json: true },
      );
      thumbnail = oembed.data?.thumbnail_url || thumbnail;
      title = oembed.data?.title || oembed.data?.author_name || '';
    } else if (kind === 'pinterest') {
      const oembed = await fetchPreview(
        `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(canonical)}`,
        { json: true },
      );
      thumbnail = oembed.data?.thumbnail_url || thumbnail;
      title = oembed.data?.title || '';
      if (!thumbnail && typeof oembed.data?.html === 'string') {
        thumbnail = /https?:\/\/i\.pinimg\.com\/[^"'\\\s<>]+/i.exec(oembed.data.html)?.[0] || null;
      }
    } else if (kind === 'instagram') {
      // oEmbed no longer carries thumbnail_url (404 / embed-only HTML). The
      // public still is `{permalink}/media/?size=l`, which 302s to a jpeg.
      // Store that stable URL — the signed scontent Location expires via `oe=`.
      const stillUrl = instagramStillUrl(canonical) || instagramStillUrl(url);
      const stillPromise = stillUrl ? fetchPreview(stillUrl) : Promise.resolve(null);
      const pagePromise = html ? Promise.resolve(null) : fetchPreview(canonical);
      const [still, page] = await Promise.all([stillPromise, pagePromise]);
      if (stillUrl && still?.contentType?.startsWith('image/')) thumbnail = stillUrl;
      if (page) {
        const followed = normalizeHref(page.url);
        if (followed && instagramStillUrl(followed)) canonical = followed;
        if (typeof page.data === 'string') html = page.data;
      }
    }

    if (!html && !['image', 'video', 'youtube', 'tiktok', 'instagram'].includes(kind)) {
      const page = await fetchPreview(canonical);
      canonical = normalizeHref(page.url) || canonical;
      if (page.contentType?.startsWith('image/')) {
        kind = 'image';
        thumbnail = canonical;
      } else if (page.contentType?.startsWith('video/')) {
        kind = 'video';
      } else {
        html = typeof page.data === 'string' ? page.data : '';
        kind = mediaKind(canonical) || kind;
      }
    }

    const meta = pageMetadata(html);
    title = String(title || meta.title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (kind === 'instagram') {
      title = usableInstagramTitle(title);
      // og:image is a signed scontent URL; keep only the verified still.
      thumbnail = normalizeHref(thumbnail);
      const metaCanonical = normalizeHref(meta.canonical);
      if (metaCanonical && instagramStillUrl(metaCanonical)) canonical = metaCanonical;
    } else {
      thumbnail = normalizeHref(thumbnail) || normalizeHref(meta.thumbnail) || null;
      canonical = normalizeHref(meta.canonical) || canonical;
    }
    const media = normalizeMedia({ url, canonical, thumbnail, title });
    res.status(200).json({ title: title || null, media });
  } catch {
    res.status(200).json({ title: null, media: normalizeMedia({ url }) });
  }
}

/**
 * Stream the Instagram still jpeg through this origin. Do not 302 the
 * browser to scontent — `<img src>` from inaayat.xyz is hotlink-blocked.
 */
async function handleIgStill(req, res) {
  const session = await requireUser(req, res);
  if (!session) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  const stillUrl = instagramStillUrl(normalizeHref(req.query?.url));
  if (!stillUrl) {
    res.status(400).json({ error: 'Not an Instagram post.' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const page = await fetch(stillUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'image/jpeg,image/*,*/*;q=0.8',
      },
    });
    const contentType = String(page.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!page.ok || !contentType.startsWith('image/')) {
      try { await page.body?.cancel?.(); } catch { /* ignore */ }
      res.status(502).json({ error: 'Instagram still unavailable.' });
      return;
    }
    const bytes = Buffer.from(await page.arrayBuffer());
    if (!bytes.length) {
      res.status(502).json({ error: 'Instagram still unavailable.' });
      return;
    }
    res.setHeader('Content-Type', contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).end(bytes);
  } catch {
    res.status(502).json({ error: 'Instagram still unavailable.' });
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(text) {
  return text
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
