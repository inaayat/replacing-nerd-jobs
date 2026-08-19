import { getAuth } from '../lib/neon-auth.js';
import { upsertUser } from '../lib/a-list.js';
import { getState, applyOps } from '../lib/sticky-notes.js';

export default async function handler(req, res) {
  const route = String(req.query?.route || '').trim();
  if (route === 'state') return handleState(req, res);
  if (route === 'ops') return handleOps(req, res);
  if (route === 'legend') return handleLegend(req, res);
  if (route === 'unfurl') return handleUnfurl(req, res);
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
  const { kind, key, label } = req.body || {};
  try {
    const applied = await applyOps(session.userId, [{ op: 'legend.set', kind, key, label }]);
    res.status(200).json({ ok: true, applied });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;

async function handleUnfurl(req, res) {
  const session = await requireUser(req, res);
  if (!session) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  const url = String(req.query?.url || '');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    res.status(200).json({ title: null });
    return;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.status(200).json({ title: null });
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const page = await fetch(parsed.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (sticky-notes unfurl)' },
    });
    clearTimeout(timer);
    if (!page.ok) {
      res.status(200).json({ title: null });
      return;
    }
    const html = (await page.text()).slice(0, 200000);
    const match = TITLE_RE.exec(html);
    const title = match
      ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim().slice(0, 300)
      : null;
    res.status(200).json({ title: title || null });
  } catch {
    res.status(200).json({ title: null });
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
