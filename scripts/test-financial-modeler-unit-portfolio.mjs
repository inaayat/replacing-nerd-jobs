/**
 * Return metrics and single-unit portfolio engine tests.
 */
import assert from 'node:assert/strict';
import { npv, irr, paybackPeriod, peakFunding, breakevenUtilization } from '../financial-modeler/returns.js';
import {
  defaultSingleUnitAssumptions,
  defaultPortfolioCohorts,
  runSingleUnitPortfolio,
  rampFactor,
} from '../financial-modeler/unit-portfolio.js';

assert.ok(Math.abs(npv(0.1, [100, 100, 100]) - 248.685) < 0.01);
{
  const r = irr([-100, 30, 40, 50, 60]);
  assert.ok(r != null && r > 0.1 && r < 0.25);
}
assert.ok(paybackPeriod([-100, 40, 40, 40]) >= 2 && paybackPeriod([-100, 40, 40, 40]) <= 3.5);
assert.equal(peakFunding([-50, -30, 80, 20]), 80);

{
  const be = breakevenUtilization({ capacity: 10000, fixedCosts: 50000, contributionPerTxn: 5 });
  assert.ok(Math.abs(be - 1) < 1e-9, 'needs full capacity at these numbers');
}

{
  const a = defaultSingleUnitAssumptions('lemonade');
  const model = runSingleUnitPortfolio(a);
  assert.equal(model.ok, true);
  assert.equal(model.kind, 'single-unit');
  assert.equal(model.checks.balances, true, `imbalance ${model.checks.worstImbalance}`);
  assert.ok(model.rows[0].revenue > 0);
  assert.ok(model.returns.unitNpv != null);
  assert.ok(model.unitYears[0].contributionMargin > 0);
}

{
  const blank = runSingleUnitPortfolio(defaultSingleUnitAssumptions('blank'));
  assert.equal(blank.checks.balances, true);
}

{
  const port = runSingleUnitPortfolio({
    ...defaultSingleUnitAssumptions('blank'),
    portfolioEnabled: true,
    capacity: 12000,
    utilization: 0.7,
    corePrice: 6,
    variableCostPerTxn: 2,
    openingCosts: 100000,
    openingCash: 200000,
    cohorts: defaultPortfolioCohorts(),
    years: 8,
  });
  assert.equal(port.checks.balances, true);
  assert.ok(port.rows.some((r) => r.activeUnits > 1), 'portfolio adds units');
  assert.ok(port.returns.peakFunding > 0);
}

{
  assert.equal(rampFactor(0, 6), 0);
  assert.equal(rampFactor(6, 6), 1);
  assert.ok(Math.abs(rampFactor(3, 6) - 0.5) < 1e-9);
}

console.log('test-financial-modeler-unit-portfolio: ok');
