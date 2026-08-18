/**
 * Extra filers on the financial modeler: public names have a CIK, none of
 * them pretend to be Fortune 500 ranks, and Veeam stays private.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPublic } from '../fortune-500/catalog.js';
import { ensureRatios } from '../fortune-500/extract.js';
import { modelReadiness } from '../financial-modeler/engine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const extras = JSON.parse(readFileSync(join(ROOT, 'financial-modeler/extras.json'), 'utf8'));
const watchlist = JSON.parse(readFileSync(join(ROOT, 'financial-modeler/watchlist.json'), 'utf8'));
const mapping = JSON.parse(readFileSync(join(ROOT, 'fortune-500/data/fortune500_edgar_mapping.json'), 'utf8'));
const tickerDump = JSON.parse(readFileSync(join(ROOT, 'fortune-500/data/company_tickers.json'), 'utf8'));

assert.ok(extras.length >= 23, 'watchlist should include growth names and cinema exhibitors');
assert.deepEqual(
  extras.map((c) => c.fortune_ticker),
  watchlist.map((c) => c.ticker),
  'extras.json must be generated from watchlist.json in the same order'
);

const NOT_MODELABLE_EXTRAS = new Set(['CNK']);

const tickerToCik = new Map();
for (const row of Object.values(tickerDump)) {
  const t = String(row.ticker || '').toUpperCase();
  if (t && !tickerToCik.has(t)) tickerToCik.set(t, Number(row.cik_str));
}

const tickers = extras.map((c) => c.fortune_ticker);
assert.equal(new Set(tickers).size, tickers.length, 'duplicate extra ticker');

const f500Tickers = new Set(mapping.map((c) => c.fortune_ticker));
for (const c of extras) {
  assert.equal(c.extra, true);
  assert.equal(c.rank, undefined, `${c.company} must not wear a Fortune rank`);
  if (c.fortune_ticker && c.fortune_ticker !== 'VEEAM') {
    assert.equal(f500Tickers.has(c.fortune_ticker), false, `${c.fortune_ticker} is already in the Fortune 500 mapping`);
  }
}

const byTicker = Object.fromEntries(extras.map((c) => [c.fortune_ticker, c]));
for (const t of ['GDDY', 'WIX', 'DUOL', 'APP', 'TOST', 'NET', 'IOT', 'AXON', 'RDDT', 'RBRK', 'CAVA', 'HIMS', 'ONON', 'SG', 'HOOD', 'TEM', 'SRAD', 'GENI', 'AMC', 'CNK', 'IMAX', 'NCMI', 'EPR']) {
  const c = byTicker[t];
  assert.ok(c, `missing ${t}`);
  assert.equal(isPublic(c), true, `${t} should be a public filer`);
  assert.ok(Number.isInteger(c.cik) && c.cik > 0, `${t} needs a CIK`);
  assert.equal(c.match_source, 'company_tickers_json');
  assert.equal(c.cik, tickerToCik.get(t), `${t} CIK must match company_tickers.json`);
  assert.equal(c.cik_padded, String(c.cik).padStart(10, '0'));
  assert.match(c.edgar_companyfacts_api, new RegExp(`CIK${c.cik_padded}`));
}

assert.equal(byTicker.WIX.form, '20-F', 'Wix files a 20-F, not a 10-K');
assert.equal(byTicker.ONON.form, '20-F');
assert.equal(byTicker.SRAD.form, '20-F');
assert.equal(byTicker.GENI.form, '20-F');
assert.equal(byTicker.GDDY.form, '10-K');

const veeam = byTicker.VEEAM;
assert.ok(veeam);
assert.equal(isPublic(veeam), false);
assert.equal(veeam.cik, null);
assert.match(veeam.note, /private/i);

{
  const headlines = JSON.parse(readFileSync(join(ROOT, 'financial-modeler/extras-headlines.json'), 'utf8'));
  assert.equal(headlines.schema, 4);
  for (const c of extras.filter((x) => isPublic(x))) {
    const row = headlines.companies[String(c.cik)];
    assert.ok(row, `no headlines for ${c.fortune_ticker}`);
    assert.ok(row.asOfYear, `${c.fortune_ticker} is missing an as-of year`);
    assert.ok(row.metrics?.revenue?.val > 0, `${c.fortune_ticker} is missing revenue`);
    const ready = modelReadiness(ensureRatios(structuredClone(row)));
    if (NOT_MODELABLE_EXTRAS.has(c.fortune_ticker)) {
      assert.equal(ready.ok, false, `${c.fortune_ticker} should stay unmodelable until SEC tags a balance sheet`);
      continue;
    }
    assert.equal(ready.ok, true, `${c.fortune_ticker} not modelable: ${ready.missing?.join(', ')}`);
  }
  assert.equal(
    headlines.companies['1609711'].metrics.cash.val,
    1080900000,
    'GoDaddy cash is the 10-K cash & equivalents line ($1,080.9M)'
  );
}

console.log('test-financial-modeler-extras: ok');
