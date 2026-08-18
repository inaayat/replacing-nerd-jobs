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
  explainCalculation,
  sanityFlags,
  ordinal,
  IMPLIED_LIABILITIES_TAG,
  liabilityComponents,
  debtStock,
} from '../fortune-500/extract.js';
import { studentText } from '../fortune-500/metric-packs.js';
import { METRICS } from '../fortune-500/catalog.js';

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

const explained = explainCalculation(
  {
    metrics: {
      revenue: { val: 100, tag: 'Revenues', form: '10-K', end: '2024-12-31', filed: '2025-02-01' },
      net_income: { val: 10, tag: 'NetIncomeLoss', form: '10-K', end: '2024-12-31', filed: '2025-02-01' },
    },
    ratios: { net_margin: 0.1 },
  },
  'net_margin'
);
assert.equal(explained.arithmetic, '$10 ÷ $100 = 10.0%');
assert.equal(explained.parts.length, 2);
assert.equal(explained.parts[0].tag, 'NetIncomeLoss');
assert.equal(explained.parts[1].tag, 'Revenues');

const missing = explainCalculation(
  { metrics: { revenue: { val: 100, tag: 'Revenues', form: '10-K' } }, ratios: { gross_margin: null } },
  'gross_margin'
);
assert.equal(missing.arithmetic, null);
assert.equal(missing.parts[0].missing, true);

const bothTags = extractHeadlines({
  cik: 1393612,
  entityName: 'Discover-like',
  facts: {
    'us-gaap': {
      Revenues: {
        units: {
          USD: [
            {
              val: 20000000000,
              start: '2024-01-01',
              end: '2024-12-31',
              fy: 2024,
              fp: 'FY',
              form: '10-K',
              filed: '2025-01-01',
            },
          ],
        },
      },
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            {
              val: 2800000000,
              start: '2024-01-01',
              end: '2024-12-31',
              fy: 2024,
              fp: 'FY',
              form: '10-K',
              filed: '2025-02-20',
            },
          ],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [
            {
              val: 4500000000,
              start: '2024-01-01',
              end: '2024-12-31',
              fy: 2024,
              fp: 'FY',
              form: '10-K',
              filed: '2025-02-20',
            },
          ],
        },
      },
    },
  },
});
assert.equal(bothTags.metrics.revenue.tag, 'Revenues');
assert.equal(bothTags.metrics.revenue.val, 20000000000);
assert.ok(bothTags.ratios.net_margin < 1);

/**
 * Broker-dealers and several big banks (Goldman, Morgan Stanley, Wells Fargo)
 * only tag their top line as RevenuesNetOfInterestExpense. Without it there is
 * no revenue at all, so every margin, turnover and growth figure is blank.
 */
function annual(val, year, extra = {}) {
  return {
    units: {
      USD: [
        {
          val,
          start: `${year}-01-01`,
          end: `${year}-12-31`,
          fy: year,
          fp: 'FY',
          form: '10-K',
          filed: `${year + 1}-02-20`,
          ...extra,
        },
      ],
    },
  };
}

const brokerDealer = extractHeadlines({
  cik: 886982,
  entityName: 'Goldman-like',
  facts: {
    'us-gaap': {
      RevenuesNetOfInterestExpense: annual(58.3e9, 2025),
      NoninterestIncome: annual(44.7e9, 2025),
      InterestAndDividendIncomeOperating: annual(80.4e9, 2025),
      NetIncomeLoss: annual(17.2e9, 2025),
    },
  },
});
assert.equal(brokerDealer.metrics.revenue.tag, 'RevenuesNetOfInterestExpense');
assert.equal(brokerDealer.metrics.revenue.val, 58.3e9);
assert.ok(brokerDealer.ratios.net_margin > 0.29 && brokerDealer.ratios.net_margin < 0.3);

