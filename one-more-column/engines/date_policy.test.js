import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addBusinessDays,
  addCalendarDays,
  computeReviewDue,
  materializeGateChain,
  isoDate,
} from './date_policy.js';

test('addCalendarDays adds wall-clock days', () => {
  assert.equal(addCalendarDays('2026-01-12', 7), '2026-01-19');
  assert.equal(addCalendarDays('2026-01-30', 3), '2026-02-02');
});

test('computeReviewDue still adds lag via addCalendarDays', () => {
  assert.equal(computeReviewDue('2026-01-12', { review_lag_days: 7 }), '2026-01-19');
});

test('addBusinessDays skips weekends', () => {
  // Friday + 1 business day → Monday
  assert.equal(addBusinessDays('2026-01-09', 1), '2026-01-12');
  // Monday + 5 business days → next Monday
  assert.equal(addBusinessDays('2026-01-05', 5), '2026-01-12');
});

test('addBusinessDays crosses a week boundary', () => {
  // Monday + 7 business days → Wednesday of the following week
  assert.equal(addBusinessDays('2026-01-05', 7), '2026-01-14');
});

test('materializeGateChain chains 7/7/7 business days from a Monday anchor', () => {
  const gates = materializeGateChain({
    anchorDate: '2026-01-05', // Monday
    steps: [
      { label: 'Obtain population', duration_days: 7, day_kind: 'business', dep_type: 'input_ready' },
      { label: 'Select samples', duration_days: 7, day_kind: 'business', dep_type: 'sample_chain' },
      { label: 'Get sample support', duration_days: 7, day_kind: 'business', dep_type: 'input_ready' },
    ],
  });

  assert.deepEqual(gates, [
    { label: 'Obtain population', dep_type: 'input_ready', due_date: '2026-01-14' },
    { label: 'Select samples', dep_type: 'sample_chain', due_date: '2026-01-23' },
    { label: 'Get sample support', dep_type: 'input_ready', due_date: '2026-02-03' },
  ]);
});

test('materializeGateChain respects calendar day_kind', () => {
  const gates = materializeGateChain({
    anchorDate: '2026-01-09', // Friday
    steps: [{ label: 'Wait', duration_days: 2, day_kind: 'calendar', dep_type: 'input_ready' }],
  });
  assert.equal(gates[0].due_date, '2026-01-11'); // includes weekend
});

test('materializeGateChain returns empty without anchor', () => {
  assert.deepEqual(materializeGateChain({ steps: [{ label: 'X', duration_days: 1 }] }), []);
});

test('isoDate coerces Date objects instead of slicing locale strings', () => {
  assert.equal(isoDate(new Date('2026-01-12T00:00:00.000Z')), '2026-01-12');
  assert.equal(isoDate('2026-01-12T15:04:05.000Z'), '2026-01-12');
  assert.equal(isoDate('not-a-date'), null);
  assert.equal(addCalendarDays(new Date('2026-01-12T00:00:00.000Z'), 7), '2026-01-19');
  assert.equal(addCalendarDays('not-a-date', 1), null);
  assert.equal(computeReviewDue(new Date('2026-01-12T00:00:00.000Z'), { review_lag_days: 7 }), '2026-01-19');
});
