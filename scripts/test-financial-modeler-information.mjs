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
} from '../financial-modeler/information-view.js';

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
};

const withDoc = filingSourceLinks({ company, point, def, filing });
assert.ok(withDoc.some((l) => l.kind === 'document' && l.href.includes('/ix?doc=')));
assert.ok(withDoc.some((l) => l.kind === 'browse'));
assert.ok(withDoc.some((l) => l.kind === 'concept' && l.href.includes('us-gaap/Revenues.json')));
assert.ok(withDoc.some((l) => l.label === 'us-gaap:Revenues'));

const noDoc = filingSourceLinks({ company, point, def });
assert.ok(noDoc.some((l) => l.kind === 'browse' && l.href.includes('type=10-K')));
assert.ok(!noDoc.some((l) => l.kind === 'document'));

const derived = filingSourceLinks({ company, derived: true });
assert.ok(derived.length >= 1);
assert.ok(derived.every((l) => l.kind === 'browse'));

console.log('test-financial-modeler-information: ok');
