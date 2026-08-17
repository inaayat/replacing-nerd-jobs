/**
 * Workspace draft: CIK-keyed persistence and year-0 typed overlays.
 */
import assert from 'node:assert/strict';
import {
  DRAFT_STORAGE_KEY,
  DRAFT_SCHEMA,
  emptyDraft,
  parseDraft,
  loadDraft,
  saveDraft,
  readCikDraft,
  writeCikDraft,
  applyYear0Inputs,
  YEAR0_METRIC,
} from '../financial-modeler/workspace-draft.js';
import { defaultAssumptions, runThreeStatement } from '../financial-modeler/engine.js';

function memStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    _data: data,
  };
}

function point(val) {
  return { val, unit: 'USD', end: '2025-12-31', form: '10-K', tag: 'Test' };
}

{
  assert.equal(YEAR0_METRIC.cash, 'cash');
  assert.equal(YEAR0_METRIC.debt, 'long_term_debt');
  assert.equal(YEAR0_METRIC.cogs, 'cogs');
  assert.deepEqual(parseDraft(null), emptyDraft());
  assert.deepEqual(parseDraft({ schema: 99, byCik: { 1: {} } }), emptyDraft());
}

{
  const store = memStore();
  const session = { assumptions: { revenueGrowth: 0.08 }, year0: { cash: 1.08e9 } };
  saveDraft(store, writeCikDraft(emptyDraft(), 1609711, session));
  const loaded = loadDraft(store);
  assert.equal(loaded.schema, DRAFT_SCHEMA);
  assert.equal(loaded.lastCik, '1609711');
  assert.equal(readCikDraft(loaded, 1609711).assumptions.revenueGrowth, 0.08);
  assert.equal(readCikDraft(loaded, 1609711).year0.cash, 1.08e9);
  assert.equal(readCikDraft(loaded, 999), null);
  assert.ok(store._data[DRAFT_STORAGE_KEY]);
}

{
  const headlines = {
    asOfYear: 2025,
    metrics: {
      revenue: point(100e9),
      net_income: point(8e9),
      operating_income: point(12e9),
      assets: point(150e9),
      liabilities: point(90e9),
      equity: point(60e9),
      cash: null,
      long_term_debt: null,
      receivables: point(10e9),
      inventory: point(15e9),
    },
  };
  const overlaid = applyYear0Inputs(headlines, { cash: 2e9, long_term_debt: 4e9 });
  assert.equal(overlaid.metrics.cash.val, 2e9);
  assert.equal(overlaid.metrics.long_term_debt.val, 4e9);
  const model = runThreeStatement(overlaid, defaultAssumptions(overlaid));
  assert.equal(model.ok, true);
  assert.equal(model.rows[0].cash, 2e9);
  assert.equal(model.rows[0].debt, 4e9);
  assert.ok(Number.isFinite(model.rows[1].cash));
}

{
  const headlines = {
    asOfYear: 2025,
    metrics: {
      revenue: point(100e9),
      net_income: point(8e9),
      operating_income: point(12e9),
      assets: point(150e9),
      liabilities: point(90e9),
      equity: point(60e9),
      cash: point(20e9),
      long_term_debt: point(30e9),
      gross_profit: null,
      cogs: null,
    },
  };
  const overlaid = applyYear0Inputs(headlines, { cogs: 60e9 });
  assert.equal(overlaid.metrics.cogs.val, 60e9);
  assert.ok(overlaid.metrics.gross_profit?.val > 0, 'typed COGS derives gross profit');
  const model = runThreeStatement(overlaid, defaultAssumptions(overlaid));
  assert.equal(model.ok, true);
  assert.ok(model.rows[0].cogs < 0);
  assert.ok(Number.isFinite(model.rows[0].grossProfit));
}

console.log('financial modeler workspace draft tests passed');
