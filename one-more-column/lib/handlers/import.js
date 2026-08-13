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
import {
  parseCsv,
  normalizeHeaderKey,
  matchCustomFieldHeaders,
  extractCustomAttributes,
  BUILTIN_IMPORT_KEYS,
} from '../csv.js';
import { logChangelog } from './assumptions.js';

export async function handleImport(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST');
    return;
  }

  const body = parseJsonBody(req);
  const { cycle_id, scenario_id, csv_text, confirm, task_type_id } = body || {};
  if (!cycle_id || !scenario_id || !csv_text) {
    badRequest(res, 'cycle_id, scenario_id, and csv_text are required.');
    return;
  }

  const { headers, rows } = parseCsv(csv_text);
  if (!rows.length) {
    badRequest(res, 'CSV must have a header row and at least one data row.');
    return;
  }

  // Optional task type → load its custom fields (scoped to the cycle's workspace).
  let taskType = null;
  let typeFields = [];
  let matchedCustom = [];
  let unmatchedHeaders = [];
  let recognizedFields = [];

  if (task_type_id) {
    const found = await db()`
      SELECT tt.id, tt.key, tt.label
      FROM task_types tt
      JOIN planning_cycles pc ON pc.workspace_id = tt.workspace_id
      WHERE tt.id = ${task_type_id} AND pc.id = ${cycle_id}
    `;
    if (!found.length) {
      badRequest(res, 'task_type_id does not belong to this plan\'s workspace.');
      return;
    }
    taskType = found[0];
    typeFields = await db()`
      SELECT id, task_type_id, key, label, field_type, options, required, seq
      FROM task_type_fields
      WHERE task_type_id = ${taskType.id}
      ORDER BY seq ASC
    `;
    ({ matched: matchedCustom, unmatchedHeaders, recognizedFields } = matchCustomFieldHeaders(
      headers,
      typeFields,
    ));
  } else {
    // Without a type, any non-built-in header is unmatched (informational only).
    unmatchedHeaders = (headers || []).filter((h) => {
      const norm = normalizeHeaderKey(h);
      return norm && !BUILTIN_IMPORT_KEYS.has(norm);
    });
  }

  // Every lookup goes through normalizeHeaderKey, so "Work Hours", "work_hours"
  // and "WORK_HOURS" all resolve the same way — parseCsv() indexes each row
  // by both its literal and normalized header text.
  const field = (row, ...names) => {
    for (const name of names) {
      const value = row[normalizeHeaderKey(name)];
      if (value) return value;
    }
    return '';
  };

  const normalized = rows.map((row, idx) => {
    const { attributes: customAttrs, warnings } = extractCustomAttributes(row, matchedCustom);
    const attributes = { ...customAttrs };
    if (taskType) attributes.task_type = taskType.key;

    return {
      row: idx + 2,
      title: field(row, 'title', 'name') || `Imported row ${idx + 1}`,
      work_hours: Number(field(row, 'work_hours', 'hours') || 0),
      review_hours: Number(field(row, 'review_hours') || 0),
      due_week: field(row, 'due_week', 'due_date') || null,
      phase: field(row, 'phase') || null,
      unique_key: field(row, 'unique_key', 'key') || `import-${idx + 1}`,
      attributes,
      warnings,
    };
  });

  // If not a single row matched a recognized column, something is wrong with
  // the paste (no header row, or headers using names we don't know) — this is
  // exactly the failure mode that used to silently write "Imported row N"
  // placeholders with zero real data instead of telling the user anything.
  const recognizedAnyColumn = rows.some((row) =>
    ['title', 'name', 'work_hours', 'hours', 'due_week', 'due_date'].some(
      (name) => normalizeHeaderKey(name) in row && row[normalizeHeaderKey(name)],
    ),
  );
  if (!recognizedAnyColumn) {
    badRequest(
      res,
      "Couldn't find a title, work_hours, or due_week column. Make sure the first line is a header row with those column names, and that it's comma-separated (or pasted straight from a spreadsheet).",
    );
    return;
  }

  const previewMeta = {
    task_type_id: taskType?.id || null,
    task_type_key: taskType?.key || null,
    task_type_label: taskType?.label || null,
    matched_fields: recognizedFields.map((f) => ({ key: f.key, label: f.label })),
    unmatched_headers: unmatchedHeaders,
    warning_count: normalized.reduce((n, r) => n + (r.warnings?.length || 0), 0),
  };

  if (!confirm) {
    sendJson(res, 200, {
      preview: true,
      headers,
      rows: normalized,
      count: normalized.length,
      ...previewMeta,
    });
    return;
  }

  await touchUser(auth);
  const inserted = [];
  const snapshot = [];

  for (const row of normalized) {
    const id = newId();
    await db()`
      INSERT INTO plan_items (
        id, cycle_id, scenario_id, unique_key, title, phase, source,
        work_hours, review_hours, due_week, assignee_ids, attributes
      ) VALUES (
        ${id}, ${cycle_id}, ${scenario_id}, ${row.unique_key}, ${row.title},
        ${row.phase}, 'file_import', ${row.work_hours}, ${row.review_hours},
        ${row.due_week}, ${[]}, ${JSON.stringify(row.attributes || {})}::jsonb
      )
    `;
    inserted.push(id);
    snapshot.push({
      unique_key: row.unique_key,
      title: row.title,
      work_hours: row.work_hours,
      review_hours: row.review_hours,
      due_week: row.due_week,
      phase: row.phase,
      attributes: row.attributes,
    });
  }

  const snapshotId = newId();
  await db()`
    INSERT INTO import_snapshots (id, cycle_id, scenario_id, row_count, snapshot, created_by)
    VALUES (${snapshotId}, ${cycle_id}, ${scenario_id}, ${inserted.length}, ${JSON.stringify(snapshot)}::jsonb, ${auth.sub})
  `;

  await logChangelog({
    cycleId: cycle_id,
    scenarioId: scenario_id,
    entityType: 'import',
    entityId: snapshotId,
    action: 'import',
    summary: `Imported ${inserted.length} plan items from CSV`,
    actorId: auth.sub,
  });

  sendJson(res, 201, {
    imported: inserted.length,
    plan_item_ids: inserted,
    snapshot_id: snapshotId,
    ...previewMeta,
  });
}
