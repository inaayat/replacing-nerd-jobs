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

/**
 * Changelog helpers live here; `handleAssumptions` is legacy.
 * The Assumptions Settings UI was removed — open Planner gates replaced it.
 * Keep the table + route so old data and scripts don't break.
 */
export async function logChangelog({ cycleId, scenarioId, entityType, entityId, action, summary, actorId }) {
  if (!cycleId) return;
  try {
    await db()`
      INSERT INTO plan_changelog (id, cycle_id, scenario_id, entity_type, entity_id, action, summary, actor_user_id)
      VALUES (${newId()}, ${cycleId}, ${scenarioId || null}, ${entityType}, ${entityId || null}, ${action}, ${summary}, ${actorId || null})
    `;
  } catch (err) {
    console.error('plan_changelog write failed', err);
  }
}

export async function handleAssumptions(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return listAssumptions(res, req);
  if (req.method === 'POST') return createAssumption(req, res, auth);
  if (req.method === 'PATCH') return patchAssumptions(req, res, auth);
  if (req.method === 'DELETE') return deleteAssumption(req, res, auth);
  methodNotAllowed(res, 'GET, POST, PATCH, or DELETE');
}

async function listAssumptions(res, req) {
  const cycleId = String(req.query?.cycle || '').trim();
  if (!cycleId) {
    badRequest(res, 'cycle query param is required.');
    return;
  }

  const assumptions = await db()`
    SELECT id, cycle_id, text, status, owner_user_id, created_at, updated_at
    FROM assumptions WHERE cycle_id = ${cycleId} AND status = 'active'
    ORDER BY created_at ASC
  `;
  sendJson(res, 200, { assumptions });
}

async function createAssumption(req, res, auth) {
  const body = parseJsonBody(req);
  if (!body?.cycle_id || !body?.text?.trim()) {
    badRequest(res, 'cycle_id and text are required.');
    return;
  }

  await touchUser(auth);
  const id = newId();
  await db()`
    INSERT INTO assumptions (id, cycle_id, text, status, owner_user_id)
    VALUES (${id}, ${body.cycle_id}, ${body.text.trim()}, 'active', ${auth.sub})
  `;

  await logChangelog({
    cycleId: body.cycle_id,
    entityType: 'assumption',
    entityId: id,
    action: 'create',
    summary: `Added assumption: ${body.text.trim().slice(0, 80)}`,
    actorId: auth.sub,
  });

  const rows = await db()`SELECT * FROM assumptions WHERE id = ${id}`;
  sendJson(res, 201, { assumption: rows[0] });
}

async function patchAssumptions(req, res, auth) {
  const body = parseJsonBody(req);
  const updates = Array.isArray(body?.assumptions) ? body.assumptions : body?.id ? [body] : [];
  if (!updates.length) {
    badRequest(res, 'Provide assumptions[] or a single assumption with id.');
    return;
  }

  await touchUser(auth);
  const patched = [];
  for (const item of updates) {
    if (!item.id) continue;
    await db()`
      UPDATE assumptions SET
        text = COALESCE(${item.text ?? null}, text),
        status = COALESCE(${item.status ?? null}, status),
        updated_at = now()
      WHERE id = ${item.id}
    `;
    const rows = await db()`SELECT * FROM assumptions WHERE id = ${item.id}`;
    if (rows[0]) patched.push(rows[0]);
  }
  sendJson(res, 200, { assumptions: patched });
}

async function deleteAssumption(req, res, auth) {
  const id = String(req.query?.id || parseJsonBody(req)?.id || '').trim();
  if (!id) {
    badRequest(res, 'id query param is required.');
    return;
  }
  await touchUser(auth);
  await db()`UPDATE assumptions SET status = 'archived', updated_at = now() WHERE id = ${id}`;
  sendJson(res, 200, { deleted: id });
}

export async function handleChangelog(req, res) {
  const auth = await requireAuth(req, res, { methods: ['GET'] });
  if (!auth) return;

  const cycleId = String(req.query?.cycle || '').trim();
  if (!cycleId) {
    badRequest(res, 'cycle query param is required.');
    return;
  }

  const limit = Math.min(Number(req.query?.limit || 50), 200);
  const entries = await db()`
    SELECT id, cycle_id, scenario_id, entity_type, entity_id, action, summary, actor_user_id, created_at
    FROM plan_changelog WHERE cycle_id = ${cycleId}
    ORDER BY created_at DESC LIMIT ${limit}
  `;
  sendJson(res, 200, { changelog: entries });
}
