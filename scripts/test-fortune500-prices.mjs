import assert from 'node:assert/strict';
import handler from '../api/fortune-500.js';
import {
  parseYahooChart,
  yahooChartUrl,
  priceTicker,
  normalizePriceRange,
  formatChangePct,
  sparklineSvg,
} from '../fortune-500/prices.js';

const yahooFixture = {
  chart: {
    result: [
      {
        meta: {
          currency: 'USD',
          symbol: 'AAPL',
          regularMarketPrice: 200.5,
          regularMarketTime: 1700000000,
        },
        timestamp: [1699833600, 1699920000, 1700006400],
        indicators: {
          quote: [
            {
              open: [198, 199, 200],
              high: [201, 202, 203],
              low: [197, 198, 199],
              close: [199, 200, 201],
              volume: [10, 11, 12],
            },
          ],
        },
      },
    ],
    error: null,
  },
};

const parsed = parseYahooChart(yahooFixture, 'AAPL');
assert.equal(parsed.symbol, 'AAPL');
assert.equal(parsed.currency, 'USD');
assert.equal(parsed.source, 'yahoo');
assert.equal(parsed.last, 200.5);
assert.equal(parsed.previousClose, 200);
assert.ok(Math.abs(parsed.changePct - (200.5 / 200 - 1)) < 1e-9);
assert.equal(parsed.bars.length, 3);
assert.equal(parsed.bars[0].date, '2023-11-13');
assert.equal(parsed.bars[2].close, 201);

assert.equal(parseYahooChart({ chart: { result: [], error: { code: 'Not Found' } } }).error, 'price unavailable');
assert.equal(yahooChartUrl('AAPL', '5y').includes('interval=1d'), true);
assert.equal(yahooChartUrl('AAPL', '5y').includes('range=5y'), true);
assert.equal(yahooChartUrl('../etc/passwd'), null);
assert.equal(normalizePriceRange('nope'), '5y');
assert.equal(normalizePriceRange('1y'), '1y');
assert.equal(priceTicker({ status: 'matched', cik: 1, sec_ticker: 'BRK-B', fortune_ticker: 'BRK-A' }), 'BRK-B');
assert.equal(priceTicker({ status: 'no_ticker', cik: 1, fortune_ticker: 'SPCX' }), null);
assert.equal(formatChangePct(0.0123), '+1.23%');
assert.ok(sparklineSvg(parsed.bars).includes('<svg'));

function mockRes() {
  const out = { statusCode: 200, body: null, headers: {} };
  return {
    setHeader(k, v) {
      out.headers[k] = v;
    },
    status(n) {
      out.statusCode = n;
      return this;
    },
    json(b) {
      out.body = b;
      return out;
    },
    _out: out,
  };
}

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, opts) => {
    assert.match(String(url), /query1\.finance\.yahoo\.com\/v8\/finance\/chart\/AAPL/);
    assert.match(String(url), /range=5y/);
    assert.match(opts.headers['User-Agent'], /Mozilla/);
    return { ok: true, status: 200, json: async () => yahooFixture };
  };
  const res = mockRes();
  await handler({ method: 'GET', query: { route: 'prices', ticker: 'AAPL', range: '5y' } }, res);
  assert.equal(res._out.statusCode, 200);
  assert.equal(res._out.body.symbol, 'AAPL');
  assert.equal(res._out.body.last, 200.5);
  assert.equal(res._out.body.source, 'yahoo');
  assert.equal(res._out.body.cached, false);
  assert.match(res._out.headers['Cache-Control'], /s-maxage/);

  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const blocked = mockRes();
  await handler({ method: 'GET', query: { route: 'prices', ticker: 'AAPL' } }, blocked);
  assert.equal(blocked._out.statusCode, 200);
  assert.equal(blocked._out.body.error, 'price unavailable');

  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  const down = mockRes();
  await handler({ method: 'GET', query: { route: 'prices', ticker: 'MSFT' } }, down);
  assert.equal(down._out.statusCode, 200);
  assert.equal(down._out.body.error, 'price unavailable');

  const bad = mockRes();
  await handler({ method: 'GET', query: { route: 'prices', ticker: '' } }, bad);
  assert.equal(bad._out.statusCode, 400);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('fortune-500 prices tests passed');
