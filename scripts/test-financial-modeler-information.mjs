/**
 * Financial Modeler filings-page helpers: metric filter, EDGAR links, series.
 */
import assert from 'node:assert/strict';
import {
  padCik,
  accessionNoDashes,
  addDaysIso,
  companyConceptUrl,
  companyFactsUrl,
  edgarBrowseUrl,
  filingArchiveUrl,
  inlineXbrlUrl,
  metricMatchesQuery,
  metricSearchHaystack,
  hasExpandableSeries,
  annualSeries,
  quarterlySeries,
  filingSourceLinks,
  stackedAddends,
  filedTagsCacheKey,
  filterFiledTagRows,
  filedTagsCountLabel,
} from '../financial-modeler/information-view.js';
import { extractFiledTags, filterFiledRows } from '../fortune-500/filed-tags.js';
import {
  STORAGE_KEY,
  saveOverride,
  clearOverride,
  loadOverridesForCik,
  applyTagOverrides,
  blankMetricKeys,
} from '../financial-modeler/tag-overrides.js';

assert.equal(padCik(104169), '0000104169');
assert.equal(padCik('0000104169'), '0000104169');
assert.equal(accessionNoDashes('0000104169-26-000019'), '000010416926000019');
assert.equal(addDaysIso('2026-03-13', 1), '2026-03-14');

assert.equal(
  companyConceptUrl(104169, 'us-gaap', 'Revenues'),
  'https://data.sec.gov/api/xbrl/companyconcept/CIK0000104169/us-gaap/Revenues.json'
);
assert.equal(
  companyFactsUrl(104169),
  'https://data.sec.gov/api/xbrl/companyfacts/CIK0000104169.json'
);
assert.equal(
  edgarBrowseUrl({ cik: 104169, form: '10-K', filed: '2026-03-13' }),
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000104169&type=10-K&dateb=20260314&owner=include&count=10'
);

const archive = filingArchiveUrl(104169, '0000104169-26-000019', 'wmt-20260131.htm');
assert.equal(
  archive,
  'https://www.sec.gov/Archives/edgar/data/104169/000010416926000019/wmt-20260131.htm'
);
assert.equal(
  inlineXbrlUrl(104169, '0000104169-26-000019', 'wmt-20260131.htm'),
  'https://www.sec.gov/ix?doc=/Archives/edgar/data/104169/000010416926000019/wmt-20260131.htm'
);

const def = {
  key: 'revenue',
  label: 'Revenue',
  student: 'Total sales from ordinary activities.',
  tags: 'Revenues',
};
assert.equal(metricMatchesQuery('', def), true);
assert.equal(metricMatchesQuery('revenue', def), true);
assert.equal(metricMatchesQuery('ordinary', def), true);
assert.equal(metricMatchesQuery('us-gaap:Revenues', def, { tag: 'Revenues', taxonomy: 'us-gaap' }), true);
assert.equal(metricMatchesQuery('inventory', def), false);
assert.ok(metricSearchHaystack(def, { tag: 'Revenues' }).includes('revenues'));

const headlines = {
  seriesAnnual: {
    revenue: [
      { year: 2024, val: 1 },
      { year: 2025, val: 2 },
    ],
  },
  seriesQuarterly: { revenue: [{ fp: 'Q1', year: 2025, val: 0.4 }] },
};
assert.equal(hasExpandableSeries(headlines, 'revenue'), true);
assert.equal(hasExpandableSeries(headlines, 'cash'), false);
assert.equal(annualSeries(headlines, 'revenue').length, 2);
assert.equal(quarterlySeries(headlines, 'revenue').length, 1);

const company = {
  cik: 104169,
  edgar_filings_browse: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000104169',
  edgar_companyfacts_api: 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000104169.json',
};
const point = {
  tag: 'Revenues',
  taxonomy: 'us-gaap',
  form: '10-K',
  filed: '2026-03-13',
  val: 681e9,
};
const filing = {
  form: '10-K',
  accession: '0000104169-26-000019',
  primary: 'wmt-20260131.htm',
  filingDate: '2026-03-13',
  factAnchors: { revenue: { '2026-01-31': 'f-42' } },
};

