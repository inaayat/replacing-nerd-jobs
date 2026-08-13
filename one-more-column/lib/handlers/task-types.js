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
import { VALID_FIELD_TYPES } from '../csv.js';

const DEFAULT_TASK_TYPES = [
  ['general', 'General'],
  ['deliverable', 'Deliverable'],
  ['review', 'Review'],
  ['meeting', 'Meeting'],
  ['admin', 'Admin'],
  ['other', 'Other'],
];

const VALID_DAY_KINDS = new Set(['business', 'calendar']);
const VALID_DEP_TYPES = new Set([
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

export async function handleTaskTypes(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return listTaskTypes(req, res);
  if (req.method === 'POST') return createTaskType(req, res, auth);
  if (req.method === 'PATCH') return patchTaskType(req, res, auth);
  if (req.method === 'DELETE') return deleteTaskType(req, res, auth);
  methodNotAllowed(res, 'GET, POST, PATCH, or DELETE');
}

/** Slugify a label into a stable key: "Control Testing" → "control_testing". */
export function slugifyKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64) || 'type';
}

async function ensureDefaultTaskTypes(workspaceId) {
  const existing = await db()`
    SELECT id FROM task_types WHERE workspace_id = ${workspaceId} LIMIT 1
  `;
  if (existing.length) return;

  for (const [key, label] of DEFAULT_TASK_TYPES) {
    await db()`
      INSERT INTO task_types (id, workspace_id, key, label)
      VALUES (${newId()}, ${workspaceId}, ${key}, ${label})
      ON CONFLICT (workspace_id, key) DO NOTHING
    `;
  }
}

