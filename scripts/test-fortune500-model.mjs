import assert from 'node:assert/strict';
import { defaultAssumptions, runDriverModel } from '../fortune-500/model.js';

const headlines = {
  asOfYear: 2024,
  metrics: { revenue: { val: 100 } },
  ratios: { revenue_yoy: 0.1, net_margin: 0.2, fcf_margin: 0.05 },
};

const a = defaultAssumptions(headlines);
assert.equal(a.revenueGrowth, 0.1);
assert.equal(a.netMargin, 0.2);
assert.equal(a.fcfMargin, 0.05);

const model = runDriverModel(headlines, { ...a, years: 2 });
assert.equal(model.ok, true);
assert.equal(model.rows.length, 3);
assert.equal(model.rows[0].revenue, 100);
assert.equal(model.rows[0].filed, true);
assert.equal(model.rows[0].netIncome, 20);
assert.ok(Math.abs(model.rows[1].revenue - 110) < 1e-9);
assert.ok(Math.abs(model.rows[1].netIncome - 22) < 1e-9);
assert.ok(Math.abs(model.rows[2].revenue - 121) < 1e-9);

const noRev = runDriverModel({ asOfYear: 2024, metrics: {} }, a);
assert.equal(noRev.ok, false);

const noMargin = runDriverModel(
  { asOfYear: 2024, metrics: { revenue: { val: 50 } }, ratios: {} },
  { years: 1, revenueGrowth: 0, netMargin: null, fcfMargin: null }
);
assert.equal(noMargin.ok, true);
assert.equal(noMargin.rows[0].netIncome, null);
assert.equal(noMargin.rows[0].fcf, null);

console.log('fortune-500 model tests passed');
