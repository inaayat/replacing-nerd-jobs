import assert from 'node:assert/strict';
import {
  chargeMonth,
  monthlyBillForMonth,
  monthlyRateForMonth,
  computeSummary,
  membershipPriceTiers,
} from '../lib/a-list-billing.js';

const legacyMembership = {
  promo_cents: 99,
  standard_cents: 2495,
  current_cents: 2799,
  price_bump_on: '2025-07-01',
};

const tieredMembership = {
  promo_cents: 99,
  price_tiers: [
    { effective_on: '2018-06-01', cents: 2495 },
    { effective_on: '2025-05-01', cents: 2799 },
    { effective_on: '2026-07-15', cents: 2999 },
  ],
};

assert.equal(chargeMonth('2025-07-28'), '2025-07-01');
assert.equal(chargeMonth('2025-08-02'), '2025-08-01');

const months = ['2025-01-01', '2025-02-01', '2025-07-01', '2025-08-01'];
assert.equal(monthlyBillForMonth('2025-01-01', legacyMembership, months), 99);
assert.equal(monthlyBillForMonth('2025-02-01', legacyMembership, months), 2495);
assert.equal(monthlyBillForMonth('2025-06-01', legacyMembership, months), 2495);
assert.equal(monthlyBillForMonth('2025-07-01', legacyMembership, months), 2799);

assert.equal(monthlyRateForMonth('2025-04-01', tieredMembership), 2495);
assert.equal(monthlyRateForMonth('2025-05-01', tieredMembership), 2799);
assert.equal(monthlyRateForMonth('2026-06-01', tieredMembership), 2799);
assert.equal(monthlyRateForMonth('2026-07-01', tieredMembership), 2999);
assert.equal(monthlyRateForMonth('2026-08-01', tieredMembership), 2999);

const tierMonths = ['2025-01-01', '2025-05-01', '2026-07-01'];
assert.equal(monthlyBillForMonth('2025-05-01', tieredMembership, tierMonths), 2799);
assert.equal(monthlyBillForMonth('2026-07-01', tieredMembership, tierMonths), 2999);

const watches = [
  { watched_on: '2025-01-10', ticket_cents: 1800, title: 'A' },
  { watched_on: '2025-01-20', ticket_cents: 2200, title: 'B' },
  { watched_on: '2025-02-05', ticket_cents: 2495, title: 'C' },
  { watched_on: '2025-07-15', ticket_cents: 3000, title: 'D' },
];

const summary = computeSummary(watches, legacyMembership);
assert.equal(summary.totalCharged, 1800 + 2200 + 2495 + 3000);
assert.equal(summary.totalBilled, 99 + 2495 + 2799);
assert.equal(summary.totalSeen, 4);
assert.equal(summary.totalSavings, summary.totalCharged - summary.totalBilled);
assert.equal(summary.byMonth.length, 3);

assert.equal(membershipPriceTiers(legacyMembership).length, 2);

console.log('billing tests passed');