// A utility that tags both keeps total operating revenues, not the smaller
// contract-revenue subset (NextEra files $27.4B against $25.8B).
const utility = extractHeadlines({
  cik: 753308,
  entityName: 'NextEra-like',
  facts: {
    'us-gaap': {
      RegulatedAndUnregulatedOperatingRevenue: annual(27.4e9, 2025),
      RevenueFromContractWithCustomerIncludingAssessedTax: annual(25.8e9, 2025),
      NetIncomeLoss: annual(7e9, 2025),
    },
  },
});
assert.equal(utility.metrics.revenue.tag, 'RegulatedAndUnregulatedOperatingRevenue');
assert.equal(utility.metrics.revenue.val, 27.4e9);

// Retailers that only tag revenue including assessed tax are left blank —
// that line can include sales tax, so it is not a safe synonym for revenue.
const retailer = extractHeadlines({
  cik: 109198,
  entityName: 'TJX-like',
  facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerIncludingAssessedTax: annual(60.4e9, 2025),
      NetIncomeLoss: annual(4.9e9, 2025),
    },
  },
});
assert.equal(retailer.metrics.revenue, null);

// The sales-tax-free variant still wins when a filer tags both.
const bothAssessed = extractHeadlines({
  cik: 2,
  entityName: 'Both-variants',
  facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: annual(100e9, 2025),
      RevenueFromContractWithCustomerIncludingAssessedTax: annual(106e9, 2025),
      NetIncomeLoss: annual(10e9, 2025),
    },
  },
});
assert.equal(bothAssessed.metrics.revenue.tag, 'RevenueFromContractWithCustomerExcludingAssessedTax');

// A filer that tags both keeps the plain total; the bank tag is only a fallback.
const bothRevenueTags = extractHeadlines({
  cik: 19617,
  entityName: 'JPMorgan-like',
  facts: {
    'us-gaap': {
      Revenues: annual(182.4e9, 2025),
      RevenuesNetOfInterestExpense: annual(1e9, 2025),
      NetIncomeLoss: annual(57e9, 2025),
    },
  },
});
assert.equal(bothRevenueTags.metrics.revenue.tag, 'Revenues');
assert.equal(bothRevenueTags.metrics.revenue.val, 182.4e9);

const feeOnly = computeRatios(
  {
    revenue: { val: 2797000000, tag: 'RevenueFromContractWithCustomerExcludingAssessedTax' },
    net_income: { val: 4535000000 },
    cfo: { val: 8425000000 },
    capex: { val: 268000000 },
  },
  null
);
assert.equal(feeOnly.net_margin, null, 'impossible net margin is dashed');
assert.equal(feeOnly.fcf_margin, null, 'impossible FCF margin is dashed');
const feeFlags = sanityFlags(
  {
    revenue: { val: 2797000000, tag: 'RevenueFromContractWithCustomerExcludingAssessedTax' },
    net_income: { val: 4535000000 },
    cfo: { val: 8425000000 },
    capex: { val: 268000000 },
  },
  feeOnly
);
assert.equal(feeFlags.net_margin, 'impossible_margin');
assert.equal(feeFlags.revenue, 'fee_subtotal');

const appleish = ensureRatios({
  metrics: { revenue: { val: 400e9 }, net_income: { val: 112e9 }, equity: { val: 73e9 } },
  ratios: {},
});
assert.ok(appleish.ratios.roe > 1);
assert.equal(appleish.flags.roe, 'thin_equity');

assert.equal(ordinal(92), '92nd');
assert.equal(ordinal(91), '91st');
assert.equal(ordinal(93), '93rd');
assert.equal(ordinal(11), '11th');
assert.equal(ordinal(12), '12th');
assert.equal(ordinal(13), '13th');
assert.equal(ordinal(1), '1st');

{
  const fpi = extractHeadlines({
    cik: 1576789,
    entityName: 'Wix-like',
    facts: {
      'us-gaap': {
        Revenues: {
          units: {
            USD: [
              {
                val: 1.76e9,
                start: '2024-01-01',
                end: '2024-12-31',
                fy: 2024,
                fp: 'FY',
                form: '20-F',
                filed: '2025-03-20',
              },
            ],
          },
        },
        NetIncomeLoss: {
          units: {
            USD: [
              {
                val: 0.14e9,
                start: '2024-01-01',
                end: '2024-12-31',
                fy: 2024,
                fp: 'FY',
                form: '20-F',
                filed: '2025-03-20',
              },
            ],
          },
        },
      },
    },
  });
  assert.equal(fpi.asOfYear, 2024);
  assert.equal(fpi.metrics.revenue.val, 1.76e9);
  assert.equal(fpi.metrics.revenue.form, '20-F');
  assert.equal(fpi.metrics.net_income.val, 0.14e9);
}

