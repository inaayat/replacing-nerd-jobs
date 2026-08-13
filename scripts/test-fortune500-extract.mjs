import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractHeadlines,
  formatUsd,
  formatMetric,
  computeRatios,
  ensureRatios,
} from '../fortune-500/extract.js';

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/amzn-facts-mini.json'), 'utf8')
);

const h = extractHeadlines(fixture);
assert.equal(h.asOfYear, 2025);
assert.ok(h.metrics.revenue, 'revenue should be tagged for FY2025');
assert.equal(h.metrics.revenue.val, 716924000000);
assert.equal(h.metrics.revenue.tag, 'RevenueFromContractWithCustomerExcludingAssessedTax');
assert.equal(h.metrics.net_income.val, 77670000000);
assert.equal(h.metrics.assets.val, 818042000000);
assert.equal(h.metrics.operating_income.val, 79975000000);
assert.equal(h.metrics.operating_income.end.slice(0, 4), '2025');

// Stale GrossProfit (2009) must not be treated as a 2025 headline.
assert.equal(h.metrics.gross_profit, null);
assert.equal(h.ratios.gross_margin, null, 'missing gross profit → no 0% margin');

assert.ok(h.priorRevenue, 'prior-year revenue for YoY');
assert.equal(h.priorRevenue.end.slice(0, 4), '2024');
assert.ok(h.ratios.revenue_yoy > 0);
assert.ok(h.ratios.net_margin > 0 && h.ratios.net_margin < 1);

assert.equal(formatUsd(716924000000), '$716.9B');
assert.equal(formatMetric({ unit: 'USD' }, { val: 77670000000 }), '$77.7B');

const empty = extractHeadlines({ cik: 1, entityName: 'X', facts: { 'us-gaap': {} } });
assert.equal(empty.asOfYear, null);
assert.equal(empty.metrics.revenue, null);

const ratios = computeRatios(
  { revenue: { val: 100 }, net_income: { val: 10 }, assets: { val: 200 }, equity: { val: 50 }, gross_profit: null, operating_income: { val: 20 }, long_term_debt: { val: 25 } },
  { val: 80 }
);
assert.equal(ratios.gross_margin, null);
assert.equal(ratios.net_margin, 0.1);
assert.equal(ratios.roa, 0.05);
assert.equal(ratios.roe, 0.2);
assert.equal(ratios.debt_equity, 0.5);
assert.equal(ratios.rd_intensity, null);
assert.equal(ratios.fcf, null);
assert.ok(Math.abs(ratios.revenue_yoy - 0.25) < 1e-9);

const withCash = computeRatios(
  { revenue: { val: 100 }, cfo: { val: 40 }, capex: { val: 15 }, rd: { val: 8 } },
  null
);
assert.equal(withCash.fcf, 25, 'CapEx stored as a positive outflow is subtracted');
assert.equal(withCash.rd_intensity, 0.08);
assert.equal(withCash.fcf_margin, 0.25);
assert.equal(withCash.capex_intensity, 0.15);

const more = computeRatios(
  {
    revenue: { val: 100 },
    net_income: { val: 10 },
    assets: { val: 200 },
    equity: { val: 50 },
    cfo: { val: 12 },
    capex: { val: 4 },
    shares_out: { val: 5 },
    receivables: { val: 20 },
    long_term_debt: { val: 25 },
  },
  null
);
assert.equal(more.asset_turnover, 0.5);
assert.equal(more.leverage, 4);
assert.equal(more.cash_conversion, 1.2);
assert.equal(more.book_value_ps, 10);
assert.equal(more.receivables_days, 73);
assert.equal(more.debt_assets, 0.125);
assert.equal(more.fcf, 8);
assert.equal(more.fcf_margin, 0.08);

const negCapex = computeRatios(
  { cfo: { val: 40 }, capex: { val: -15 } },
  null
);
assert.equal(negCapex.fcf, 25, 'negative CapEx outflow is added');

const filled = ensureRatios({
  metrics: { revenue: { val: 100 }, net_income: { val: 10 }, cfo: { val: 30 }, capex: { val: 5 } },
  priorRevenue: { val: 80 },
  ratios: {},
});
assert.equal(filled.ratios.fcf, 25);
assert.ok(Math.abs(filled.ratios.revenue_yoy - 0.25) < 1e-9);

console.log('fortune-500 extract tests passed');
