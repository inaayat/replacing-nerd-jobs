import assert from 'node:assert/strict';
import { extractSegmentsFromHtml } from '../fortune-500/extract-segments.js';

const html = `
<xbrli:context id="c-1">
  <xbrli:startDate>2024-10-01</xbrli:startDate>
  <xbrli:endDate>2025-09-27</xbrli:endDate>
  <xbrldi:explicitMember dimension="srt:ProductOrServiceAxis">aapl:IPhoneMember</xbrldi:explicitMember>
</xbrli:context>
<xbrli:context id="c-2">
  <xbrli:startDate>2024-10-01</xbrli:startDate>
  <xbrli:endDate>2025-09-27</xbrli:endDate>
  <xbrldi:explicitMember dimension="srt:ProductOrServiceAxis">aapl:MacMember</xbrldi:explicitMember>
</xbrli:context>
<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-1" scale="9">209.6</ix:nonFraction>
<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-2" scale="9">33.7</ix:nonFraction>
`;

const extracted = extractSegmentsFromHtml(html);
assert.equal(extracted.axes.length, 1);
assert.equal(extracted.axes[0].id, 'product');
assert.equal(extracted.axes[0].members.length, 2);
assert.equal(extracted.axes[0].members[0].label, 'IPhone');
assert.equal(extracted.axes[0].members[0].revenue, 209.6e9);
assert.equal(extracted.checks.product_revenue_sum, 243.3e9);

const empty = extractSegmentsFromHtml('<html></html>');
assert.deepEqual(empty.axes, []);
assert.ok(empty.flags.includes('no_segment_breakdown'));

console.log('fortune-500 segment extract tests passed');