{
  const ifrs = extractHeadlines({
    cik: 1858985,
    entityName: 'On-like',
    facts: {
      'ifrs-full': {
        RevenueFromContractsWithCustomers: {
          units: {
            CHF: [
              {
                val: 3.014e9,
                start: '2025-01-01',
                end: '2025-12-31',
                fy: 2025,
                fp: 'FY',
                form: '20-F',
                filed: '2026-03-01',
              },
            ],
          },
        },
        ProfitLossAttributableToOwnersOfParent: {
          units: {
            CHF: [
              {
                val: 2.8e8,
                start: '2025-01-01',
                end: '2025-12-31',
                fy: 2025,
                fp: 'FY',
                form: '20-F',
                filed: '2026-03-01',
              },
            ],
          },
        },
        Assets: {
          units: {
            CHF: [
              {
                val: 2.8e9,
                end: '2025-12-31',
                fy: 2025,
                fp: 'FY',
                form: '20-F',
                filed: '2026-03-01',
              },
            ],
          },
        },
        Equity: {
          units: {
            CHF: [
              {
                val: 1.6e9,
                end: '2025-12-31',
                fy: 2025,
                fp: 'FY',
                form: '20-F',
                filed: '2026-03-01',
              },
            ],
          },
        },
      },
    },
  });
  assert.equal(ifrs.asOfYear, 2025);
  assert.equal(ifrs.metrics.revenue.val, 3.014e9);
  assert.equal(ifrs.metrics.revenue.unit, 'CHF');
  assert.equal(ifrs.metrics.revenue.form, '20-F');
  assert.equal(ifrs.metrics.assets.val, 2.8e9);
}

{
  // Extended packs: Amazon fixture has no PP&E tag → null, not zero.
  assert.equal(h.metrics.ppe_net, null);
  assert.equal(h.metrics.accounts_payable, null);
  assert.ok(h.seriesAnnual, 'annual series object');
  assert.ok(h.seriesAnnual.revenue.length >= 4, 'multi-year revenue series');
  assert.equal(h.seriesAnnual.revenue.at(-1).year, 2025);
  assert.equal(h.seriesAnnual.revenue.at(-1).val, 716924000000);
}