const exactPoint = { ...point, end: '2026-01-31' };
const withDoc = filingSourceLinks({ company, point: exactPoint, def, filing });
assert.equal(withDoc.length, 1);
assert.equal(withDoc[0].kind, 'document');
assert.ok(withDoc[0].href.endsWith('/wmt-20260131.htm#f-42'));
assert.equal(withDoc[0].label, 'Open exact line in 10-K');

const noDoc = filingSourceLinks({ company, point, def });
assert.deepEqual(noDoc, []);

const derived = filingSourceLinks({ company, derived: true });
assert.deepEqual(derived, []);

const fallback = filingSourceLinks({ company, point, def, filing });
assert.ok(fallback[0].href.includes('/ix?doc='));
assert.equal(fallback[0].label, 'Open 10-K (inline XBRL)');

const eq = stackedAddends(
  [
    { key: 'debt_current', label: 'Current portion of debt', val: 15.1e6 },
    { key: 'debt_noncurrent', label: 'Long-term debt, noncurrent', val: 3.8e9 },
    { key: 'accounts_payable', label: 'Accounts payable', val: 67.5e6 },
  ],
  7.8e9
);
assert.equal(eq.rows.length, 3);
assert.equal(eq.rows[0].op, '');
assert.equal(eq.rows[1].op, '+');
assert.equal(eq.rows[2].op, '+');
assert.equal(eq.sum, 15.1e6 + 3.8e9 + 67.5e6);
assert.equal(eq.tiesTotal, false);
assert.equal(eq.total, 7.8e9);

const tied = stackedAddends(
  [
    { label: 'A', val: 40 },
    { label: 'B', val: 60 },
  ],
  100
);
assert.equal(tied.tiesTotal, true);
assert.equal(tied.rows[0].op, '');
assert.equal(tied.rows[1].op, '+');

const withMinus = stackedAddends([
  { label: 'Income', val: 10 },
  { label: 'Loss', val: -3 },
]);
assert.equal(withMinus.rows[1].op, '−');
assert.equal(withMinus.rows[1].abs, 3);
assert.equal(withMinus.sum, 7);

assert.deepEqual(stackedAddends([]).rows, []);
assert.equal(stackedAddends(null).sum, 0);

assert.equal(filedTagsCacheKey(1609711, 2025), 'fm-filed-tags:1609711:2025');
assert.equal(filedTagsCountLabel({ filed: 212, mapped: 44, unmapped: 168 }), '212 filed · 44 mapped · 168 not in our catalog');

const filedRows = [
  { tag: 'Revenues', label: 'Revenues', mappedKey: 'revenue' },
  { tag: 'CostOfGoodsSold', label: 'COGS', mappedKey: null },
];
assert.equal(filterFiledTagRows(filedRows, { filter: 'mapped' }).length, 1);
assert.equal(filterFiledTagRows(filedRows, { filter: 'unmapped' }).length, 1);
assert.equal(filterFiledRows(filedRows, { query: 'cogs' }).length, 1);
assert.equal(filterFiledRows(filedRows, { query: 'Revenues' }).length, 1);

const instant = (val, end, fy) => [{ val, end, fy, fp: 'FY', form: '10-K', filed: `${fy + 1}-02-15` }];
const duration = (val, start, end, fy) => [
  { val, start, end, fy, fp: 'FY', form: '10-K', filed: `${fy + 1}-02-15` },
];

