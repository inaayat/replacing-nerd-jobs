import assert from 'node:assert/strict';
import {
  percentile,
  poolFor,
  buildInsights,
  similarByRevenue,
  metricNumber,
  ratioNumber,
  coverageOf,
  coverageOverlap,
  leadersFor,
  suggestComparisons,
} from '../fortune-500/insights.js';
import { METRICS, DERIVED, PRESETS, allDefs, isPublic, COURSE_STEPS, SUGGESTED_RANK, HOW_TO, PURPOSE, courseProgress } from '../fortune-500/catalog.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function headlines({
  revenue,
  net_income,
  cfo,
  rd,
  net_margin,
  revenue_yoy,
  roe,
  rd_intensity,
  asset_turnover,
  cash_conversion,
  asOfYear = 2025,
}) {
  return {
    asOfYear,
    metrics: {
      revenue: revenue != null ? { val: revenue } : null,
      net_income: net_income != null ? { val: net_income } : null,
      cfo: cfo != null ? { val: cfo } : null,
      rd: rd != null ? { val: rd } : null,
    },
    ratios: {
      net_margin: net_margin ?? null,
      revenue_yoy: revenue_yoy ?? null,
      roe: roe ?? null,
      rd_intensity: rd_intensity ?? null,
      asset_turnover: asset_turnover ?? null,
      cash_conversion: cash_conversion ?? null,
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

const turns = buildInsights([
  { company: co('Grocer'), headlines: headlines({ revenue: 100e9, net_margin: 0.03, asset_turnover: 2.4 }) },
  { company: co('Utility'), headlines: headlines({ revenue: 80e9, net_margin: 0.08, asset_turnover: 0.4 }) },
]);
assert.ok(turns.some((s) => s.includes('sales per dollar of assets') && s.includes('Grocer') && s.includes('Utility')));

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
assert.ok(mixedYears.some((s) => s.includes('not aligned') && s.includes('2024') && s.includes('2025')));

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

const cov = coverageOf(headlines({ revenue: 10, net_income: 1, cfo: 2 }));
assert.ok(cov.tagged.includes('revenue'));
assert.ok(cov.tagged.includes('cfo'));
assert.ok(cov.missing.includes('inventory'));
assert.equal(cov.total, METRICS.length);

const overlap = coverageOverlap([
  { company: co('A', { cik: 1 }), headlines: headlines({ revenue: 10, net_income: 1, rd: 2 }) },
  { company: co('B', { cik: 2 }), headlines: headlines({ revenue: 12, net_income: 2 }) },
]);
assert.ok(overlap.shared.includes('revenue'));
assert.ok(overlap.shared.includes('net_income'));
assert.ok(overlap.split.includes('rd'));
assert.ok(overlap.none.includes('inventory'));

const wildMargin = buildInsights([
  { company: co('Bankish'), headlines: headlines({ revenue: 2e9, net_margin: 1.72 }) },
  { company: co('Appleish'), headlines: headlines({ revenue: 400e9, net_margin: 0.27 }) },
]);
assert.ok(!wildMargin.some((s) => s.includes('172')));

const unalignedSentences = buildInsights([
  {
    company: co('Apple'),
    headlines: {
      ...headlines({ revenue: 400e9, revenue_yoy: 0.02, asOfYear: 2025 }),
      metrics: { revenue: { val: 400e9, end: '2025-09-27' } },
    },
  },
  {
    company: co('Microsoft'),
    headlines: {
      ...headlines({ revenue: 280e9, revenue_yoy: 0.178, asOfYear: 2026 }),
      metrics: { revenue: { val: 280e9, end: '2026-06-30' } },
    },
  },
]);
assert.ok(unalignedSentences.some((s) => s.includes('not aligned')));
assert.ok(!unalignedSentences.some((s) => s.includes('grew revenue fastest')));

const cashStory = buildInsights([
  { company: co('CashCo'), headlines: headlines({ revenue: 100e9, net_income: 20e9, cfo: 50e9, net_margin: 0.2 }) },
  { company: co('AccrualCo'), headlines: headlines({ revenue: 90e9, net_income: 25e9, cfo: 5e9, net_margin: 0.28 }) },
]);
assert.ok(cashStory.some((s) => s.includes('cash') && s.includes('profit')));

const rdStory = buildInsights([
  { company: co('Lab'), headlines: headlines({ revenue: 50e9, rd: 10e9, rd_intensity: 0.2, net_margin: 0.1 }) },
  { company: co('Store'), headlines: headlines({ revenue: 60e9, net_margin: 0.03 }) },
]);
assert.ok(rdStory.some((s) => s.includes('R&D') && s.includes('Lab') && s.includes('Store')));

const leaders = leadersFor(
  catalog,
  {
    101: headlines({ revenue: 700e9, net_margin: 0.1 }),
    102: headlines({ revenue: 680e9, net_margin: 0.03 }),
    103: headlines({ revenue: 390e9, net_margin: 0.27 }),
    104: headlines({ revenue: 20e9, net_margin: 0.05 }),
  },
  'net_margin',
  'ratio',
  2,
  true
);
assert.equal(leaders[0].company.company, 'Apple');
assert.equal(leaders.length, 2);

const marginSnap = {
  101: headlines({ revenue: 700e9, net_margin: 0.11, rd: 80e9, rd_intensity: 0.11 }),
  102: headlines({ revenue: 680e9, net_margin: 0.03 }),
  103: headlines({ revenue: 390e9, net_margin: 0.27, rd: 30e9, rd_intensity: 0.08 }),
  104: headlines({ revenue: 20e9, net_margin: 0.05, rd: 8e9, rd_intensity: 0.4 }),
};
const suggestions = suggestComparisons(catalog[0], catalog, marginSnap, 3);
assert.ok(suggestions.some((s) => s.id === 'similar'));
assert.ok(suggestions.some((s) => s.id === 'margin-foil'));
assert.ok(suggestions.some((s) => s.id === 'rd'));
assert.ok(suggestions.every((s) => s.ranks[0] === 1));

for (const def of allDefs()) {
  assert.ok(def.eli5 && def.eli5.length > 40, `${def.key} needs an ELI5`);
  assert.ok(def.whyMissing && def.whyMissing.length > 10, `${def.key} needs whyMissing`);
  assert.ok(def.plain, `${def.key} needs a one-liner`);
}
for (const p of PRESETS) {
  assert.ok(p.blurb, `${p.id} needs a blurb`);
  assert.ok(p.ranks.length >= 2 && p.ranks.length <= 5);
}

const mapping = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../fortune-500/data/fortune500_edgar_mapping.json'), 'utf8')
);
const spacex = mapping.find((r) => r.rank === 236);
assert.equal(spacex.company, 'SpaceX');
assert.equal(spacex.status, 'no_ticker');
assert.equal(isPublic(spacex), false);
assert.equal(spacex.cik, 1181412, 'keep the mis-matched CIK on file');
const exxon = mapping.find((r) => r.rank === 9);
assert.equal(exxon.cik, 34088);
assert.equal(exxon.successor_cik, 2115436);

const apple = mapping.find((r) => r.rank === 4);
assert.equal(apple.company, 'Apple');
assert.equal(SUGGESTED_RANK, 4);
assert.equal(COURSE_STEPS.length, 4);
assert.deepEqual(COURSE_STEPS.map((s) => s.id), ['open', 'ratio', 'model', 'compare']);
assert.equal(HOW_TO.length, 3);
assert.ok(PURPOSE.includes('Year 0 is filed'));
const mid = courseProgress({ open: true, ratio: true });
assert.equal(mid.completed, 2);
assert.equal(mid.next.id, 'model');
assert.equal(mid.complete, false);
assert.equal(courseProgress({ open: true, ratio: true, model: true, compare: true }).complete, true);

console.log('fortune-500 insights tests passed');
