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

const DEFAULT_WORKSPACE_NAME = 'Default workspace';

export async function handleWorkspaces(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return listWorkspaces(res);
  if (req.method === 'POST') return createWorkspace(req, res, auth);
  if (req.method === 'PATCH') return patchWorkspace(req, res, auth);
  if (req.method === 'DELETE') return deleteWorkspace(req, res, auth);
  methodNotAllowed(res, 'GET, POST, PATCH, or DELETE');
}

async function listWorkspaces(res) {
  await ensureDefaultWorkspace();
  const workspaces = await db()`
    SELECT id, name, profile, description, created_at, updated_at
    FROM workspaces
    ORDER BY created_at ASC
  `;
  sendJson(res, 200, { workspaces });
}

async function createWorkspace(req, res, auth) {
  const body = parseJsonBody(req);
  if (!body?.name?.trim()) {
    badRequest(res, 'name is required.');
    return;
  }

  await touchUser(auth);
  const id = newId();
  await db()`
    INSERT INTO workspaces (id, name, profile, description)
    VALUES (
      ${id},
      ${body.name.trim()},
      ${body.profile || 'default'},
      ${body.description || null}
    )
  `;

  const rows = await db()`
    SELECT id, name, profile, description, created_at, updated_at
    FROM workspaces WHERE id = ${id}
  `;
  sendJson(res, 201, { workspace: rows[0] });
}

async function patchWorkspace(req, res, auth) {
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

  const existing = await db()`SELECT id FROM workspaces WHERE id = ${id}`;
  if (!existing.length) {
    sendJson(res, 404, { error: 'Workspace not found.' });
    return;
  }

  await touchUser(auth);
  await db()`
    UPDATE workspaces SET name = ${name}, updated_at = now() WHERE id = ${id}
  `;
  const rows = await db()`
    SELECT id, name, profile, description, created_at, updated_at
    FROM workspaces WHERE id = ${id}
  `;
  sendJson(res, 200, { workspace: rows[0] });
}

async function deleteWorkspace(req, res, auth) {
  const id = String(req.query?.id || '').trim();
  if (!id) {
    badRequest(res, 'id query param is required.');
    return;
  }

  const countRows = await db()`SELECT count(*)::int AS n FROM workspaces`;
  if (countRows[0].n <= 1) {
    badRequest(res, 'Cannot delete the only workspace.');
    return;
  }

  const rows = await db()`SELECT id FROM workspaces WHERE id = ${id}`;
  if (!rows.length) {
    sendJson(res, 404, { error: 'Workspace not found.' });
    return;
  }

  await touchUser(auth);

  const cycleIds = await db()`
    SELECT id FROM planning_cycles WHERE workspace_id = ${id}
  `;
  for (const { id: cycleId } of cycleIds) {
    await db()`DELETE FROM planning_cycles WHERE id = ${cycleId}`;
  }

  await db()`DELETE FROM resources WHERE workspace_id = ${id}`;
  await db()`DELETE FROM field_definitions WHERE workspace_id = ${id}`;
  await db()`DELETE FROM task_types WHERE workspace_id = ${id}`;
  await db()`DELETE FROM workspaces WHERE id = ${id}`;

  sendJson(res, 200, { deleted: id });
}

/** Ensures at least one workspace exists and backfills orphan rows (H1 → H1.5 migration). */
export async function ensureDefaultWorkspace() {
  let rows = await db()`SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`;
  if (!rows.length) {
    const id = newId();
    await db()`
      INSERT INTO workspaces (id, name, profile, description)
      VALUES (${id}, ${DEFAULT_WORKSPACE_NAME}, 'default', 'Migrated from H1')
    `;
    rows = [{ id }];
  }

  const defaultId = rows[0].id;
  await db()`UPDATE planning_cycles SET workspace_id = ${defaultId} WHERE workspace_id IS NULL`;
  await db()`UPDATE resources SET workspace_id = ${defaultId} WHERE workspace_id IS NULL`;
  await db()`UPDATE field_definitions SET workspace_id = ${defaultId} WHERE workspace_id IS NULL`;
  return defaultId;
}
