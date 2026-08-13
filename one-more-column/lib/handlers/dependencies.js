import { db } from '../db.js';
import {
  badRequest,
  conflict,
  methodNotAllowed,
  newId,
  parseJsonBody,
  requireAuth,
  sendJson,
  touchUser,
} from '../api-helpers.js';
import { computeReadyToStart } from '../../engines/ready_to_start.js';
import { materializeGateChain } from '../../engines/date_policy.js';

const VALID_TYPES = new Set([
  'input_ready',
  'handoff_chain',
  'review_lag',
  'phase_gate',
  'staffing',
  'external_flag',
  'blackout',
  'evidence_ready',
  'sample_chain',
]);

const VALID_STATUS = new Set(['open', 'met', 'waived', 'blocked']);

export async function handleDependencies(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return listDependencies(res, req);
  if (req.method === 'POST') return postDependencies(req, res, auth);
  if (req.method === 'PATCH') return patchDependencies(req, res, auth);
  if (req.method === 'DELETE') return deleteDependency(req, res, auth);
  methodNotAllowed(res, 'GET, POST, PATCH, or DELETE');
}

async function listDependencies(res, req) {
  const cycleId = String(req.query?.cycle || '').trim();
  const scenarioId = String(req.query?.scenario || '').trim();
  if (!cycleId) {
    badRequest(res, 'cycle query param is required.');
    return;
  }

  try {
    let deps;
    if (scenarioId) {
      deps = await db()`
        SELECT
          d.id, d.cycle_id, d.from_plan_item_id, d.to_plan_item_id,
          d.dep_type, d.status, d.label, d.meta, d.created_at, d.updated_at,
          pf.title AS from_title, pt.title AS to_title
        FROM dependencies d
        LEFT JOIN plan_items pf ON pf.id = d.from_plan_item_id
        JOIN plan_items pt ON pt.id = d.to_plan_item_id
        WHERE d.cycle_id = ${cycleId} AND pt.scenario_id = ${scenarioId}
        ORDER BY d.created_at ASC
      `;
    } else {
      deps = await db()`
        SELECT
          d.id, d.cycle_id, d.from_plan_item_id, d.to_plan_item_id,
          d.dep_type, d.status, d.label, d.meta, d.created_at, d.updated_at,
          pf.title AS from_title, pt.title AS to_title
        FROM dependencies d
        LEFT JOIN plan_items pf ON pf.id = d.from_plan_item_id
        JOIN plan_items pt ON pt.id = d.to_plan_item_id
        WHERE d.cycle_id = ${cycleId}
        ORDER BY d.created_at ASC
      `;
    }

    let readiness = null;
    if (scenarioId) {
      const items = await db()`
        SELECT id, title, due_week, attributes
        FROM plan_items WHERE scenario_id = ${scenarioId}
      `;
      const policyRows = await db()`
        SELECT config FROM planning_policies
        WHERE cycle_id = ${cycleId}
        ORDER BY version DESC LIMIT 1
      `;
      const policy = policyRows[0]?.config || {};
      readiness = items.map((item) => {
        try {
          const itemDeps = deps.filter((d) => d.to_plan_item_id === item.id);
          const result = computeReadyToStart(item, itemDeps, policy);
          return {
            plan_item_id: item.id,
            title: item.title,
            ready_to_start: result.ready_date,
            blocked: result.blocked,
            blockers: result.blockers,
          };
        } catch {
          return {
            plan_item_id: item.id,
            title: item.title,
            ready_to_start: null,
            blocked: false,
            blockers: [],
          };
        }
      });
    }

    sendJson(res, 200, { dependencies: deps, readiness });
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Failed to load dependencies.' });
  }
}

/** Shared insert used by createDependency and applyGateTemplate. */
export async function insertDependencyRow({
  cycle_id,
  from_plan_item_id = null,
  to_plan_item_id,
  dep_type = 'input_ready',
  status = 'open',
  label = null,
  meta = {},
}) {
  if (!VALID_TYPES.has(dep_type)) {
    throw new Error(`dep_type must be one of: ${[...VALID_TYPES].join(', ')}`);
  }
  const id = newId();
  await db()`
    INSERT INTO dependencies (
      id, cycle_id, from_plan_item_id, to_plan_item_id, dep_type, status, label, meta
    ) VALUES (
      ${id},
      ${cycle_id},
      ${from_plan_item_id || null},
      ${to_plan_item_id},
      ${dep_type},
      ${status},
      ${label || null},
      ${JSON.stringify(meta || {})}::jsonb
    )
  `;
  const rows = await db()`SELECT * FROM dependencies WHERE id = ${id}`;
  return rows[0];
}

async function postDependencies(req, res, auth) {
  const body = parseJsonBody(req);
  if (body?.action === 'apply-gate-template') {
    return applyGateTemplate(req, res, auth, body);
  }
  return createDependency(req, res, auth, body);
}

