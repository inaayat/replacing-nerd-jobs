import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveEffortHours } from './effort.js';
import { computeAlerts } from './alerts.js';

test('deriveEffortHours applies review ratio', () => {
  const result = deriveEffortHours(10, 0, { review_ratio: 0.35 });
  assert.equal(result.review_hours, 3.5);
  assert.equal(result.total_hours, 13.5);
});

test('deriveEffortHours respects explicit review hours', () => {
  const result = deriveEffortHours(10, 5, { review_ratio: 0.35 });
  assert.equal(result.total_hours, 15);
});

test('deriveEffortHours applies review floor', () => {
  const result = deriveEffortHours(2, 0, { review_ratio: 0.1, review_floor_hours: 4 });
  assert.equal(result.review_hours, 4);
});

test('computeAlerts finds overload', () => {
  const grid = {
    rows: [
      {
        resource_id: 'r1',
        name: 'Alex',
        team: 'BP',
        weeks: [{ week: '2026-01-12', capacity: 32, load: 40, remaining: -8, overloaded: true, band: 'red' }],
      },
    ],
  };
  const alerts = computeAlerts({ capacityGrid: grid, planItems: [], readiness: [], dependencies: [], policy: {} });
  assert.equal(alerts.some((a) => a.type === 'overload'), true);
});
