import assert from 'node:assert/strict';
import { runStrategicAppraisal, defaultStrategicAssumptions } from '../financial-modeler/strategic-investment.js';
import { runMarketEntry, defaultMarketEntryAssumptions } from '../financial-modeler/market-entry.js';

{
  const m = runStrategicAppraisal(defaultStrategicAssumptions());
  assert.equal(m.ok, true);
  assert.equal(m.alternatives.length, 7);
  assert.ok(m.alternatives.find((a) => a.key === 'nothing'));
  assert.ok(finite(m.baseline.npv) || m.baseline.npv === 0);
  const build = m.alternatives.find((a) => a.key === 'build');
  assert.ok(build.incrementalNpv != null || build.npv != null);
}

{
  const m = runMarketEntry(defaultMarketEntryAssumptions());
  assert.equal(m.ok, true);
  assert.equal(m.structures.length, 6);
  assert.ok(m.preferredStructure);
  assert.equal(m.checks.fxIdentified, true);
}

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

console.log('test-financial-modeler-strategic-market: ok');