{
  const leaseFacts = {
    cik: 1,
    entityName: 'Lease Co',
    facts: {
      'us-gaap': {
        Revenues: {
          units: {
            USD: [
              {
                val: 100,
                start: '2025-01-01',
                end: '2025-12-31',
                fy: 2025,
                fp: 'FY',
                form: '10-K',
                filed: '2026-02-01',
              },
            ],
          },
        },
        NetIncomeLoss: {
          units: {
            USD: [
              {
                val: 10,
                start: '2025-01-01',
                end: '2025-12-31',
                fy: 2025,
                fp: 'FY',
                form: '10-K',
                filed: '2026-02-01',
              },
            ],
          },
        },
        Assets: {
          units: {
            USD: [{ val: 200, end: '2025-12-31', fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-01' }],
          },
        },
        OperatingLeaseLiabilityCurrent: {
          units: {
            USD: [{ val: 20, end: '2025-12-31', fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-01' }],
          },
        },
        OperatingLeaseLiabilityNoncurrent: {
          units: {
            USD: [{ val: 80, end: '2025-12-31', fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-01' }],
          },
        },
        IncomeTaxExpenseBenefit: {
          units: {
            USD: [
              {
                val: 4,
                start: '2025-01-01',
                end: '2025-12-31',
                fy: 2025,
                fp: 'FY',
                form: '10-K',
                filed: '2026-02-01',
              },
            ],
          },
        },
        IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: {
          units: {
            USD: [
              {
                val: 20,
                start: '2025-01-01',
                end: '2025-12-31',
                fy: 2025,
                fp: 'FY',
                form: '10-K',
                filed: '2026-02-01',
              },
            ],
          },
        },
      },
    },
  };
  const lease = extractHeadlines(leaseFacts);
  assert.equal(lease.metrics.operating_lease_liability.val, 100);
  assert.equal(lease.metrics.operating_lease_liability.tag, 'OperatingLeaseLiabilityCurrent+Noncurrent');
  assert.equal(lease.ratios.effective_tax_rate, 0.2);
}

{
  const revenue = METRICS.find((m) => m.key === 'revenue');
  const copy = studentText(revenue);
  assert.ok(copy.startsWith('How much customers paid this year.'));
  assert.ok(copy.includes('starting point of the income statement'));
}

{
  const annual = (val, end, fy) => [{
    val,
    end,
    fy,
    fp: 'FY',
    form: '10-K',
    filed: `${fy + 1}-02-01`,
  }];
  const duration = (val, start, end, fy) => [{
    val,
    start,
    end,
    fy,
    fp: 'FY',
    form: '10-K',
    filed: `${fy + 1}-02-01`,
  }];
  const noRollup = extractHeadlines({
    cik: 2,
    entityName: 'No Liab Tag Inc',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(50, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(5, '2025-01-01', '2025-12-31', 2025) } },
        Assets: {
          units: {
            USD: [
              ...annual(80, '2024-12-31', 2024),
              ...annual(100, '2025-12-31', 2025),
            ],
          },
        },
        StockholdersEquity: {
          units: {
            USD: [
              ...annual(30, '2024-12-31', 2024),
              ...annual(40, '2025-12-31', 2025),
            ],
          },
        },
        LongTermDebtNoncurrent: { units: { USD: annual(25, '2025-12-31', 2025) } },
        AccountsPayableCurrent: { units: { USD: annual(10, '2025-12-31', 2025) } },
      },
    },
  });
  assert.equal(noRollup.metrics.liabilities.val, 60);
  assert.equal(noRollup.metrics.liabilities.tag, IMPLIED_LIABILITIES_TAG);
  assert.equal(noRollup.metrics.liabilities.derived, true);
  assert.equal(noRollup.metrics.debt_noncurrent.val, 25);
  assert.equal(noRollup.metrics.accounts_payable.val, 10);
  const pieces = liabilityComponents(noRollup.metrics);
  assert.deepEqual(
    pieces.map((p) => p.key),
    ['debt_noncurrent', 'accounts_payable']
  );
  const fy24 = noRollup.seriesAnnual.liabilities.find((r) => r.year === 2024);
  assert.equal(fy24.val, 50);
  assert.equal(noRollup.priorMetrics.values.liabilities, 50);

  const tagged = extractHeadlines({
    cik: 3,
    entityName: 'Has Liab Tag Inc',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(50, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(5, '2025-01-01', '2025-12-31', 2025) } },
        Assets: { units: { USD: annual(100, '2025-12-31', 2025) } },
        StockholdersEquity: { units: { USD: annual(40, '2025-12-31', 2025) } },
        Liabilities: { units: { USD: annual(77, '2025-12-31', 2025) } },
      },
    },
  });
  assert.equal(tagged.metrics.liabilities.val, 77, 'tagged roll-up wins over assets − equity');
  assert.equal(tagged.metrics.liabilities.tag, 'Liabilities');
  assert.equal(tagged.metrics.liabilities.derived, undefined);

  const fromSnap = ensureRatios({
    metrics: {
      assets: { val: 100, tag: 'Assets' },
      equity: { val: 15, tag: 'StockholdersEquity' },
      liabilities: null,
      debt_current: { val: 8, tag: 'LongTermDebtCurrent' },
    },
  });
  assert.equal(fromSnap.metrics.liabilities.val, 85);
  assert.equal(fromSnap.metrics.liabilities.tag, IMPLIED_LIABILITIES_TAG);
}

