/**
 * Fortune 500 EDGAR headlines — one Hobby-plan function with ?route= branches.
 *
 * GET headlines?ciks=1018724,320193  → latest 10-K headline metrics (max 4 CIKs)
 *
 * Fetches Company Facts from data.sec.gov (required User-Agent), extracts a
 * slim metric set, and caches it in Neon when DATABASE_URL is set.
 */
import { db, ensureSchema } from '../lib/db.js';
import { extractHeadlines } from '../fortune-500/extract.js';

const MAX_CIKS = 4;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SEC_PAUSE_MS = 125;

function secUserAgent() {
  return (
    process.env.SEC_USER_AGENT ||
    'inaayat.xyz/fortune-500 (https://inaayat.xyz/fortune-500/)'
  );
}

function padCik(cik) {
  return String(cik).padStart(10, '0');
}

function parseCiks(raw) {
  const parts = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ciks = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n <= 0) continue;
    if (!ciks.includes(n)) ciks.push(n);
  }
  return ciks.slice(0, MAX_CIKS);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  const route = String(req.query?.route || '').trim();
  if (route === 'headlines') return handleHeadlines(req, res);
  res.status(404).json({ error: 'Unknown Fortune 500 route.', routes: ['headlines'] });
}

async function handleHeadlines(req, res) {
  const ciks = parseCiks(req.query?.ciks);
  if (!ciks.length) {
    res.status(400).json({ error: 'Pass ?ciks= as up to 4 integer CIKs.' });
    return;
  }

  const companies = [];
  for (let i = 0; i < ciks.length; i++) {
    if (i > 0) await sleep(SEC_PAUSE_MS);
    companies.push(await headlinesForCik(ciks[i]));
  }
  res.status(200).json({ companies });
}

async function headlinesForCik(cik) {
  const cached = await readCache(cik);
  if (cached) return { cik, ...cached, cached: true };

  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`;
  let facts;
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': secUserAgent(),
        Accept: 'application/json',
      },
    });
    if (!resp.ok) {
      return { cik, error: `SEC ${resp.status}`, metrics: {}, ratios: {}, asOfYear: null };
    }
    facts = await resp.json();
  } catch (err) {
    return { cik, error: err.message || 'SEC fetch failed', metrics: {}, ratios: {}, asOfYear: null };
  }

  const extracted = extractHeadlines(facts);
  const payload = {
    entityName: extracted.entityName,
    asOfYear: extracted.asOfYear,
    metrics: extracted.metrics,
    priorRevenue: extracted.priorRevenue,
    ratios: extracted.ratios,
  };
  await writeCache(cik, payload);
  return { cik, ...payload, cached: false };
}

async function readCache(cik) {
  try {
    if (!process.env.DATABASE_URL) return null;
    await ensureSchema();
    const rows = await db()`
      SELECT payload, fetched_at
      FROM f500_headline_cache
      WHERE cik = ${cik}
    `;
    const row = rows[0];
    if (!row) return null;
    const age = Date.now() - new Date(row.fetched_at).getTime();
    if (age > CACHE_TTL_MS) return null;
    return row.payload;
  } catch {
    return null;
  }
}

async function writeCache(cik, payload) {
  try {
    if (!process.env.DATABASE_URL) return;
    await ensureSchema();
    await db()`
      INSERT INTO f500_headline_cache (cik, as_of_year, payload, fetched_at)
      VALUES (${cik}, ${payload.asOfYear}, ${JSON.stringify(payload)}, now())
      ON CONFLICT (cik) DO UPDATE SET
        as_of_year = EXCLUDED.as_of_year,
        payload = EXCLUDED.payload,
        fetched_at = now()
    `;
  } catch {
    // Cache is optional — still return live numbers.
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