async function createDependency(req, res, auth, body) {
  if (!body?.cycle_id || !body?.to_plan_item_id) {
    badRequest(res, 'cycle_id and to_plan_item_id are required.');
    return;
  }
  const depType = body.dep_type || 'input_ready';
  if (!VALID_TYPES.has(depType)) {
    badRequest(res, `dep_type must be one of: ${[...VALID_TYPES].join(', ')}`);
    return;
  }

  await touchUser(auth);
  try {
    const dependency = await insertDependencyRow({
      cycle_id: body.cycle_id,
      from_plan_item_id: body.from_plan_item_id || null,
      to_plan_item_id: body.to_plan_item_id,
      dep_type: depType,
      status: body.status || 'open',
      label: body.label || null,
      meta: body.meta || {},
    });
    sendJson(res, 201, { dependency });
  } catch (err) {
    badRequest(res, err.message);
  }
}

async function applyGateTemplate(req, res, auth, body) {
  const planItemId = String(body.plan_item_id || '').trim();
  const taskTypeId = String(body.task_type_id || '').trim();
  const anchorDate = String(body.anchor_date || '').trim().slice(0, 10);

  if (!planItemId || !taskTypeId || !anchorDate) {
    badRequest(res, 'plan_item_id, task_type_id, and anchor_date are required.');
    return;
  }

  const items = await db()`
    SELECT id, cycle_id FROM plan_items WHERE id = ${planItemId}
  `;
  if (!items.length) {
    sendJson(res, 404, { error: 'Plan item not found.' });
    return;
  }
  const planItem = items[0];

  const types = await db()`
    SELECT id, key, label FROM task_types WHERE id = ${taskTypeId}
  `;
  if (!types.length) {
    sendJson(res, 404, { error: 'Task type not found.' });
    return;
  }

  const steps = await db()`
    SELECT label, duration_days, day_kind, dep_type
    FROM gate_templates
    WHERE task_type_id = ${taskTypeId}
    ORDER BY seq ASC
  `;
  if (!steps.length) {
    badRequest(res, 'This task type has no gate template steps.');
    return;
  }

  const materialized = materializeGateChain({
    anchorDate,
    steps: steps.map((s) => ({
      label: s.label,
      duration_days: Number(s.duration_days),
      day_kind: s.day_kind,
      dep_type: s.dep_type,
    })),
  });

  await touchUser(auth);
  const dependencies = [];
  for (const gate of materialized) {
    const depType = VALID_TYPES.has(gate.dep_type) ? gate.dep_type : 'input_ready';
    const row = await insertDependencyRow({
      cycle_id: planItem.cycle_id,
      to_plan_item_id: planItemId,
      dep_type: depType,
      status: 'open',
      label: gate.label,
      meta: { due_date: gate.due_date, source: 'template' },
    });
    dependencies.push(row);
  }

  sendJson(res, 201, { dependencies, count: dependencies.length });
}

async function patchDependencies(req, res, auth) {
  const body = parseJsonBody(req);
  const updates = Array.isArray(body?.dependencies) ? body.dependencies : body?.id ? [body] : [];
  if (!updates.length) {
    badRequest(res, 'Provide dependencies[] or a single dependency with id.');
    return;
  }

  await touchUser(auth);
  const patched = [];
  const conflicts = [];
  const force = Boolean(body.force);

  for (const dep of updates) {
    if (!dep.id) continue;
    if (dep.status && !VALID_STATUS.has(dep.status)) continue;
    if (dep.dep_type && !VALID_TYPES.has(dep.dep_type)) continue;

    const guard = force ? null : dep.updated_at || null;

    const rows = await db()`
      UPDATE dependencies SET
        from_plan_item_id = COALESCE(${dep.from_plan_item_id ?? null}, from_plan_item_id),
        dep_type = COALESCE(${dep.dep_type ?? null}, dep_type),
        status = COALESCE(${dep.status ?? null}, status),
        label = COALESCE(${dep.label ?? null}, label),
        meta = COALESCE(${dep.meta ? JSON.stringify(dep.meta) : null}::jsonb, meta),
        updated_at = now()
      WHERE id = ${dep.id}
        AND (
          ${guard}::timestamptz IS NULL
          OR date_trunc('milliseconds', updated_at)
             = date_trunc('milliseconds', ${guard}::timestamptz)
        )
      RETURNING *
    `;

    if (rows.length) {
      patched.push(rows[0]);
      continue;
    }

    const current = await db()`SELECT * FROM dependencies WHERE id = ${dep.id}`;
    if (current[0]) conflicts.push({ id: dep.id, current: current[0] });
  }

  if (conflicts.length) {
    conflict(res, conflicts, { dependencies: patched });
    return;
  }

  sendJson(res, 200, { dependencies: patched });
}

async function deleteDependency(req, res, auth) {
  const id = String(req.query?.id || parseJsonBody(req)?.id || '').trim();
  if (!id) {
    badRequest(res, 'id query param is required.');
    return;
  }

  await touchUser(auth);
  await db()`DELETE FROM dependencies WHERE id = ${id}`;
  sendJson(res, 200, { deleted: id });
}
