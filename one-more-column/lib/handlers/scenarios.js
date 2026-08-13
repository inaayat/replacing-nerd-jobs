import { db } from '../db.js';
import {
  badRequest,
  methodNotAllowed,
  newId,
  parseJsonBody,
  requireAuth,
  sendJson,
  touchUser,
} from '../api-helpers.js';

export async function handleScenarios(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return listScenarios(res, req);
  if (req.method === 'POST') return createScenario(req, res, auth);
  if (req.method === 'PATCH') return patchScenario(req, res, auth);
  if (req.method === 'DELETE') return deleteScenario(req, res, auth);
  methodNotAllowed(res, 'GET, POST, PATCH, or DELETE');
}

async function listScenarios(res, req) {
  const cycleId = String(req.query?.cycle || '').trim();
  if (!cycleId) {
    badRequest(res, 'cycle query param is required.');
    return;
  }

  const scenarios = await db()`
    SELECT s.id, s.cycle_id, s.name, s.status, s.created_at,
      (SELECT count(*)::int FROM plan_items p WHERE p.scenario_id = s.id) AS plan_item_count
    FROM scenarios s
    WHERE s.cycle_id = ${cycleId}
    ORDER BY s.created_at ASC
  `;
  sendJson(res, 200, { scenarios });
}

async function createScenario(req, res, auth) {
  const body = parseJsonBody(req);
  const cycleId = body?.cycle_id;
  const name = body?.name?.trim();
  if (!cycleId || !name) {
    badRequest(res, 'cycle_id and name are required.');
    return;
  }

  const cycleRows = await db()`SELECT id FROM planning_cycles WHERE id = ${cycleId}`;
  if (!cycleRows.length) {
    sendJson(res, 404, { error: 'Cycle not found.' });
    return;
  }

  await touchUser(auth);
  const scenarioId = newId();

  await db()`
    INSERT INTO scenarios (id, cycle_id, name, status)
    VALUES (${scenarioId}, ${cycleId}, ${name}, ${body.status || 'draft'})
  `;

  const cloneFrom = body.clone_from_scenario_id;
  if (cloneFrom) {
    const sourceItems = await db()`
      SELECT id, unique_key, title, phase, source, work_hours, review_hours, due_week, assignee_ids, attributes
      FROM plan_items WHERE scenario_id = ${cloneFrom}
    `;
    const idMap = new Map();
    for (const item of sourceItems) {
      const newItemId = newId();
      idMap.set(item.id, newItemId);
      await db()`
        INSERT INTO plan_items (
          id, cycle_id, scenario_id, unique_key, title, phase, source,
          work_hours, review_hours, due_week, assignee_ids, attributes
        ) VALUES (
          ${newItemId}, ${cycleId}, ${scenarioId},
          ${item.unique_key}, ${item.title}, ${item.phase}, ${item.source},
          ${item.work_hours}, ${item.review_hours}, ${item.due_week},
          ${item.assignee_ids}, ${item.attributes}
        )
      `;
    }

    const sourceDeps = await db()`
      SELECT from_plan_item_id, to_plan_item_id, dep_type, status, label, meta
      FROM dependencies WHERE cycle_id = ${cycleId}
    `;
    for (const dep of sourceDeps) {
      const toId = idMap.get(dep.to_plan_item_id);
      if (!toId) continue;
      const fromId = dep.from_plan_item_id ? idMap.get(dep.from_plan_item_id) : null;
      await db()`
        INSERT INTO dependencies (
          id, cycle_id, from_plan_item_id, to_plan_item_id, dep_type, status, label, meta
        ) VALUES (
          ${newId()}, ${cycleId}, ${fromId}, ${toId},
          ${dep.dep_type}, ${dep.status}, ${dep.label}, ${dep.meta}
        )
      `;
    }
  }

  const rows = await db()`
    SELECT id, cycle_id, name, status, created_at
    FROM scenarios WHERE id = ${scenarioId}
  `;
  sendJson(res, 201, { scenario: rows[0] });
}

async function patchScenario(req, res, auth) {
  const body = parseJsonBody(req);
  const scenarioId = String(body?.id || '').trim();
  if (!scenarioId) {
    badRequest(res, 'id is required.');
    return;
  }

  const rows = await db()`SELECT id, cycle_id, status FROM scenarios WHERE id = ${scenarioId}`;
  if (!rows.length) {
    sendJson(res, 404, { error: 'Scenario not found.' });
    return;
  }
  const scenario = rows[0];

  await touchUser(auth);

  if (body.status === 'active') {
    await db()`
      UPDATE scenarios SET status = 'draft'
      WHERE cycle_id = ${scenario.cycle_id} AND id <> ${scenarioId} AND status = 'active'
    `;
    await db()`
      UPDATE scenarios SET status = 'active'
      WHERE id = ${scenarioId}
    `;
  } else if (body.status) {
    await db()`
      UPDATE scenarios SET status = ${body.status}
      WHERE id = ${scenarioId}
    `;
  }

  if (body.name?.trim()) {
    await db()`
      UPDATE scenarios SET name = ${body.name.trim()}
      WHERE id = ${scenarioId}
    `;
  }

  const updated = await db()`
    SELECT id, cycle_id, name, status, created_at FROM scenarios WHERE id = ${scenarioId}
  `;
  sendJson(res, 200, { scenario: updated[0] });
}

async function deleteScenario(req, res, auth) {
  const scenarioId = String(req.query?.id || '').trim();
  if (!scenarioId) {
    badRequest(res, 'id query param is required.');
    return;
  }

  const rows = await db()`SELECT id, cycle_id, status FROM scenarios WHERE id = ${scenarioId}`;
  if (!rows.length) {
    sendJson(res, 404, { error: 'Scenario not found.' });
    return;
  }
  const scenario = rows[0];

  const countRows = await db()`
    SELECT count(*)::int AS n FROM scenarios WHERE cycle_id = ${scenario.cycle_id}
  `;
  if (countRows[0].n <= 1) {
    badRequest(res, 'Cannot delete the only scenario for this cycle.');
    return;
  }

  await touchUser(auth);

  if (scenario.status === 'active') {
    const fallback = await db()`
      SELECT id FROM scenarios
      WHERE cycle_id = ${scenario.cycle_id} AND id <> ${scenarioId}
      ORDER BY created_at ASC
      LIMIT 1
    `;
    if (fallback.length) {
      await db()`
        UPDATE scenarios SET status = 'draft'
        WHERE cycle_id = ${scenario.cycle_id} AND id <> ${fallback[0].id}
      `;
      await db()`UPDATE scenarios SET status = 'active' WHERE id = ${fallback[0].id}`;
    }
  }

  await db()`DELETE FROM scenarios WHERE id = ${scenarioId}`;
  sendJson(res, 200, { deleted: scenarioId });
}