const mockFacts = {
  cik: 1609711,
  entityName: 'GoDaddy Inc.',
  facts: {
    'us-gaap': {
      Revenues: {
        label: 'Revenues',
        units: { USD: duration(4.951e9, '2025-01-01', '2025-12-31', 2025) },
      },
      NetIncomeLoss: {
        label: 'Net Income (Loss)',
        units: { USD: duration(5e8, '2025-01-01', '2025-12-31', 2025) },
      },
      Assets: {
        label: 'Assets',
        units: { USD: instant(8e9, '2025-12-31', 2025) },
      },
      StockholdersEquity: {
        label: 'Equity',
        units: { USD: instant(2e9, '2025-12-31', 2025) },
      },
      CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization: {
        label: 'Cost of goods and services, excluding D&A',
        units: { USD: duration(1.802e9, '2025-01-01', '2025-12-31', 2025) },
      },
      EntityInformationLineItems: {
        label: 'Entity info abstract',
        units: { USD: instant(1, '2025-12-31', 2025) },
      },
    },
  },
};

const filed = extractFiledTags(mockFacts);
assert.equal(filed.asOfYear, 2025);
assert.ok(filed.rows.length >= 5);
assert.ok(filed.rows.some((r) => r.tag === 'Revenues' && r.mappedKey === 'revenue'));
const cogsAlt = filed.rows.find(
  (r) => r.tag === 'CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization'
);
assert.ok(cogsAlt, 'unmapped sibling COGS tag is included');
assert.equal(cogsAlt.mappedKey, null);
assert.ok(filed.counts.filed >= filed.counts.mapped);
assert.ok(!filed.rows.some((r) => r.tag === 'EntityInformationLineItems'));
assert.equal(filterFiledRows(filed.rows, { filter: 'unmapped' }).some((r) => r.tag === cogsAlt.tag), true);

const ls = {};
globalThis.localStorage = {
  getItem: (k) => ls[k] ?? null,
  setItem: (k, v) => {
    ls[k] = v;
  },
  removeItem: (k) => {
    delete ls[k];
  },
};

const baseHeadlines = {
  asOfYear: 2025,
  metrics: {
    revenue: { val: 4.951e9, tag: 'Revenues', taxonomy: 'us-gaap', end: '2025-12-31' },
    cogs: null,
    gross_profit: null,
    net_income: { val: 5e8, tag: 'NetIncomeLoss', taxonomy: 'us-gaap', end: '2025-12-31' },
  },
  priorRevenue: null,
};

saveOverride(1609711, 'cogs', {
  taxonomy: 'us-gaap',
  tag: 'CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization',
  val: 1.802e9,
  unit: 'USD',
  end: '2025-12-31',
  form: '10-K',
  fy: 2025,
});
assert.ok(loadOverridesForCik(1609711).cogs);
assert.ok(JSON.parse(ls[STORAGE_KEY])['1609711'].cogs);

const filled = applyTagOverrides(baseHeadlines, 1609711);
assert.equal(filled.metrics.cogs.val, 1.802e9);
assert.equal(filled.metrics.cogs.override, true);
assert.equal(filled.metrics.gross_profit.val, 4.951e9 - 1.802e9);
assert.equal(filled.metrics.gross_profit.tag, 'Revenue−COGS');

const tagged = applyTagOverrides(baseHeadlines, 1609711, { allowReplace: false });
assert.equal(tagged.metrics.revenue.val, 4.951e9, 'does not clobber tagged revenue without allowReplace');

saveOverride(1609711, 'revenue', { taxonomy: 'us-gaap', tag: 'OtherRevenues', val: 1, unit: 'USD', end: '2025-12-31' });
const replaced = applyTagOverrides(baseHeadlines, 1609711, { allowReplace: true });
assert.equal(replaced.metrics.revenue.val, 1);

clearOverride(1609711, 'cogs');
assert.equal(loadOverridesForCik(1609711).cogs, undefined);

assert.deepEqual(blankMetricKeys(baseHeadlines, ['cogs', 'revenue', 'net_income']), ['cogs']);

console.log('test-financial-modeler-information: ok');
