/**
 * Pull Company Facts + Submissions for the seven AI-buildout names.
 * Writes ai-buildout/data/snapshot.json (slim series, not raw Facts).
 *
 * Usage: node scripts/pull-ai-buildout.mjs
 * Optional: FRED_API_KEY for the official observations API; otherwise the
 * public fredgraph.csv for GDP is tried, then catalog.GDP_FALLBACK.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPANIES, SNAPSHOT_SCHEMA, GDP_FALLBACK, edgarFactsUrl, edgarSubmissionsUrl } from '../ai-buildout/catalog.js';
import { extractCompany, eventsFromSubmissions } from '../ai-buildout/extract.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'ai-buildout/data');
const OUT = join(OUT_DIR, 'snapshot.json');
const UA =
  process.env.SEC_USER_AGENT ||
  'inaayat.xyz/ai-buildout (https://inaayat.xyz/ai-buildout/)';
const GAP_MS = 150;
const MAX_ATTEMPTS = 5;
const EVENT_KEEP = 120;
const FORCE = process.argv.includes('--force') || process.env.AI_BUILDOUT_FORCE === '1';
const ANNUAL_FORMS = new Set(['10-K', '10-K/A', '10-Q', '10-Q/A']);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url) {
  let delay = 1000;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (resp.status === 429 || resp.status === 503) {
      const wait = delay + Math.floor(Math.random() * 400);
      console.warn(`  ${resp.status} ${url} — retry in ${wait}ms`);
      await sleep(wait);
      delay *= 2;
      continue;
    }
    if (resp.status === 404) return { missing: true };
    if (!resp.ok) throw new Error(`${resp.status} ${url}`);
    return { json: await resp.json() };
  }
  throw new Error(`still 429/503 after ${MAX_ATTEMPTS} attempts: ${url}`);
}

async function fetchGdp() {
  const key = process.env.FRED_API_KEY;
  if (key) {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=GDP&api_key=${encodeURIComponent(key)}&file_type=json&sort_order=desc&limit=4`;
    const resp = await fetch(url);
    if (resp.ok) {
      const body = await resp.json();
      const obs = (body.observations || []).find((o) => o.value && o.value !== '.');
      if (obs) {
        return {
          series: 'GDP',
          value: Number(obs.value) * 1e9,
          date: obs.date,
          source: 'FRED API (nominal GDP, billions SAAR → USD)',
        };
      }
    }
  }
  try {
    const resp = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=GDP', {
      headers: { 'User-Agent': UA, Accept: 'text/csv' },
    });
    if (resp.ok) {
      const text = await resp.text();
      const lines = text.trim().split(/\n/).filter(Boolean);
      for (let i = lines.length - 1; i >= 1; i--) {
        const [date, raw] = lines[i].split(',');
        const value = Number(raw);
        if (date && Number.isFinite(value) && value > 0) {
          return {
            series: 'GDP',
            value: value * 1e9,
            date,
            source: 'FRED fredgraph.csv (nominal GDP, billions SAAR → USD)',
          };
        }
      }
    }
  } catch (err) {
    console.warn(`  FRED CSV failed: ${err.message}`);
  }
  console.warn('  using cached GDP fallback');
  return { ...GDP_FALLBACK };
}

function latestAnnual(submissions) {
  const recent = submissions?.filings?.recent;
  if (!recent?.form) return null;
  for (let i = 0; i < recent.form.length; i++) {
    if (!ANNUAL_FORMS.has(recent.form[i])) continue;
    return {
      accession: recent.accessionNumber?.[i] || null,
      form: recent.form[i],
      filed: recent.filingDate?.[i] || null,
    };
  }
  return null;
}

function gdpIsFresh(prevGdp) {
  if (!prevGdp?.fetched_at) return false;
  const age = Date.now() - Date.parse(prevGdp.fetched_at);
  return Number.isFinite(age) && age < 6 * 24 * 60 * 60 * 1000;
}

function contentKey(snap) {
  if (!snap) return '';
  const { pulled_at, ...rest } = snap;
  return JSON.stringify(rest);
}

function slimExtracted(extracted) {
  return {
    cik: extracted.cik,
    entityName: extracted.entityName,
    asOfYear: extracted.asOfYear,
    latest: extracted.latest,
    series: extracted.series,
    derivedSeries: extracted.derivedSeries,
    derived: extracted.derived,
    funding: extracted.funding,
    iceberg: extracted.iceberg,
  };
}

mkdirSync(OUT_DIR, { recursive: true });

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const schemaMismatch = prev && prev.schema !== SNAPSHOT_SCHEMA;
const pullState = prev?.pull_state && typeof prev.pull_state === 'object' ? { ...prev.pull_state } : {};
const prevByCik = Object.fromEntries((prev?.companies || []).map((c) => [String(c.cik), c]));

const companies = [];
const events = [];
let errors = 0;

for (const co of COMPANIES) {
  console.log(`${co.ticker}  submissions`);
  await sleep(GAP_MS);
  let annual = null;
  try {
    const subRes = await fetchJson(edgarSubmissionsUrl(co.cikPadded));
    if (subRes.missing) throw new Error('no submissions');
    const recentAccn = subRes.json?.filings?.recent?.accessionNumber?.[0] || null;
    annual = latestAnnual(subRes.json);
    pullState[String(co.cik)] = {
      last_accession: recentAccn,
      last_filing_date: subRes.json?.filings?.recent?.filingDate?.[0] || null,
      last_facts_accn: pullState[String(co.cik)]?.last_facts_accn || null,
    };
    events.push(...eventsFromSubmissions(subRes.json, { cik: co.cik, ticker: co.ticker, name: co.name }));
  } catch (err) {
    errors += 1;
    console.warn(`  submissions fail ${co.ticker}: ${err.message}`);
  }

  const cached = prevByCik[String(co.cik)];
  const factsAccn = annual?.accession || null;
  const factsFresh =
    !FORCE &&
    !schemaMismatch &&
    cached?.extracted?.asOfYear &&
    factsAccn &&
    pullState[String(co.cik)]?.last_facts_accn === factsAccn;

  if (factsFresh) {
    console.log(`${co.ticker}  facts (cached ${annual.form} ${factsAccn})`);
    companies.push({
      id: co.id,
      name: co.name,
      ticker: co.ticker,
      cik: co.cik,
      role: co.role,
      color: co.color,
      fyNote: co.fyNote,
      extracted: cached.extracted,
    });
    continue;
  }

  console.log(`${co.ticker}  facts`);
  await sleep(GAP_MS);
  try {
    const factsRes = await fetchJson(edgarFactsUrl(co.cikPadded));
    if (factsRes.missing) throw new Error('no company facts');
    const extracted = extractCompany(factsRes.json);
    if (pullState[String(co.cik)]) pullState[String(co.cik)].last_facts_accn = factsAccn;
    companies.push({
      id: co.id,
      name: co.name,
      ticker: co.ticker,
      cik: co.cik,
      role: co.role,
      color: co.color,
      fyNote: co.fyNote,
      extracted: slimExtracted(extracted),
    });
  } catch (err) {
    errors += 1;
    console.warn(`  facts fail ${co.ticker}: ${err.message}`);
    companies.push({
      id: co.id,
      name: co.name,
      ticker: co.ticker,
      cik: co.cik,
      role: co.role,
      color: co.color,
      fyNote: co.fyNote,
      error: err.message || String(err),
      extracted: cached?.extracted || null,
    });
  }
}

events.sort((a, b) => String(b.filed || '').localeCompare(String(a.filed || '')));
const trimmed = events.slice(0, EVENT_KEEP);

let gdp;
if (!FORCE && gdpIsFresh(prev?.gdp) && prev?.gdp?.value) {
  console.log('GDP (cached)');
  gdp = prev.gdp;
} else {
  console.log('GDP');
  gdp = { ...(await fetchGdp()), fetched_at: new Date().toISOString() };
}

const snap = {
  schema: SNAPSHOT_SCHEMA,
  pulled_at: new Date().toISOString(),
  gdp,
  companies,
  events: trimmed,
  pull_state: pullState,
};

if (!FORCE && prev && contentKey(prev) === contentKey(snap)) {
  console.log(`No content change (${OUT} left as-is)`);
} else {
  writeFileSync(OUT, JSON.stringify(snap));
  console.log(`Wrote ${OUT}`);
}
const ok = companies.filter((c) => c.extracted?.asOfYear).length;
console.log(`Companies with an as-of year: ${ok}/${COMPANIES.length}; events ${trimmed.length}; errors ${errors}`);
if (ok < COMPANIES.length) process.exitCode = 1;
