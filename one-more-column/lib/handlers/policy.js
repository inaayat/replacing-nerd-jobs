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
import { logChangelog } from './assumptions.js';

export async function handlePolicy(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const cycleId = String(req.query?.cycle || '').trim();
  if (!cycleId) {
    badRequest(res, 'cycle query param is required.');
    return;
  }

  if (req.method === 'GET') return getPolicy(res, cycleId);
  if (req.method === 'PUT') return putPolicy(req, res, auth, cycleId);
  methodNotAllowed(res, 'GET or PUT');
}

async function getPolicy(res, cycleId) {
  const rows = await db()`
    SELECT id, cycle_id, version, config, created_by, created_at
    FROM planning_policies
    WHERE cycle_id = ${cycleId}
    ORDER BY version DESC
    LIMIT 1
  `;
  if (!rows.length) {
    sendJson(res, 404, { error: 'No policy found for cycle.' });
    return;
  }
  sendJson(res, 200, { policy: rows[0] });
}

async function putPolicy(req, res, auth, cycleId) {
  const body = parseJsonBody(req);
  if (!body?.config || typeof body.config !== 'object') {
    badRequest(res, 'config object is required.');
    return;
  }

  const cycleRows = await db()`SELECT id FROM planning_cycles WHERE id = ${cycleId}`;
  if (!cycleRows.length) {
    sendJson(res, 404, { error: 'Cycle not found.' });
    return;
  }

  await touchUser(auth);

  const latest = await db()`
    SELECT version FROM planning_policies
    WHERE cycle_id = ${cycleId}
    ORDER BY version DESC
    LIMIT 1
  `;
  const nextVersion = (latest[0]?.version || 0) + 1;
  const config = { ...DEFAULT_POLICY_CONFIG, ...body.config };
  const policyId = newId();

  await db()`
    INSERT INTO planning_policies (id, cycle_id, version, config, created_by)
    VALUES (${policyId}, ${cycleId}, ${nextVersion}, ${JSON.stringify(config)}::jsonb, ${auth.sub})
  `;

  const rows = await db()`
    SELECT id, cycle_id, version, config, created_by, created_at
    FROM planning_policies WHERE id = ${policyId}
  `;
  await logChangelog({
    cycleId,
    entityType: 'policy',
    entityId: policyId,
    action: 'update',
    summary: 'Updated planning rules',
    actorId: auth.sub,
  });
  sendJson(res, 200, { policy: rows[0] });
}
