/**
 * Scenario state: initialization, isolation, and active-case assumptions.
 */
import assert from 'node:assert/strict';
import { defaultAssumptions, runThreeStatement } from '../financial-modeler/engine.js';
import {
  createScenarioState,
  setActiveScenario,
  editScenarioValue,
  resetActiveScenario,
  assumptionsFromScenarioState,
  ensureScenarioInitialized,
  SCENARIO_DRIVERS,
} from '../financial-modeler/scenarios.js';

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

const defaults = defaultAssumptions(headlines());

{
  let state = createScenarioState(defaults);
  assert.equal(state.activeScenario, 'base');
  assert.equal(state.scenarios.base.values.revenueGrowth, defaults.revenueGrowth);
  assert.equal(state.initialized.base, true);
  assert.equal(state.initialized.upside, false);
}

{
  let state = createScenarioState(defaults);
  state = setActiveScenario(state, 'upside');
  assert.equal(state.activeScenario, 'upside');
  assert.equal(state.initialized.upside, true);
  const upsideGrowth = state.scenarios.upside.values.revenueGrowth;
  assert.ok(upsideGrowth > defaults.revenueGrowth);

  state = editScenarioValue(state, 'revenueGrowth', 0.25);
  assert.equal(state.scenarios.upside.values.revenueGrowth, 0.25);

  state = setActiveScenario(state, 'downside');
  state = ensureScenarioInitialized(state, 'downside');
  assert.notEqual(state.scenarios.downside.values.revenueGrowth, 0.25);

  state = setActiveScenario(state, 'upside');
  assert.equal(state.scenarios.upside.values.revenueGrowth, 0.25, 'upside edit preserved');
}

{
  let state = createScenarioState(defaults);
  state = setActiveScenario(state, 'base');
  const a = assumptionsFromScenarioState(state);
  const model = runThreeStatement(headlines(), a);
  assert.equal(model.ok, true);
  assert.ok(model.checks.balances);
}

{
  let state = createScenarioState(defaults);
  state = setActiveScenario(state, 'downside');
  const a = assumptionsFromScenarioState(state);
  const model = runThreeStatement(headlines(), a);
  assert.equal(model.ok, true);
  assert.ok(model.checks.balances);
}

{
  let state = createScenarioState(defaults);
  state = editScenarioValue(state, 'revenueGrowth', 0.12);
  state = resetActiveScenario(state, defaults);
  assert.equal(state.scenarios.base.values.revenueGrowth, defaults.revenueGrowth);
}

assert.ok(SCENARIO_DRIVERS.includes('revenueGrowth'));
assert.ok(SCENARIO_DRIVERS.includes('terminalGrowth'));

console.log('test-financial-modeler-scenarios: ok');