{
  const impliedEquity = extractHeadlines({
    entityName: 'REIT Example',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: [{ val: 100, start: '2025-01-01', end: '2025-12-31', fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-01' }] } },
        NetIncomeLoss: { units: { USD: [{ val: 10, start: '2025-01-01', end: '2025-12-31', fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-01' }] } },
        OperatingIncomeLoss: { units: { USD: [{ val: 20, start: '2025-01-01', end: '2025-12-31', fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-01' }] } },
        Assets: { units: { USD: [{ val: 200, end: '2025-12-31', fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-01' }] } },
        Liabilities: { units: { USD: [{ val: 120, end: '2025-12-31', fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-01' }] } },
      },
    },
  });
  assert.equal(impliedEquity.metrics.equity.val, 80);
  assert.equal(impliedEquity.metrics.equity.tag, 'Assets-Liabilities');
}

{
  const instant = (val, end, fy) => [{
    val,
    end,
    fy,
    fp: 'FY',
    form: '10-K',
    filed: `${fy + 1}-02-01`,
  }];
  const duration = (val, start, end, fy) => [{
    val,
    start,
    end,
    fy,
    fp: 'FY',
    form: '10-K',
    filed: `${fy + 1}-02-01`,
  }];
  // Combined cash + restricted-cash is a different line; do not use it as cash.
  const gddyLike = extractHeadlines({
    cik: 1609711,
    entityName: 'GoDaddy-like',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(50, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(5, '2025-01-01', '2025-12-31', 2025) } },
        CashAndCashEquivalentsAtCarryingValue: { units: { USD: instant(932.4e6, '2018-12-31', 2018) } },
        CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: {
          units: { USD: instant(1080.9e6, '2025-12-31', 2025) },
        },
      },
    },
  });
  assert.equal(gddyLike.metrics.cash, null);

  const bothCash = extractHeadlines({
    cik: 3,
    entityName: 'Both cash tags',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(50, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(5, '2025-01-01', '2025-12-31', 2025) } },
        CashAndCashEquivalentsAtCarryingValue: { units: { USD: instant(100, '2025-12-31', 2025) } },
        CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: {
          units: { USD: instant(130, '2025-12-31', 2025) },
        },
      },
    },
  });
  assert.equal(bothCash.metrics.cash.val, 100, 'prefer cash & equivalents over the restricted-cash combined tag');
  assert.equal(bothCash.metrics.cash.tag, 'CashAndCashEquivalentsAtCarryingValue');

  const gddyDebt = extractHeadlines({
    cik: 1609711,
    entityName: 'GoDaddy-like debt',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(50, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(5, '2025-01-01', '2025-12-31', 2025) } },
        LongTermDebtNoncurrent: { units: { USD: instant(3765.2e6, '2025-12-31', 2025) } },
      },
    },
  });
  assert.equal(gddyDebt.metrics.long_term_debt.val, 3765.2e6);
  assert.equal(gddyDebt.metrics.long_term_debt.tag, 'LongTermDebtNoncurrent');

  const legacyDebt = extractHeadlines({
    cik: 1,
    entityName: 'Legacy debt tag',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(50, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(5, '2025-01-01', '2025-12-31', 2025) } },
        LongTermDebt: { units: { USD: instant(100, '2025-12-31', 2025) } },
        LongTermDebtNoncurrent: { units: { USD: instant(90, '2025-12-31', 2025) } },
      },
    },
  });
  assert.equal(legacyDebt.metrics.long_term_debt.val, 90, 'noncurrent tag is the labeled line when both exist');
  assert.equal(legacyDebt.metrics.long_term_debt.tag, 'LongTermDebtNoncurrent');

  const onlyLegacyDebt = extractHeadlines({
    cik: 1,
    entityName: 'Ambiguous LongTermDebt',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(50, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(5, '2025-01-01', '2025-12-31', 2025) } },
        LongTermDebt: { units: { USD: instant(100, '2025-12-31', 2025) } },
      },
    },
  });
  assert.equal(onlyLegacyDebt.metrics.long_term_debt, null, 'LongTermDebt alone is sometimes a total, so leave blank');

  const fromSnap = ensureRatios({
    metrics: {
      revenue: { val: 100 },
      net_income: { val: 10 },
      assets: { val: 200 },
      equity: { val: 50 },
      long_term_debt: null,
      debt_noncurrent: { val: 25, tag: 'LongTermDebtNoncurrent', taxonomy: 'us-gaap' },
    },
  });
  assert.equal(fromSnap.metrics.long_term_debt.val, 25);
  assert.equal(fromSnap.metrics.long_term_debt.tag, 'LongTermDebtNoncurrent');
  assert.equal(fromSnap.ratios.debt_equity, 0.5);

  const derivedGross = extractHeadlines({
    cik: 2,
    entityName: 'Derived gross profit',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(100, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(10, '2025-01-01', '2025-12-31', 2025) } },
        CostOfRevenue: { units: { USD: duration(65, '2025-01-01', '2025-12-31', 2025) } },
      },
    },
  });
  assert.equal(derivedGross.metrics.gross_profit.val, 35);
  assert.equal(derivedGross.metrics.gross_profit.derived, true);
  assert.equal(derivedGross.metrics.gross_profit.formula, 'revenue − cost of goods and services sold');
  assert.equal(derivedGross.ratios.gross_margin, 0.35);

  const reportedGross = extractHeadlines({
    cik: 3,
    entityName: 'Reported gross profit',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(100, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(10, '2025-01-01', '2025-12-31', 2025) } },
        GrossProfit: { units: { USD: duration(40, '2025-01-01', '2025-12-31', 2025) } },
        CostOfRevenue: { units: { USD: duration(65, '2025-01-01', '2025-12-31', 2025) } },
      },
    },
  });
  assert.equal(reportedGross.metrics.gross_profit.val, 40, 'reported gross profit wins over calculation');
  assert.equal(reportedGross.metrics.gross_profit.derived, undefined);
}

