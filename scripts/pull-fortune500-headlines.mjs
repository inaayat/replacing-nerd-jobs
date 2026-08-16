/**
 * One-shot pull of slim 10-K headlines for every public Fortune 500 CIK.
 * Writes fortune-500/data/headlines-snapshot.json (not raw Company Facts).
 *
 * Usage: node scripts/pull-fortune500-headlines.mjs
 * Respects SEC ~10 req/sec: two workers, 150ms between launches, 429 backoff.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractHeadlines } from '../fortune-500/extract.js';
import { METRICS } from '../fortune-500/catalog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'fortune-500/data/headlines-snapshot.json');
const OUT_EXTENDED = join(ROOT, 'fortune-500/data/extended-snapshot.json');
const MAPPING = join(ROOT, 'fortune-500/data/fortune500_edgar_mapping.json');
const UA =
  process.env.SEC_USER_AGENT ||
  'inaayat.xyz/fortune-500 (https://inaayat.xyz/fortune-500/)';
const WORKERS = 2;
const GAP_MS = 150;
const MAX_ATTEMPTS = 5;
/**
 * Bump when a slimmed field is added, so existing rows get refetched instead of
 * silently serving a snapshot the UI can no longer fill in.
 * 2 — prior-year filed values (`priorMetrics`) for the FY-1 statement column.
 * 4 — extended Company Facts packs (PP&E, D&A, WC, leases, financing, bank)
 *     plus 5-year annual series and quarterly revenue/NI.
 */
const SNAPSHOT_SCHEMA = 4;

function padCik(cik) {
  return String(cik).padStart(10, '0');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const CORE_KEYS = METRICS.map((m) => m.key);

function pickMetrics(metrics, keys) {
  const out = {};
  for (const key of keys) out[key] = metrics?.[key] ?? null;
  return out;
}

function slimCore(extracted, cik) {
  const prior = extracted.priorMetrics;
  const priorValues = {};
  if (prior?.values) {
    for (const key of CORE_KEYS) {
      if (prior.values[key] != null) priorValues[key] = prior.values[key];
    }
  }
  return {
    cik,
    entityName: extracted.entityName,
    asOfYear: extracted.asOfYear,
    metrics: pickMetrics(extracted.metrics, CORE_KEYS),
    priorRevenue: extracted.priorRevenue,
    priorMetrics: prior && Object.keys(priorValues).length ? { year: prior.year, values: priorValues } : null,
    ratios: extracted.ratios,
    flags: extracted.flags,
  };
}

function slimFull(extracted, cik) {
  return {
    ...slimCore(extracted, cik),
    metrics: extracted.metrics,
    priorMetrics: extracted.priorMetrics,
    seriesAnnual: extracted.seriesAnnual || {},
    seriesQuarterly: extracted.seriesQuarterly || {},
  };
}

function slim(extracted, cik) {
  return slimFull(extracted, cik);
}

function loadSnapshot() {
  const path = existsSync(OUT_EXTENDED) ? OUT_EXTENDED : OUT;
  if (!existsSync(path)) {
    return { schema: SNAPSHOT_SCHEMA, pulled_at: null, companies: {} };
  }
  const snap = JSON.parse(readFileSync(path, 'utf8'));
  if (snap.schema !== SNAPSHOT_SCHEMA) {
    console.log(`Snapshot schema ${snap.schema ?? 1} → ${SNAPSHOT_SCHEMA}: refetching every filer.`);
    return { schema: SNAPSHOT_SCHEMA, pulled_at: null, companies: {} };
  }
  return snap;
}

function saveSnapshot(snap) {
  snap.schema = SNAPSHOT_SCHEMA;
  snap.pulled_at = new Date().toISOString();
  writeFileSync(OUT_EXTENDED, JSON.stringify(snap));
  const core = { schema: SNAPSHOT_SCHEMA, pulled_at: snap.pulled_at, companies: {} };
  for (const [cik, row] of Object.entries(snap.companies || {})) {
    if (row.error) {
      core.companies[cik] = row;
      continue;
    }
    core.companies[cik] = slimCore(row, row.cik ?? Number(cik));
  }
  writeFileSync(OUT, JSON.stringify(core));
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

const mapping = JSON.parse(readFileSync(MAPPING, 'utf8'));
const publicCos = mapping.filter((c) => c.status === 'matched' && c.cik != null);
const snap = loadSnapshot();
if (!snap.companies) snap.companies = {};

const pending = publicCos.filter((c) => !snap.companies[String(c.cik)]);
console.log(
  `Public filers ${publicCos.length}; already in snapshot ${publicCos.length - pending.length}; to pull ${pending.length}`
);

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
    } else {
      snap.companies[String(c.cik)] = slim(extractHeadlines(result.facts), c.cik);
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
    console.warn(`  fail ${c.fortune_ticker || c.company}: ${err.message}`);
  }
  done += 1;
  if (done % 10 === 0 || done === pending.length) {
    saveSnapshot(snap);
    console.log(`  ${done}/${pending.length} (${errors} errors)`);
  }
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

await runPool(pending, WORKERS);
saveSnapshot(snap);
const ok = Object.values(snap.companies).filter((c) => c.asOfYear && !c.error).length;
console.log(`Wrote ${OUT}`);
console.log(`Headlines with an as-of year: ${ok}/${publicCos.length}`);
