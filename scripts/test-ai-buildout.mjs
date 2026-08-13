import assert from 'node:assert/strict';
import {
  collectPoints,
  pickForYear,
  extractCompany,
  eventsFromSubmissions,
  groupOfferingEvents,
  offeringHeadline,
  latestFootnoteHits,
  fcfFrom,
  capexToCfo,
  icebergFrom,
  fundingFrom,
  gdpShare,
  formatUsd,
  formatCentsPerDollar,
  isWatchFiling,
} from '../ai-buildout/extract.js';
import { isWatchFiling as catalogWatch, METRICS, COMPANIES, hyperscalers } from '../ai-buildout/catalog.js';

assert.equal(COMPANIES.length, 7);
assert.equal(hyperscalers().length, 5);
assert.deepEqual(
  hyperscalers().map((c) => c.ticker),
  ['AMZN', 'MSFT', 'GOOGL', 'META', 'ORCL']
);

assert.equal(catalogWatch('424B5', ''), true);
assert.equal(catalogWatch('FWP', null), true);
assert.equal(catalogWatch('8-K', 'Results of Operations'), false);
assert.equal(catalogWatch('8-K', 'Entry into a Credit Agreement'), true);
assert.equal(catalogWatch('8-K', '8-K', '1.01,9.01'), true);
assert.equal(catalogWatch('8-K', '8-K', '2.02,9.01'), false);
assert.equal(catalogWatch('8-K', 'Senior Notes due 2055'), true);
assert.equal(isWatchFiling('424B2'), true);

assert.equal(fcfFrom(100, 40), 60);
assert.equal(fcfFrom(100, -40), 60);
assert.equal(fcfFrom(null, 40), null);
assert.equal(capexToCfo(200, 94), 0.47);
assert.equal(capexToCfo(100, -94), 0.94);
assert.equal(capexToCfo(0, 10), null);

const ice = icebergFrom({
  long_term_debt: { val: 30 },
  operating_lease_liability: { val: 50 },
  finance_lease_liability: { val: 10 },
  remaining_lease_payments: { val: 80 },
  purchase_obligation: { val: 12 },
});
assert.equal(ice.long_term_debt, 30);
assert.equal(ice.lease_liability, 60, 'sum operating + finance; do not add remaining payments');
assert.equal(ice.remaining_lease_payments, 80);
assert.equal(ice.purchase_obligation, 12);

const missingLease = icebergFrom({ long_term_debt: { val: 5 } });
assert.equal(missingLease.lease_liability, null, 'blank is not $0 of leases');

const fund = fundingFrom({
  cfo: { val: 100 },
  capex: { val: 94 },
  debt_proceeds: { val: 40 },
  long_term_debt: { val: 20 },
});
assert.equal(fund.fcf, 6);
assert.equal(fund.capex, 94);
assert.equal(fund.debt_proceeds, 40);

assert.equal(formatUsd(27300000000), '$27.3B');
assert.equal(formatCentsPerDollar(0.025), '2.5¢');
assert.ok(Math.abs(gdpShare(700e9, 28e12) - 0.025) < 1e-9);

function annual(val, year, extra = {}) {
  return {
    val,
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    fy: year,
    fp: 'FY',
    form: '10-K',
    filed: `${year + 1}-02-01`,
    ...extra,
  };
}

const facts = {
  cik: 1326801,
  entityName: 'Meta Platforms, Inc.',
  facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: { USD: [annual(100, 2023), annual(140, 2024), annual(170, 2025)] },
      },
      NetCashProvidedByUsedInOperatingActivities: {
        units: { USD: [annual(50, 2023), annual(70, 2024), annual(80, 2025)] },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        units: { USD: [annual(20, 2023), annual(40, 2024), annual(75, 2025)] },
      },
      LongTermDebt: {
        units: { USD: [annual(10, 2023), annual(18, 2024), annual(28, 2025)] },
      },
      OperatingLeaseLiability: {
        units: { USD: [annual(8, 2024), annual(22, 2025)] },
      },
      LesseeOperatingLeaseLiabilityPaymentsDue: {
        units: { USD: [annual(30, 2025)] },
      },
      ProceedsFromIssuanceOfLongTermDebt: {
        units: { USD: [annual(5, 2024), annual(50, 2025)] },
      },
      OperatingIncomeLoss: {
        units: { USD: [annual(40, 2025)] },
      },
      Assets: {
        units: { USD: [annual(200, 2025)] },
      },
      // Stale 2009-style point must not become 2025.
      PurchaseObligation: {
        units: {
          USD: [
            {
              val: 1,
              end: '2009-12-31',
              fy: 2009,
              fp: 'FY',
              form: '10-K',
              filed: '2010-02-01',
            },
          ],
        },
      },
    },
  },
};

