import assert from 'node:assert/strict';
import {
  percentile,
  poolFor,
  buildInsights,
  similarByRevenue,
  metricNumber,
  ratioNumber,
} from '../fortune-500/insights.js';

function headlines({ revenue, net_income, net_margin, revenue_yoy, roe, asOfYear = 2025 }) {
  return {
    asOfYear,
    metrics: {
      revenue: revenue != null ? { val: revenue } : null,
      net_income: net_income != null ? { val: net_income } : null,
    },
    ratios: {
      net_margin: net_margin ?? null,
      revenue_yoy: revenue_yoy ?? null,
      roe: roe ?? null,
    },
  };
}

function co(name, extra = {}) {
  return { company: name, name, status: 'matched', cik: extra.cik ?? 1, ...extra };
}

assert.equal(percentile(null, [1, 2, 3, 4, 5, 6, 7, 8]), null);
assert.equal(percentile(5, [1, 2, 3]), null, 'need 8 peers');
assert.equal(percentile(10, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 95);
assert.equal(percentile(1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 5);
assert.equal(percentile(1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], true), 95, 'invert: low debt is high percentile');

const snap = {
  1: headlines({ revenue: 100, net_margin: 0.1 }),
  2: headlines({ revenue: 200, net_margin: 0.2 }),
  3: headlines({ revenue: 50 }),
};
assert.deepEqual(poolFor(snap, 'metric', 'revenue').sort((a, b) => a - b), [50, 100, 200]);
assert.equal(poolFor(snap, 'ratio', 'net_margin').length, 2);
assert.equal(metricNumber(snap[1], 'revenue'), 100);
assert.equal(ratioNumber(snap[2], 'net_margin'), 0.2);

const scale = buildInsights([
  { company: co('Amazon'), headlines: headlines({ revenue: 700e9, net_margin: 0.11, revenue_yoy: 0.12, roe: 0.25 }) },
  { company: co('Target'), headlines: headlines({ revenue: 100e9, net_margin: 0.03, revenue_yoy: -0.02, roe: 0.12 }) },
]);
assert.ok(scale.some((s) => s.includes('Amazon') && s.includes('7.0×') && s.includes('Target')));
assert.ok(scale.some((s) => s.includes('net margin') && s.includes('11.0%') && s.includes('3.0%')));
assert.ok(scale.some((s) => s.includes('grew') && s.includes('shrank')));
assert.ok(scale.some((s) => s.includes('ROE')));

const similarSize = buildInsights([
  { company: co('Ford Motor'), headlines: headlines({ revenue: 180e9, net_margin: 0.04, revenue_yoy: 0.03 }) },
  { company: co('General Motors'), headlines: headlines({ revenue: 175e9, net_margin: 0.045, revenue_yoy: 0.02 }) },
]);
assert.ok(similarSize.some((s) => s.includes('similar size')));
assert.ok(similarSize.some((s) => s.includes('grew revenue') && s.includes('Ford Motor')));

const mixedYears = buildInsights([
  { company: co('A'), headlines: headlines({ revenue: 10e9, asOfYear: 2024 }) },
  { company: co('B'), headlines: headlines({ revenue: 12e9, asOfYear: 2025 }) },
]);
assert.ok(mixedYears.some((s) => s.includes('Fiscal years differ') && s.includes('2024') && s.includes('2025')));

const bigPool = {};
for (let i = 1; i <= 20; i++) bigPool[i] = headlines({ revenue: i * 1e9 });
const pctInsight = buildInsights(
  [
    { company: co('Whale'), headlines: headlines({ revenue: 20e9, net_margin: 0.1 }) },
    { company: co('Minnow'), headlines: headlines({ revenue: 1e9, net_margin: 0.1 }) },
  ],
  bigPool
);
assert.ok(pctInsight.some((s) => s.includes('percentile')));

assert.deepEqual(buildInsights([{ company: co('Solo'), headlines: headlines({ revenue: 1 }) }]), []);

const catalog = [
  co('Amazon', { cik: 101, rank: 1 }),
  co('Walmart', { cik: 102, rank: 2 }),
  co('Apple', { cik: 103, rank: 4 }),
  co('Tiny', { cik: 104, rank: 99 }),
];
const revSnap = {
  101: headlines({ revenue: 700e9 }),
  102: headlines({ revenue: 680e9 }),
  103: headlines({ revenue: 390e9 }),
  104: headlines({ revenue: 20e9 }),
};
const peers = similarByRevenue(catalog[0], catalog, revSnap, 2);
assert.equal(peers.length, 2);
assert.equal(peers[0].company.company, 'Walmart');
assert.equal(peers[1].company.company, 'Apple');

console.log('fortune-500 insights tests passed');
