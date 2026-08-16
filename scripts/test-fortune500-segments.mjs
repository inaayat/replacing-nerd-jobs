import assert from 'node:assert/strict';
import {
  extractFactAnchorsFromHtml,
  extractSegmentsFromHtml,
} from '../fortune-500/extract-segments.js';

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
<xbrli:context id="c-3">
  <xbrli:startDate>2024-10-01</xbrli:startDate>
  <xbrli:endDate>2025-09-27</xbrli:endDate>
</xbrli:context>
<xbrli:context id="c-4">
  <xbrli:instant>2025-09-27</xbrli:instant>
</xbrli:context>
<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-1" scale="9">209.6</ix:nonFraction>
<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-2" scale="9">33.7</ix:nonFraction>
<ix:nonFraction id="f-revenue" name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-3" scale="9">416.2</ix:nonFraction>
<ix:nonFraction id="f-cash" name="us-gaap:CashAndCashEquivalentsAtCarryingValue" contextRef="c-4" scale="6">35,934</ix:nonFraction>
`;

const extracted = extractSegmentsFromHtml(html);
assert.equal(extracted.axes.length, 1);
assert.equal(extracted.axes[0].id, 'product');
assert.equal(extracted.axes[0].members.length, 2);
assert.equal(extracted.axes[0].members[0].label, 'IPhone');
assert.equal(extracted.axes[0].members[0].revenue, 209.6e9);
assert.equal(extracted.checks.product_revenue_sum, 243.3e9);

const anchors = extractFactAnchorsFromHtml(html, {
  metrics: {
    revenue: {
      val: 416.2e9,
      tag: 'RevenueFromContractWithCustomerExcludingAssessedTax',
      end: '2025-09-27',
    },
    cash: {
      val: 35.934e9,
      tag: 'CashAndCashEquivalentsAtCarryingValue',
      end: '2025-09-27',
    },
    gross_profit: {
      val: 100,
      tag: 'Revenue−CostOfGoodsAndServicesSold',
      end: '2025-09-27',
      derived: true,
    },
  },
  seriesAnnual: {},
});
assert.equal(anchors.revenue['2025-09-27'], 'f-revenue');
assert.equal(anchors.cash['2025-09-27'], 'f-cash');
assert.equal(anchors.gross_profit, undefined);

const empty = extractSegmentsFromHtml('<html></html>');
assert.deepEqual(empty.axes, []);
assert.ok(empty.flags.includes('no_segment_breakdown'));

console.log('fortune-500 segment extract tests passed');
