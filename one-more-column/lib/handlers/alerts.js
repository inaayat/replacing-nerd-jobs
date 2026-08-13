import { db } from '../db.js';
import { badRequest, requireAuth, sendJson } from '../api-helpers.js';
import { buildCapacityForCycle } from '../capacity-build.js';
import { computeAlerts } from '../../engines/alerts.js';
import { computeReadyToStart } from '../../engines/ready_to_start.js';

/** Alerts UI is archived for now; engine + this endpoint stay for a future
 *  dependency/gate surface. Nothing in the SPA calls this currently. */
export async function handleAlerts(req, res) {
  const auth = await requireAuth(req, res, { methods: ['GET'] });
  if (!auth) return;

  const cycleId = String(req.query?.cycle || '').trim();
  const scenarioId = String(req.query?.scenario || '').trim();
  if (!cycleId) {
    badRequest(res, 'cycle query param is required.');
    return;
  }

  const grid = await buildCapacityForCycle({ cycleId, scenarioId, mode: 'due' });
  if (!grid) {
    sendJson(res, 404, { error: 'Cycle or scenario not found.' });
    return;
  }

  const planItems = await db()`
    SELECT id, title, work_hours, review_hours, due_week, assignee_ids, attributes
    FROM plan_items WHERE scenario_id = ${grid.scenario.id}
  `;

  const deps = await db()`
    SELECT d.*, pf.title AS from_title, pt.title AS to_title
    FROM dependencies d
    LEFT JOIN plan_items pf ON pf.id = d.from_plan_item_id
    JOIN plan_items pt ON pt.id = d.to_plan_item_id
    WHERE d.cycle_id = ${cycleId} AND pt.scenario_id = ${grid.scenario.id}
  `;

  const readiness = planItems.map((item) => {
    const itemDeps = deps.filter((d) => d.to_plan_item_id === item.id);
    const result = computeReadyToStart(item, itemDeps, grid.policy);
    return {
      plan_item_id: item.id,
      title: item.title,
      ready_to_start: result.ready_date,
      blocked: result.blocked,
      blockers: result.blockers,
    };
  });

  const alerts = computeAlerts({
    capacityGrid: grid,
    planItems,
    readiness,
    dependencies: deps,
    policy: grid.policy,
  });

  sendJson(res, 200, {
    alerts,
    counts: {
      high: alerts.filter((a) => a.severity === 'high').length,
      medium: alerts.filter((a) => a.severity === 'medium').length,
      low: alerts.filter((a) => a.severity === 'low').length,
    },
    cycle: grid.cycle,
    scenario: grid.scenario,
  });
}
