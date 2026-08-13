import { db } from '../db.js';
import { badRequest, requireAuth, sendJson } from '../api-helpers.js';
import { capacityToCsv, planToCsv } from '../export-csv.js';
import { buildCapacityForCycle } from '../capacity-build.js';

export async function handleExport(req, res) {
  const auth = await requireAuth(req, res, { methods: ['GET'] });
  if (!auth) return;

  const type = String(req.query?.type || 'capacity').trim();
  const format = String(req.query?.format || 'csv').trim();
  const cycleId = String(req.query?.cycle || '').trim();
  const scenarioId = String(req.query?.scenario || '').trim();

  if (!cycleId) {
    badRequest(res, 'cycle query param is required.');
    return;
  }

  if (type === 'plan') {
    const scenario = scenarioId || (await defaultScenarioId(cycleId));
    if (!scenario) {
      sendJson(res, 404, { error: 'No scenario found.' });
      return;
    }
    const items = await db()`
      SELECT unique_key, title, phase, work_hours, review_hours, due_week, source
      FROM plan_items WHERE scenario_id = ${scenario}
      ORDER BY due_week NULLS LAST, title
    `;
    const csv = planToCsv(items);
    return sendExport(res, format, `plan-${cycleId.slice(0, 8)}.csv`, csv, { plan_items: items });
  }

  if (type === 'capacity') {
    const grid = await buildCapacityForCycle({
      cycleId,
      scenarioId,
      team: String(req.query?.team || '').trim(),
      mode: req.query?.mode === 'spread' ? 'spread' : 'due',
    });
    if (!grid) {
      sendJson(res, 404, { error: 'Cycle or scenario not found.' });
      return;
    }
    const csv = capacityToCsv(grid);
    return sendExport(res, format, `capacity-${cycleId.slice(0, 8)}.csv`, csv, grid);
  }

  if (type === 'drift') {
    return exportDrift(res, cycleId, scenarioId);
  }

  badRequest(res, 'type must be plan, capacity, or drift.');
}

function sendExport(res, format, filename, csv, jsonPayload) {
  if (format === 'json') {
    sendJson(res, 200, jsonPayload);
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csv);
}

async function defaultScenarioId(cycleId) {
  const rows = await db()`
    SELECT id FROM scenarios WHERE cycle_id = ${cycleId} ORDER BY created_at LIMIT 1
  `;
  return rows[0]?.id || null;
}

async function exportDrift(res, cycleId, scenarioId) {
  const scenario = scenarioId || (await defaultScenarioId(cycleId));
  if (!scenario) {
    sendJson(res, 404, { error: 'No scenario found.' });
    return;
  }

  const snapshotRows = await db()`
    SELECT id, row_count, snapshot, created_at
    FROM import_snapshots WHERE cycle_id = ${cycleId} AND scenario_id = ${scenario}
    ORDER BY created_at DESC LIMIT 1
  `;
  if (!snapshotRows.length) {
    sendJson(res, 200, { drift: [], message: 'No import snapshot to compare against.' });
    return;
  }

  const current = await db()`
    SELECT unique_key, title, work_hours, review_hours, due_week, phase
    FROM plan_items WHERE scenario_id = ${scenario}
  `;
  const snapshot = snapshotRows[0].snapshot || [];
  const currentByKey = new Map(current.map((r) => [r.unique_key, r]));
  const snapByKey = new Map(snapshot.map((r) => [r.unique_key, r]));

  const drift = [];
  for (const [key, row] of currentByKey) {
    const prev = snapByKey.get(key);
    if (!prev) {
      drift.push({ unique_key: key, change: 'added', current: row });
      continue;
    }
    if (
      Number(prev.work_hours) !== Number(row.work_hours) ||
      String(prev.due_week || '') !== String(row.due_week || '') ||
      prev.title !== row.title
    ) {
      drift.push({ unique_key: key, change: 'modified', before: prev, after: row });
    }
  }
  for (const [key, row] of snapByKey) {
    if (!currentByKey.has(key)) drift.push({ unique_key: key, change: 'removed', before: row });
  }

  sendJson(res, 200, {
    drift,
    snapshot_at: snapshotRows[0].created_at,
    added: drift.filter((d) => d.change === 'added').length,
    modified: drift.filter((d) => d.change === 'modified').length,
    removed: drift.filter((d) => d.change === 'removed').length,
  });
}