{
  const gddy = ensureRatios({
    metrics: {
      revenue: { val: 4_951_100_000, end: '2025-12-31', form: '10-K' },
      equity: { val: 215_100_000 },
      debt_current: { val: 15_100_000, tag: 'LongTermDebtCurrent', end: '2025-12-31' },
      debt_noncurrent: { val: 3_765_200_000, tag: 'LongTermDebtNoncurrent', end: '2025-12-31' },
      long_term_debt: null,
    },
  });
  assert.equal(gddy.metrics.long_term_debt.val, 3_765_200_000);
  assert.equal(gddy.metrics.long_term_debt.tag, 'LongTermDebtNoncurrent');
  assert.equal(debtStock(gddy.metrics), 15_100_000 + 3_765_200_000);
  assert.ok(Math.abs(gddy.ratios.debt_equity - (15_100_000 + 3_765_200_000) / 215_100_000) < 1e-9);

  const aapl = ensureRatios({
    metrics: {
      equity: { val: 100e9 },
      debt_current: { val: 12.35e9, tag: 'LongTermDebtCurrent', end: '2025-09-27' },
      debt_noncurrent: { val: 78.33e9, tag: 'LongTermDebtNoncurrent', end: '2025-09-27' },
      long_term_debt: { val: 90.68e9, tag: 'LongTermDebt', end: '2025-09-27' },
    },
  });
  assert.equal(aapl.metrics.long_term_debt.val, 78.33e9, 'drop ambiguous LongTermDebt total in favor of noncurrent');
  assert.equal(debtStock(aapl.metrics), 90.68e9, 'debt stock is still current + noncurrent');
  assert.ok(Math.abs(aapl.ratios.debt_equity - 90.68e9 / 100e9) < 1e-9);

  const abt = ensureRatios({
    metrics: {
      revenue: { val: 44_328_000_000, end: '2025-12-31', form: '10-K' },
      cogs: { val: 19_319_000_000, tag: 'CostOfGoodsAndServicesSold', end: '2025-12-31' },
      gross_profit: null,
    },
  });
  assert.equal(abt.metrics.gross_profit.val, 44_328_000_000 - 19_319_000_000);
  assert.equal(abt.metrics.gross_profit.tag, 'Revenue−COGS');
  assert.ok(abt.ratios.gross_margin > 0.5 && abt.ratios.gross_margin < 0.6);

  const gpOnly = ensureRatios({
    metrics: {
      revenue: { val: 100, end: '2025-12-31' },
      gross_profit: { val: 40, tag: 'GrossProfit', end: '2025-12-31' },
      cogs: null,
    },
  });
  assert.equal(gpOnly.metrics.cogs.val, 60);
  assert.equal(gpOnly.metrics.cogs.tag, 'Revenue−GrossProfit');
}

