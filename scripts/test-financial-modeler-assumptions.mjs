/**
 * Assumption catalog, dependency map, and build-step metadata.
 */
import assert from 'node:assert/strict';
import { assumptionCatalog, isOverride, sourceToken, validateAssumption } from '../financial-modeler/assumptions.js';
import { dependencyPath, dependencyRowKeys } from '../financial-modeler/dependencies.js';
import { stepsForTab, THREE_STATEMENT_STEPS } from '../financial-modeler/build-steps.js';
import { previewForStep } from '../financial-modeler/checklist.js';
import { defaultAssumptions, runThreeStatement, runDcf } from '../financial-modeler/engine.js';

const catalog = assumptionCatalog(['three', 'dcf']);
assert.ok(catalog.length >= 14, 'catalog should include three-statement and DCF drivers');

const rg = catalog.find((c) => c.key === 'revenueGrowth');
assert.equal(rg.sourceType, 'historical-calculation');
assert.ok(rg.affects.includes('impliedPrice'));
assert.ok(rg.formulaText.includes('revenue'));

assert.deepEqual(dependencyPath('revenueGrowth'), [
  'Revenue',
  'EBIT',
  'Unlevered FCF',
  'Implied share price',
]);
assert.ok(dependencyRowKeys('revenueGrowth').includes('revenue'));
assert.ok(dependencyRowKeys('capacity', 'unit').includes('transactions'));
assert.ok(dependencyRowKeys('hurdleRate', 'capital').includes('projectNpv'));

assert.equal(stepsForTab('three').length, THREE_STATEMENT_STEPS.length);
assert.equal(stepsForTab('dcf').length, 5);
assert.equal(stepsForTab('comps').length, 6);

{
  const bad = validateAssumption(rg, 0.5);
  assert.equal(bad.valid, false);
  const ok = validateAssumption(rg, 0.05);
  assert.equal(ok.valid, true);
}

{
  const defaults = { revenueGrowth: 0.05, ebitMargin: 0.12 };
  assert.equal(isOverride('revenueGrowth', 0.05, defaults), false);
  assert.equal(isOverride('revenueGrowth', 0.08, defaults), true);
  assert.equal(sourceToken(rg, 0.05, { revenueGrowth: 0.05 }), 'filing');
  assert.equal(sourceToken(rg, 0.08, { revenueGrowth: 0.05 }), 'override');
  const tax = catalog.find((c) => c.key === 'taxRate');
  assert.equal(sourceToken(tax, 0.21, { taxRate: 0.21 }), 'assumption');
  assert.equal(sourceToken(tax, 0.25, { taxRate: 0.21 }), 'override');
}

{
  const headlines = {
    asOfYear: 2025,
    metrics: {
      revenue: { val: 100e9 },
      net_income: { val: 8e9 },
      gross_profit: { val: 40e9 },
      operating_income: { val: 12e9 },
      assets: { val: 150e9 },
      equity: { val: 60e9 },
      liabilities: { val: 90e9 },
      cash: { val: 20e9 },
      receivables: { val: 10e9 },
      inventory: { val: 15e9 },
      long_term_debt: { val: 30e9 },
      capex: { val: 5e9 },
      shares_out: { val: 1e9 },
    },
    ratios: { revenue_yoy: 0.05, gross_margin: 0.4, operating_margin: 0.12, capex_intensity: 0.05 },
  };
  const assumptions = defaultAssumptions(headlines);
  const model = runThreeStatement(headlines, assumptions);
  assert.equal(model.ok, true);
  const preview = previewForStep(THREE_STATEMENT_STEPS[0], {
    model,
    dcf: runDcf(model, { shares: 1e9 }),
    assumptions,
    peers: [],
  });
  assert.match(preview, /Year 1 revenue/);
}

console.log('test-financial-modeler-assumptions: ok');
