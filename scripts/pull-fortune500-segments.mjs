/**
 * Pull dimensional segment facts from each public Fortune 500 filer's latest
 * 10-K / 20-F inline XBRL. Writes fortune-500/data/segments-snapshot.json.
 *
 * Usage: node scripts/pull-fortune500-segments.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSegmentsFromHtml } from '../fortune-500/extract-segments.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'fortune-500/data/segments-snapshot.json');
const MAPPING = join(ROOT, 'fortune-500/data/fortune500_edgar_mapping.json');
const UA =
  process.env.SEC_USER_AGENT ||
  'inaayat.xyz/fortune-500 (https://inaayat.xyz/fortune-500/)';
const WORKERS = 2;
const GAP_MS = 150;
const MAX_ATTEMPTS = 5;
const SEGMENT_SNAPSHOT_SCHEMA = 1;
const ANNUAL = new Set(['10-K', '10-K/A', '20-F', '20-F/A']);

function padCik(cik) {
  return String(cik).padStart(10, '0');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadSnapshot() {
  if (!existsSync(OUT)) return { schema: SEGMENT_SNAPSHOT_SCHEMA, pulled_at: null, companies: {} };
  const snap = JSON.parse(readFileSync(OUT, 'utf8'));
  if (snap.schema !== SEGMENT_SNAPSHOT_SCHEMA) {
    console.log(`Segment schema ${snap.schema ?? 0} → ${SEGMENT_SNAPSHOT_SCHEMA}: refetching.`);
    return { schema: SEGMENT_SNAPSHOT_SCHEMA, pulled_at: null, companies: {} };
  }
  return snap;
}

function saveSnapshot(snap) {
  snap.schema = SEGMENT_SNAPSHOT_SCHEMA;
  snap.pulled_at = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(snap));
}

async function fetchJson(url) {
  let delay = 1000;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, text/html' } });
    if (resp.status === 429 || resp.status === 503) {
      const wait = delay + Math.floor(Math.random() * 400);
      console.warn(`  ${resp.status} — retry in ${wait}ms ${url}`);
      await sleep(wait);
      delay *= 2;
      continue;
    }
    if (resp.status === 404) return { missing: true };
    if (!resp.ok) throw new Error(`SEC ${resp.status} ${url}`);
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('json')) return { json: await resp.json() };
    return { text: await resp.text() };
  }
  throw new Error(`still 429/503 after ${MAX_ATTEMPTS}: ${url}`);
}

function latestAnnual(submissions) {
  const recent = submissions?.filings?.recent;
  if (!recent?.form) return null;
  for (let i = 0; i < recent.form.length; i += 1) {
    if (ANNUAL.has(recent.form[i])) {
      return {
        form: recent.form[i],
        accession: recent.accessionNumber[i],
        primary: recent.primaryDocument[i],
        filingDate: recent.filingDate[i],
      };
    }
  }
  return null;
}

const mapping = JSON.parse(readFileSync(MAPPING, 'utf8'));
const extrasPath = join(ROOT, 'financial-modeler/extras.json');
const extras = existsSync(extrasPath) ? JSON.parse(readFileSync(extrasPath, 'utf8')) : [];
const publicCos = [
  ...mapping.filter((c) => c.status === 'matched' && c.cik != null),
  ...extras.filter((c) => c.status === 'matched' && c.cik != null),
];
const seen = new Set();
const unique = publicCos.filter((c) => {
  if (seen.has(c.cik)) return false;
  seen.add(c.cik);
  return true;
});
const snap = loadSnapshot();
if (!snap.companies) snap.companies = {};

const pending = unique.filter((c) => !snap.companies[String(c.cik)]);
console.log(
  `Public filers ${unique.length}; already in segment snapshot ${unique.length - pending.length}; to pull ${pending.length}`
);

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

let done = 0;
let errors = 0;

async function pullOne(c) {
  const cik = String(c.cik);
  try {
    const subUrl = `https://data.sec.gov/submissions/CIK${padCik(c.cik)}.json`;
    const sub = await gated(() => fetchJson(subUrl));
    if (sub.missing || !sub.json) {
      snap.companies[cik] = { cik: c.cik, error: 'no_submissions', axes: [], flags: ['no_submissions'] };
    } else {
      const filing = latestAnnual(sub.json);
      if (!filing?.accession || !filing.primary) {
        snap.companies[cik] = { cik: c.cik, error: 'no_annual', axes: [], flags: ['no_annual'] };
      } else {
        const accn = filing.accession.replace(/-/g, '');
        const url = `https://www.sec.gov/Archives/edgar/data/${Number(c.cik)}/${accn}/${filing.primary}`;
        const doc = await gated(() => fetchJson(url));
        if (doc.missing || !doc.text) {
          snap.companies[cik] = {
            cik: c.cik,
            error: 'no_filing_html',
            filing,
            axes: [],
            flags: ['no_filing_html'],
          };
        } else {
          const extracted = extractSegmentsFromHtml(doc.text);
          snap.companies[cik] = {
            cik: c.cik,
            entityName: sub.json.name || c.company,
            filing,
            ...extracted,
          };
        }
      }
    }
  } catch (err) {
    errors += 1;
    snap.companies[cik] = { cik: c.cik, error: err.message || String(err), axes: [], flags: ['fetch_error'] };
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
const withAxes = Object.values(snap.companies).filter((c) => (c.axes || []).length).length;
console.log(`Wrote ${OUT}`);
console.log(`Companies with at least one segment axis: ${withAxes}/${unique.length}`);
