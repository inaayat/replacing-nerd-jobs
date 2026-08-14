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
const mapping = JSON.parse(readFileSync(join(ROOT, 'fortune-500/data/fortune500_edgar_mapping.json'), 'utf8'));

assert.ok(extras.length >= 18, 'watchlist should include the named growth names');

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
for (const t of ['GDDY', 'WIX', 'DUOL', 'APP', 'TOST', 'NET', 'IOT', 'AXON', 'RDDT', 'RBRK', 'CAVA', 'HIMS', 'ONON', 'SG', 'HOOD', 'TEM', 'SRAD', 'GENI']) {
  const c = byTicker[t];
  assert.ok(c, `missing ${t}`);
  assert.equal(isPublic(c), true, `${t} should be a public filer`);
  assert.ok(Number.isInteger(c.cik) && c.cik > 0, `${t} needs a CIK`);
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
  assert.equal(headlines.schema, 3);
  for (const c of extras.filter((x) => isPublic(x))) {
    const row = headlines.companies[String(c.cik)];
    assert.ok(row, `no headlines for ${c.fortune_ticker}`);
    assert.ok(row.asOfYear, `${c.fortune_ticker} is missing an as-of year`);
    assert.ok(row.metrics?.revenue?.val > 0, `${c.fortune_ticker} is missing revenue`);
    const ready = modelReadiness(ensureRatios(row));
    assert.equal(ready.ok, true, `${c.fortune_ticker} not modelable: ${ready.missing?.join(', ')}`);
  }
}

console.log('test-financial-modeler-extras: ok');
