import test from 'node:test';
import assert from 'node:assert/strict';
import { rollupGridToMonths } from './period_rollup.js';

test('rollupGridToMonths aggregates weekly cells', () => {
  const grid = {
    weeks: ['2026-01-05', '2026-01-12', '2026-02-02'],
    rows: [
      {
        name: 'Alex',
        weeks: [
          { week: '2026-01-05', capacity: 32, load: 8, remaining: 24, band: 'green' },
          { week: '2026-01-12', capacity: 32, load: 20, remaining: 12, band: 'yellow' },
          { week: '2026-02-02', capacity: 32, load: 40, remaining: -8, band: 'red', overloaded: true },
        ],
      },
    ],
  };

  const rolled = rollupGridToMonths(grid);
  assert.equal(rolled.granularity, 'month');
  assert.deepEqual(rolled.weeks, ['2026-01', '2026-02']);
  assert.equal(rolled.rows[0].weeks[0].capacity, 64);
  assert.equal(rolled.rows[0].weeks[0].load, 28);
  assert.equal(rolled.rows[0].weeks[1].load, 40);
});
