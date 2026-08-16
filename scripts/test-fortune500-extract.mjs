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

// Retailers and industrials that only tag the including-assessed-tax variant.
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
assert.equal(retailer.metrics.revenue.tag, 'RevenueFromContractWithCustomerIncludingAssessedTax');
assert.equal(retailer.metrics.revenue.val, 60.4e9);

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
  // GoDaddy-style: AtCarryingValue went stale in 2018; the 10-K line is the
  // combined cash + restricted-cash tag.
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
  assert.equal(gddyLike.metrics.cash.val, 1080.9e6);
  assert.equal(gddyLike.metrics.cash.tag, 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents');

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
}

console.log('fortune-500 extract tests passed');
