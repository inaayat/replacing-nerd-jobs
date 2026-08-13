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
import { logChangelog } from './assumptions.js';

export async function handlePlanItems(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return listPlanItems(res, req);
  if (req.method === 'POST') return createPlanItem(req, res, auth);
  if (req.method === 'PATCH') return patchPlanItems(req, res, auth);
  if (req.method === 'DELETE') return deletePlanItem(req, res, auth);
  methodNotAllowed(res, 'GET, POST, PATCH, or DELETE');
}

async function listPlanItems(res, req) {
  const cycleId = String(req.query?.cycle || '').trim();
  const scenarioId = String(req.query?.scenario || '').trim();

  if (!cycleId && !scenarioId) {
    badRequest(res, 'cycle or scenario query param is required.');
    return;
  }

  const items = scenarioId
    ? await db()`
        SELECT *
        FROM plan_items
        WHERE scenario_id = ${scenarioId}
        ORDER BY due_week NULLS LAST, title
      `
    : await db()`
        SELECT *
        FROM plan_items
        WHERE cycle_id = ${cycleId}
        ORDER BY due_week NULLS LAST, title
      `;

  sendJson(res, 200, { plan_items: items });
}

async function createPlanItem(req, res, auth) {
  const body = parseJsonBody(req);
  if (!body?.cycle_id || !body?.scenario_id || !body?.title?.trim()) {
    badRequest(res, 'cycle_id, scenario_id, and title are required.');
    return;
  }

  await touchUser(auth);
  const id = newId();
  const uniqueKey = body.unique_key || `manual-${id.slice(0, 8)}`;

  await db()`
    INSERT INTO plan_items (
      id, cycle_id, scenario_id, unique_key, title, phase, source,
      work_hours, review_hours, due_week, assignee_ids, attributes
    ) VALUES (
      ${id},
      ${body.cycle_id},
      ${body.scenario_id},
      ${uniqueKey},
      ${body.title.trim()},
      ${body.phase || null},
      ${body.source || 'manual'},
      ${Number(body.work_hours || 0)},
      ${Number(body.review_hours || 0)},
      ${body.due_week || null},
      ${body.assignee_ids || []},
      ${JSON.stringify(body.attributes || {})}::jsonb
    )
  `;

  const rows = await db()`SELECT * FROM plan_items WHERE id = ${id}`;
  await logChangelog({
    cycleId: body.cycle_id,
    scenarioId: body.scenario_id,
    entityType: 'plan_item',
    entityId: id,
    action: 'create',
    summary: `Added work item: ${body.title.trim().slice(0, 80)}`,
    actorId: auth.sub,
  });
  sendJson(res, 201, { plan_item: rows[0] });
}

async function patchPlanItems(req, res, auth) {
  const body = parseJsonBody(req);
  const updates = Array.isArray(body?.plan_items) ? body.plan_items : body?.id ? [body] : [];
  if (!updates.length) {
    badRequest(res, 'Provide plan_items[] or a single item with id.');
    return;
  }

  await touchUser(auth);
  const patched = [];
  const conflicts = [];
  // The client sends the updated_at it loaded the row with. Without `force` a
  // write whose guard no longer matches is rejected rather than overwriting an
  // edit someone else made in between. Comparison is truncated to milliseconds
  // because that is all a JSON round-trip of a timestamptz reliably preserves.
  const force = Boolean(body.force);

  for (const item of updates) {
    if (!item.id) continue;
    const guard = force ? null : item.updated_at || null;

    const rows = await db()`
      UPDATE plan_items SET
        title = COALESCE(${item.title ?? null}, title),
        phase = COALESCE(${item.phase ?? null}, phase),
        work_hours = COALESCE(${item.work_hours ?? null}, work_hours),
        review_hours = COALESCE(${item.review_hours ?? null}, review_hours),
        due_week = COALESCE(${item.due_week ?? null}, due_week),
        assignee_ids = COALESCE(${item.assignee_ids ?? null}, assignee_ids),
        attributes = COALESCE(${item.attributes ? JSON.stringify(item.attributes) : null}::jsonb, attributes),
        updated_at = now()
      WHERE id = ${item.id}
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

    const current = await db()`SELECT * FROM plan_items WHERE id = ${item.id}`;
    // A missing row is a delete, not a conflict — nothing to reconcile.
    if (current[0]) conflicts.push({ id: item.id, current: current[0] });
  }

  if (conflicts.length) {
    conflict(res, conflicts, { plan_items: patched });
    return;
  }

  for (const row of patched) {
    await logChangelog({
      cycleId: row.cycle_id,
      scenarioId: row.scenario_id,
      entityType: 'plan_item',
      entityId: row.id,
      action: 'update',
      summary: `Updated work item: ${(row.title || 'Untitled').slice(0, 80)}`,
      actorId: auth.sub,
    });
  }

  sendJson(res, 200, { plan_items: patched });
}

async function deletePlanItem(req, res, auth) {
  const id = String(req.query?.id || parseJsonBody(req)?.id || '').trim();
  if (!id) {
    badRequest(res, 'id query param is required.');
    return;
  }

  await touchUser(auth);
  const existing = await db()`SELECT id, cycle_id, scenario_id, title FROM plan_items WHERE id = ${id}`;
  await db()`DELETE FROM plan_items WHERE id = ${id}`;
  if (existing[0]) {
    await logChangelog({
      cycleId: existing[0].cycle_id,
      scenarioId: existing[0].scenario_id,
      entityType: 'plan_item',
      entityId: id,
      action: 'delete',
      summary: `Deleted work item: ${(existing[0].title || 'Untitled').slice(0, 80)}`,
      actorId: auth.sub,
    });
  }
  sendJson(res, 200, { deleted: id });
}
