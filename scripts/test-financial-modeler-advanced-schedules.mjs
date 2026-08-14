import assert from 'node:assert/strict';
import { runLeaseSchedule } from '../financial-modeler/lease-schedule.js';
import { runWorkingCapitalSchedule } from '../financial-modeler/wc-schedule.js';
import { multiInputOptimize } from '../financial-modeler/sensitivity.js';

{
  const lease = runLeaseSchedule({});
  assert.equal(lease.ok, true);
  assert.equal(lease.rows.length, 5);
  assert.ok(lease.rows[0].closingLiability >= 0);
}

{
  const wc = runWorkingCapitalSchedule({ revenue: [100, 110, 120], cogs: [-60, -66, -72], years: 3 });
  assert.equal(wc.ok, true);
  assert.equal(wc.rows.length, 3);
  assert.ok(wc.rows.some((r) => r.deferredRevenue > 0));
}

{
  const result = multiInputOptimize({
    objective: 'score',
    assumptions: { x: 0.5, y: 0.5 },
    inputs: [
      { key: 'x', min: 0, max: 1 },
      { key: 'y', min: 0, max: 1 },
    ],
    evaluate: (patch) => -((patch.x - 0.7) ** 2) - (patch.y - 0.3) ** 2,
    constraints: [{ check: (p) => ({ ok: p.x + p.y <= 1.2 }) }],
    steps: 6,
  });
  assert.equal(result.ok, true);
  assert.ok(result.localOptimum);
  assert.ok(result.value > -0.5);
}

console.log('test-financial-modeler-advanced-schedules: ok');
