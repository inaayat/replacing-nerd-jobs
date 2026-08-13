/**
 * Autosave payload tests.
 *
 * The per-row save path is the one place a bug silently costs someone their
 * work: drop a field and the edit never lands, drop the updated_at guard and a
 * stale write overwrites somebody else. These assert the exact shape sent.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  planItemPatch,
  dependencyPatch,
  resourcePatch,
  taskTypePatch,
  policyConfig,
  slugifyFieldKey,
} from './patches.js';

test('planItemPatch carries every editable field plus the concurrency guard', () => {
  const patch = planItemPatch({
    id: 'p1',
    title: 'Draft the forecast',
    phase: 'Phase 1',
    work_hours: '12.5',
    due_week: '2026-01-12',
    attributes: { task_type: 'control_testing', start_date: '2026-01-05' },
    updated_at: '2026-01-02T10:00:00.000Z',
    // Not editable in the grid, so it must not be echoed back.
    unique_key: 'manual-abc',
  });

  assert.deepEqual(patch, {
    id: 'p1',
    title: 'Draft the forecast',
    phase: 'Phase 1',
    work_hours: 12.5,
    due_week: '2026-01-12',
    attributes: { task_type: 'control_testing', start_date: '2026-01-05' },
    updated_at: '2026-01-02T10:00:00.000Z',
  });
});

test('planItemPatch normalizes blanks rather than sending empty strings', () => {
  const patch = planItemPatch({ id: 'p1', title: '', phase: '', work_hours: '', due_week: '' });
  assert.equal(patch.work_hours, 0, 'a cleared hours box must save as 0, not NaN');
  assert.equal(patch.due_week, null, 'a cleared date must clear the column');
  assert.equal(patch.phase, null);
  assert.deepEqual(patch.attributes, {});
});

test('planItemPatch sends a null guard for a row that has never been saved', () => {
  assert.equal(planItemPatch({ id: 'p1', title: 'x' }).updated_at, null);
});

test('dependencyPatch keeps the gate due date and its guard', () => {
  const patch = dependencyPatch({
    id: 'd1',
    from_plan_item_id: 'p2',
    dep_type: 'input_ready',
    label: 'Population received',
    status: 'open',
    meta: { due_date: '2026-02-01' },
    updated_at: '2026-01-03T09:00:00.000Z',
  });

  assert.equal(patch.meta.due_date, '2026-02-01');
  assert.equal(patch.updated_at, '2026-01-03T09:00:00.000Z');
  assert.equal(patch.from_plan_item_id, 'p2');
});

test('dependencyPatch turns a cleared upstream row into null, not an empty string', () => {
  const patch = dependencyPatch({ id: 'd1', from_plan_item_id: '', label: '', meta: null });
  assert.equal(patch.from_plan_item_id, null);
  assert.equal(patch.label, null);
  assert.deepEqual(patch.meta, {});
});

test('resourcePatch reads weekly hours out of the first profile', () => {
  const patch = resourcePatch({
    id: 'r1',
    name: 'Alex Rivera',
    team: 'Analyst',
    profiles: [{ weekly_hours: 24 }],
  });
  assert.equal(patch.weekly_hours, 24);
  assert.equal(patch.team, 'Analyst');
});

test('resourcePatch sends null hours when there is no profile to read', () => {
  const patch = resourcePatch({ id: 'r2', name: 'Sam Lee', team: null, profiles: [] });
  assert.equal(patch.weekly_hours, null, 'null lets the server fall back to the plan default');
});

test('taskTypePatch renumbers steps and fields from their current order', () => {
  const patch = taskTypePatch({
    id: 'tt1',
    label: 'Control Testing',
    gate_templates: [
      { id: 's2', label: 'Test', duration_days: 5, seq: 9 },
      { id: 's1', label: 'Obtain population', duration_days: 3, seq: 4 },
    ],
    fields: [{ id: 'f1', key: 'control_id', label: 'Control ID', field_type: 'text', seq: 7 }],
  });

  assert.deepEqual(
    patch.gate_templates.map((s) => [s.id, s.seq]),
    [['s2', 1], ['s1', 2]],
    'seq must follow array order so a reorder actually persists',
  );
  assert.equal(patch.fields[0].seq, 1);
  assert.equal(patch.gate_templates[0].day_kind, 'business', 'missing day_kind needs a default');
  assert.equal(patch.gate_templates[0].dep_type, 'input_ready');
});

test('taskTypePatch only sends options for select fields', () => {
  const patch = taskTypePatch({
    id: 'tt1',
    label: 'T',
    fields: [
      { id: 'f1', key: 'a', label: 'A', field_type: 'select', options: ['High', 'Low'] },
      { id: 'f2', key: 'b', label: 'B', field_type: 'text', options: ['stale'] },
    ],
  });

  assert.deepEqual(patch.fields[0].options, ['High', 'Low']);
  assert.equal(patch.fields[1].options, null, 'a non-select must not keep leftover options');
});

test('policyConfig prefers typed values and falls back to what is stored', () => {
  const config = policyConfig(
    { 'policy-weekly': '36', 'policy-review': '' },
    { weekly_capacity_default: 32, review_ratio: 0.35, custom_key: 'kept' },
  );

  assert.equal(config.weekly_capacity_default, 36, 'the typed value wins');
  assert.equal(config.review_ratio, 0.35, 'an untouched field keeps the stored value');
  assert.equal(config.custom_key, 'kept', 'unknown keys must survive a save');
});

test('policyConfig ignores garbage instead of writing NaN', () => {
  const config = policyConfig({ 'policy-threshold': 'abc' }, { overload_threshold: 1 });
  assert.equal(config.overload_threshold, 1);
});

test('policyConfig lets an explicit override beat both', () => {
  const config = policyConfig(
    { 'policy-weekly': '36' },
    { tracking_granularity: 'week' },
    { tracking_granularity: 'month' },
  );
  assert.equal(config.tracking_granularity, 'month');
});

test('slugifyFieldKey matches the server key format', () => {
  assert.equal(slugifyFieldKey('Control Testing'), 'control_testing');
  assert.equal(slugifyFieldKey('  Reliance %  '), 'reliance');
  assert.equal(slugifyFieldKey('a'.repeat(80)).length, 64, 'keys are capped at 64 chars');
  assert.equal(slugifyFieldKey(''), '');
});
