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
import { DEFAULT_POLICY_CONFIG } from '../default-policy.js';
import { requireWorkspace } from '../workspace-scope.js';

const VALID_CYCLE_TYPES = new Set(['annual', 'quarter', 'sprint', 'custom']);

export async function handleCycles(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return listCycles(req, res);
  if (req.method === 'POST') return createCycle(req, res, auth);
  if (req.method === 'PATCH') return patchCycle(req, res, auth);
  if (req.method === 'DELETE') return deleteCycle(req, res, auth);
  methodNotAllowed(res, 'GET, POST, PATCH, or DELETE');
}

async function listCycles(req, res) {
  const workspaceId = await requireWorkspace(req, res);
  if (!workspaceId) return;

  const cycles = await db()`
    SELECT id, workspace_id, name, profile, status, cycle_type, start_date, end_date, created_at, updated_at
    FROM planning_cycles
    WHERE workspace_id = ${workspaceId}
    ORDER BY created_at DESC
  `;
  sendJson(res, 200, { cycles, workspace_id: workspaceId });
}

async function createCycle(req, res, auth) {
  const workspaceId = await requireWorkspace(req, res);
  if (!workspaceId) return;

  const body = parseJsonBody(req);
  if (!body?.name?.trim()) {
    badRequest(res, 'name is required.');
    return;
  }

  const cycleType = body.cycle_type || 'annual';
  if (!VALID_CYCLE_TYPES.has(cycleType)) {
    badRequest(res, 'cycle_type must be annual, quarter, sprint, or custom.');
    return;
  }

  await touchUser(auth);
  const cycleId = newId();
  const scenarioId = newId();
  const policyId = newId();

  await db()`
    INSERT INTO planning_cycles (
      id, workspace_id, name, profile, status, cycle_type, start_date, end_date
    ) VALUES (
      ${cycleId},
      ${workspaceId},
      ${body.name.trim()},
      ${body.profile || 'default'},
      ${body.status || 'active'},
      ${cycleType},
      ${body.start_date || null},
      ${body.end_date || null}
    )
  `;

  await db()`
    INSERT INTO scenarios (id, cycle_id, name, status)
    VALUES (${scenarioId}, ${cycleId}, ${body.scenario_name || 'Default'}, 'active')
  `;

  const config = { ...DEFAULT_POLICY_CONFIG, ...(body.policy || {}) };
  await db()`
    INSERT INTO planning_policies (id, cycle_id, version, config, created_by)
    VALUES (${policyId}, ${cycleId}, 1, ${JSON.stringify(config)}::jsonb, ${auth.sub})
  `;

  const rows = await db()`
    SELECT id, workspace_id, name, profile, status, cycle_type, start_date, end_date, created_at, updated_at
    FROM planning_cycles WHERE id = ${cycleId}
  `;

  sendJson(res, 201, {
    cycle: rows[0],
    default_scenario_id: scenarioId,
    policy: { version: 1, config },
    workspace_id: workspaceId,
  });
}

async function patchCycle(req, res, auth) {
  const workspaceId = await requireWorkspace(req, res);
  if (!workspaceId) return;

  const body = parseJsonBody(req);
  const id = String(body?.id || req.query?.id || '').trim();
  const name = String(body?.name || '').trim();
  if (!id) {
    badRequest(res, 'id is required.');
    return;
  }
  if (!name) {
    badRequest(res, 'name is required.');
    return;
  }

  const owned = await db()`
    SELECT id FROM planning_cycles WHERE id = ${id} AND workspace_id = ${workspaceId}
  `;
  if (!owned.length) {
    sendJson(res, 404, { error: 'Cycle not found in workspace.' });
    return;
  }

  await touchUser(auth);
  await db()`
    UPDATE planning_cycles SET name = ${name}, updated_at = now() WHERE id = ${id}
  `;
  const rows = await db()`
    SELECT id, workspace_id, name, profile, status, cycle_type, start_date, end_date, created_at, updated_at
    FROM planning_cycles WHERE id = ${id}
  `;
  sendJson(res, 200, { cycle: rows[0] });
}

async function deleteCycle(req, res, auth) {
  const workspaceId = await requireWorkspace(req, res);
  if (!workspaceId) return;

  const id = String(req.query?.id || '').trim();
  if (!id) {
    badRequest(res, 'id query param is required.');
    return;
  }

  const owned = await db()`
    SELECT id FROM planning_cycles WHERE id = ${id} AND workspace_id = ${workspaceId}
  `;
  if (!owned.length) {
    sendJson(res, 404, { error: 'Cycle not found in workspace.' });
    return;
  }

  await touchUser(auth);
  await db()`DELETE FROM planning_cycles WHERE id = ${id}`;
  sendJson(res, 200, { deleted: id });
}