const extracted = extractCompany(facts);
assert.equal(extracted.asOfYear, 2025);
assert.equal(extracted.latest.capex.val, 75);
assert.equal(extracted.latest.cfo.val, 80);
assert.equal(extracted.derived.capex_to_cfo, 75 / 80);
assert.equal(extracted.derived.fcf, 5);
assert.equal(extracted.latest.purchase_obligation, null, 'stale 2009 tag is not this year’s number');
assert.equal(extracted.iceberg.lease_liability, 22);
assert.equal(extracted.iceberg.remaining_lease_payments, 30);
assert.equal(extracted.funding.debt_proceeds, 50);

const capexSeries = extracted.series.capex.map((p) => p.year);
assert.ok(capexSeries.includes(2023) && capexSeries.includes(2025));
const ratio2023 = extracted.derivedSeries.find((d) => d.year === 2023);
assert.equal(ratio2023.capex_to_cfo, 20 / 50);

const capexDef = METRICS.find((m) => m.key === 'capex');
const points = collectPoints(facts, capexDef);
assert.equal(pickForYear(points, 2025).val, 75);

const events = eventsFromSubmissions(
  {
    cik: 1326801,
    name: 'Meta Platforms, Inc.',
    filings: {
      recent: {
        form: ['8-K', '8-K', '424B5', '10-K', 'FWP'],
        filingDate: ['2026-05-01', '2026-04-01', '2026-03-15', '2026-01-30', '2026-03-14'],
        accessionNumber: [
          '0001326801-26-000111',
          '0001326801-26-000099',
          '0001326801-26-000088',
          '0001326801-26-000010',
          '0001326801-26-000087',
        ],
        primaryDocument: ['d8k.htm', 'earn.htm', 'd424b5.htm', 'meta-10k.htm', 'dfwp.htm'],
        primaryDocDescription: [
          'Entry into a Material Definitive Agreement — data center lease',
          'Results of Operations and Financial Condition',
          '424B5',
          'Annual report',
          'FWP',
        ],
        items: ['1.01,9.01', '2.02,9.01', '', '', ''],
      },
    },
  },
  { ticker: 'META', name: 'Meta' }
);
assert.equal(events.length, 3, 'earnings 8-K and 10-K dropped; lease 8-K, 424B5, FWP kept');
assert.equal(events[0].filed, '2026-05-01');
assert.equal(events.find((e) => e.form === '424B5').description, null, 'form-as-description is dropped');
assert.ok(events[0].url.includes('000132680126000111'));
assert.ok(events.some((e) => e.form === '424B5'));

const grouped = groupOfferingEvents([
  { cik: 1, ticker: 'GOOGL', filed: '2026-08-07', form: '424B5', url: 'a' },
  { cik: 1, ticker: 'GOOGL', filed: '2026-08-07', form: 'FWP', url: 'b' },
  { cik: 1, ticker: 'GOOGL', filed: '2026-08-06', form: '424B2', url: 'c' },
]);
assert.equal(grouped.length, 2);
assert.equal(grouped[0].count, 2);
assert.match(offeringHeadline(grouped[0]), /2 filings/);

assert.deepEqual(
  latestFootnoteHits([
    { cik: 1, phrase: 'rvg', filed: '2025-01-01' },
    { cik: 1, phrase: 'rvg', filed: '2026-07-31' },
    { cik: 2, phrase: 'rvg', filed: '2026-01-01' },
  ]).map((h) => h.filed),
  ['2026-07-31', '2026-01-01']
);

const empty = extractCompany({ cik: 1, entityName: 'X', facts: { 'us-gaap': {} } });
assert.equal(empty.asOfYear, null);
assert.equal(empty.latest.capex, null);
assert.equal(empty.iceberg.long_term_debt, null);

console.log('ai-buildout extract tests passed');