function normalizeOptions(raw) {
  if (Array.isArray(raw)) {
    return raw.map((o) => String(o).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  return null;
}

async function loadTypesWithChildren(workspaceId) {
  const types = await db()`
    SELECT id, workspace_id, key, label, created_at, updated_at
    FROM task_types
    WHERE workspace_id = ${workspaceId}
    ORDER BY label ASC
  `;

  const ids = types.map((t) => t.id);
  let steps = [];
  let fields = [];
  if (ids.length) {
    steps = await db()`
      SELECT id, task_type_id, seq, label, duration_days, day_kind, dep_type, created_at, updated_at
      FROM gate_templates
      WHERE task_type_id = ANY(${ids})
      ORDER BY seq ASC
    `;
    fields = await db()`
      SELECT id, task_type_id, key, label, field_type, options, required, seq
      FROM task_type_fields
      WHERE task_type_id = ANY(${ids})
      ORDER BY seq ASC
    `;
  }

  return types.map((t) => ({
    ...t,
    gate_templates: steps.filter((s) => s.task_type_id === t.id),
    fields: fields.filter((f) => f.task_type_id === t.id),
  }));
}

async function listTaskTypes(req, res) {
  const workspaceId = await requireWorkspace(req, res);
  if (!workspaceId) return;

  await ensureDefaultTaskTypes(workspaceId);
  const taskTypes = await loadTypesWithChildren(workspaceId);
  sendJson(res, 200, { task_types: taskTypes, workspace_id: workspaceId });
}

async function createTaskType(req, res, auth) {
  const workspaceId = await requireWorkspace(req, res);
  if (!workspaceId) return;

  const body = parseJsonBody(req);
  if (!body?.label?.trim()) {
    badRequest(res, 'label is required.');
    return;
  }

  await ensureDefaultTaskTypes(workspaceId);
  await touchUser(auth);

  const label = body.label.trim();
  let key = body.key?.trim() ? slugifyKey(body.key) : slugifyKey(label);

  // Avoid colliding with an existing key by appending a short suffix.
  const clash = await db()`
    SELECT id FROM task_types WHERE workspace_id = ${workspaceId} AND key = ${key}
  `;
  if (clash.length) {
    key = `${key}_${newId().slice(0, 8)}`;
  }

  const id = newId();
  await db()`
    INSERT INTO task_types (id, workspace_id, key, label)
    VALUES (${id}, ${workspaceId}, ${key}, ${label})
  `;

  const rows = await db()`
    SELECT id, workspace_id, key, label, created_at, updated_at
    FROM task_types WHERE id = ${id}
  `;
  sendJson(res, 201, { task_type: { ...rows[0], gate_templates: [], fields: [] } });
}

async function replaceGateTemplates(taskTypeId, steps) {
  await db()`DELETE FROM gate_templates WHERE task_type_id = ${taskTypeId}`;

  if (!Array.isArray(steps)) return [];

  const inserted = [];
  let seq = 0;
  for (const step of steps) {
    if (!step?.label?.trim()) continue;
    seq += 1;
    const dayKind = VALID_DAY_KINDS.has(step.day_kind) ? step.day_kind : 'business';
    const depType = VALID_DEP_TYPES.has(step.dep_type) ? step.dep_type : 'input_ready';
    const duration = Number(step.duration_days);
    const durationDays = Number.isFinite(duration) && duration > 0 ? duration : 1;
    const id = step.id && String(step.id).trim() ? String(step.id).trim() : newId();

    await db()`
      INSERT INTO gate_templates (id, task_type_id, seq, label, duration_days, day_kind, dep_type)
      VALUES (
        ${id},
        ${taskTypeId},
        ${seq},
        ${step.label.trim()},
        ${durationDays},
        ${dayKind},
        ${depType}
      )
    `;
    inserted.push({
      id,
      task_type_id: taskTypeId,
      seq,
      label: step.label.trim(),
      duration_days: durationDays,
      day_kind: dayKind,
      dep_type: depType,
    });
  }
  return inserted;
}

async function replaceFields(taskTypeId, fields) {
  await db()`DELETE FROM task_type_fields WHERE task_type_id = ${taskTypeId}`;

  if (!Array.isArray(fields)) return [];

  const inserted = [];
  const usedKeys = new Set();
  let seq = 0;
  for (const field of fields) {
    if (!field?.label?.trim()) continue;
    seq += 1;
    const label = field.label.trim();
    let key = field.key?.trim() ? slugifyKey(field.key) : slugifyKey(label);
    if (usedKeys.has(key)) {
      key = `${key}_${seq}`;
    }
    usedKeys.add(key);

    const fieldType = VALID_FIELD_TYPES.has(field.field_type) ? field.field_type : 'text';
    const options = fieldType === 'select' ? normalizeOptions(field.options) : null;
    const required = Boolean(field.required);
    const id = field.id && String(field.id).trim() ? String(field.id).trim() : newId();

    await db()`
      INSERT INTO task_type_fields (id, task_type_id, key, label, field_type, options, required, seq)
      VALUES (
        ${id},
        ${taskTypeId},
        ${key},
        ${label},
        ${fieldType},
        ${options ? JSON.stringify(options) : null}::jsonb,
        ${required},
        ${seq}
      )
    `;
    inserted.push({
      id,
      task_type_id: taskTypeId,
      key,
      label,
      field_type: fieldType,
      options,
      required,
      seq,
    });
  }
  return inserted;
}

async function loadFieldsForType(taskTypeId) {
  return db()`
    SELECT id, task_type_id, key, label, field_type, options, required, seq
    FROM task_type_fields WHERE task_type_id = ${taskTypeId} ORDER BY seq ASC
  `;
}

async function loadGatesForType(taskTypeId) {
  return db()`
    SELECT id, task_type_id, seq, label, duration_days, day_kind, dep_type, created_at, updated_at
    FROM gate_templates WHERE task_type_id = ${taskTypeId} ORDER BY seq ASC
  `;
}

async function patchTaskType(req, res, auth) {
  const workspaceId = await requireWorkspace(req, res);
  if (!workspaceId) return;

  const body = parseJsonBody(req);
  if (!body?.id) {
    badRequest(res, 'id is required.');
    return;
  }

  const owned = await db()`
    SELECT id FROM task_types WHERE id = ${body.id} AND workspace_id = ${workspaceId}
  `;
  if (!owned.length) {
    sendJson(res, 404, { error: 'Task type not found in workspace.' });
    return;
  }

  await touchUser(auth);

  if (body.label != null) {
    const label = String(body.label).trim();
    if (!label) {
      badRequest(res, 'label cannot be empty.');
      return;
    }
    await db()`
      UPDATE task_types SET label = ${label}, updated_at = now()
      WHERE id = ${body.id} AND workspace_id = ${workspaceId}
    `;
  }

  let gateTemplates;
  if (Array.isArray(body.gate_templates)) {
    gateTemplates = await replaceGateTemplates(body.id, body.gate_templates);
    await db()`UPDATE task_types SET updated_at = now() WHERE id = ${body.id}`;
  }

  let fields;
  if (Array.isArray(body.fields)) {
    fields = await replaceFields(body.id, body.fields);
    await db()`UPDATE task_types SET updated_at = now() WHERE id = ${body.id}`;
  }

  const rows = await db()`
    SELECT id, workspace_id, key, label, created_at, updated_at
    FROM task_types WHERE id = ${body.id}
  `;

  if (gateTemplates === undefined) gateTemplates = await loadGatesForType(body.id);
  if (fields === undefined) fields = await loadFieldsForType(body.id);

  sendJson(res, 200, {
    task_type: { ...rows[0], gate_templates: gateTemplates, fields },
  });
}

async function deleteTaskType(req, res, auth) {
  const workspaceId = await requireWorkspace(req, res);
  if (!workspaceId) return;

  const id = String(req.query?.id || '').trim();
  if (!id) {
    badRequest(res, 'id query param is required.');
    return;
  }

  const owned = await db()`
    SELECT id FROM task_types WHERE id = ${id} AND workspace_id = ${workspaceId}
  `;
  if (!owned.length) {
    sendJson(res, 404, { error: 'Task type not found in workspace.' });
    return;
  }

  await touchUser(auth);
  await db()`DELETE FROM task_types WHERE id = ${id}`;
  sendJson(res, 200, { deleted: id });
}
