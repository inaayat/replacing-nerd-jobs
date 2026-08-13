import { db } from './db.js';
import { badRequest, parseJsonBody, sendJson } from './api-helpers.js';

/** Read workspace id from query string or JSON body. */
export function workspaceIdFromRequest(req) {
  const fromQuery = String(req.query?.workspace || '').trim();
  if (fromQuery) return fromQuery;
  const body = parseJsonBody(req);
  return String(body?.workspace_id || '').trim();
}

/** Validates workspace exists; sends error response and returns null if missing. */
export async function requireWorkspace(req, res) {
  const workspaceId = workspaceIdFromRequest(req);
  if (!workspaceId) {
    badRequest(res, 'workspace query param (or workspace_id in body) is required.');
    return null;
  }

  const rows = await db()`SELECT id FROM workspaces WHERE id = ${workspaceId}`;
  if (!rows.length) {
    sendJson(res, 404, { error: 'Workspace not found.' });
    return null;
  }
  return workspaceId;
}
