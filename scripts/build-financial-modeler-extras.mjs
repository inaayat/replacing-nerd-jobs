/**
 * Build financial-modeler/extras.json the same way the Fortune 500 mapping
 * was built: ticker → SEC company_tickers.json → CIK, then confirm the CIK
 * against data.sec.gov/submissions (legal name, listed tickers, 10-K vs 20-F).
 *
 * Does not hit Company Facts. After this, run:
 *   node scripts/pull-financial-modeler-extras.mjs
 *
 * Usage: node scripts/build-financial-modeler-extras.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WATCHLIST = join(ROOT, 'financial-modeler/watchlist.json');
const TICKERS = join(ROOT, 'fortune-500/data/company_tickers.json');
const OUT = join(ROOT, 'financial-modeler/extras.json');
const UA =
  process.env.SEC_USER_AGENT ||
  'inaayat.xyz/fortune-500 (https://inaayat.xyz/fortune-500/)';
const GAP_MS = 150;
const MAX_ATTEMPTS = 5;
const TICKER_INDEX_URL = 'https://www.sec.gov/files/company_tickers.json';

function padCik(cik) {
  return String(cik).padStart(10, '0');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function edgarUrls(cik) {
  const cik_padded = padCik(cik);
  return {
    cik: Number(cik),
    cik_padded,
    edgar_submissions_api: `https://data.sec.gov/submissions/CIK${cik_padded}.json`,
    edgar_companyfacts_api: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik_padded}.json`,
    edgar_companyconcept_revenues_api: `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik_padded}/us-gaap/Revenues.json`,
    edgar_filings_browse: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik_padded}&type=&dateb=&owner=include&count=40`,
  };
}

function tickerIndex(raw) {
  const byTicker = new Map();
  for (const row of Object.values(raw)) {
    const ticker = String(row.ticker || '').toUpperCase();
    if (!ticker) continue;
    // First hit wins — same rule as the Fortune mapping.
    if (!byTicker.has(ticker)) {
      byTicker.set(ticker, { cik: Number(row.cik_str), ticker, title: row.title });
    }
  }
  return byTicker;
}

async function fetchJson(url) {
  let delay = 1000;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (resp.status === 429 || resp.status === 503) {
      const wait = delay + Math.floor(Math.random() * 400);
      console.warn(`  ${resp.status} ${url} — retry in ${wait}ms`);
      await sleep(wait);
      delay *= 2;
      continue;
    }
    if (resp.status === 404) return { missing: true };
    if (!resp.ok) throw new Error(`SEC ${resp.status} for ${url}`);
    return { json: await resp.json() };
  }
  throw new Error(`SEC still 429/503 after ${MAX_ATTEMPTS} attempts`);
}

function annualForm(submissions) {
  const forms = submissions?.filings?.recent?.form || [];
  if (forms.some((f) => f === '20-F' || f === '20-F/A')) return '20-F';
  if (forms.some((f) => f === '10-K' || f === '10-K/A')) return '10-K';
  return null;
}

function listedTickers(submissions) {
  const t = submissions?.tickers;
  return Array.isArray(t) ? t.map((x) => String(x).toUpperCase()) : [];
}

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

async function loadTickerIndex() {
  try {
    const live = await fetchJson(TICKER_INDEX_URL);
    if (live.json) {
      console.log('Using live SEC company_tickers.json');
      return tickerIndex(live.json);
    }
  } catch (err) {
    console.warn(`Live ticker index failed (${err.message}); using the committed snapshot.`);
  }
  return tickerIndex(JSON.parse(readFileSync(TICKERS, 'utf8')));
}

const watchlist = JSON.parse(readFileSync(WATCHLIST, 'utf8'));
const index = await loadTickerIndex();
const extras = [];

for (const item of watchlist) {
  if (item.private) {
    extras.push({
      extra: true,
      company: item.company,
      fortune_ticker: item.ticker,
      sec_ticker: null,
      cik: null,
      cik_padded: null,
      sec_name: null,
      blurb: item.blurb,
      form: null,
      status: 'no_ticker',
      match_source: null,
      note: item.note,
      edgar_submissions_api: null,
      edgar_companyfacts_api: null,
      edgar_companyconcept_revenues_api: null,
      edgar_filings_browse: null,
    });
    console.log(`${item.ticker.padEnd(6)} private — no CIK`);
    continue;
  }

  const hit = index.get(String(item.ticker).toUpperCase());
  if (!hit) {
    throw new Error(`${item.ticker} (${item.company}) is not in company_tickers.json — needs a manual CIK lookup.`);
  }

  const urls = edgarUrls(hit.cik);
  const sub = await gated(() => fetchJson(urls.edgar_submissions_api));
  if (sub.missing || !sub.json) {
    throw new Error(`${item.ticker} CIK ${hit.cik} has no submissions JSON.`);
  }
  const submissions = sub.json;
  const tickers = listedTickers(submissions);
  if (tickers.length && !tickers.includes(item.ticker.toUpperCase())) {
    throw new Error(
      `${item.ticker} mapped to CIK ${hit.cik} (${submissions.name}), but submissions lists ${tickers.join(', ')}`
    );
  }
  const form = annualForm(submissions);
  const secTicker = tickers[0] || hit.ticker;
  extras.push({
    extra: true,
    company: item.company,
    fortune_ticker: item.ticker,
    sec_ticker: secTicker,
    cik: urls.cik,
    cik_padded: urls.cik_padded,
    sec_name: submissions.name || hit.title,
    blurb: item.blurb,
    form,
    status: 'matched',
    match_source: 'company_tickers_json',
    edgar_submissions_api: urls.edgar_submissions_api,
    edgar_companyfacts_api: urls.edgar_companyfacts_api,
    edgar_companyconcept_revenues_api: urls.edgar_companyconcept_revenues_api,
    edgar_filings_browse: urls.edgar_filings_browse,
  });
  console.log(
    `${item.ticker.padEnd(6)} CIK ${String(hit.cik).padStart(10)}  ${form || 'no annual form'}  ${submissions.name}`
  );
}

writeFileSync(OUT, `${JSON.stringify(extras, null, 2)}\n`);
const matched = extras.filter((c) => c.status === 'matched').length;
console.log(`Wrote ${OUT} (${matched} public CIKs, ${extras.length - matched} private)`);
