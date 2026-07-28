import assert from 'node:assert/strict';
import {
  chargeMonth,
  monthlyBillForMonth,
  computeSummary,
} from '../amc-a-lister/engine/billing.js';

const membership = {
  promo_cents: 99,
  standard_cents: 2495,
  current_cents: 2799,
  price_bump_on: '2025-07-01',
};

assert.equal(chargeMonth('2025-07-28'), '2025-07-01');
assert.equal(chargeMonth('2025-08-02'), '2025-08-01');

const months = ['2025-01-01', '2025-02-01', '2025-07-01', '2025-08-01'];
assert.equal(monthlyBillForMonth('2025-01-01', membership, months), 99);
assert.equal(monthlyBillForMonth('2025-02-01', membership, months), 2495);
assert.equal(monthlyBillForMonth('2025-06-01', membership, months), 2495);
assert.equal(monthlyBillForMonth('2025-07-01', membership, months), 2799);

const watches = [
  { watched_on: '2025-01-10', ticket_cents: 1800, title: 'A' },
  { watched_on: '2025-01-20', ticket_cents: 2200, title: 'B' },
  { watched_on: '2025-02-05', ticket_cents: 2495, title: 'C' },
  { watched_on: '2025-07-15', ticket_cents: 3000, title: 'D' },
];

const summary = computeSummary(watches, membership);
assert.equal(summary.totalCharged, 1800 + 2200 + 2495 + 3000);
assert.equal(summary.totalBilled, 99 + 2495 + 2799);
assert.equal(summary.totalSeen, 4);
assert.equal(summary.totalSavings, summary.totalCharged - summary.totalBilled);
assert.equal(summary.byMonth.length, 3);

console.log('billing tests passed');
