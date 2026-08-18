/**
 * SEC submissions helpers: annual filing selection for inline XBRL pulls.
 */
import assert from 'node:assert/strict';
import { latestAnnualFiling } from '../fortune-500/edgar-filings.js';

const amcLike = {
  filings: {
    recent: {
      form: ['10-K/A', '10-K', '8-K'],
      accessionNumber: ['0001104659-26-053024', '0001411579-26-000016', '0001411579-26-000099'],
      primaryDocument: ['amc-20251231x10ka.htm', 'amc-20251231x10k.htm', 'amc-8k.htm'],
      filingDate: ['2026-04-30', '2026-02-23', '2026-03-01'],
    },
  },
};

const picked = latestAnnualFiling(amcLike);
assert.equal(picked.form, '10-K');
assert.equal(picked.accession, '0001411579-26-000016');
assert.equal(picked.primary, 'amc-20251231x10k.htm');

const amendmentOnly = {
  filings: {
    recent: {
      form: ['10-K/A', '8-K'],
      accessionNumber: ['0001104659-26-053024', '0001411579-26-000099'],
      primaryDocument: ['amc-20251231x10ka.htm', 'amc-8k.htm'],
      filingDate: ['2026-04-30', '2026-03-01'],
    },
  },
};
assert.equal(latestAnnualFiling(amendmentOnly).form, '10-K/A');

const wixLike = {
  filings: {
    recent: {
      form: ['20-F', '6-K'],
      accessionNumber: ['0001576789-26-000010', '0001576789-26-000020'],
      primaryDocument: ['wix-20251231.htm', 'wix-6k.htm'],
      filingDate: ['2026-03-15', '2026-04-01'],
    },
  },
};
assert.equal(latestAnnualFiling(wixLike).form, '20-F');

console.log('test-edgar-filings: ok');
