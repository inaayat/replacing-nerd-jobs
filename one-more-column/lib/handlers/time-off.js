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

export async function handleTimeOff(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'POST') return createTimeOff(req, res, auth);
  if (req.method === 'DELETE') return deleteTimeOff(req, res, auth);
  methodNotAllowed(res, 'POST or DELETE');
}

async function createTimeOff(req, res, auth) {
  const workspaceId = await requireWorkspace(req, res);
  if (!workspaceId) return;

  const body = parseJsonBody(req);
  if (!body?.resource_id || !body?.start_date || !body?.end_date) {
    badRequest(res, 'resource_id, start_date, and end_date are required.');
    return;
  }

  const owned = await db()`
    SELECT id FROM resources WHERE id = ${body.resource_id} AND workspace_id = ${workspaceId}
  `;
  if (!owned.length) {
    sendJson(res, 404, { error: 'Resource not found in workspace.' });
    return;
  }

  await touchUser(auth);
  const id = newId();
  await db()`
    INSERT INTO resource_time_off (id, resource_id, start_date, end_date, hours_per_day, reason)
    VALUES (
      ${id}, ${body.resource_id}, ${body.start_date}, ${body.end_date},
      ${body.hours_per_day ?? null}, ${body.reason || null}
    )
  `;

  const rows = await db()`SELECT * FROM resource_time_off WHERE id = ${id}`;
  sendJson(res, 201, { time_off: rows[0] });
}

async function deleteTimeOff(req, res, auth) {
  const id = String(req.query?.id || '').trim();
  if (!id) {
    badRequest(res, 'id query param is required.');
    return;
  }
  await touchUser(auth);
  await db()`DELETE FROM resource_time_off WHERE id = ${id}`;
  sendJson(res, 200, { deleted: id });
}
