/**
 * Sensitivity matrix construction, center-cell parity, monotonicity, goal seek.
 */
import assert from 'node:assert/strict';
import {
  defaultAssumptions,
  runThreeStatement,
  runDcf,
  dcfSensitivity,
} from '../financial-modeler/engine.js';
import {
  runSensitivityMatrix,
  checkMonotonicity,
  goalSeek,
  SENSITIVITY_PRESETS,
} from '../financial-modeler/sensitivity.js';

const B = 1e9;

function headlines() {
  return {
    asOfYear: 2025,
    metrics: {
      revenue: { val: 100 * B },
      net_income: { val: 8 * B },
      gross_profit: { val: 40 * B },
      operating_income: { val: 12 * B },
      assets: { val: 150 * B },
      equity: { val: 60 * B },
      liabilities: { val: 90 * B },
      cash: { val: 20 * B },
      receivables: { val: 10 * B },
      inventory: { val: 15 * B },
      long_term_debt: { val: 30 * B },
      capex: { val: 5 * B },
      shares_out: { val: 1e9 },
    },
    ratios: { revenue_yoy: 0.05, gross_margin: 0.4, operating_margin: 0.12, capex_intensity: 0.05 },
  };
}

const h = headlines();
const assumptions = defaultAssumptions(h);
const model = runThreeStatement(h, assumptions);
const dcf = runDcf(model, { price: 100, shares: 1e9 });
const ctx = { headlines: h, assumptions, model, dcf, shares: 1e9, price: 100, peers: [] };

{
  const sens = dcfSensitivity(model, dcf, { shares: 1e9 });
  const matrix = runSensitivityMatrix('dcfWaccGrowth', ctx);
  assert.equal(matrix.rows.length, sens.rows.length);
  assert.ok(Math.abs(matrix.centerValue - dcf.impliedPrice) < 1e-6);
  assert.ok(matrix.rows[4].cells[2] < matrix.rows[0].cells[2]);
  assert.ok(matrix.rows[2].cells[4] > matrix.rows[2].cells[0]);
  const mono = checkMonotonicity(matrix);
  assert.equal(mono.ok, true);
}

{
  const baseNi = model.rows.find((r) => r.offset === 1).netIncome;
  const matrix = runSensitivityMatrix('opsGrowthMargin', ctx);
  assert.ok(matrix.rows.length === 5);
  assert.ok(Math.abs(matrix.centerValue - baseNi) < 1e3);
  const patchedAssumptions = { ...assumptions };
  assert.equal(patchedAssumptions.revenueGrowth, assumptions.revenueGrowth, 'base assumptions unchanged');
}

{
  const targetNi = model.rows.find((r) => r.offset === 1).netIncome * 1.1;
  const result = goalSeek({
    targetOutput: 'netIncome',
    targetValue: targetNi,
    inputKey: 'revenueGrowth',
    assumptions,
    min: -0.05,
    max: 0.35,
    evaluate: (patch) => {
      const m = runThreeStatement(h, patch);
      return m.ok ? m.rows.find((r) => r.offset === 1).netIncome : null;
    },
  });
  assert.equal(result.ok, true);
  assert.ok(result.solved != null);
  const check = runThreeStatement(h, { ...assumptions, revenueGrowth: result.solved });
  assert.ok(Math.abs(check.rows.find((r) => r.offset === 1).netIncome - targetNi) < 1e6);
}

{
  const bad = goalSeek({
    targetValue: 1e15,
    inputKey: 'revenueGrowth',
    assumptions,
    min: 0,
    max: 0.1,
    evaluate: (patch) => runThreeStatement(h, patch).rows.find((r) => r.offset === 1).netIncome,
  });
  assert.equal(bad.unreachable, true);
}

assert.ok(SENSITIVITY_PRESETS.dcfWaccGrowth);
console.log('test-financial-modeler-sensitivity: ok');
