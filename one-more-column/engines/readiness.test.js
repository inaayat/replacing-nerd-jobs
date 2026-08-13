import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePeriod } from './period_normalizer.js';
import { computeReviewDue } from './date_policy.js';
import { computeReadyToStart } from './ready_to_start.js';

test('normalizePeriod parses FY26 Q1', () => {
  assert.equal(normalizePeriod('FY26 Q1'), '2026-Q1');
});

test('computeReviewDue adds lag days', () => {
  assert.equal(computeReviewDue('2026-01-12', { review_lag_days: 7 }), '2026-01-19');
});

test('computeReadyToStart blocks on open dependency', () => {
  const item = { id: 'a', title: 'Control A', due_week: '2026-02-01', attributes: {} };
  const deps = [
    {
      id: 'd1',
      dep_type: 'evidence_ready',
      status: 'open',
      label: 'PBC received',
      meta: { due_date: '2026-01-20' },
    },
  ];
  const result = computeReadyToStart(item, deps, {});
  assert.equal(result.blocked, true);
  assert.equal(result.ready_date, '2026-01-20');
  assert.equal(result.blockers.length, 1);
});

test('computeReadyToStart uses met dependency date', () => {
  const item = { id: 'a', title: 'Control A', attributes: {} };
  const deps = [
    { id: 'd1', dep_type: 'evidence_ready', status: 'met', meta: { met_date: '2026-01-15' } },
  ];
  const result = computeReadyToStart(item, deps, {});
  assert.equal(result.blocked, false);
  assert.equal(result.ready_date, '2026-01-15');
});

test('computeReadyToStart survives Date objects and stringified meta', () => {
  const item = {
    id: 'a',
    title: 'Control A',
    due_week: new Date('2026-02-01T00:00:00.000Z'),
    attributes: {},
  };
  const deps = [
    {
      id: 'd1',
      dep_type: 'evidence_ready',
      status: 'open',
      label: 'PBC received',
      meta: JSON.stringify({ due_date: '2026-01-20' }),
    },
  ];
  const result = computeReadyToStart(item, deps, { review_lag_days: 7 });
  assert.equal(result.blocked, true);
  assert.equal(result.ready_date, '2026-01-20');
  assert.equal(result.review_due, '2026-02-08');
});
