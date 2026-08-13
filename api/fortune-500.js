/**
 * Fortune 500 — one Hobby-plan function with ?route= branches.
 *
 * GET headlines?ciks=1018724,320193  → latest 10-K headline metrics (max 5 CIKs)
 * GET prices?ticker=AAPL&range=5y    → Yahoo v8 last price + daily OHLCV (no API key)
 *
 * Headlines: Company Facts from data.sec.gov, cached in Neon when DATABASE_URL is set.
 * Prices: Yahoo Finance chart API, same optional Neon cache, CDN s-maxage.
 */
import { db, ensureSchema } from '../lib/db.js';
import { extractHeadlines } from '../fortune-500/extract.js';
import { MAX_COMPARE } from '../fortune-500/catalog.js';
import {
  yahooChartUrl,
  parseYahooChart,
  normalizePriceRange,
} from '../fortune-500/prices.js';

const MAX_CIKS = MAX_COMPARE;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PRICE_CACHE_TTL_MS = 1000 * 60 * 15;
const SEC_PAUSE_MS = 125;
const YAHOO_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function secUserAgent() {
  return (
    process.env.SEC_USER_AGENT ||
    'inaayat.xyz/fortune-500 (https://www.inaayat.xyz/fortune-500/)'
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
  if (route === 'prices') return handlePrices(req, res);
  res.status(404).json({ error: 'Unknown Fortune 500 route.', routes: ['headlines', 'prices'] });
}

async function handleHeadlines(req, res) {
  const ciks = parseCiks(req.query?.ciks);
  if (!ciks.length) {
    res.status(400).json({ error: `Pass ?ciks= as up to ${MAX_CIKS} integer CIKs.` });
    return;
  }

  const companies = [];
  for (let i = 0; i < ciks.length; i++) {
    if (i > 0) await sleep(SEC_PAUSE_MS);
    companies.push(await headlinesForCik(ciks[i]));
  }
  res.status(200).json({ companies });
}

async function handlePrices(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400');
  const ticker = String(req.query?.ticker || '')
    .trim()
    .toUpperCase()
    .replace(/\./g, '-');
  const range = normalizePriceRange(req.query?.range);
  const url = yahooChartUrl(ticker, range);
  if (!url) {
    res.status(400).json({ error: 'Pass ?ticker= as a Yahoo symbol (AAPL, BRK-B). range=1y|5y|max.' });
    return;
  }

  const cached = await readPriceCache(ticker, range);
  if (cached) {
    res.status(200).json({ ...cached, cached: true });
    return;
  }

  let payload;
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': YAHOO_UA,
        Accept: 'application/json',
      },
    });
    if (resp.status === 429) {
      res.status(200).json({ error: 'price unavailable', symbol: ticker, source: 'yahoo' });
      return;
    }
    if (!resp.ok) {
      res.status(200).json({ error: 'price unavailable', symbol: ticker, source: 'yahoo' });
      return;
    }
    payload = await resp.json();
  } catch {
    res.status(200).json({ error: 'price unavailable', symbol: ticker, source: 'yahoo' });
    return;
  }

  const parsed = parseYahooChart(payload, ticker);
  if (parsed.error) {
    res.status(200).json({ error: 'price unavailable', symbol: ticker, source: 'yahoo' });
    return;
  }
  await writePriceCache(ticker, range, parsed);
  res.status(200).json({ ...parsed, cached: false });
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
    flags: extracted.flags,
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

function priceCacheKey(ticker, range) {
  return `${ticker}|${range}`;
}

async function readPriceCache(ticker, range) {
  try {
    if (!process.env.DATABASE_URL) return null;
    await ensureSchema();
    const key = priceCacheKey(ticker, range);
    const rows = await db()`
      SELECT payload, fetched_at
      FROM f500_price_cache
      WHERE cache_key = ${key}
    `;
    const row = rows[0];
    if (!row) return null;
    const age = Date.now() - new Date(row.fetched_at).getTime();
    if (age > PRICE_CACHE_TTL_MS) return null;
    return row.payload;
  } catch {
    return null;
  }
}

async function writePriceCache(ticker, range, payload) {
  try {
    if (!process.env.DATABASE_URL) return;
    await ensureSchema();
    const key = priceCacheKey(ticker, range);
    await db()`
      INSERT INTO f500_price_cache (cache_key, payload, fetched_at)
      VALUES (${key}, ${JSON.stringify(payload)}, now())
      ON CONFLICT (cache_key) DO UPDATE SET
        payload = EXCLUDED.payload,
        fetched_at = now()
    `;
  } catch {
    // Cache is optional.
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
