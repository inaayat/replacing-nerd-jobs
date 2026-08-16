/**
 * Pull slim 10-K / 20-F headlines for financial-modeler extra filers
 * (GoDaddy, Wix, …). Writes financial-modeler/extras-headlines.json so the
 * Fortune 500 snapshot stays Fortune 500-only.
 *
 * Usage: node scripts/pull-financial-modeler-extras.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractHeadlines } from '../fortune-500/extract.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'financial-modeler/extras-headlines.json');
const EXTRAS = join(ROOT, 'financial-modeler/extras.json');
const UA =
  process.env.SEC_USER_AGENT ||
  'inaayat.xyz/fortune-500 (https://inaayat.xyz/fortune-500/)';
const WORKERS = 2;
const GAP_MS = 150;
const MAX_ATTEMPTS = 5;
const SNAPSHOT_SCHEMA = 4;

function padCik(cik) {
  return String(cik).padStart(10, '0');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function slim(extracted, cik) {
  return {
    cik,
    entityName: extracted.entityName,
    asOfYear: extracted.asOfYear,
    metrics: extracted.metrics,
    priorRevenue: extracted.priorRevenue,
    priorMetrics: extracted.priorMetrics,
    ratios: extracted.ratios,
    flags: extracted.flags,
    seriesAnnual: extracted.seriesAnnual || {},
    seriesQuarterly: extracted.seriesQuarterly || {},
  };
}

async function fetchFacts(cik) {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`;
  let delay = 1000;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (resp.status === 429 || resp.status === 503) {
      const wait = delay + Math.floor(Math.random() * 400);
      console.warn(`  CIK ${cik} ${resp.status} — retry in ${wait}ms`);
      await sleep(wait);
      delay *= 2;
      continue;
    }
    if (resp.status === 404) return { missing: true };
    if (!resp.ok) throw new Error(`SEC ${resp.status}`);
    return { facts: await resp.json() };
  }
  throw new Error(`SEC still 429/503 after ${MAX_ATTEMPTS} attempts`);
}

const extras = JSON.parse(readFileSync(EXTRAS, 'utf8')).filter((c) => c.status === 'matched' && c.cik != null);
const snap = { schema: SNAPSHOT_SCHEMA, pulled_at: null, companies: {} };

let done = 0;
let errors = 0;
let launch = Promise.resolve();

async function gated(fn) {
  const prev = launch;
  let release;
  launch = new Promise((r) => {
    release = r;
  });
  await prev;
  setTimeout(release, GAP_MS);
  return fn();
}

async function pullOne(c) {
  try {
    const result = await gated(() => fetchFacts(c.cik));
    if (result.missing) {
      snap.companies[String(c.cik)] = {
        cik: c.cik,
        error: 'no_company_facts',
        asOfYear: null,
        metrics: {},
        ratios: {},
      };
      console.warn(`  ${c.fortune_ticker} — no Company Facts`);
    } else {
      const row = slim(extractHeadlines(result.facts), c.cik);
      snap.companies[String(c.cik)] = row;
      console.log(
        `  ${c.fortune_ticker} FY${row.asOfYear ?? '—'} revenue=${row.metrics?.revenue?.val ?? 'missing'}`
      );
    }
  } catch (err) {
    errors += 1;
    snap.companies[String(c.cik)] = {
      cik: c.cik,
      error: err.message || String(err),
      asOfYear: null,
      metrics: {},
      ratios: {},
    };
    console.warn(`  fail ${c.fortune_ticker}: ${err.message}`);
  }
  done += 1;
}

async function runPool(items, n) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i];
      i += 1;
      await pullOne(item);
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));
}

console.log(`Pulling ${extras.length} extra filers from EDGAR`);
await runPool(extras, WORKERS);
snap.pulled_at = new Date().toISOString();
writeFileSync(OUT, `${JSON.stringify(snap, null, 2)}\n`);
const ok = Object.values(snap.companies).filter((c) => c.asOfYear && !c.error).length;
console.log(`Wrote ${OUT}`);
console.log(`Headlines with an as-of year: ${ok}/${extras.length} (${errors} errors)`);