{
  const instant = (val, end, fy) => [{
    val,
    end,
    fy,
    fp: 'FY',
    form: '10-K',
    filed: `${fy + 1}-02-01`,
  }];
  const duration = (val, start, end, fy) => [{
    val,
    start,
    end,
    fy,
    fp: 'FY',
    form: '10-K',
    filed: `${fy + 1}-02-01`,
  }];

  // Microsoft-style: G&A and selling are pieces. Do not print G&A as SG&A.
  const msftSga = extractHeadlines({
    cik: 789019,
    entityName: 'Microsoft-like',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(100, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(10, '2025-01-01', '2025-12-31', 2025) } },
        GeneralAndAdministrativeExpense: { units: { USD: duration(8, '2025-01-01', '2025-12-31', 2025) } },
        SellingAndMarketingExpense: { units: { USD: duration(27, '2025-01-01', '2025-12-31', 2025) } },
      },
    },
  });
  assert.equal(msftSga.metrics.sga, null);

  const aaplSga = extractHeadlines({
    cik: 320193,
    entityName: 'Apple-like SG&A',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(100, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(10, '2025-01-01', '2025-12-31', 2025) } },
        SellingGeneralAndAdministrativeExpense: { units: { USD: duration(28, '2025-01-01', '2025-12-31', 2025) } },
        GeneralAndAdministrativeExpense: { units: { USD: duration(8, '2025-01-01', '2025-12-31', 2025) } },
        SellingAndMarketingExpense: { units: { USD: duration(20, '2025-01-01', '2025-12-31', 2025) } },
      },
    },
  });
  assert.equal(aaplSga.metrics.sga.val, 28);
  assert.equal(aaplSga.metrics.sga.tag, 'SellingGeneralAndAdministrativeExpense');

  const cpOnly = extractHeadlines({
    cik: 1,
    entityName: 'CP-only',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(50, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(5, '2025-01-01', '2025-12-31', 2025) } },
        CommercialPaper: { units: { USD: instant(8, '2025-12-31', 2025) } },
      },
    },
  });
  assert.equal(cpOnly.metrics.debt_current, null, 'commercial paper is not the current-LTD line');

  const wavgOnly = extractHeadlines({
    cik: 1,
    entityName: 'Wavg shares',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(50, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(5, '2025-01-01', '2025-12-31', 2025) } },
        WeightedAverageNumberOfDilutedSharesOutstanding: {
          units: { shares: duration(8e9, '2025-01-01', '2025-12-31', 2025) },
        },
      },
    },
  });
  assert.equal(wavgOnly.metrics.shares_out, null, 'weighted-average shares are not period-end shares');
  assert.equal(wavgOnly.metrics.shares_diluted_wavg.val, 8e9);

  const nciLiab = extractHeadlines({
    cik: 104169,
    entityName: 'Walmart-like NCI',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: duration(50, '2025-01-01', '2025-12-31', 2025) } },
        NetIncomeLoss: { units: { USD: duration(5, '2025-01-01', '2025-12-31', 2025) } },
        Assets: { units: { USD: instant(284.668, '2025-12-31', 2025) } },
        StockholdersEquity: { units: { USD: instant(99.617, '2025-12-31', 2025) } },
        StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: {
          units: { USD: instant(105.887, '2025-12-31', 2025) },
        },
      },
    },
  });
  assert.equal(nciLiab.metrics.equity.val, 99.617, 'parent equity, not including NCI');
  assert.ok(Math.abs(nciLiab.metrics.liabilities.val - (284.668 - 105.887)) < 1e-9);
  assert.equal(nciLiab.metrics.liabilities.tag, IMPLIED_LIABILITIES_TAG);

  const droppedSga = ensureRatios({
    metrics: {
      sga: { val: 8, tag: 'GeneralAndAdministrativeExpense' },
      cash: { val: 11, tag: 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents' },
    },
  });
  assert.equal(droppedSga.metrics.sga, null);
  assert.equal(droppedSga.metrics.cash, null);
}

console.log('fortune-500 extract tests passed');
