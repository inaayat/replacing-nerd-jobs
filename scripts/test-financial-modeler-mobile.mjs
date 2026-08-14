/**
 * Phone walkthrough helpers: three-year truncation is display-only, the
 * engine still projects five years, and Excel stays a web-only callout.
 */
import assert from 'node:assert/strict';
import { defaultAssumptions, runThreeStatement } from '../financial-modeler/engine.js';
import {
  MOBILE_FORECAST_YEARS,
  MOBILE_MQ,
  WEB_ONLY_FEATURES,
  STATEMENT_PAGES,
  clampIndex,
  truncateModelRows,
  columnLabel,
  yearRangeNote,
  walkableDials,
  linesForStatement,
  mobileModelPages,
  renderMobileHtml,
  isMobileUi,
} from '../financial-modeler/mobile.js';

function point(val, extra = {}) {
  return { val, unit: 'USD', end: '2025-12-31', form: '10-K', tag: 'Test', ...extra };
}

function retailer() {
  const B = 1e9;
  return {
    cik: 1,
    entityName: 'Retailer Inc',
    asOfYear: 2025,
    metrics: {
      revenue: point(100 * B),
      net_income: point(8 * B),
      gross_profit: point(40 * B),
      operating_income: point(12 * B),
      assets: point(150 * B),
      liabilities: point(90 * B),
      equity: point(60 * B),
      cash: point(20 * B),
      receivables: point(10 * B),
      inventory: point(15 * B),
      long_term_debt: point(30 * B),
      capex: point(5 * B),
      cfo: point(14 * B),
      shares_out: point(1e9, { unit: 'shares' }),
    },
    ratios: { revenue_yoy: 0.05, gross_margin: 0.4, operating_margin: 0.12, capex_intensity: 0.05 },
  };
}

assert.equal(MOBILE_FORECAST_YEARS, 3);
assert.equal(MOBILE_MQ, '(max-width: 900px)');
assert.equal(isMobileUi(), false);
assert.equal(isMobileUi(() => ({ matches: true })), true);
assert.equal(isMobileUi(() => ({ matches: false })), false);

assert.deepEqual(
  WEB_ONLY_FEATURES.map((f) => f.id),
  ['excel', 'dcf', 'comps', 'scenarios', 'sensitivity', 'five-year', 'all-statements', 'all-assumptions']
);
assert.ok(WEB_ONLY_FEATURES.some((f) => /excel/i.test(f.label)));

assert.deepEqual(
  STATEMENT_PAGES.map((p) => p.id),
  ['income', 'cash', 'balance']
);
assert.equal(mobileModelPages('three').length, 3);
assert.equal(mobileModelPages('capital-project')[0].id, 'schedule');
assert.equal(mobileModelPages('strategic')[0].id, 'alts');
assert.equal(mobileModelPages('market-entry')[0].id, 'structures');

assert.equal(clampIndex(-1, 4), 0);
assert.equal(clampIndex(9, 4), 3);
assert.equal(clampIndex(1.8, 4), 1);
assert.equal(clampIndex(0, 0), 0);

{
  const headlines = retailer();
  const model = runThreeStatement(headlines, defaultAssumptions(headlines));
  assert.equal(model.ok, true);
  assert.equal(model.rows.length, 6, 'engine still projects filed year + five forecast years');
  const copy = model.rows.map((r) => r.year);
  const shown = truncateModelRows(model.rows);
  assert.equal(shown.length, 4, 'filed year plus three forecast years');
  assert.equal(shown[0].filed, true);
  assert.equal(shown[0].year, 2025);
  assert.equal(shown[shown.length - 1].year, 2028);
  assert.deepEqual(
    model.rows.map((r) => r.year),
    copy,
    'truncateModelRows must not mutate engine rows'
  );
  assert.equal(columnLabel(shown[0]), 'FY2025A');
  assert.equal(columnLabel(shown[1]), 'FY2026E');
  assert.match(yearRangeNote(shown), /FY2025A–FY2028E/);
  assert.match(yearRangeNote(shown), /Years 4–5 are on the web version/);

  const income = linesForStatement({ ...model, rows: shown }, 'income');
  const cash = linesForStatement({ ...model, rows: shown }, 'cash');
  const balance = linesForStatement({ ...model, rows: shown }, 'balance');
  assert.equal(income.at(-1).key, 'netIncome');
  assert.equal(income.at(-1).values.length, 4);
  assert.equal(cash.at(-1).key, 'netChangeCash');
  assert.equal(balance.at(-1).key, 'balanceCheck');
  assert.equal(
    linesForStatement({ ...model, rows: shown }, 'income').length,
    linesForStatement({ ...model, rows: model.rows }, 'income').length,
    'truncation changes columns, not which lines exist'
  );
}

{
  const unitRows = [{ year: 1, offset: 1 }, { year: 2 }, { year: 3 }, { year: 4 }, { year: 5 }];
  const shown = truncateModelRows(unitRows);
  assert.equal(shown.length, 3);
  assert.equal(columnLabel(shown[0], { unitKind: true }), 'Y1');
}

{
  const dials = [
    { key: 'revenueGrowth', name: 'Sales growth', fmt: 'pct', value: 0.05 },
    { key: 'grossMargin', name: 'Gross margin', fmt: 'pct', value: null },
    { key: 'secondaryEnabled', name: 'Secondary', fmt: 'bool', value: false },
    { key: 'utilizationRamp', name: 'Ramp', fmt: 'raw', value: [0.2, 1] },
  ];
  const walkable = walkableDials(dials, (d) => d.value);
  assert.deepEqual(
    walkable.map((d) => d.key),
    ['revenueGrowth', 'secondaryEnabled']
  );
}

{
  const html = renderMobileHtml({
    title: 'Retailer Inc',
    subtitle: 'AAPL · FY2025 10-K',
    statusOk: true,
    statusChip: 'Sheet ties',
    statusText: 'Balance sheet ties in every projected year.',
    dials: [
      {
        key: 'revenueGrowth',
        name: 'Sales growth',
        fmt: 'pct',
        what: 'How much bigger the company gets each year.',
        origin: 'Last year sales moved 5%.',
        token: 'filing',
        valueText: '5.0%',
        effect: 'Every line starts from this number.',
      },
    ],
    assumptionIndex: 0,
    statementId: 'income',
    pages: STATEMENT_PAGES,
    rows: [
      { year: 2025, filed: true, offset: 0, revenue: 1e11, netIncome: 8e9 },
      { year: 2026, filed: false, revenue: 1.05e11, netIncome: 9e9 },
      { year: 2027, filed: false, revenue: 1.1e11, netIncome: 9.5e9 },
      { year: 2028, filed: false, revenue: 1.16e11, netIncome: 1e10 },
    ],
    kind: 'three',
    assumptions: { grossMargin: 0.4, ebitMargin: 0.12 },
    scale: 1e6,
    unitLabel: 'US$ millions',
    yearNote: 'Showing FY2025A–FY2028E. Years 4–5 are on the web version.',
  });
  assert.match(html, /Assumption 1 of 1/);
  assert.match(html, /Sales growth/);
  assert.match(html, /Income statement/);
  assert.match(html, /FY2025A/);
  assert.match(html, /FY2028E/);
  assert.doesNotMatch(html, /FY2029/);
  assert.match(html, /On the web version/);
  assert.match(html, /Excel download/);
  assert.match(html, /DCF valuation/);
  assert.doesNotMatch(html, /Download Excel/);
  assert.match(html, /Phone walkthrough/);
  assert.match(html, /three years/);
}

console.log('financial modeler mobile tests passed');
