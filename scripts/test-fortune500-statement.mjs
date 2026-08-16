/**
 * Statement view model: years as columns, line items as rows.
 * Pure functions — no network, no secrets.
 */
import assert from 'node:assert/strict';
import {
  STATEMENT_ROWS,
  STATEMENT_KEYS,
  buildStatement,
  statementColumns,
  priorYearOf,
} from '../fortune-500/statement.js';
import { runPracticeModel, seedAssumptions } from '../fortune-500/model.js';
import { playbookById } from '../fortune-500/playbooks.js';
import { ensureRatios } from '../fortune-500/extract.js';

function point(val, end) {
  return { val, end, unit: 'USD', form: '10-K', fp: 'FY', tag: 'Test' };
}

const headlines = ensureRatios({
  cik: 320193,
  asOfYear: 2025,
  metrics: {
    revenue: point(400e9, '2025-09-27'),
    gross_profit: point(180e9, '2025-09-27'),
    operating_income: point(125e9, '2025-09-27'),
    net_income: point(100e9, '2025-09-27'),
    cfo: point(120e9, '2025-09-27'),
    capex: point(12e9, '2025-09-27'),
    cash: point(30e9, '2025-09-27'),
    long_term_debt: point(85e9, '2025-09-27'),
    rd: point(32e9, '2025-09-27'),
    assets: point(365e9, '2025-09-27'),
    equity: point(60e9, '2025-09-27'),
  },
  priorRevenue: point(380e9, '2024-09-28'),
  priorMetrics: {
    year: 2024,
    values: {
      revenue: 380e9,
      gross_profit: 170e9,
      operating_income: 118e9,
      net_income: 95e9,
      cfo: 110e9,
      capex: 10e9,
      cash: 28e9,
      long_term_debt: 90e9,
      rd: 30e9,
    },
  },
});

// Row order is the statement, not a pile of ratios.
assert.deepEqual(
  STATEMENT_ROWS.filter((r) => !r.detail).map((r) => r.label),
  ['Revenue', 'Gross profit', 'Operating income', 'Net income', 'Free cash flow', 'Cash and cash equivalents', 'Long-term debt']
);
assert.deepEqual(STATEMENT_KEYS, [
  'revenue',
  'gross_profit',
  'operating_income',
  'net_income',
  'fcf',
  'cash',
  'long_term_debt',
]);

// Filed only: prior year column first, then the filed year.
const filed = buildStatement(headlines);
assert.deepEqual(
  filed.columns.map((c) => [c.kind, c.label]),
  [
    ['prior', 'FY2024'],
    ['filed', 'FY2025'],
  ]
);
assert.equal(filed.hasPrior, true);
assert.equal(priorYearOf(headlines), 2024);

const revenue = filed.rows.find((r) => r.key === 'revenue');
assert.deepEqual(
  revenue.cells.map((c) => c.value),
  [380e9, 400e9]
);

// FCF is CFO − CapEx in both years, computed the same way for the prior column.
const fcf = filed.rows.find((r) => r.key === 'fcf');
assert.deepEqual(
  fcf.cells.map((c) => c.value),
  [100e9, 108e9]
);

// Growth reads across the columns; margins divide by that column's revenue.
const growth = filed.driverRows.find((r) => r.key === 'revenue_yoy');
assert.equal(growth.cells[0].value, null, 'no column before the prior year');
assert.ok(Math.abs(growth.cells[1].value - (400 / 380 - 1)) < 1e-12);
const netMargin = filed.driverRows.find((r) => r.key === 'net_margin');
assert.ok(Math.abs(netMargin.cells[0].value - 95 / 380) < 1e-12);
assert.ok(Math.abs(netMargin.cells[1].value - 100 / 400) < 1e-12);

// With a practice model: filed year, then one column per projected year.
const book = playbookById('generic');
const assumptions = { ...seedAssumptions(headlines, book), revenueGrowth: 0.1, netMargin: 0.25 };
const model = runPracticeModel(headlines, assumptions, book);
assert.equal(model.ok, true);
const projected = buildStatement(headlines, { model });
assert.deepEqual(
  projected.columns.map((c) => c.label),
  ['FY2024', 'FY2025', 'FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030']
);
assert.deepEqual(
  projected.columns.map((c) => c.kind),
  ['prior', 'filed', 'projected', 'projected', 'projected', 'projected', 'projected']
);

