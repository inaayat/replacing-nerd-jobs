import { getAuth } from '../lib/neon-auth.js';
import { upsertUser } from '../lib/a-list.js';
import { getBoard, putBoard } from '../lib/wedding.js';
import {
  cleanUrl,
  extractOpenGraph,
  linkKind,
  localPreview,
  mediaPreview,
  normalizePreview,
  pinterestPinId,
  pinterestThumbFromHtml,
  pinterestWidgetThumbnail,
} from '../wedding/engine/model.js';

export default async function handler(req, res) {
  const route = String(req.query?.route || 'board').trim();
  if (route === 'unfurl') return handleUnfurl(req, res);
  if (route !== 'board') {
    res.status(404).json({ error: 'Unknown wedding route.' });
    return;
  }
  return handleBoard(req, res);
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

async function handleBoard(req, res) {
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    try {
      const data = await getBoard(session.userId);
      res.status(200).json(data);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PUT') {
    try {
      const data = await putBoard(session.userId, req.body?.board);
      res.status(200).json(data);
    } catch (err) {
      const bad = /too large|Board is too large/i.test(err.message || '');
      res.status(bad ? 400 : 502).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Use GET or PUT.' });
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchWithTimeout(url, { json = false, timeout = 5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const page = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: json ? 'application/json' : 'text/html,application/json',
      },
    });
    if (!page.ok) return { url: page.url, ok: false, data: null };
    if (json) {
      const data = await page.json().catch(() => null);
      return { url: page.url, ok: true, data };
    }
    const html = (await page.text()).slice(0, 200000);
    return { url: page.url, ok: true, data: html };
  } catch {
    return { url, ok: false, data: null };
  } finally {
    clearTimeout(timer);
  }
}

function previewPayload(url, extra = {}) {
  const canonical = extra.canonical || url;
  const local = localPreview(canonical) || localPreview(url);
  return normalizePreview({
    thumbnail: extra.thumbnail || local?.thumbnail || null,
    title: extra.title || '',
    canonical,
  }) || { thumbnail: null, title: '', canonical: cleanUrl(canonical) };
}

function applyPinPage(html, current) {
  if (!html || typeof html !== 'string') return current;
  const og = extractOpenGraph(html);
  const thumbnail = current.thumbnail
    || og.image
    || pinterestThumbFromHtml(html)
    || null;
  const title = current.title || og.title || '';
  const canonical = (og.url && cleanUrl(og.url)) || current.canonical;
  return { thumbnail, title, canonical };
}

async function unfurlPinterest(startUrl, canonical, followedHtml) {
  let next = {
    thumbnail: null,
    title: '',
    canonical,
  };
  next = applyPinPage(followedHtml, next);

  const tryOembed = async (u) => {
    if (!u) return;
    const oembed = await fetchWithTimeout(
      `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(u)}`,
      { json: true },
    );
    if (!oembed.data) return;
    next.thumbnail = next.thumbnail
      || oembed.data.thumbnail_url
      || pinterestThumbFromHtml(oembed.data.html)
      || null;
    next.title = next.title || oembed.data.title || '';
    if (oembed.data.url) next.canonical = cleanUrl(oembed.data.url) || next.canonical;
  };

  if (!next.thumbnail) await tryOembed(next.canonical);
  if (!next.thumbnail && startUrl !== next.canonical) await tryOembed(startUrl);

  if (!next.thumbnail || !pinterestPinId(next.canonical)) {
    const page = await fetchWithTimeout(next.canonical);
    if (page.url) {
      const landed = cleanUrl(page.url) || next.canonical;
      if (pinterestPinId(landed)) next.canonical = landed;
    }
    next = applyPinPage(page.data, next);
  }

  const pinId = pinterestPinId(next.canonical);
  if (pinId && !next.thumbnail) {
    const widget = await fetchWithTimeout(
      `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${encodeURIComponent(pinId)}`,
      { json: true },
    );
    next.thumbnail = pinterestWidgetThumbnail(widget.data) || next.thumbnail;
  }

  return next;
}

async function handleUnfurl(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  const session = await requireUser(req, res);
  if (!session) return;

  const url = cleanUrl(req.query?.url);
  if (!url) {
    res.status(200).json({ thumbnail: null, title: null, canonical: null });
    return;
  }

  try {
    const kind = linkKind(url);
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const short = host === 'pin.it'
      || host === 'vm.tiktok.com'
      || /\/t\//.test(parsed.pathname)
      || /\/share\//.test(parsed.pathname);
    let canonical = url;
    let followedHtml = '';
    if (short) {
      const followed = await fetchWithTimeout(url, { timeout: 5000 });
      if (followed.url) canonical = cleanUrl(followed.url) || url;
      if (followed.ok && typeof followed.data === 'string') followedHtml = followed.data;
    }

    let thumbnail = null;
    let title = '';

    if (kind === 'tiktok' || linkKind(canonical) === 'tiktok') {
      const oembed = await fetchWithTimeout(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonical)}`,
        { json: true },
      );
      thumbnail = oembed.data?.thumbnail_url || null;
      title = oembed.data?.title || oembed.data?.author_name || '';
    } else if (kind === 'pinterest' || linkKind(canonical) === 'pinterest') {
      const pin = await unfurlPinterest(url, canonical, followedHtml);
      thumbnail = pin.thumbnail;
      title = pin.title;
      canonical = pin.canonical;
    } else if (kind === 'youtube' || linkKind(canonical) === 'youtube') {
      thumbnail = mediaPreview(canonical)?.thumbnail || null;
    } else if (kind !== 'image' && kind !== 'video') {
      const page = await fetchWithTimeout(canonical);
      if (page.ok && typeof page.data === 'string') {
        const og = extractOpenGraph(page.data);
        thumbnail = og.image || null;
        title = og.title || '';
        if (page.url) canonical = cleanUrl(page.url) || canonical;
      }
    }

    res.status(200).json(previewPayload(url, {
      thumbnail,
      title: String(title || '').slice(0, 200),
      canonical,
    }));
  } catch {
    res.status(200).json(previewPayload(url));
  }
}
