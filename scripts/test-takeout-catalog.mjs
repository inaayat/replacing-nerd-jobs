/**
 * Takeout source catalog: URL builders, picks, and loadSource (mocked fetch).
 */
import assert from 'node:assert/strict';
import {
  SOURCES,
  sourceById,
  defaultParams,
  groupsOf,
  parsePastedJson,
  loadSource,
} from '../takeout/catalog.js';

assert.ok(SOURCES.length >= 10);
assert.equal(new Set(SOURCES.map((s) => s.id)).size, SOURCES.length);
assert.ok(SOURCES.every((s) => s.name && s.group && s.kind));
assert.ok(sourceById('missing') === null);
assert.equal(sourceById('demo-posts').kind, 'http');

const groups = groupsOf();
assert.ok(groups.some((g) => g.name === 'Finance'));
assert.ok(groups.every((g) => g.sources.length));

const fx = sourceById('frankfurter');
assert.equal(defaultParams(fx).base, 'USD');
assert.equal(fx.buildUrl({ base: 'EUR' }), 'https://api.frankfurter.app/latest?from=EUR');

const wb = sourceById('world-bank');
const wbUrl = wb.buildUrl({ place: 'USA', indicator: 'NY.GDP.MKTP.CD' });
assert.match(wbUrl, /country\/USA\/indicator\/NY\.GDP\.MKTP\.CD/);
assert.match(wbUrl, /format=json/);

const prices = sourceById('f500-prices');
assert.match(prices.buildUrl({ ticker: 'aapl', range: '1y' }), /ticker=AAPL/);
const sneaky = prices.buildUrl({ ticker: '../etc/passwd', range: 'nope' });
assert.match(sneaky, /ticker=\.\.ETCPASSW/);
assert.ok(!sneaky.includes('../'));
assert.ok(!sneaky.includes('passwd'));
assert.match(prices.buildUrl({ ticker: 'AAPL', range: '5y' }), /range=5y/);
assert.ok(!prices.buildUrl({ ticker: 'AAPL<script>', range: '5y' }).includes('<'));

const custom = sourceById('custom-url');
assert.throws(() => custom.buildUrl({ url: 'javascript:alert(1)' }), /http/);
assert.equal(custom.buildUrl({ url: 'https://example.com/x.json' }), 'https://example.com/x.json');

const pasted = parsePastedJson('[{"a":1}]');
assert.equal(pasted.data[0].a, 1);
assert.ok(parsePastedJson('{').error);

const pasteSource = sourceById('paste-json');
const fromPaste = await loadSource(pasteSource, {
  json: JSON.stringify([
    { name: 'Ada', year: 1815 },
    { name: 'Alan', year: 1912, field: { main: 'cs' } },
  ]),
});
assert.deepEqual(fromPaste.table.columns, ['name', 'year', 'field.main']);
assert.equal(fromPaste.table.rows[1]['field.main'], 'cs');
assert.equal(fromPaste.sourceId, 'paste-json');

async function fakeFetch(url) {
  const body = url.includes('posts')
    ? [{ id: 1, title: 'Hello', body: 'x' }]
    : { rates: { EUR: 0.9, GBP: 0.8 }, base: 'USD', date: '2026-08-21' };
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(body);
    },
  };
}

const demo = await loadSource(sourceById('demo-posts'), {}, fakeFetch);
assert.equal(demo.table.rows[0].title, 'Hello');
assert.match(demo.url, /jsonplaceholder/);

const rates = await loadSource(sourceById('frankfurter'), { base: 'USD' }, fakeFetch);
assert.equal(rates.table.rows.length, 2);
assert.equal(rates.table.rows.find((r) => r.currency === 'EUR').rate, 0.9);

const headlines = sourceById('f500-headlines');
const slim = headlines.pick({
  companies: {
    320193: {
      cik: 320193,
      entityName: 'Apple Inc.',
      asOfYear: 2025,
      metrics: { revenue: { val: 100 }, net_income: null },
      ratios: { roe: { val: 1.4 } },
    },
  },
});
assert.equal(slim[0].name, 'Apple Inc.');
assert.equal(slim[0].revenue, 100);
assert.equal(slim[0].ratio_roe, 1.4);

const countries = sourceById('rest-countries');
const slimC = countries.pick([
  {
    name: { common: 'France', official: 'French Republic' },
    cca2: 'FR',
    region: 'Europe',
    capital: ['Paris'],
    population: 67,
    currencies: { EUR: { name: 'Euro' } },
    languages: { fra: 'French' },
    unMember: true,
  },
]);
assert.equal(slimC[0].name, 'France');
assert.equal(slimC[0].capital, 'Paris');
assert.equal(slimC[0].currencies, 'Euro');

let failed = false;
try {
  await loadSource(sourceById('demo-posts'), {}, async () => {
    throw new TypeError('Failed to fetch');
  });
} catch (err) {
  failed = /CORS|could not read/i.test(err.message);
}
assert.equal(failed, true);

console.log('takeout catalog tests passed');