const projRevenue = projected.rows.find((r) => r.key === 'revenue');
assert.ok(Math.abs(projRevenue.cells[2].value - 400e9 * 1.1) < 1);
const projNi = projected.rows.find((r) => r.key === 'net_income');
assert.ok(Math.abs(projNi.cells[2].value - 400e9 * 1.1 * 0.25) < 1);

// We do not fake a balance sheet: cash and debt have no projected cells.
for (const key of ['cash', 'long_term_debt']) {
  const row = projected.rows.find((r) => r.key === key);
  assert.equal(row.projected, false);
  const forward = row.cells.filter((c) => c.kind === 'na');
  assert.equal(forward.length, 5, `${key} should have 5 unmodelled year cells`);
  assert.ok(forward.every((c) => c.value == null));
}
assert.ok(projected.notes.some((n) => /not a balance sheet/i.test(n)));

// Detail rows are opt-in.
assert.equal(buildStatement(headlines).rows.some((r) => r.key === 'rd'), false);
assert.equal(buildStatement(headlines, { detail: true }).rows.some((r) => r.key === 'rd'), true);

// The practice pane asks for only the lines the model moves, and no percent
// check figures — those live on the guess cards beside it.
const practice = buildStatement(headlines, {
  model,
  detail: true,
  projectedRowsOnly: true,
  drivers: false,
});
assert.deepEqual(
  practice.rows.map((r) => r.key),
  ['revenue', 'gross_profit', 'operating_income', 'net_income', 'fcf', 'rd', 'capex']
);
assert.ok(practice.rows.every((r) => r.projected));
assert.equal(practice.driverRows.length, 0);
// Nothing unprojected is on screen, so the balance-sheet caveat is not needed.
assert.equal(practice.notes.some((n) => /not a balance sheet/i.test(n)), false);
assert.deepEqual(practice.columns.map((c) => c.kind), projected.columns.map((c) => c.kind));

// Missing tags stay blank, never zero, and the prior column disappears when a
// snapshot predates prior-year values.
const thin = ensureRatios({
  asOfYear: 2025,
  metrics: { revenue: point(50e9, '2025-12-31'), net_income: point(4e9, '2025-12-31') },
});
const thinStatement = buildStatement(thin);
assert.deepEqual(thinStatement.columns.map((c) => c.kind), ['filed']);
assert.equal(thinStatement.hasPrior, false);
assert.equal(thinStatement.rows.find((r) => r.key === 'gross_profit').cells[0].value, null);
assert.equal(thinStatement.rows.find((r) => r.key === 'gross_profit').empty, true);
assert.ok(thinStatement.notes.some((n) => /no prior-year column/i.test(n)));

// Old payloads with only priorRevenue still get a prior revenue column.
const legacy = ensureRatios({
  asOfYear: 2025,
  metrics: { revenue: point(50e9, '2025-12-31'), net_income: point(4e9, '2025-12-31') },
  priorRevenue: point(45e9, '2024-12-31'),
});
const legacyStatement = buildStatement(legacy);
assert.deepEqual(legacyStatement.columns.map((c) => c.label), ['FY2024', 'FY2025']);
assert.deepEqual(
  legacyStatement.rows.find((r) => r.key === 'revenue').cells.map((c) => c.value),
  [45e9, 50e9]
);
assert.equal(legacyStatement.rows.find((r) => r.key === 'net_income').cells[0].value, null);

{
  const gddyDebt = ensureRatios({
    asOfYear: 2025,
    metrics: {
      revenue: point(4.951e9, '2025-12-31'),
      debt_current: { ...point(15.1e6, '2025-12-31'), tag: 'LongTermDebtCurrent' },
      debt_noncurrent: { ...point(3.7652e9, '2025-12-31'), tag: 'LongTermDebtNoncurrent' },
      long_term_debt: null,
    },
  });
  const debtRow = buildStatement(gddyDebt).rows.find((r) => r.key === 'long_term_debt');
  assert.equal(debtRow.cells[0].value, 3_765_200_000);
}

// A statement with no model has no projected columns at all.
assert.equal(statementColumns(headlines).some((c) => c.kind === 'projected'), false);

console.log('fortune-500 statement tests passed');
