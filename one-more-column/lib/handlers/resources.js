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
import { requireWorkspace } from '../workspace-scope.js';
import { logChangelog } from './assumptions.js';

export async function handleResources(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return listResources(req, res);
  if (req.method === 'POST') return createResource(req, res, auth);
  if (req.method === 'PATCH') return patchResources(req, res, auth);
  if (req.method === 'DELETE') return deleteResource(req, res, auth);
  methodNotAllowed(res, 'GET, POST, PATCH, or DELETE');
}

async function listResources(req, res) {
  const workspaceId = await requireWorkspace(req, res);
  if (!workspaceId) return;

  const team = String(req.query?.team || '').trim();
  const activeOnly = req.query?.active !== 'false';

  let resources;
  if (team && activeOnly) {
    resources = await db()`
      SELECT id, workspace_id, name, email, team, active, jira_account_id, created_at, updated_at
      FROM resources
      WHERE workspace_id = ${workspaceId} AND active = true AND team = ${team}
      ORDER BY team NULLS LAST, name
    `;
  } else if (team) {
    resources = await db()`
      SELECT id, workspace_id, name, email, team, active, jira_account_id, created_at, updated_at
      FROM resources
      WHERE workspace_id = ${workspaceId} AND team = ${team}
      ORDER BY team NULLS LAST, name
    `;
  } else if (activeOnly) {
    resources = await db()`
      SELECT id, workspace_id, name, email, team, active, jira_account_id, created_at, updated_at
      FROM resources
      WHERE workspace_id = ${workspaceId} AND active = true
      ORDER BY team NULLS LAST, name
    `;
  } else {
    resources = await db()`
      SELECT id, workspace_id, name, email, team, active, jira_account_id, created_at, updated_at
      FROM resources
      WHERE workspace_id = ${workspaceId}
      ORDER BY team NULLS LAST, name
    `;
  }

  const ids = resources.map((r) => r.id);
  let profiles = [];
  let timeOff = [];
  if (ids.length) {
    profiles = await db()`
      SELECT id, resource_id, effective_from, weekly_hours, daily_hours, created_at
      FROM resource_profiles
      WHERE resource_id = ANY(${ids})
      ORDER BY effective_from DESC
    `;
    timeOff = await db()`
      SELECT id, resource_id, start_date, end_date, hours_per_day, reason, created_at
      FROM resource_time_off
      WHERE resource_id = ANY(${ids})
      ORDER BY start_date
    `;
  }

  const enriched = resources.map((r) => ({
    ...r,
    profiles: profiles.filter((p) => p.resource_id === r.id),
    time_off: timeOff.filter((t) => t.resource_id === r.id),
  }));

  const teams = [...new Set(resources.map((r) => r.team).filter(Boolean))].sort();
  sendJson(res, 200, { resources: enriched, teams, workspace_id: workspaceId });
}

async function createResource(req, res, auth) {
  const workspaceId = await requireWorkspace(req, res);
  if (!workspaceId) return;

  const body = parseJsonBody(req);
  if (!body?.name?.trim()) {
    badRequest(res, 'name is required.');
    return;
  }

  await touchUser(auth);
  const id = newId();
  await db()`
    INSERT INTO resources (id, workspace_id, name, email, team, active, jira_account_id)
    VALUES (
      ${id},
      ${workspaceId},
      ${body.name.trim()},
      ${body.email || null},
      ${body.team || null},
      ${body.active !== false},
      ${body.jira_account_id || null}
    )
  `;

  if (body.weekly_hours != null || body.daily_hours != null) {
    await db()`
      INSERT INTO resource_profiles (id, resource_id, effective_from, weekly_hours, daily_hours)
      VALUES (
        ${newId()},
        ${id},
        ${body.effective_from || new Date().toISOString().slice(0, 10)},
        ${body.weekly_hours ?? null},
        ${body.daily_hours ?? null}
      )
    `;
  }

  const rows = await db()`
    SELECT id, workspace_id, name, email, team, active, jira_account_id, created_at, updated_at
    FROM resources WHERE id = ${id}
  `;
  sendJson(res, 201, { resource: rows[0] });
}

async function patchResources(req, res, auth) {
  const workspaceId = await requireWorkspace(req, res);
  if (!workspaceId) return;

  const body = parseJsonBody(req);
  const updates = Array.isArray(body?.resources) ? body.resources : body?.id ? [body] : [];
  if (!updates.length) {
    badRequest(res, 'Provide resources[] or a single resource with id.');
    return;
  }

  await touchUser(auth);
  const patched = [];

  for (const item of updates) {
    if (!item.id) continue;

    const owned = await db()`
      SELECT id FROM resources WHERE id = ${item.id} AND workspace_id = ${workspaceId}
    `;
    if (!owned.length) continue;

    await db()`
      UPDATE resources SET
        name = COALESCE(${item.name ?? null}, name),
        email = COALESCE(${item.email ?? null}, email),
        team = COALESCE(${item.team ?? null}, team),
        active = COALESCE(${item.active ?? null}, active),
        jira_account_id = COALESCE(${item.jira_account_id ?? null}, jira_account_id),
        updated_at = now()
      WHERE id = ${item.id} AND workspace_id = ${workspaceId}
    `;

    if (item.weekly_hours != null || item.daily_hours != null) {
      await db()`
        INSERT INTO resource_profiles (id, resource_id, effective_from, weekly_hours, daily_hours)
        VALUES (
          ${newId()},
          ${item.id},
          ${item.effective_from || new Date().toISOString().slice(0, 10)},
          ${item.weekly_hours ?? null},
          ${item.daily_hours ?? null}
        )
      `;
    }

    const rows = await db()`
      SELECT id, workspace_id, name, email, team, active, jira_account_id, created_at, updated_at
      FROM resources WHERE id = ${item.id}
    `;
    if (rows[0]) patched.push(rows[0]);
  }

  const cycleRows = await db()`
    SELECT id FROM planning_cycles WHERE workspace_id = ${workspaceId} ORDER BY updated_at DESC
  `;

  for (const row of patched) {
    for (const cycle of cycleRows) {
      await logChangelog({
        cycleId: cycle.id,
        entityType: 'resource',
        entityId: row.id,
        action: 'update',
        summary: `Updated team member: ${(row.name || 'Unnamed').slice(0, 80)}`,
        actorId: auth.sub,
      });
    }
  }

  sendJson(res, 200, { resources: patched, workspace_id: workspaceId });
}

async function deleteResource(req, res, auth) {
  const workspaceId = await requireWorkspace(req, res);
  if (!workspaceId) return;

  const id = String(req.query?.id || '').trim();
  if (!id) {
    badRequest(res, 'id query param is required.');
    return;
  }

  const owned = await db()`
    SELECT id FROM resources WHERE id = ${id} AND workspace_id = ${workspaceId}
  `;
  if (!owned.length) {
    sendJson(res, 404, { error: 'Resource not found in workspace.' });
    return;
  }

  await touchUser(auth);
  await db()`DELETE FROM resources WHERE id = ${id}`;
  sendJson(res, 200, { deleted: id });
}
